import type { Prisma } from '@prisma/client';
import {
  createProductSchema,
  paginationSchema,
  updateProductSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { moneyFromMinorOrFloat, toMinor } from '../lib/money';
import prisma from '../lib/prisma';
import { ensureCompanyOwnership, resolveScopedCompanyId } from '../lib/request-scope';
import { DefaultCatalogService } from '../lib/catalog/defaultCatalogService';

interface IdParams {
  id: string;
}

interface BarcodeParams {
  barcode: string;
}

interface ProductListQuery {
  active?: string;
  brand?: string;
  categoryId?: string;
  companyId?: string;
  includeInactive?: string;
  maxPrice?: string;
  maxPurchasePrice?: string;
  minPrice?: string;
  minPurchasePrice?: string;
  quickAccess?: string;
  search?: string;
  supplierId?: string;
  updatedFrom?: string;
  updatedTo?: string;
  vatRate?: string;
}

interface BulkUpdateProductResultRow {
  changed: boolean;
  id: string;
  message?: string;
  next: {
    categoryId: string | null;
    isActive: boolean;
    minStock: number;
    salePrice: number;
  };
  previous: {
    categoryId: string | null;
    isActive: boolean;
    minStock: number;
    salePrice: number;
  };
  success: boolean;
}

const bulkProductUpdateSchema = z
  .object({
    categoryId: z.string().uuid().nullable().optional(),
    companyId: z.string().uuid(),
    isActive: z.boolean().optional(),
    minStock: z.number().int().min(0).optional(),
    mode: z.enum([
      'SET_PRICE',
      'ADJUST_PRICE_PERCENT',
      'SET_MIN_STOCK',
      'MOVE_CATEGORY',
      'SET_ACTIVE',
    ]),
    percentage: z.number().min(-100).max(1000).optional(),
    previewOnly: z.boolean().default(false),
    productIds: z.array(z.string().uuid()).min(1).max(500),
    salePrice: z.number().min(0).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.mode === 'SET_PRICE' && typeof payload.salePrice !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_PRICE icin salePrice zorunludur',
        path: ['salePrice'],
      });
    }
    if (
      payload.mode === 'ADJUST_PRICE_PERCENT' &&
      typeof payload.percentage !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADJUST_PRICE_PERCENT icin percentage zorunludur',
        path: ['percentage'],
      });
    }
    if (payload.mode === 'SET_MIN_STOCK' && typeof payload.minStock !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_MIN_STOCK icin minStock zorunludur',
        path: ['minStock'],
      });
    }
    if (payload.mode === 'MOVE_CATEGORY' && typeof payload.categoryId === 'undefined') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MOVE_CATEGORY icin categoryId zorunludur (null olabilir)',
        path: ['categoryId'],
      });
    }
    if (payload.mode === 'SET_ACTIVE' && typeof payload.isActive !== 'boolean') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SET_ACTIVE icin isActive zorunludur',
        path: ['isActive'],
      });
    }
  });

