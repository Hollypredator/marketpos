import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Company } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';
import {
  buildCompanyAccessSnapshot,
  buildPackageGraceEndsAt,
  calculateQuickRenewedExpiresAt,
} from '../lib/company-access';
import { provisionCompanyFromTemplate } from '../lib/company-provisioning';
import prisma from '../lib/prisma';
import {
  serializeSyncProduct,
  serializeSyncSupplier,
} from './sync';

const licenseActivateSchema = z.object({
  licenseKey: z.string().trim().min(3).max(100),
  registerName: z.string().trim().min(1).max(40),
  branchName: z.string().trim().min(2).max(120),
  adminUsername: z.string().trim().min(3).max(80),
  adminFullName: z.string().trim().min(3).max(120),
  adminEmail: z.string().trim().email().max(255),
  adminPassword: z.string().min(6).max(128),
  templateCode: z.string().trim().regex(/^[a-z0-9-]+$/u).optional().default('bakkal-v1'),
});

const licenseRenewSchema = z.object({
  licenseKey: z.string().trim().min(3).max(100),
});

export async function licenseRoutes(server: FastifyInstance): Promise<void> {
  server.post('/activate', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = licenseActivateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz aktivasyon verisi',
        success: false,
      });
    }

    const {
      licenseKey,
      registerName,
      branchName,
      adminUsername,
      adminFullName,
      adminEmail,
      adminPassword,
      templateCode,
    } = parsed.data;

    let company: Company | null = await prisma.company.findUnique({
      where: { licenseKey },
    });

    const isTestKey = licenseKey.toUpperCase().startsWith('TEST-') || licenseKey.toUpperCase().startsWith('DEMO-');

    if (!company) {
      if (isTestKey) {
        // Test anahtarları için otomatik şirket oluştur
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 yıl
        const graceEndsAt = new Date(expiresAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 gün
        company = await prisma.company.create({
          data: {
            name: `${licenseKey.toUpperCase()} Market`,
            licenseKey,
            licenseKeyActivatedAt: now,
            packageExpiresAt: expiresAt,
            packageGraceDays: 7,
            packageGraceEndsAt: graceEndsAt,
            packageStartedAt: now,
            packageStatus: 'ACTIVE',
            packageType: 'YEARLY',
          },
        });
      } else {
        return reply.status(404).send({
          error: 'Lisans anahtari bulunamadi. Lutfen satin aldiginiz anahtari kontrol edin.',
          errorCode: 'LICENSE_KEY_NOT_FOUND',
          success: false,
        });
      }
    }

    if (!company.isActive || company.packageStatus === 'SUSPENDED') {
      return reply.status(403).send({
        error: 'Bu lisans anahtari askiya alinmis. Lutfen destek ile iletisime gecin.',
        errorCode: 'LICENSE_KEY_SUSPENDED',
        success: false,
      });
    }

    try {
      // 1. Şirketi şablona göre hazırla (Provisioning)
      const provisionResult = await provisionCompanyFromTemplate({
        actorUserId: '00000000-0000-0000-0000-000000000000',
        adminEmail,
        adminFullName,
        adminPassword,
        adminUsername,
        branchName,
        companyId: company.id,
        graceDays: company.packageGraceDays,
        overwriteStock: true,
        packageDays: 365,
        registerName,
        templateCode,
      });

      // Set activation timestamp
      await prisma.company.update({
        where: { id: company.id },
        data: { licenseKeyActivatedAt: new Date() },
      });

      // Automatically seed default catalog (4000+ products) for the company in the background
      void DefaultCatalogService.seedForCompany(company.id).catch((err) => {
        console.error(`Failed to automatically seed company ${company.id} after activation:`, err);
      });

      // 2. Yeni oluşturulan admin kullanıcısını çek
      const user = await prisma.user.findFirst({
        include: {
          branch: true,
          company: true,
        },
        where: {
          companyId: company.id,
          username: adminUsername.trim(),
        },
      });

      if (!user) {
        throw new Error('Kullanici kaydi olusturulamadi');
      }

      // 3. Kullanıcı için oturum aç ve token'ları üret
      const payload = {
        branchId: user.branchId,
        companyId: user.companyId,
        id: user.id,
        role: user.role,
      };

      const accessToken = server.jwt.sign(payload);
      const refreshToken = server.jwt.sign(
        {
          ...payload,
          type: 'refresh',
        },
        { expiresIn: '7d' },
      );

      await prisma.refreshToken.create({
        data: {
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          token: refreshToken,
          userId: user.id,
        },
      });

      // 4. Kriptografik imzalı CompanyAccessSnapshot oluştur
      const companyAccess = buildCompanyAccessSnapshot({
        id: company.id,
        isActive: company.isActive && company.deletedAt === null,
        packageExpiresAt: company.packageExpiresAt,
        packageGraceDays: company.packageGraceDays,
        packageGraceEndsAt: company.packageGraceEndsAt,
        packageStatus: company.packageStatus,
      });

      // 5. İlk kurulum çevrimdışı seed verilerini derle
      const [products, productsTotalActive, categories, users, stockLevels, suppliers, customers] = await Promise.all([
        prisma.product.findMany({
          where: { companyId: company.id },
        }),
        prisma.product.count({
          where: { companyId: company.id, isActive: true },
        }),
        prisma.category.findMany({
          where: { companyId: company.id },
        }),
        prisma.user.findMany({
          select: {
            branchId: true,
            companyId: true,
            fullName: true,
            id: true,
            isActive: true,
            role: true,
            username: true,
          },
          where: { companyId: company.id },
        }),
        prisma.stockLevel.findMany({
          where: { branchId: provisionResult.branch.id },
        }),
        prisma.supplier.findMany({
          where: { companyId: company.id },
        }),
        prisma.customer.findMany({
          where: { companyId: company.id },
        }),
      ]);

      const serializedProducts = products.map((p) =>
        serializeSyncProduct(p as unknown as Record<string, unknown>),
      );
      const serializedSuppliers = suppliers.map((s) =>
        serializeSyncSupplier(s as unknown as Record<string, unknown>),
      );

      const now = new Date();
      const serverSyncAt = now.toISOString();
      const seedData = {
        branches: [user.branch],
        bundles: [],
        categories,
        cursor: null,
        customers,
        lastSyncAt: serverSyncAt,
        nextCursor: '',
        products: serializedProducts,
        productsTotalActive,
        purchaseInvoices: [],
        registers: [
          {
            id: provisionResult.register.id,
            branchId: provisionResult.branch.id,
            name: provisionResult.register.name,
            isActive: true,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            deletedAt: null,
          }
        ],
        stockLevels,
        suppliers: serializedSuppliers,
        users,
      };

      const { passwordHash: _passwordHash, pin: _pin, ...userPublic } = user;

      return {
        data: {
          accessToken,
          companyAccess,
          refreshToken,
          seedData,
          user: userPublic,
          registerId: provisionResult.register.id,
          sessionId: '00000000-0000-0000-0000-000000000000', // session setup will be created on client first run
        },
        success: true,
      };
    } catch (err: unknown) {
      server.log.error(err);
      return reply.status(500).send({
        error: `Aktivasyon sirasinda bir sunucu hatasi olustu: ${err instanceof Error ? err.message : 'Bilinmeyen hata'}`,
        success: false,
      });
    }
  });

  server.post('/renew', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = licenseRenewSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz yenileme verisi',
        success: false,
      });
    }

    const { licenseKey } = parsed.data;

    const company = await prisma.company.findUnique({
      where: { licenseKey },
    });

    if (!company) {
      return reply.status(404).send({
        error: 'Lisans anahtari bulunamadi. Lutfen satin aldiginiz anahtari kontrol edin.',
        errorCode: 'LICENSE_KEY_NOT_FOUND',
        success: false,
      });
    }

    if (company.licenseKeyActivatedAt) {
      return reply.status(400).send({
        error: 'Bu lisans anahtari zaten etkinlestirilmis.',
        errorCode: 'LICENSE_KEY_ALREADY_ACTIVATED',
        success: false,
      });
    }

    if (!company.isActive || company.packageStatus === 'SUSPENDED') {
      return reply.status(403).send({
        error: 'Bu lisans anahtari askiya alinmis. Lutfen destek ile iletisime gecin.',
        errorCode: 'LICENSE_KEY_SUSPENDED',
        success: false,
      });
    }

    const now = new Date();
    const previousAccess = buildCompanyAccessSnapshot(
      {
        id: company.id,
        isActive: company.isActive && company.deletedAt === null,
        packageExpiresAt: company.packageExpiresAt,
        packageGraceDays: company.packageGraceDays,
        packageGraceEndsAt: company.packageGraceEndsAt,
        packageStatus: company.packageStatus,
      },
      now,
    );

    const nextExpiresAt = calculateQuickRenewedExpiresAt({
      currentExpiresAt: company.packageExpiresAt,
      currentStatus: previousAccess.status as any,
      now,
    });
    const nextGraceEndsAt = buildPackageGraceEndsAt(
      nextExpiresAt,
      company.packageGraceDays,
    );

    const updated = await prisma.company.update({
      data: {
        packageExpiresAt: nextExpiresAt,
        packageGraceEndsAt: nextGraceEndsAt,
        packageStartedAt: now,
        packageStatus: 'ACTIVE',
        licenseKeyActivatedAt: now,
        updatedAt: now,
      },
      where: { id: company.id },
    });

    const nextAccess = buildCompanyAccessSnapshot(
      {
        id: updated.id,
        isActive: updated.isActive && updated.deletedAt === null,
        packageExpiresAt: updated.packageExpiresAt,
        packageGraceDays: updated.packageGraceDays,
        packageGraceEndsAt: updated.packageGraceEndsAt,
        packageStatus: updated.packageStatus,
      },
      now,
    );

    const buildCompanySnapshotPayload = (
      comp: typeof company,
      accessObj: typeof nextAccess,
    ) => {
      return {
        companyAccess: accessObj as any,
        packageExpiresAt: comp.packageExpiresAt?.toISOString() ?? null,
        packageGraceDays: comp.packageGraceDays,
        packageGraceEndsAt: comp.packageGraceEndsAt?.toISOString() ?? null,
        packageStartedAt: comp.packageStartedAt?.toISOString() ?? null,
        packageStatus: comp.packageStatus,
      };
    };

    await prisma.companySubscriptionAudit.create({
      data: {
        actorType: 'SYSTEM',
        companyId: company.id,
        eventType: 'RENEW_MANUAL',
        nextPayload: buildCompanySnapshotPayload(updated, nextAccess),
        nextStatus: nextAccess.status as any,
        previousPayload: buildCompanySnapshotPayload(company, previousAccess),
        previousStatus: previousAccess.status as any,
        note: `Lisans anahtari ile yenileme yapildi: ${licenseKey}`,
      },
    });

    return {
      data: nextAccess,
      success: true,
    };
  });

  server.post('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const bodySchema = z.object({
      companyId: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Geçersiz firma kimliği',
        success: false,
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
    });

    if (!company) {
      return reply.status(404).send({
        error: 'Firma bulunamadı',
        errorCode: 'COMPANY_NOT_FOUND',
        success: false,
      });
    }

    const companyAccess = buildCompanyAccessSnapshot({
      id: company.id,
      isActive: company.isActive && company.deletedAt === null,
      packageExpiresAt: company.packageExpiresAt,
      packageGraceDays: company.packageGraceDays,
      packageGraceEndsAt: company.packageGraceEndsAt,
      packageStatus: company.packageStatus,
    });

    return {
      data: companyAccess,
      success: true,
    };
  });

  server.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { companyId?: string };
    if (!query.companyId) {
      return reply.status(400).send({
        error: 'companyId parametresi gereklidir',
        success: false,
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: query.companyId },
    });

    if (!company) {
      return reply.status(404).send({
        error: 'Firma bulunamadı',
        success: false,
      });
    }

    const companyAccess = buildCompanyAccessSnapshot({
      id: company.id,
      isActive: company.isActive && company.deletedAt === null,
      packageExpiresAt: company.packageExpiresAt,
      packageGraceDays: company.packageGraceDays,
      packageGraceEndsAt: company.packageGraceEndsAt,
      packageStatus: company.packageStatus,
    });

    return {
      data: companyAccess,
      success: true,
    };
  });

  server.get('/download-desktop', async (_request: FastifyRequest, reply: FastifyReply) => {
    const currentModuleDir = resolve(process.cwd(), 'packages/api-server/src/routes');
    const possiblePaths = [
      resolve(process.cwd(), 'packages/pos-desktop/release/MarketPOS-1.0.0-setup.exe'),
      resolve(process.cwd(), '../pos-desktop/release/MarketPOS-1.0.0-setup.exe'),
      resolve(process.cwd(), 'release/MarketPOS-1.0.0-setup.exe'),
      resolve(process.cwd(), 'MarketPOS-1.0.0-setup.exe'),
      resolve(currentModuleDir, '../../../../packages/pos-desktop/release/MarketPOS-1.0.0-setup.exe'),
      resolve(currentModuleDir, '../../../pos-desktop/release/MarketPOS-1.0.0-setup.exe'),
    ];

    const installerPath = possiblePaths.find((path) => existsSync(path));

    if (installerPath && existsSync(installerPath)) {
      const stream = createReadStream(installerPath);
      reply.header('Content-Type', 'application/vnd.microsoft.portable-executable');
      reply.header('Content-Disposition', 'attachment; filename="MarketPOS-Setup.exe"');
      return reply.send(stream);
    }

    return reply.redirect('https://github.com/Hollypredator/marketpos/releases/download/v1.0.3/MarketPOS-1.0.3-setup.exe');
  });
}


