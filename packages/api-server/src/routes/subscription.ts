import { Prisma } from '@prisma/client';
import type {
  Company,
  CompanyAccessStatus as DbCompanyAccessStatus,
  CompanySubscriptionAuditEventType,
} from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  buildCompanyAccessSnapshot,
  buildPackageGraceEndsAt,
  calculateQuickRenewedExpiresAt,
  normalizePackageExpiresAt,
} from '../lib/company-access';
import {
  provisionCompanyFromTemplate,
  ProvisioningInputError,
} from '../lib/company-provisioning';
import { listCatalogTemplateSummaries } from '../lib/catalog-templates';
import prisma from '../lib/prisma';
import { mapSystemEventType } from '../lib/subscription-admin-helpers';
import { generateLicenseKey } from '../lib/license-utils';

interface CompanyIdParams {
  id: string;
}

const adminListQuerySchema = z.object({
  dueInDays: z.coerce.number().int().min(0).max(3650).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(200).optional(),
  status: z
    .enum(['ACTIVE', 'EXPIRED', 'GRACE', 'SUSPENDED', 'UNCONFIGURED'])
    .optional(),
});

const auditListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

const renewQuickSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const manualPlanSchema = z.object({
  note: z.string().trim().min(3).max(500),
  packageExpiresAt: z.coerce.date().nullable().optional(),
  packageGraceDays: z.coerce.number().int().min(1).max(30).optional(),
  packageStartedAt: z.coerce.date().nullable().optional(),
  packageStatus: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

const suspendSchema = z.object({
  note: z.string().trim().min(3).max(500),
});

const provisionCompanySchema = z
  .object({
    address: z.string().trim().max(255).optional().nullable(),
    adminEmail: z.string().trim().email().max(255).optional().nullable(),
    adminFullName: z.string().trim().min(3).max(120),
    adminPassword: z.string().min(6).max(128),
    adminUsername: z.string().trim().min(3).max(80),
    branchName: z.string().trim().min(2).max(120),
    companyId: z.string().trim().uuid().optional(),
    companyName: z.string().trim().min(2).max(160).optional(),
    email: z.string().trim().email().max(255).optional().nullable(),
    graceDays: z.coerce.number().int().min(1).max(30).default(7),
    overwriteStock: z.boolean().optional().default(false),
    packageDays: z.coerce.number().int().min(1).max(3650).default(365),
    phone: z.string().trim().max(60).optional().nullable(),
    registerName: z.string().trim().min(1).max(40),
    taxNumber: z.string().trim().max(64).optional().nullable(),
    templateCode: z.string().trim().regex(/^[a-z0-9-]+$/u),
  })
  .superRefine((payload, ctx) => {
    const hasCompanyId =
      typeof payload.companyId === 'string' && payload.companyId.trim().length > 0;
    const hasCompanyName =
      typeof payload.companyName === 'string' && payload.companyName.trim().length > 0;
    if (!hasCompanyId && !hasCompanyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mevcut firma id veya yeni firma adi zorunludur',
        path: ['companyName'],
      });
    }
    if (
      !hasCompanyId &&
      !(typeof payload.adminEmail === 'string' && payload.adminEmail.trim().length > 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Yeni firma acilisinda adminEmail zorunludur',
        path: ['adminEmail'],
      });
    }
  });

type SubscriptionCompanyRecord = Company;

function mapStatusForDb(status: string): DbCompanyAccessStatus {
  return status as DbCompanyAccessStatus;
}

function buildCompanySnapshotPayload(
  company: {
    packageExpiresAt: Date | null;
    packageGraceDays: number;
    packageGraceEndsAt: Date | null;
    packageStartedAt: Date | null;
    packageStatus: 'ACTIVE' | 'SUSPENDED';
  },
  companyAccess: ReturnType<typeof buildCompanyAccessSnapshot>,
): Prisma.InputJsonObject {
  const payload: Prisma.InputJsonObject = {
    companyAccess: companyAccess as unknown as Prisma.InputJsonValue,
    packageExpiresAt: company.packageExpiresAt?.toISOString() ?? null,
    packageGraceDays: company.packageGraceDays,
    packageGraceEndsAt: company.packageGraceEndsAt?.toISOString() ?? null,
    packageStartedAt: company.packageStartedAt?.toISOString() ?? null,
    packageStatus: company.packageStatus,
  };
  return payload;
}

