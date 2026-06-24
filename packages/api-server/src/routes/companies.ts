import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createCompanySchema, paginationSchema, updateCompanySchema } from '@marketpos/shared';

import prisma from '../lib/prisma';
import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';
import { resolveScopedCompanyId } from '../lib/request-scope';
import { findRestrictedSubscriptionFields } from '../lib/subscription-admin-helpers';
import { generateLicenseKey } from '../lib/license-utils';

interface IdParams {
  id: string;
}

export async function companyRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);
  server.addHook('onRequest', server.ensureBackofficeWriter);

  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit, page } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;
    const scopedCompanyId = resolveScopedCompanyId(request, reply);
    if (reply.sent) {
      return;
    }

    const where = {
      deletedAt: null,
      ...(scopedCompanyId ? { id: scopedCompanyId } : {}),
    };

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where,
      }),
      prisma.company.count({ where }),
    ]);

    return {
      data: companies,
      pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
      success: true,
    };
  });

  server.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const scopedCompanyId = resolveScopedCompanyId(request, reply);
      if (reply.sent) {
        return;
      }

      const { id } = request.params;
      if (scopedCompanyId && scopedCompanyId !== id) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }

      const company = await prisma.company.findFirst({
        include: {
          branches: {
            where: { deletedAt: null },
          },
        },
        where: {
          deletedAt: null,
          id,
        },
      });

      if (!company) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }

      return {
        data: company,
        success: true,
      };
    },
  );

  server.post('/', { preHandler: server.ensureSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const restrictedFields = findRestrictedSubscriptionFields(request.body);
    if (restrictedFields.length > 0) {
      return reply.status(400).send({
        error: `Paket alanlari sadece subscription admin modulu ile guncellenebilir: ${restrictedFields.join(', ')}`,
        success: false,
      });
    }

    const parsed = createCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz firma verisi',
        success: false,
      });
    }

    const company = await prisma.company.create({
      data: {
        ...parsed.data,
        licenseKey: generateLicenseKey(),
      },
    });

    // Automatically seed default catalog for the new company in the background
    // We don't await it to avoid delaying the response, but we trigger it now
    void DefaultCatalogService.seedForCompany(company.id).catch((err) => {
      console.error(`Failed to automatically seed company ${company.id}:`, err);
    });

    return reply.status(201).send({
      data: company,
      success: true,
    });
  });

  server.put(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const scopedCompanyId = resolveScopedCompanyId(request, reply);
      if (reply.sent) {
        return;
      }
      if (scopedCompanyId && scopedCompanyId !== request.params.id) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }

      const restrictedFields = findRestrictedSubscriptionFields(request.body);
      if (restrictedFields.length > 0) {
        return reply.status(400).send({
          error: `Paket alanlari sadece subscription admin modulu ile guncellenebilir: ${restrictedFields.join(', ')}`,
          success: false,
        });
      }

      const parsed = updateCompanySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz firma verisi',
          success: false,
        });
      }

      const existing = await prisma.company.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }

      const company = await prisma.company.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: company,
        success: true,
      };
    },
  );

  server.delete(
    '/:id',
    { preHandler: server.ensureSuperAdmin },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const company = await prisma.company.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!company) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }

      await prisma.company.update({
        data: { deletedAt: new Date() },
        where: { id: request.params.id },
      });

      return {
        message: 'Firma silindi',
        success: true,
      };
    },
  );
}


