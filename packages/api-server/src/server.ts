import cors from '@fastify/cors';
import Fastify from 'fastify';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { ZodError } from 'zod';

import { startSubscriptionAuditJob } from './jobs/subscription-audit-job.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { branchRoutes } from './routes/branches.js';
import { categoryRoutes } from './routes/categories.js';
import { companyRoutes } from './routes/companies.js';
import { customerRoutes } from './routes/customers.js';
import { financeRoutes } from './routes/finance.js';
import { purchaseInvoiceRoutes } from './routes/purchase-invoices.js';
import { productRoutes } from './routes/products.js';
import { refundRoutes } from './routes/refunds.js';
import { registerRoutes } from './routes/registers.js';
import { reportRoutes } from './routes/reports.js';
import { saleRoutes } from './routes/sales.js';
import { stockRoutes } from './routes/stock.js';
import { stockTransferRoutes } from './routes/stock-transfers.js';
import { subscriptionRoutes } from './routes/subscription.js';
import { supplierRoutes } from './routes/suppliers.js';
import { syncRoutes } from './routes/sync.js';
import { userRoutes } from './routes/users.js';
import { licenseRoutes } from './routes/license.js';
import { paymentsRoutes } from './routes/payments.js';
import { superadminRoutes } from './routes/superadmin.js';
import { platformAdminRoutes } from './routes/platform-admin.js';

function loadEnvironment(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const envCandidates = [
    resolve(process.cwd(), 'packages/api-server/.env'),
    resolve(process.cwd(), '.env'),
    resolve(currentDir, '../.env'),
  ];

  const envFilePath = envCandidates.find((candidate) => existsSync(candidate));
  if (!envFilePath) {
    return;
  }

  const raw = readFileSync(envFilePath, 'utf8');
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Sunucu hatasi';
}

function isZodValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}

loadEnvironment();

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { options: { colorize: true }, target: 'pino-pretty' }
        : undefined,
  },
});

// Hook to capture raw body for payments webhook (signature verification)
server.addHook('preParsing', async (request, reply, payload) => {
  if (request.url === '/api/payments/webhook' || request.url.startsWith('/api/payments/webhook')) {
    const buffer: Buffer[] = [];
    for await (const chunk of payload) {
      buffer.push(chunk as Buffer);
    }
    const totalBuffer = Buffer.concat(buffer);
    (request as any).rawBody = totalBuffer.toString('utf8');

    const newStream = new Readable();
    newStream.push(totalBuffer);
    newStream.push(null);
    return newStream;
  }
  return payload;
});

async function start(): Promise<void> {
  await server.register(cors, {
    credentials: true,
    origin: true,
  });

  await authPlugin(server);

  server.get('/health', async () => ({
    data: { status: 'ok', timestamp: new Date().toISOString() },
    success: true,
  }));

  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(companyRoutes, { prefix: '/api/companies' });
  await server.register(branchRoutes, { prefix: '/api/branches' });
  await server.register(registerRoutes, { prefix: '/api/registers' });
  await server.register(userRoutes, { prefix: '/api/users' });
  await server.register(categoryRoutes, { prefix: '/api/categories' });
  await server.register(productRoutes, { prefix: '/api/products' });
  await server.register(customerRoutes, { prefix: '/api/customers' });
  await server.register(supplierRoutes, { prefix: '/api/suppliers' });
  await server.register(purchaseInvoiceRoutes, { prefix: '/api/purchase-invoices' });
  await server.register(saleRoutes, { prefix: '/api/sales' });
  await server.register(refundRoutes, { prefix: '/api/refunds' });
  await server.register(stockRoutes, { prefix: '/api/stock' });
  await server.register(stockTransferRoutes, { prefix: '/api/stock-transfers' });
  await server.register(reportRoutes, { prefix: '/api/reports' });
  await server.register(syncRoutes, { prefix: '/api/sync' });
  await server.register(subscriptionRoutes, { prefix: '/api/subscription' });
  await server.register(licenseRoutes, { prefix: '/api/license' });
  await server.register(financeRoutes, { prefix: '/api/finance' });
  await server.register(paymentsRoutes, { prefix: '/api/payments' });
  await server.register(superadminRoutes, { prefix: '/api/superadmin' });
  await server.register(platformAdminRoutes, { prefix: '/api/superadmin' });

  // Serve static web-dashboard single-page application (SPA)
  const possibleWebPaths = [
    resolve(process.cwd(), 'packages/web-dashboard/dist'),
    resolve(process.cwd(), '../web-dashboard/dist'),
    resolve(__dirname, '../../web-dashboard/dist'),
    resolve(__dirname, '../../../packages/web-dashboard/dist'),
  ];
  const webDist = possibleWebPaths.find((p) => existsSync(p));

  if (webDist) {
    const fastifyStatic = (await import('@fastify/static')).default;
    await server.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });

    // SPA fallback: render index.html for non-API web page requests
    server.setNotFoundHandler((request, reply) => {
      if (request.raw.url && !request.raw.url.startsWith('/api')) {
        const indexPath = resolve(webDist, 'index.html');
        if (existsSync(indexPath)) {
          return reply.type('text/html').send(readFileSync(indexPath));
        }
      }
      return reply.status(404).send({ error: 'Endpoint bulunamadi', success: false });
    });
  }

  const stopSubscriptionAuditJob = startSubscriptionAuditJob(server);
  server.addHook('onClose', async () => {
    stopSubscriptionAuditJob();
  });

  server.setErrorHandler((error: unknown, _request, reply) => {
    server.log.error(error);

    if (isZodValidationError(error)) {
      return reply.status(400).send({
        error: 'Gecersiz istek verisi',
        success: false,
      });
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    reply.status(statusCode).send({
      error: readErrorMessage(error),
      success: false,
    });
  });

  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await server.listen({ host, port });
    server.log.info(`MarketPOS API calisiyor: http://${host}:${port}`);
  } catch (error: unknown) {
    server.log.error(error);
    process.exit(1);
  }
}

void start();