export async function writeSystemSubscriptionTransitionAudit(
  now = new Date(),
): Promise<void> {
  const companies = await prisma.company.findMany({
    select: {
      deletedAt: true,
      id: true,
      isActive: true,
      packageExpiresAt: true,
      packageGraceDays: true,
      packageGraceEndsAt: true,
      packageStartedAt: true,
      packageStatus: true,
    },
    where: {
      deletedAt: null,
    },
  });

  for (const company of companies) {
    const companyAccess = buildCompanyAccessSnapshot(
      {
        id: company.id,
        isActive: company.isActive,
        packageExpiresAt: company.packageExpiresAt,
        packageGraceDays: company.packageGraceDays,
        packageGraceEndsAt: company.packageGraceEndsAt,
        packageStatus: company.packageStatus,
      },
      now,
    );

    const latestAudit = await prisma.companySubscriptionAudit.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        nextPayload: true,
        nextStatus: true,
      },
      where: { companyId: company.id },
    });

    const previousStatus = latestAudit?.nextStatus ?? null;
    const nextStatus = mapStatusForDb(companyAccess.status);
    if (previousStatus === nextStatus) {
      continue;
    }

    const eventType = mapSystemEventType(previousStatus, nextStatus);
    if (!eventType) {
      continue;
    }

    await prisma.companySubscriptionAudit.create({
      data: {
        actorType: 'SYSTEM',
        companyId: company.id,
        eventType,
        nextPayload: buildCompanySnapshotPayload(company, companyAccess),
        nextStatus,
        previousPayload:
          latestAudit && latestAudit.nextPayload !== null
            ? (latestAudit.nextPayload as Prisma.InputJsonValue)
            : Prisma.DbNull,
        previousStatus,
      },
    });
  }
}

async function readCompanyOr404(
  reply: FastifyReply,
  companyId: string,
): Promise<SubscriptionCompanyRecord | null> {
  const company = await prisma.company.findFirst({
    where: { deletedAt: null, id: companyId },
  });
  if (!company) {
    await reply.status(404).send({
      error: 'Firma bulunamadi',
      success: false,
    });
    return null;
  }
  return company;
}

