import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../lib/prisma';
import { provisionCompanyFromTemplate } from '../lib/company-provisioning';
import { buildPackageGraceEndsAt, normalizePackageExpiresAt } from '../lib/company-access';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const pricingFilePath = path.resolve(currentDir, '../../pricing-config.json');

const DEFAULT_PRICING = {
  monthlyPrice: 490,
  yearlyPrice: 390,
  ecoSetPrice: 24900,
  proSetPrice: 39900,
};

const pricingSchema = z.object({
  monthlyPrice: z.number().int().nonnegative(),
  yearlyPrice: z.number().int().nonnegative(),
  ecoSetPrice: z.number().int().nonnegative(),
  proSetPrice: z.number().int().nonnegative(),
});

function getPricingConfig(): typeof DEFAULT_PRICING {
  try {
    if (fs.existsSync(pricingFilePath)) {
      const content = fs.readFileSync(pricingFilePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    // fallback
  }
  return DEFAULT_PRICING;
}

function savePricingConfig(config: typeof DEFAULT_PRICING): void {
  fs.writeFileSync(pricingFilePath, JSON.stringify(config, null, 2), 'utf8');
}

const checkoutSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  adminEmail: z.string().trim().email().max(255),
  adminFullName: z.string().trim().min(3).max(120),
  adminUsername: z.string().trim().min(3).max(80),
  adminPassword: z.string().min(6).max(128),
  templateCode: z.string().trim().regex(/^[a-z0-9-]+$/u).optional().default('bakkal-v1'),
  planType: z.enum(['MONTHLY', 'YEARLY', 'ECO_SET', 'PRO_SET']),
});

const checkoutParamsSchema = z.object({
  companyId: z.string().uuid(),
});

