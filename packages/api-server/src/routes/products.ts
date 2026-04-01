import type { Prisma } from '@prisma/client';
import {
  createProductSchema,
  paginationSchema,
  updateProductSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import { ensureCompanyOwnership, resolveScopedCompanyId } from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface BarcodeParams {
  barcode: string;
}

interface ProductListQuery {
  categoryId?: string;
  companyId?: string;
  quickAccess?: string;
  search?: string;
}

export async function productRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: ProductListQuery }>,
      reply: FastifyReply,
    ) => {
      const { limit, page } = paginationSchema.parse(request.query);
      const skip = (page - 1) * limit;
      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }

      const where: Prisma.ProductWhereInput = {
        deletedAt: null,
        isActive: true,
      };

      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }
      if (request.query.categoryId) {
        where.categoryId = request.query.categoryId;
      }
      if (request.query.quickAccess === 'true') {
        where.isQuickAccess = true;
      }
      if (request.query.search) {
        where.OR = [
          { name: { contains: request.query.search, mode: 'insensitive' } },
          { barcode: { contains: request.query.search } },
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          include: { category: true },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
          where,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        data: products,
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
        success: true,
      };
    },
  );

  server.get(
    '/barcode/:barcode',
    async (
      request: FastifyRequest<{ Params: BarcodeParams }>,
      reply: FastifyReply,
    ) => {
      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        request.user.companyId,
        { requiredForSuperAdmin: true },
      );
      if (reply.sent || !scopedCompanyId) {
        return;
      }

      const product = await prisma.product.findFirst({
        include: { category: true },
        where: {
          barcode: request.params.barcode,
          companyId: scopedCompanyId,
          deletedAt: null,
          isActive: true,
        },
      });

      if (!product) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }

      return {
        data: product,
        success: true,
      };
    },
  );

  server.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const product = await prisma.product.findFirst({
        include: {
          category: true,
          stockLevels: true,
        },
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });

      if (!product) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        product.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }

      return {
        data: product,
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz urun verisi',
        success: false,
      });
    }
    if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
      return;
    }

    if (parsed.data.categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          companyId: parsed.data.companyId,
          deletedAt: null,
          id: parsed.data.categoryId,
        },
      });
      if (!category) {
        return reply.status(400).send({
          error: 'Kategori ayni firma icinde bulunamadi',
          success: false,
        });
      }
    }

    const existing = await prisma.product.findFirst({
      where: {
        barcode: parsed.data.barcode,
        companyId: parsed.data.companyId,
        deletedAt: null,
      },
    });

    if (existing) {
      return reply.status(409).send({
        error: 'Bu barkod zaten kullaniliyor',
        success: false,
      });
    }

    const product = await prisma.product.create({ data: parsed.data });
    return reply.status(201).send({
      data: product,
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
      const parsed = updateProductSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz urun verisi',
        success: false,
      });
    }
      if (
        typeof parsed.data.companyId === 'string' &&
        !ensureCompanyOwnership(request, reply, parsed.data.companyId)
      ) {
        return;
      }

      const existing = await prisma.product.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }

      const targetCompanyId =
        (typeof parsed.data.companyId === 'string' && parsed.data.companyId) ||
        existing.companyId;
      if (parsed.data.categoryId) {
        const category = await prisma.category.findFirst({
          where: {
            companyId: targetCompanyId,
            deletedAt: null,
            id: parsed.data.categoryId,
          },
        });
        if (!category) {
          return reply.status(400).send({
            error: 'Kategori ayni firma icinde bulunamadi',
            success: false,
          });
        }
      }

      const product = await prisma.product.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: product,
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
      const existing = await prisma.product.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Urun bulunamadi',
          success: false,
        });
      }

      await prisma.product.update({
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
        where: { id: request.params.id },
      });

      return {
        message: 'Urun silindi',
        success: true,
      };
    },
  );
}

