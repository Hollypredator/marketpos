import type { Prisma } from '@prisma/client';
import { createCategorySchema, updateCategorySchema } from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import { ensureCompanyOwnership, resolveScopedCompanyId } from '../lib/request-scope';

interface CategoryQuery {
  companyId?: string;
}

interface IdParams {
  id: string;
}

export async function categoryRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: CategoryQuery }>,
      reply: FastifyReply,
    ) => {
      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }

      const where: Prisma.CategoryWhereInput = {
        deletedAt: null,
      };
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }

      const categories = await prisma.category.findMany({
        include: {
          children: {
            orderBy: { sortOrder: 'asc' },
            where: { deletedAt: null },
          },
        },
        orderBy: { sortOrder: 'asc' },
        where,
      });

      const rootCategories = categories.filter((category) => !category.parentId);
      return {
        data: rootCategories,
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz kategori verisi',
        success: false,
      });
    }
    if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
      return;
    }

    if (parsed.data.parentId) {
      const parent = await prisma.category.findFirst({
        where: {
          companyId: parsed.data.companyId,
          deletedAt: null,
          id: parsed.data.parentId,
        },
      });
      if (!parent) {
        return reply.status(400).send({
          error: 'Ust kategori ayni firma icinde bulunamadi',
          success: false,
        });
      }
    }

    const category = await prisma.category.create({
      data: parsed.data,
    });

    return reply.status(201).send({
      data: category,
      success: true,
    });
    },
  );

  server.put(
    '/:id',
    { preHandler: server.ensureBackofficeWriter },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateCategorySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz kategori verisi',
        success: false,
      });
    }
      if (
        typeof parsed.data.companyId === 'string' &&
        !ensureCompanyOwnership(request, reply, parsed.data.companyId)
      ) {
        return;
      }

      const existing = await prisma.category.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kategori bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kategori bulunamadi',
          success: false,
        });
      }

      const targetCompanyId =
        (typeof parsed.data.companyId === 'string' && parsed.data.companyId) ||
        existing.companyId;
      if (parsed.data.parentId) {
        const parent = await prisma.category.findFirst({
          where: {
            companyId: targetCompanyId,
            deletedAt: null,
            id: parsed.data.parentId,
          },
        });
        if (!parent) {
          return reply.status(400).send({
            error: 'Ust kategori ayni firma icinde bulunamadi',
            success: false,
          });
        }
      }

      const category = await prisma.category.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: category,
        success: true,
      };
    },
  );

  server.delete(
    '/:id',
    { preHandler: server.ensureBackofficeWriter },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.category.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kategori bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kategori bulunamadi',
          success: false,
        });
      }

      await prisma.category.update({
        data: { deletedAt: new Date() },
        where: { id: request.params.id },
      });

      return {
        message: 'Kategori silindi',
        success: true,
      };
    },
  );
}

