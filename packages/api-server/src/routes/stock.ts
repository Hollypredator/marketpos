import type { Prisma } from '@prisma/client';
import {
  closeRegisterSessionSchema,
  createStockMovementSchema,
  openRegisterSessionSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

interface BranchQuery {
  branchId: string;
}

interface SessionActiveQuery {
  registerId: string;
}

interface SessionIdParams {
  id: string;
}

interface MovementsQuery {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  maxQuantity?: string;
  minQuantity?: string;
  page?: string;
  productId?: string;
  search?: string;
  type?: string;
  userSearch?: string;
}

interface LowStockRow {
  barcode: string;
  branch_id: string;
  min_stock: number;
  name: string;
  product_id: string;
  quantity: number;
  updated_at: Date;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeClientRequestId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length < 8) {
    return null;
  }
  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function parseOptionalFloat(value?: string): number | null {
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
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function findScopedBranch(
  branchId: string,
  request: FastifyRequest,
): Promise<{ companyId: string; id: string } | null> {
  const branch = await prisma.branch.findFirst({
    select: {
      companyId: true,
      id: true,
    },
    where: {
      deletedAt: null,
      id: branchId,
    },
  });
  if (!branch) {
    return null;
  }
  if (
    request.user.role !== 'SUPER_ADMIN' &&
    branch.companyId !== request.user.companyId
  ) {
    return null;
  }
  return branch;
}

async function findScopedRegister(
  registerId: string,
  request: FastifyRequest,
): Promise<{ branchId: string; id: string } | null> {
  const register = await prisma.register.findFirst({
    include: {
      branch: {
        select: {
          companyId: true,
        },
      },
    },
    where: {
      deletedAt: null,
      id: registerId,
    },
  });
  if (!register) {
    return null;
  }
  if (
    request.user.role !== 'SUPER_ADMIN' &&
    register.branch.companyId !== request.user.companyId
  ) {
    return null;
  }
  return {
    branchId: register.branchId,
    id: register.id,
  };
}

export async function stockRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/levels',
    async (
      request: FastifyRequest<{ Querystring: BranchQuery }>,
      reply,
    ) => {
      const branch = await findScopedBranch(request.query.branchId, request);
      if (!branch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      const stockLevels = await prisma.stockLevel.findMany({
        include: {
          product: {
            select: {
              barcode: true,
              id: true,
              isActive: true,
              minStock: true,
              name: true,
              salePrice: true,
            },
          },
        },
        orderBy: { product: { name: 'asc' } },
        where: { branchId: branch.id },
      });

      return {
        data: stockLevels,
        success: true,
      };
    },
  );

  server.get(
    '/low',
    async (
      request: FastifyRequest<{ Querystring: BranchQuery }>,
      reply,
    ) => {
      const branch = await findScopedBranch(request.query.branchId, request);
      if (!branch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      const lowStock = await prisma.$queryRaw<LowStockRow[]>`
        SELECT sl.product_id, sl.branch_id, sl.quantity, sl.updated_at, p.name, p.barcode, p.min_stock
        FROM stock_levels sl
        JOIN products p ON p.id = sl.product_id
        WHERE sl.branch_id = ${branch.id}
          AND sl.quantity <= p.min_stock
          AND p.is_active = true
          AND p.deleted_at IS NULL
        ORDER BY sl.quantity ASC
      `;

      return {
        data: lowStock,
        success: true,
      };
    },
  );

  server.post(
    '/movement',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createStockMovementSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz stok hareketi',
          success: false,
        });
      }

      const {
        branchId,
        clientRequestId,
        note,
        productId,
        quantity,
        reference,
      } = parsed.data;
      const rawRequestedType =
        typeof (request.body as { type?: string } | undefined)?.type === 'string'
          ? (request.body as { type?: string }).type
          : undefined;
      const requestedType =
        rawRequestedType &&
        ['PURCHASE', 'SALE', 'REFUND', 'ADJUSTMENT', 'WASTE'].includes(rawRequestedType)
          ? (rawRequestedType as Prisma.StockMovementUncheckedCreateInput['type'])
          : undefined;
      const scopedBranch = await findScopedBranch(branchId, request);
      if (!scopedBranch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }
      const normalizedClientRequestId = normalizeClientRequestId(clientRequestId);
      if (normalizedClientRequestId) {
        const replayed = await prisma.stockMovement.findFirst({
          where: {
            branchId,
            clientRequestId: normalizedClientRequestId,
          },
        });
        if (replayed) {
          return reply.status(200).send({
            data: replayed,
            success: true,
          });
        }
      }
      const type: Prisma.StockMovementUncheckedCreateInput['type'] =
        requestedType ?? (quantity > 0 ? 'PURCHASE' : 'ADJUSTMENT');
      let result;
      try {
        result = await prisma.$transaction(async (tx) => {
          const product = await tx.product.findFirst({
            where: {
              companyId: scopedBranch.companyId,
              deletedAt: null,
              id: productId,
            },
          });
          if (!product) {
            throw new Error('Urun ayni firma icinde bulunamadi');
          }

          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_branchId: {
                branchId,
                productId,
              },
            },
          });

          const previousQuantity = stockLevel?.quantity ?? 0;
          const newQuantity = previousQuantity + quantity;

          await tx.stockLevel.upsert({
            create: {
              branchId,
              productId,
              quantity: newQuantity,
            },
            update: { quantity: newQuantity },
            where: {
              productId_branchId: {
                branchId,
                productId,
              },
            },
          });

          return tx.stockMovement.create({
            data: {
              branchId,
              clientRequestId: normalizedClientRequestId,
              newQuantity,
              note,
              previousQuantity,
              productId,
              quantity,
              reference,
              type,
              userId: request.user.id,
            },
          });
        });
      } catch (error: unknown) {
        if (!isUniqueConstraintError(error) || !normalizedClientRequestId) {
          throw error;
        }
        const replayed = await prisma.stockMovement.findFirst({
          where: {
            branchId,
            clientRequestId: normalizedClientRequestId,
          },
        });
        if (!replayed) {
          throw error;
        }
        return reply.status(200).send({
          data: replayed,
          success: true,
        });
      }

      request.log.info(
        {
          branchId,
          event: 'stock.movement_create',
          movementId: result.id,
          productId,
          type,
          userId: request.user.id,
        },
        'Stock movement created',
      );

      return reply.status(201).send({
        data: result,
        success: true,
      });
    },
  );

  server.get(
    '/movements',
    async (
      request: FastifyRequest<{ Querystring: MovementsQuery }>,
      reply,
    ) => {
      const limit = parsePositiveInt(request.query.limit, 50);
      const page = parsePositiveInt(request.query.page, 1);
      const skip = (page - 1) * limit;

      const where: Prisma.StockMovementWhereInput = {};
      if (request.query.branchId) {
        const branch = await findScopedBranch(request.query.branchId, request);
        if (!branch) {
          return reply.status(404).send({
            error: 'Sube bulunamadi',
            success: false,
          });
        }
        where.branchId = request.query.branchId;
      } else if (request.user.role !== 'SUPER_ADMIN') {
        where.branch = {
          companyId: request.user.companyId,
          deletedAt: null,
        };
      }
      if (request.query.productId) {
        where.product =
          request.user.role === 'SUPER_ADMIN'
            ? {
                deletedAt: null,
                id: request.query.productId,
              }
            : {
                companyId: request.user.companyId,
                deletedAt: null,
                id: request.query.productId,
              };
      }
      if (typeof request.query.type === 'string' && request.query.type.length > 0) {
        where.type = request.query.type as any;
      }
      if (typeof request.query.userSearch === 'string' && request.query.userSearch.length > 0) {
        where.user = {
          fullName: { contains: request.query.userSearch },
        };
      }
      const dateFrom = parseOptionalDate(request.query.dateFrom);
      const dateTo = parseOptionalDate(request.query.dateTo);
      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = dateFrom;
        }
        if (dateTo) {
          where.createdAt.lte = dateTo;
        }
      }

      const minQuantity = parseOptionalFloat(request.query.minQuantity);
      const maxQuantity = parseOptionalFloat(request.query.maxQuantity);
      if (typeof minQuantity === 'number' || typeof maxQuantity === 'number') {
        where.quantity = {};
        if (typeof minQuantity === 'number') {
          where.quantity.gte = minQuantity;
        }
        if (typeof maxQuantity === 'number') {
          where.quantity.lte = maxQuantity;
        }
      }

      if (typeof request.query.search === 'string' && request.query.search.trim().length > 0) {
        const search = request.query.search.trim();
        const currentOr = Array.isArray(where.OR) ? where.OR : [];
        where.OR = [
          ...currentOr,
          { note: { contains: search } },
          { reference: { contains: search } },
          { product: { barcode: { contains: search } } },
          { product: { name: { contains: search } } },
        ];
      }

      const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
          include: {
            product: { select: { barcode: true, name: true } },
            user: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.stockMovement.count({ where }),
      ]);

      return {
        data: movements,
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
        success: true,
      };
    },
  );

  server.post('/session/open', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = openRegisterSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz oturum acilis verisi',
        success: false,
      });
    }

    const { openingBalance, registerId } = parsed.data;
    const existingSession = await prisma.registerSession.findFirst({
      where: {
        registerId,
        status: 'OPEN',
      },
    });
    if (existingSession) {
      return reply.status(409).send({
        error: 'Bu kasada zaten acik bir oturum var',
        success: false,
      });
    }

    const register = await findScopedRegister(registerId, request);
    if (!register) {
      return reply.status(404).send({
        error: 'Kasa bulunamadi',
        success: false,
      });
    }

    const session = await prisma.registerSession.create({
      data: {
        branchId: register.branchId,
        openingBalance,
        registerId,
        userId: request.user.id,
      },
    });

    return reply.status(201).send({
      data: session,
      success: true,
    });
  });

  server.post(
    '/session/:id/close',
    async (
      request: FastifyRequest<{ Params: SessionIdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = closeRegisterSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz oturum kapama verisi',
          success: false,
        });
      }

      const session = await prisma.registerSession.findUnique({
        include: {
          branch: {
            select: {
              companyId: true,
            },
          },
        },
        where: { id: request.params.id },
      });
      if (!session) {
        return reply.status(404).send({
          error: 'Oturum bulunamadi',
          success: false,
        });
      }
      if (session.status === 'CLOSED') {
        return reply.status(409).send({
          error: 'Oturum zaten kapatilmis',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        session.branch.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Oturum bulunamadi',
          success: false,
        });
      }

      const expectedBalance =
        session.openingBalance + session.totalCashSales - session.totalRefunds;
      
      const closedAt = new Date();
      let difference = parsed.data.closingBalance - expectedBalance;
      if (parsed.data.declaredCash !== undefined) {
         // Eğer gişe görevlisi manuel nakit girdiyse hata (kasa farkı) nakit bazlı hesaplanır
         difference = parsed.data.declaredCash - expectedBalance;
      }

      const updated = await prisma.registerSession.update({
        data: {
          closedAt,
          closingBalance: parsed.data.closingBalance,
          declaredCash: parsed.data.declaredCash,
          difference,
          expectedBalance,
          note: parsed.data.note,
          status: 'CLOSED',
        },
        where: { id: request.params.id },
      });

      return {
        data: updated,
        success: true,
      };
    },
  );

  server.get(
    '/session/active',
    async (
      request: FastifyRequest<{ Querystring: SessionActiveQuery }>,
      reply: FastifyReply,
    ) => {
      const register = await findScopedRegister(request.query.registerId, request);
      if (!register) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }

      const session = await prisma.registerSession.findFirst({
        where: {
          registerId: register.id,
          status: 'OPEN',
        },
      });

      if (!session) {
        return reply.status(404).send({
          error: 'Acik oturum bulunamadi',
          success: false,
        });
      }

      return {
        data: session,
        success: true,
      };
    },
  );
}