async function createManualAudit(params: {
  actorUserId: string;
  companyAfter: SubscriptionCompanyRecord;
  companyBefore: SubscriptionCompanyRecord;
  eventType: CompanySubscriptionAuditEventType;
  note?: string;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const previousAccess = buildCompanyAccessSnapshot(
    {
      id: params.companyBefore.id,
      isActive:
        params.companyBefore.isActive && params.companyBefore.deletedAt === null,
      packageExpiresAt: params.companyBefore.packageExpiresAt,
      packageGraceDays: params.companyBefore.packageGraceDays,
      packageGraceEndsAt: params.companyBefore.packageGraceEndsAt,
      packageStatus: params.companyBefore.packageStatus,
    },
    now,
  );
  const nextAccess = buildCompanyAccessSnapshot(
    {
      id: params.companyAfter.id,
      isActive:
        params.companyAfter.isActive && params.companyAfter.deletedAt === null,
      packageExpiresAt: params.companyAfter.packageExpiresAt,
      packageGraceDays: params.companyAfter.packageGraceDays,
      packageGraceEndsAt: params.companyAfter.packageGraceEndsAt,
      packageStatus: params.companyAfter.packageStatus,
    },
    now,
  );

  await prisma.companySubscriptionAudit.create({
    data: {
      actorType: 'USER',
      actorUserId: params.actorUserId,
      companyId: params.companyAfter.id,
      eventType: params.eventType,
      nextPayload: buildCompanySnapshotPayload(params.companyAfter, nextAccess),
      nextStatus: mapStatusForDb(nextAccess.status),
      note: params.note,
      previousPayload: buildCompanySnapshotPayload(
        params.companyBefore,
        previousAccess,
      ),
      previousStatus: mapStatusForDb(previousAccess.status),
    },
  });
}

export async function subscriptionRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);

  server.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const company = await prisma.company.findFirst({
      select: {
        deletedAt: true,
        id: true,
        isActive: true,
        packageExpiresAt: true,
        packageGraceDays: true,
        packageGraceEndsAt: true,
        packageStatus: true,
      },
      where: { id: request.user.companyId },
    });

    if (!company) {
      return reply.status(404).send({
        error: 'Firma bulunamadi',
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

  server.get(
    '/admin/companies',
    { preHandler: server.ensureSuperAdmin },
    async (request: FastifyRequest) => {
      const query = adminListQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const where: Prisma.CompanyWhereInput = { deletedAt: null };
      if (query.search && query.search.length > 0) {
        where.OR = [
          { name: { contains: query.search } },
          { taxNumber: { contains: query.search } },
        ];
      }

      const companies = await prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        where,
      });

      const withStatus = companies.map((company) => {
        const access = buildCompanyAccessSnapshot({
          id: company.id,
          isActive: company.isActive && company.deletedAt === null,
          packageExpiresAt: company.packageExpiresAt,
          packageGraceDays: company.packageGraceDays,
          packageGraceEndsAt: company.packageGraceEndsAt,
          packageStatus: company.packageStatus,
        });
        return { access, company };
      });

      const filtered = withStatus.filter(({ access }) => {
        if (query.status && access.status !== query.status) {
          return false;
        }
        if (
          typeof query.dueInDays === 'number' &&
          (access.daysRemaining === null || access.daysRemaining > query.dueInDays)
        ) {
          return false;
        }
        return true;
      });

      const companyIds = filtered.map((row) => row.company.id);
      const lastAuditRows =
        companyIds.length > 0
          ? await prisma.companySubscriptionAudit.groupBy({
              by: ['companyId'],
              where: { companyId: { in: companyIds } },
              _max: { createdAt: true },
            })
          : [];
      const lastAuditByCompanyId = new Map(
        lastAuditRows.map((row) => [row.companyId, row._max.createdAt ?? null]),
      );

      const summary = {
        ACTIVE: 0,
        EXPIRED: 0,
        GRACE: 0,
        SUSPENDED: 0,
        UNCONFIGURED: 0,
      };
      for (const row of filtered) {
        summary[row.access.status] += 1;
      }

      const pageData = filtered.slice(skip, skip + query.limit);
      return {
        data: pageData.map(({ access, company }) => ({
          access,
          company,
          lastAuditAt:
            lastAuditByCompanyId.get(company.id)?.toISOString() ?? null,
        })),
        pagination: {
          limit: query.limit,
          page: query.page,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / query.limit)),
        },
        summary,
        success: true,
      };
    },
  );

  server.get(
    '/admin/templates',
    { preHandler: server.ensureSuperAdmin },
    async () => {
      const templates = await listCatalogTemplateSummaries();
      return {
        data: templates,
        success: true,
      };
    },
  );

  server.post(
    '/admin/provision',
    { preHandler: server.ensureSuperAdmin },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = provisionCompanySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error:
            parsed.error.errors[0]?.message ??
            'Gecersiz provisioning verisi',
          success: false,
        });
      }

      try {
        const result = await provisionCompanyFromTemplate({
          actorUserId: request.user.id,
          address: parsed.data.address ?? null,
          adminEmail: parsed.data.adminEmail ?? null,
          adminFullName: parsed.data.adminFullName,
          adminPassword: parsed.data.adminPassword,
          adminUsername: parsed.data.adminUsername,
          branchName: parsed.data.branchName,
          companyId: parsed.data.companyId,
          companyName: parsed.data.companyName,
          email: parsed.data.email ?? null,
          graceDays: parsed.data.graceDays,
          overwriteStock: parsed.data.overwriteStock,
          packageDays: parsed.data.packageDays,
          phone: parsed.data.phone ?? null,
          registerName: parsed.data.registerName,
          taxNumber: parsed.data.taxNumber ?? null,
          templateCode: parsed.data.templateCode,
        });

        return reply.status(parsed.data.companyId ? 200 : 201).send({
          data: result,
          success: true,
        });
      } catch (error: unknown) {
        if (error instanceof ProvisioningInputError) {
          return reply.status(error.statusCode).send({
            error: error.message,
            errorCode: error.errorCode,
            success: false,
          });
        }
        throw error;
      }
    },
  );

  server.get(
    '/admin/companies/:id/audit',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const query = auditListQuerySchema.parse(request.query);
      const skip = (query.page - 1) * query.limit;

      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
      }

      const [rows, total] = await Promise.all([
        prisma.companySubscriptionAudit.findMany({
          include: {
            actorUser: {
              select: {
                fullName: true,
                id: true,
                role: true,
                username: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.limit,
          where: { companyId: company.id },
        }),
        prisma.companySubscriptionAudit.count({
          where: { companyId: company.id },
        }),
      ]);

      return {
        data: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        pagination: {
          limit: query.limit,
          page: query.page,
          total,
          totalPages: Math.max(1, Math.ceil(total / query.limit)),
        },
        success: true,
      };
    },
  );

  server.post(
    '/admin/companies/:id/renew-quick',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = renewQuickSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz yenileme verisi',
          success: false,
        });
      }

      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
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
        currentStatus: previousAccess.status,
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
          updatedAt: now,
        },
        where: { id: company.id },
      });

      await createManualAudit({
        actorUserId: request.user.id,
        companyAfter: updated,
        companyBefore: company,
        eventType: 'RENEW_QUICK',
        note: parsed.data.note,
        now,
      });

      return {
        data: {
          company: updated,
          companyAccess: buildCompanyAccessSnapshot({
            id: updated.id,
            isActive: updated.isActive && updated.deletedAt === null,
            packageExpiresAt: updated.packageExpiresAt,
            packageGraceDays: updated.packageGraceDays,
            packageGraceEndsAt: updated.packageGraceEndsAt,
            packageStatus: updated.packageStatus,
          }),
        },
        success: true,
      };
    },
  );

  server.post(
    '/admin/companies/:id/generate-license',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
      }

      const newKey = generateLicenseKey();

      const updated = await prisma.company.update({
        data: {
          licenseKey: newKey,
          licenseKeyActivatedAt: null,
          updatedAt: new Date(),
        },
        where: { id: company.id },
      });

      await createManualAudit({
        actorUserId: request.user.id,
        companyAfter: updated,
        companyBefore: company,
        eventType: 'RENEW_MANUAL',
        note: `Yeni lisans anahtari uretildi: ${newKey}`,
      });

      return {
        data: {
          licenseKey: newKey,
        },
        success: true,
      };
    },
  );

  server.put(
    '/admin/companies/:id/plan',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = manualPlanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz paket guncelleme verisi',
          success: false,
        });
      }

      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
      }

      const hasExpiresAt = Object.prototype.hasOwnProperty.call(
        parsed.data,
        'packageExpiresAt',
      );
      const hasStartedAt = Object.prototype.hasOwnProperty.call(
        parsed.data,
        'packageStartedAt',
      );
      const nextGraceDays =
        parsed.data.packageGraceDays ?? company.packageGraceDays;
      const nextExpiresAt = hasExpiresAt
        ? normalizePackageExpiresAt(parsed.data.packageExpiresAt ?? null)
        : company.packageExpiresAt;
      const nextStartedAt = hasStartedAt
        ? parsed.data.packageStartedAt ?? null
        : company.packageStartedAt;
      const nextStatus = parsed.data.packageStatus ?? company.packageStatus;

      const updated = await prisma.company.update({
        data: {
          packageExpiresAt: nextExpiresAt,
          packageGraceDays: nextGraceDays,
          packageGraceEndsAt: buildPackageGraceEndsAt(nextExpiresAt, nextGraceDays),
          packageStartedAt: nextStartedAt,
          packageStatus: nextStatus,
          updatedAt: new Date(),
        },
        where: { id: company.id },
      });

      await createManualAudit({
        actorUserId: request.user.id,
        companyAfter: updated,
        companyBefore: company,
        eventType: 'RENEW_MANUAL',
        note: parsed.data.note,
      });

      return {
        data: {
          company: updated,
          companyAccess: buildCompanyAccessSnapshot({
            id: updated.id,
            isActive: updated.isActive && updated.deletedAt === null,
            packageExpiresAt: updated.packageExpiresAt,
            packageGraceDays: updated.packageGraceDays,
            packageGraceEndsAt: updated.packageGraceEndsAt,
            packageStatus: updated.packageStatus,
          }),
        },
        success: true,
      };
    },
  );

  server.post(
    '/admin/companies/:id/suspend',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = suspendSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Askıya alma notu zorunludur',
          success: false,
        });
      }

      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
      }

      const updated = await prisma.company.update({
        data: {
          packageStatus: 'SUSPENDED',
          updatedAt: new Date(),
        },
        where: { id: company.id },
      });

      await createManualAudit({
        actorUserId: request.user.id,
        companyAfter: updated,
        companyBefore: company,
        eventType: 'SUSPEND_MANUAL',
        note: parsed.data.note,
      });

      return {
        data: {
          company: updated,
          companyAccess: buildCompanyAccessSnapshot({
            id: updated.id,
            isActive: updated.isActive && updated.deletedAt === null,
            packageExpiresAt: updated.packageExpiresAt,
            packageGraceDays: updated.packageGraceDays,
            packageGraceEndsAt: updated.packageGraceEndsAt,
            packageStatus: updated.packageStatus,
          }),
        },
        success: true,
      };
    },
  );

  server.post(
    '/admin/companies/:id/unsuspend',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: CompanyIdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = suspendSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Askidan cikarma notu zorunludur',
          success: false,
        });
      }

      const company = await readCompanyOr404(reply, request.params.id);
      if (!company) {
        return;
      }

      const updated = await prisma.company.update({
        data: {
          packageStatus: 'ACTIVE',
          updatedAt: new Date(),
        },
        where: { id: company.id },
      });

      await createManualAudit({
        actorUserId: request.user.id,
        companyAfter: updated,
        companyBefore: company,
        eventType: 'UNSUSPEND_MANUAL',
        note: parsed.data.note,
      });

      return {
        data: {
          company: updated,
          companyAccess: buildCompanyAccessSnapshot({
            id: updated.id,
            isActive: updated.isActive && updated.deletedAt === null,
            packageExpiresAt: updated.packageExpiresAt,
            packageGraceDays: updated.packageGraceDays,
            packageGraceEndsAt: updated.packageGraceEndsAt,
            packageStatus: updated.packageStatus,
          }),
        },
        success: true,
      };
    },
  );
}