export async function paymentsRoutes(server: FastifyInstance): Promise<void> {
  // Initialize Checkout & Register Pending Company
  server.post('/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Geçersiz kayıt verisi',
        success: false,
      });
    }

    const {
      companyName,
      adminEmail,
      adminFullName,
      adminUsername,
      adminPassword,
      templateCode,
      planType,
    } = parsed.data;

    // Check if email already in use globally (User table unique constraint)
    const existingUser = await prisma.user.findFirst({
      where: { email: adminEmail.toLowerCase().trim(), deletedAt: null },
    });

    if (existingUser) {
      return reply.status(400).send({
        error: 'Bu e-posta adresi zaten kullanımda.',
        success: false,
      });
    }

    try {
      // 1. Provision Company with temporary values (30 days default or 365 for sets)
      const packageDaysInitial = (planType === 'YEARLY' || planType === 'ECO_SET' || planType === 'PRO_SET') ? 365 : 30;
      const provisionResult = await provisionCompanyFromTemplate({
        actorUserId: '00000000-0000-0000-0000-000000000000',
        adminEmail: adminEmail.toLowerCase().trim(),
        adminFullName,
        adminPassword,
        adminUsername: adminUsername.trim(),
        branchName: 'Merkez Şube',
        graceDays: 7,
        overwriteStock: true,
        packageDays: packageDaysInitial,
        registerName: 'K01',
        companyName,
        templateCode,
      });

      const companyId = provisionResult.company.id;

      // 2. Suspend/deactivate the company until payment is verified
      const company = await prisma.company.update({
        where: { id: companyId },
        data: {
          packageStatus: 'SUSPENDED', // suspended until webhook payment success
          packageExpiresAt: null,
          packageGraceEndsAt: null,
          packageStartedAt: null,
          packageType: planType === 'MONTHLY' ? 'MONTHLY' : 'YEARLY',
          isActive: false, // inactive until payment
        },
      });

      // 3. Generate LemonSqueezy checkout URL
      // Use config variables or default fallback URLs
      let baseCheckoutUrl = '';
      if (planType === 'ECO_SET') {
        baseCheckoutUrl = process.env.LEMONSQUEEZY_ECO_SET_CHECKOUT_URL || 'https://marketpos.lemonsqueezy.com/checkout/buy/eco-set';
      } else if (planType === 'PRO_SET') {
        baseCheckoutUrl = process.env.LEMONSQUEEZY_PRO_SET_CHECKOUT_URL || 'https://marketpos.lemonsqueezy.com/checkout/buy/pro-set';
      } else if (planType === 'YEARLY') {
        baseCheckoutUrl = process.env.LEMONSQUEEZY_YEARLY_CHECKOUT_URL || 'https://marketpos.lemonsqueezy.com/checkout/buy/yearly';
      } else {
        baseCheckoutUrl = process.env.LEMONSQUEEZY_MONTHLY_CHECKOUT_URL || 'https://marketpos.lemonsqueezy.com/checkout/buy/monthly';
      }

      const url = new URL(baseCheckoutUrl);
      url.searchParams.set('checkout[email]', adminEmail.toLowerCase().trim());
      url.searchParams.set('checkout[name]', adminFullName);
      url.searchParams.set('checkout[custom][company_id]', companyId);
      url.searchParams.set('checkout[custom][plan_type]', planType);

      // Return checkout info
      return {
        checkoutUrl: url.toString(),
        companyId,
        success: true,
      };
    } catch (err: unknown) {
      server.log.error(err);
      return reply.status(500).send({
        error: `Kayıt oluşturulurken sunucu hatası: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
        success: false,
      });
    }
  });

  // Get activation status (used for frontend success page polling)
  server.get('/status/:companyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const paramsParsed = checkoutParamsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.status(400).send({
        error: 'Geçersiz firma ID',
        success: false,
      });
    }

    const { companyId } = paramsParsed.data;

    const company = await prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      include: {
        users: {
          where: { role: 'ADMIN', deletedAt: null },
          select: { username: true },
        },
      },
    });

    if (!company) {
      return reply.status(404).send({
        error: 'Firma bulunamadı',
        success: false,
      });
    }

    return {
      success: true,
      data: {
        companyId: company.id,
        name: company.name,
        isActive: company.isActive && company.packageStatus === 'ACTIVE',
        packageStatus: company.packageStatus,
        packageType: company.packageType,
        packageExpiresAt: company.packageExpiresAt ? company.packageExpiresAt.toISOString() : null,
        licenseKey: company.isActive && company.packageStatus === 'ACTIVE' ? company.licenseKey : null,
        adminUsername: company.users[0]?.username ?? null,
      },
    };
  });

  // Webhook for LemonSqueezy Events
  server.post('/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    
    // Verify signature if configured
    if (secret) {
      const signature = request.headers['x-signature'];
      if (!signature) {
        server.log.warn('LemonSqueezy webhook x-signature header is missing');
        return reply.status(401).send({ error: 'Signature header missing', success: false });
      }

      const rawBody = (request as any).rawBody || JSON.stringify(request.body);
      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(rawBody).digest('hex');

      if (signature !== digest) {
        server.log.warn('LemonSqueezy signature verification failed');
        return reply.status(401).send({ error: 'Invalid webhook signature', success: false });
      }
    }

    const payload = request.body as any;
    const eventName = payload?.meta?.event_name;
    const customData = payload?.meta?.custom_data;
    const companyId = customData?.company_id;
    const planType = customData?.plan_type || 'MONTHLY';

    server.log.info(`LemonSqueezy webhook received event: ${eventName} for company ID: ${companyId}`);

    // If event is related to payment success or subscription created/renewed
    const activeEvents = ['order_created', 'subscription_created', 'subscription_payment_success'];

    if (activeEvents.includes(eventName) && companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
      });

      if (!company) {
        server.log.error(`Company not found for ID: ${companyId} in LemonSqueezy webhook`);
        return reply.status(404).send({ error: 'Company not found', success: false });
      }

      const now = new Date();
      const packageDays = (planType === 'YEARLY' || planType === 'ECO_SET' || planType === 'PRO_SET') ? 365 : 30;
      const nextExpiresAt = normalizePackageExpiresAt(
        new Date(now.getTime() + packageDays * 24 * 60 * 60 * 1000)
      );
      const nextGraceEndsAt = buildPackageGraceEndsAt(nextExpiresAt, company.packageGraceDays);

      const updatedCompany = await prisma.company.update({
        where: { id: companyId },
        data: {
          packageStatus: 'ACTIVE',
          packageStartedAt: now,
          packageExpiresAt: nextExpiresAt,
          packageGraceEndsAt: nextGraceEndsAt,
          packageType: (planType === 'MONTHLY' ? 'MONTHLY' : 'YEARLY') as any,
          isActive: true,
          updatedAt: now,
        },
      });

      // Write System transition Audit Log
      const buildCompanySnapshotPayload = (comp: typeof updatedCompany, accessObj: any) => {
        return {
          companyAccess: accessObj,
          packageExpiresAt: comp.packageExpiresAt?.toISOString() ?? null,
          packageGraceDays: comp.packageGraceDays,
          packageGraceEndsAt: comp.packageGraceEndsAt?.toISOString() ?? null,
          packageStartedAt: comp.packageStartedAt?.toISOString() ?? null,
          packageStatus: comp.packageStatus,
        };
      };

      const accessObj = {
        checkedAt: now.toISOString(),
        companyId: updatedCompany.id,
        daysRemaining: packageDays,
        expiresAt: nextExpiresAt?.toISOString() ?? null,
        graceEndsAt: nextGraceEndsAt?.toISOString() ?? null,
        isAccessAllowed: true,
        offlineAccessGraceDays: 365,
        offlineAccessValidUntil: nextGraceEndsAt?.toISOString() ?? nextExpiresAt?.toISOString() ?? now.toISOString(),
        operatorAction: 'NONE',
        packageGraceDays: updatedCompany.packageGraceDays,
        reasonCode: 'ACTIVE_SUBSCRIPTION',
        status: 'ACTIVE',
        summary: `Paket LemonSqueezy ödemesi ile aktif edildi. Bitiş: ${nextExpiresAt?.toISOString().slice(0, 10)}.`,
      };

      await prisma.companySubscriptionAudit.create({
        data: {
          actorType: 'SYSTEM',
          companyId: company.id,
          eventType: 'SYSTEM_RESTORE_ACTIVE',
          nextPayload: buildCompanySnapshotPayload(updatedCompany, accessObj),
          nextStatus: 'ACTIVE',
          previousPayload: {
            packageStatus: company.packageStatus,
            packageExpiresAt: company.packageExpiresAt?.toISOString() ?? null,
            packageStartedAt: company.packageStartedAt?.toISOString() ?? null,
          },
          previousStatus: 'SUSPENDED',
          note: `LemonSqueezy Webhook ödeme doğrulama: ${eventName}. Plan: ${planType}.`,
        },
      });

      server.log.info(`Activated company ID: ${companyId} successfully via LemonSqueezy Webhook`);
    }

    return reply.status(200).send({ success: true });
  });

  // Get dynamic pricing configuration (public)
  server.get('/pricing', async () => {
    return {
      data: getPricingConfig(),
      success: true,
    };
  });

  // Update pricing configuration (Super Admin only)
  server.post(
    '/pricing',
    {
      onRequest: server.authenticate,
      preHandler: server.ensureSuperAdmin,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = pricingSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Geçersiz fiyatlandırma verisi',
          success: false,
        });
      }

      savePricingConfig(parsed.data);

      server.log.info(`Pricing configuration updated by user ${request.user.id}`);
      return {
        data: parsed.data,
        success: true,
      };
    }
  );
}
