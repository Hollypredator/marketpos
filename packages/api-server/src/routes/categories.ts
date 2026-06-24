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

interface DeleteCategoryBody {
  transferCategoryId?: string | null;
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
        { requiredForSuperAdmin: true },
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
    request.log.info(
      {
        categoryId: category.id,
        companyId: category.companyId,
        event: 'catalog.category_create',
        userId: request.user.id,
      },
      'Category created',
    );

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
      if (parsed.data.parentId && parsed.data.parentId === existing.id) {
        return reply.status(400).send({
          error: 'Kategori kendi ustune baglanamaz',
          success: false,
        });
      }
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
      request.log.info(
        {
          categoryId: category.id,
          companyId: category.companyId,
          event: 'catalog.category_update',
          userId: request.user.id,
        },
        'Category updated',
      );

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
      request: FastifyRequest<{ Body: DeleteCategoryBody; Params: IdParams }>,
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

      const transferCategoryId =
        typeof request.body?.transferCategoryId === 'string' &&
        request.body.transferCategoryId.trim().length > 0
          ? request.body.transferCategoryId.trim()
          : null;

      if (transferCategoryId && transferCategoryId === existing.id) {
        return reply.status(400).send({
          error: 'Kategori kendisine tasinamaz',
          success: false,
        });
      }

      if (transferCategoryId) {
        const transferCategory = await prisma.category.findFirst({
          where: {
            companyId: existing.companyId,
            deletedAt: null,
            id: transferCategoryId,
          },
        });
        if (!transferCategory) {
          return reply.status(400).send({
            error: 'Tasinacak hedef kategori bulunamadi',
            success: false,
          });
        }
      }

      const linkedProductCount = await prisma.product.count({
        where: {
          categoryId: existing.id,
          companyId: existing.companyId,
          deletedAt: null,
        },
      });
      if (linkedProductCount > 0 && !transferCategoryId) {
        return reply.status(409).send({
          error: 'Bu kategoride urun var. Silmek icin once hedef kategori secin veya islemi iptal edin.',
          success: false,
        });
      }

      await prisma.$transaction(async (tx) => {
        if (linkedProductCount > 0) {
          await tx.product.updateMany({
            data: { categoryId: transferCategoryId },
            where: {
              categoryId: existing.id,
              companyId: existing.companyId,
              deletedAt: null,
            },
          });
        }

        await tx.category.updateMany({
          data: { parentId: transferCategoryId ?? existing.parentId ?? null },
          where: {
            deletedAt: null,
            parentId: existing.id,
          },
        });

        await tx.category.update({
          data: { deletedAt: new Date() },
          where: { id: request.params.id },
        });
      });

      request.log.info(
        {
          categoryId: existing.id,
          event: 'catalog.category_delete',
          linkedProductCount,
          transferCategoryId,
          userId: request.user.id,
        },
        'Category soft-deleted with transfer workflow',
      );

      return {
        message: 'Kategori silindi',
        success: true,
      };
    },
  );
}

