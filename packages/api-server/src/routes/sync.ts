import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import prisma from '../lib/prisma';

const syncPushSchema = z.object({
  payments: z.array(z.record(z.unknown())).optional(),
  refunds: z.array(z.record(z.unknown())).optional(),
  refundItems: z.array(z.record(z.unknown())).optional(),
  registerId: z.string().uuid(),
  registerSessions: z.array(z.record(z.unknown())).optional(),
  sales: z.array(z.record(z.unknown())).optional(),
  saleItems: z.array(z.record(z.unknown())).optional(),
  stockMovements: z.array(z.record(z.unknown())).optional(),
});

interface SyncPullQuery {
  lastSyncAt?: string;
  registerId: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

export async function syncRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.post('/push', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = syncPushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz senkronizasyon verisi',
        success: false,
      });
    }

    const {
      payments = [],
      refunds = [],
      refundItems = [],
      registerId,
      registerSessions = [],
      sales = [],
      saleItems = [],
      stockMovements = [],
    } = parsed.data;
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
      return reply.status(404).send({
        error: 'Kasa bulunamadi',
        success: false,
      });
    }
    if (
      request.user.role !== 'SUPER_ADMIN' &&
      register.branch.companyId !== request.user.companyId
    ) {
      return reply.status(403).send({
        error: 'Sadece kendi firma kasalarina senkronizasyon yapabilirsiniz',
        success: false,
      });
    }

    const results = {
      errors: [] as string[],
      refunds: 0,
      sales: 0,
      sessions: 0,
      stockMovements: 0,
    };

    await prisma.$transaction(async (tx) => {
      for (const sale of sales) {
        try {
          await tx.sale.upsert({
            create: sale as Prisma.SaleUncheckedCreateInput,
            update: sale as Prisma.SaleUncheckedUpdateInput,
            where: { id: String((sale as { id?: string }).id ?? '') },
          });
          results.sales += 1;
        } catch (error: unknown) {
          const saleId = String((sale as { id?: string }).id ?? 'unknown');
          results.errors.push(`Sale ${saleId}: ${toErrorMessage(error)}`);
        }
      }

      for (const item of saleItems) {
        try {
          await tx.saleItem.upsert({
            create: item as Prisma.SaleItemUncheckedCreateInput,
            update: item as Prisma.SaleItemUncheckedUpdateInput,
            where: { id: String((item as { id?: string }).id ?? '') },
          });
        } catch {
          // no-op
        }
      }

      for (const payment of payments) {
        try {
          await tx.payment.upsert({
            create: payment as Prisma.PaymentUncheckedCreateInput,
            update: payment as Prisma.PaymentUncheckedUpdateInput,
            where: { id: String((payment as { id?: string }).id ?? '') },
          });
        } catch {
          // no-op
        }
      }

      for (const refund of refunds) {
        try {
          await tx.refund.upsert({
            create: refund as Prisma.RefundUncheckedCreateInput,
            update: refund as Prisma.RefundUncheckedUpdateInput,
            where: { id: String((refund as { id?: string }).id ?? '') },
          });
          results.refunds += 1;
        } catch (error: unknown) {
          const refundId = String((refund as { id?: string }).id ?? 'unknown');
          results.errors.push(`Refund ${refundId}: ${toErrorMessage(error)}`);
        }
      }

      for (const item of refundItems) {
        try {
          await tx.refundItem.upsert({
            create: item as Prisma.RefundItemUncheckedCreateInput,
            update: item as Prisma.RefundItemUncheckedUpdateInput,
            where: { id: String((item as { id?: string }).id ?? '') },
          });
        } catch {
          // no-op
        }
      }

      for (const movement of stockMovements) {
        try {
          await tx.stockMovement.upsert({
            create: movement as Prisma.StockMovementUncheckedCreateInput,
            update: movement as Prisma.StockMovementUncheckedUpdateInput,
            where: { id: String((movement as { id?: string }).id ?? '') },
          });
          results.stockMovements += 1;
        } catch {
          // no-op
        }
      }

      for (const session of registerSessions) {
        try {
          await tx.registerSession.upsert({
            create: session as Prisma.RegisterSessionUncheckedCreateInput,
            update: session as Prisma.RegisterSessionUncheckedUpdateInput,
            where: { id: String((session as { id?: string }).id ?? '') },
          });
          results.sessions += 1;
        } catch {
          // no-op
        }
      }
    });

    await prisma.syncLog.create({
      data: {
        data: JSON.stringify(results),
        operation: 'INSERT',
        recordId: 'batch',
        registerId,
        status: results.errors.length > 0 ? 'FAILED' : 'SYNCED',
        tableName: 'push',
      },
    });

    return {
      data: results,
      success: true,
    };
  });

  server.get(
    '/pull',
    async (
      request: FastifyRequest<{ Querystring: SyncPullQuery }>,
      reply: FastifyReply,
    ) => {
      const since = request.query.lastSyncAt
        ? new Date(request.query.lastSyncAt)
        : new Date(0);

      const register = await prisma.register.findUnique({
        include: { branch: true },
        where: { id: request.query.registerId },
      });
      if (!register) {
        throw new Error('Kasa bulunamadi');
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        register.branch.companyId !== request.user.companyId
      ) {
        return reply.status(403).send({
          error: 'Sadece kendi firma kasalarina erisebilirsiniz',
          success: false,
        });
      }

      const [products, categories, users, stockLevels] = await Promise.all([
        prisma.product.findMany({
          where: {
            companyId: request.user.companyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.category.findMany({
          where: {
            companyId: request.user.companyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.user.findMany({
          select: {
            branchId: true,
            companyId: true,
            createdAt: true,
            deletedAt: true,
            fullName: true,
            id: true,
            isActive: true,
            role: true,
            updatedAt: true,
            username: true,
          },
          where: {
            companyId: request.user.companyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.stockLevel.findMany({
          where: {
            branchId: register.branchId,
            updatedAt: { gt: since },
          },
        }),
      ]);

      return {
        data: {
          branches: [register.branch],
          categories,
          lastSyncAt: new Date().toISOString(),
          products,
          registers: [register],
          stockLevels,
          users,
        },
        success: true,
      };
    },
  );
}

