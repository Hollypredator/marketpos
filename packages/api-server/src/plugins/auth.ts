import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UserRole } from '@prisma/client';

import { buildCompanyAccessSnapshot } from '../lib/company-access';
import prisma from '../lib/prisma';

const BACKOFFICE_WRITE_ROLES: ReadonlySet<UserRole> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
]);

const REPORT_READ_ROLES: ReadonlySet<UserRole> = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'CASHIER',
  'ACCOUNTANT',
]);

function roleAllowed(role: UserRole | undefined, allowed: ReadonlySet<UserRole>): boolean {
  return typeof role === 'string' && allowed.has(role);
}

export async function authPlugin(server: FastifyInstance): Promise<void> {
  await server.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    sign: { expiresIn: '15m' },
  });

  server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({
        error: 'Yetkisiz erisim',
        success: false,
      });
    }
  });

  server.decorate('ensureCompanyAccess', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.companyId) {
      return reply.status(403).send({
        error: 'Firma bilgisi bulunamadi',
        errorCode: 'COMPANY_NOT_FOUND',
        success: false,
      });
    }

    if (request.user.role === 'SUPER_ADMIN') {
      return;
    }

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
      where: {
        id: request.user.companyId,
      },
    });

    if (!company) {
      return reply.status(403).send({
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
    request.companyAccess = companyAccess;

    if (!companyAccess.isAccessAllowed) {
      return reply.status(402).send({
        data: {
          companyAccess,
        },
        error: companyAccess.summary,
        errorCode: 'SUBSCRIPTION_BLOCKED',
        success: false,
      });
    }
  });

  server.decorate('ensureSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.id) {
      return reply.status(401).send({
        error: 'Yetkisiz erisim',
        success: false,
      });
    }

    if (request.user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({
        error: 'Bu islem sadece SUPER_ADMIN rolune aciktir',
        success: false,
      });
    }
  });

  server.decorate('ensureBackofficeWriter', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.id) {
      return reply.status(401).send({
        error: 'Yetkisiz erisim',
        success: false,
      });
    }

    if (!roleAllowed(request.user.role, BACKOFFICE_WRITE_ROLES)) {
      return reply.status(403).send({
        error: 'Bu islem icin ADMIN veya SUPER_ADMIN rolu gerekir',
        success: false,
      });
    }
  });

  server.decorate('ensureReportReader', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.id) {
      return reply.status(401).send({
        error: 'Yetkisiz erisim',
        success: false,
      });
    }

    if (!roleAllowed(request.user.role, REPORT_READ_ROLES)) {
      return reply.status(403).send({
        error: 'Bu islem icin rapor goruntuleme yetkisi gerekir',
        success: false,
      });
    }
  });
}