function parseOptionalNumber(value?: string): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalDate(value?: string): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function serializeProduct(product: Record<string, unknown>): Record<string, unknown> {
  const { purchasePrice, purchasePriceMinor, salePrice, salePriceMinor, ...rest } = product;
  return {
    ...rest,
    purchasePrice: moneyFromMinorOrFloat(
      purchasePrice as number | undefined,
      purchasePriceMinor as bigint | undefined,
    ),
    salePrice: moneyFromMinorOrFloat(
      salePrice as number | undefined,
      salePriceMinor as bigint | undefined,
    ),
  };
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
        { requiredForSuperAdmin: true },
      );
      if (reply.sent) {
        return;
      }

      const where: Prisma.ProductWhereInput = {
        deletedAt: null,
      };

      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }
      if (request.query.categoryId) {
        where.categoryId = request.query.categoryId;
      }
      if (request.query.supplierId) {
        where.supplierId = request.query.supplierId;
      }
      if (typeof request.query.brand === 'string' && request.query.brand.trim().length > 0) {
        where.brand = { contains: request.query.brand.trim() };
      }
      if (request.query.quickAccess === 'true') {
        where.isQuickAccess = true;
      }
      const activeFilter = request.query.active;
      const includeInactive = request.query.includeInactive === 'true';
      if (activeFilter === 'true') {
        where.isActive = true;
      } else if (activeFilter === 'false') {
        where.isActive = false;
      } else if (!includeInactive) {
        // Backward compatibility: callers that do not request inactive rows
        // continue to receive only active products.
        where.isActive = true;
      }

      const minPrice = parseOptionalNumber(request.query.minPrice);
      const maxPrice = parseOptionalNumber(request.query.maxPrice);
      if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
        where.salePrice = {};
        if (typeof minPrice === 'number') {
          where.salePrice.gte = minPrice;
        }
        if (typeof maxPrice === 'number') {
          where.salePrice.lte = maxPrice;
        }
      }
      const minPurchasePrice = parseOptionalNumber(request.query.minPurchasePrice);
      const maxPurchasePrice = parseOptionalNumber(request.query.maxPurchasePrice);
      if (
        typeof minPurchasePrice === 'number' ||
        typeof maxPurchasePrice === 'number'
      ) {
        where.purchasePrice = {};
        if (typeof minPurchasePrice === 'number') {
          where.purchasePrice.gte = minPurchasePrice;
        }
        if (typeof maxPurchasePrice === 'number') {
          where.purchasePrice.lte = maxPurchasePrice;
        }
      }

      const vatRate = parseOptionalNumber(request.query.vatRate);
      if (typeof vatRate === 'number') {
        where.vatRate = Math.round(vatRate);
      }

      const updatedFrom = parseOptionalDate(request.query.updatedFrom);
      const updatedTo = parseOptionalDate(request.query.updatedTo);
      if (updatedFrom || updatedTo) {
        where.updatedAt = {};
        if (updatedFrom) {
          where.updatedAt.gte = updatedFrom;
        }
        if (updatedTo) {
          where.updatedAt.lte = updatedTo;
        }
      }
      if (request.query.search) {
        where.OR = [
          { name: { contains: request.query.search } },
          { brand: { contains: request.query.search } },
          { barcode: { contains: request.query.search } },
          {
            category: {
              name: { contains: request.query.search },
            },
          },
          {
            supplier: {
              name: { contains: request.query.search },
            },
          },
        ];
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          include: { category: true, supplier: true },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
          where,
        }),
        prisma.product.count({ where }),
      ]);

      return {
        data: products.map((product) =>
          serializeProduct(product as unknown as Record<string, unknown>),
        ),
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
        include: { category: true, supplier: true },
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
        data: serializeProduct(product as unknown as Record<string, unknown>),
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
          supplier: true,
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
        data: serializeProduct(product as unknown as Record<string, unknown>),
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

      const normalizedRequestedId = normalizeOptionalId(parsed.data.id);
      if (normalizedRequestedId) {
        const replayedById = await prisma.product.findFirst({
          where: {
            companyId: parsed.data.companyId,
            deletedAt: null,
            id: normalizedRequestedId,
          },
        });
        if (replayedById) {
          return reply.status(200).send({
            data: serializeProduct(replayedById as unknown as Record<string, unknown>),
            success: true,
          });
        }
      }

      if (typeof parsed.data.categoryId === 'string') {
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
      if (typeof parsed.data.supplierId === 'string') {
        const supplier = await prisma.supplier.findFirst({
          where: {
            companyId: parsed.data.companyId,
            deletedAt: null,
            id: parsed.data.supplierId,
          },
        });
        if (!supplier) {
          return reply.status(400).send({
            error: 'Tedarikci ayni firma icinde bulunamadi',
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
        if (normalizedRequestedId && existing.id === normalizedRequestedId) {
          return reply.status(200).send({
            data: serializeProduct(existing as unknown as Record<string, unknown>),
            success: true,
          });
        }
        return reply.status(409).send({
          error: 'Bu barkod zaten kullaniliyor',
          success: false,
        });
      }

      const { clientRequestId: _ignoredClientRequestId, ...productData } = parsed.data;
      const product = await prisma.product.create({
        data: {
          ...productData,
          purchasePriceMinor: toMinor(parsed.data.purchasePrice),
          salePriceMinor: toMinor(parsed.data.salePrice),
        },
      });
      request.log.info(
        {
          event: 'catalog.product_create',
          productId: product.id,
          companyId: product.companyId,
          userId: request.user.id,
        },
        'Product created',
      );
      return reply.status(201).send({
        data: serializeProduct(product as unknown as Record<string, unknown>),
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

      if (
        typeof parsed.data.barcode === 'string' &&
        parsed.data.barcode.trim().length > 0 &&
        parsed.data.barcode.trim() !== existing.barcode
      ) {
        const duplicate = await prisma.product.findFirst({
          where: {
            barcode: parsed.data.barcode.trim(),
            companyId: targetCompanyId,
            deletedAt: null,
            id: { not: existing.id },
          },
        });
        if (duplicate) {
          return reply.status(409).send({
            error: 'Bu barkod zaten kullaniliyor',
            success: false,
          });
        }
      }

      if (typeof parsed.data.categoryId === 'string') {
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
      if (typeof parsed.data.supplierId === 'string') {
        const supplier = await prisma.supplier.findFirst({
          where: {
            companyId: targetCompanyId,
            deletedAt: null,
            id: parsed.data.supplierId,
          },
        });
        if (!supplier) {
          return reply.status(400).send({
            error: 'Tedarikci ayni firma icinde bulunamadi',
            success: false,
          });
        }
      }

      const {
        clientRequestId: _ignoredClientRequestId,
        companyId: _ignoredCompanyId,
        id: _ignoredId,
        ...updatableFields
      } = parsed.data;

      const product = await prisma.product.update({
        data: {
          ...updatableFields,
          barcode:
            typeof parsed.data.barcode === 'string'
              ? parsed.data.barcode.trim()
              : parsed.data.barcode,
          purchasePriceMinor:
            typeof parsed.data.purchasePrice === 'number'
              ? toMinor(parsed.data.purchasePrice)
              : undefined,
          salePriceMinor:
            typeof parsed.data.salePrice === 'number'
              ? toMinor(parsed.data.salePrice)
              : undefined,
        },
        where: { id: request.params.id },
      });
      request.log.info(
        {
          event: 'catalog.product_update',
          productId: product.id,
          companyId: product.companyId,
          userId: request.user.id,
        },
        'Product updated',
      );

      return {
        data: serializeProduct(product as unknown as Record<string, unknown>),
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
      request.log.info(
        {
          event: 'catalog.product_delete',
          productId: existing.id,
          companyId: existing.companyId,
          userId: request.user.id,
        },
        'Product soft-deleted',
      );

      return {
        message: 'Urun silindi',
        success: true,
      };
    },
  );

  server.post(
    '/bulk-update',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bulkProductUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz bulk urun guncellemesi',
          success: false,
        });
      }
      if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
        return;
      }

      const products = await prisma.product.findMany({
        where: {
          companyId: parsed.data.companyId,
          deletedAt: null,
          id: { in: parsed.data.productIds },
        },
      });

      if (products.length === 0) {
        return reply.status(404).send({
          error: 'Secilen urunler bulunamadi',
          success: false,
        });
      }

      if (parsed.data.mode === 'MOVE_CATEGORY' && parsed.data.categoryId) {
        const category = await prisma.category.findFirst({
          where: {
            companyId: parsed.data.companyId,
            deletedAt: null,
            id: parsed.data.categoryId,
          },
        });
        if (!category) {
          return reply.status(400).send({
            error: 'Hedef kategori ayni firma icinde bulunamadi',
            success: false,
          });
        }
      }

      const rows: BulkUpdateProductResultRow[] = products.map((product) => {
        const previous = {
          categoryId: product.categoryId,
          isActive: product.isActive,
          minStock: product.minStock,
          salePrice: product.salePrice,
        };

        const next = { ...previous };
        if (parsed.data.mode === 'SET_PRICE' && typeof parsed.data.salePrice === 'number') {
          next.salePrice = parsed.data.salePrice;
        } else if (
          parsed.data.mode === 'ADJUST_PRICE_PERCENT' &&
          typeof parsed.data.percentage === 'number'
        ) {
          next.salePrice = Math.max(
            0,
            Number((next.salePrice * (1 + parsed.data.percentage / 100)).toFixed(2)),
          );
        } else if (
          parsed.data.mode === 'SET_MIN_STOCK' &&
          typeof parsed.data.minStock === 'number'
        ) {
          next.minStock = parsed.data.minStock;
        } else if (parsed.data.mode === 'MOVE_CATEGORY') {
          next.categoryId =
            typeof parsed.data.categoryId === 'string' ? parsed.data.categoryId : null;
        } else if (
          parsed.data.mode === 'SET_ACTIVE' &&
          typeof parsed.data.isActive === 'boolean'
        ) {
          next.isActive = parsed.data.isActive;
        }

        const changed =
          previous.salePrice !== next.salePrice ||
          previous.minStock !== next.minStock ||
          previous.categoryId !== next.categoryId ||
          previous.isActive !== next.isActive;

        return {
          changed,
          id: product.id,
          next,
          previous,
          success: true,
        };
      });

      const preview = {
        mode: parsed.data.mode,
        sample: rows.slice(0, 5),
        totalRequested: parsed.data.productIds.length,
        totalResolved: rows.length,
        willChange: rows.filter((row) => row.changed).length,
      };

      if (parsed.data.previewOnly) {
        return {
          data: {
            preview,
            rows,
          },
          success: true,
        };
      }

      const failures: BulkUpdateProductResultRow[] = [];
      const successes: BulkUpdateProductResultRow[] = [];
      for (const row of rows) {
        try {
          await prisma.product.update({
            data: {
              ...row.next,
              salePriceMinor: toMinor(row.next.salePrice),
            },
            where: { id: row.id },
          });
          successes.push(row);
        } catch (error: unknown) {
          failures.push({
            ...row,
            message: error instanceof Error ? error.message : 'Guncelleme basarisiz',
            success: false,
          });
        }
      }

      request.log.info(
        {
          event: 'catalog.bulk_update',
          mode: parsed.data.mode,
          companyId: parsed.data.companyId,
          failed: failures.length,
          requested: parsed.data.productIds.length,
          updated: successes.length,
          userId: request.user.id,
        },
        'Catalog bulk update completed',
      );

      return {
        data: {
          preview,
          rows: [...successes, ...failures],
          summary: {
            failed: failures.length,
            requested: parsed.data.productIds.length,
            updated: successes.length,
          },
        },
        success: true,
      };
    },
  );

  server.post(
    '/setup-defaults',
    { preHandler: server.ensureBackofficeWriter },
    async (request: any, reply: FastifyReply) => {
      let companyId = request.user.companyId;

      // Allow Super Admins to override companyId from body
      if (request.user.role === 'SUPER_ADMIN' && request.body?.companyId) {
        companyId = request.body.companyId;
      }

      if (!companyId) {
        return reply.status(400).send({
          error: 'Firma bilgisi bulunamadi',
          success: false,
        });
      }

      try {
        const totalSynced = await DefaultCatalogService.seedForCompany(companyId);
        return {
          data: { totalSynced },
          message: `${totalSynced} urun basariyla sisteme tanimlandi.`,
          success: true,
        };
      } catch (error: any) {
        return reply.status(500).send({
          error: error.message || 'Varsayilan katalog yuklenirken bir hata olustu',
          success: false,
        });
      }
    },
  );
}

