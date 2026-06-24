import cors from '@fastify/cors';
import Fastify from 'fastify';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';

import { startSubscriptionAuditJob } from './jobs/subscription-audit-job';
import { authPlugin } from './plugins/auth';
import { authRoutes } from './routes/auth';
import { branchRoutes } from './routes/branches';
import { categoryRoutes } from './routes/categories';
import { companyRoutes } from './routes/companies';
import { customerRoutes } from './routes/customers';
import { financeRoutes } from './routes/finance';
import { purchaseInvoiceRoutes } from './routes/purchase-invoices';
import { productRoutes } from './routes/products';
import { refundRoutes } from './routes/refunds';
import { registerRoutes } from './routes/registers';
import { reportRoutes } from './routes/reports';
import { saleRoutes } from './routes/sales';
import { stockRoutes } from './routes/stock';
import { stockTransferRoutes } from './routes/stock-transfers';
import { subscriptionRoutes } from './routes/subscription';
import { supplierRoutes } from './routes/suppliers';
import { syncRoutes } from './routes/sync';
import { userRoutes } from './routes/users';
import { licenseRoutes } from './routes/license';

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
