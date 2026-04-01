import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

interface DailyQuery {
  branchId: string;
  companyId?: string;
  date?: string;
}

interface TopProductsQuery {
  branchId?: string;
  companyId?: string;
  from?: string;
  limit?: string;
  to?: string;
}

interface SessionsQuery {
  companyId?: string;
  from?: string;
  registerId?: string;
  to?: string;
}

interface BranchComparisonQuery {
  companyId?: string;
  from?: string;
  to?: string;
}

interface OperationsHealthQuery {
  branchId?: string;
  companyId?: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toStartOfDay(date: Date): Date {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return target;
}

function toEndOfDay(date: Date): Date {
  const target = new Date(date);
  target.setHours(23, 59, 59, 999);
  return target;
}

function resolveDateRange(from?: string, to?: string): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const rawFrom = from ? new Date(from) : defaultFrom;
  const rawTo = to ? new Date(to) : now;

  const safeFrom = Number.isNaN(rawFrom.getTime()) ? defaultFrom : rawFrom;
  const safeTo = Number.isNaN(rawTo.getTime()) ? now : rawTo;

  const normalizedFrom = toStartOfDay(safeFrom);
  const normalizedTo = toEndOfDay(safeTo);
  if (normalizedFrom <= normalizedTo) {
    return { from: normalizedFrom, to: normalizedTo };
  }
  return { from: toStartOfDay(safeTo), to: toEndOfDay(safeFrom) };
}

function resolveTargetCompanyId(
  request: FastifyRequest,
  reply: FastifyReply,
  requestedCompanyId?: string,
): string | null {
  if (request.user.role === 'SUPER_ADMIN') {
    const candidate = requestedCompanyId?.trim() ?? request.user.companyId;
    return candidate && candidate.length > 0 ? candidate : null;
  }
  if (
    requestedCompanyId &&
    requestedCompanyId.trim().length > 0 &&
    requestedCompanyId !== request.user.companyId
  ) {
    reply.status(403).send({
      error: 'Sadece kendi firma verisine erisebilirsiniz',
      success: false,
    });
    return null;
  }
  return request.user.companyId;
}

export async function reportRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);
  server.addHook('onRequest', server.ensureReportReader);

  server.get(
    '/daily',
    async (
      request: FastifyRequest<{ Querystring: DailyQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }
      if (!companyId) {
        return reply.status(400).send({
          error: 'companyId zorunludur',
          success: false,
        });
      }
      const branch = await prisma.branch.findFirst({
        select: { id: true },
        where: {
          companyId,
          deletedAt: null,
          id: request.query.branchId,
        },
      });
      if (!branch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      const date = request.query.date ? new Date(request.query.date) : new Date();
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const saleWhere: Prisma.SaleWhereInput = {
        branchId: request.query.branchId,
        companyId,
        createdAt: { gte: dayStart, lte: dayEnd },
        deletedAt: null,
      };

      const [sales, refunds, byPayment] = await Promise.all([
        prisma.sale.aggregate({
          _count: true,
          _sum: { grandTotal: true, totalDiscount: true, totalVat: true },
          where: saleWhere,
        }),
        prisma.refund.aggregate({
          _count: true,
          _sum: { totalAmount: true },
          where: {
            branchId: request.query.branchId,
            companyId,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.payment.groupBy({
          _sum: { amount: true },
          by: ['method'],
          where: { sale: saleWhere },
        }),
      ]);

      const totalSales = sales._sum.grandTotal ?? 0;
      const totalRefunds = refunds._sum.totalAmount ?? 0;

      return {
        data: {
          date: date.toISOString().slice(0, 10),
          netSales: totalSales - totalRefunds,
          paymentBreakdown: byPayment.map((item) => ({
            method: item.method,
            total: item._sum.amount ?? 0,
          })),
          refundsCount: refunds._count,
          salesCount: sales._count,
          totalRefunds,
          totalSales,
          totalVat: sales._sum.totalVat ?? 0,
        },
        success: true,
      };
    },
  );

  server.get(
    '/top-products',
    async (
      request: FastifyRequest<{ Querystring: TopProductsQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }
      if (!companyId) {
        return reply.status(400).send({
          error: 'companyId zorunludur',
          success: false,
        });
      }

      const limit = parsePositiveInt(request.query.limit, 20);
      const { from, to } = resolveDateRange(request.query.from, request.query.to);
      const createdAtFilter: Prisma.DateTimeFilter = { gte: from, lte: to };

      const saleFilter: Prisma.SaleWhereInput = {
        companyId,
        deletedAt: null,
        status: 'COMPLETED',
      };
      if (request.query.branchId) {
        const branch = await prisma.branch.findFirst({
          select: { id: true },
          where: {
            companyId,
            deletedAt: null,
            id: request.query.branchId,
          },
        });
        if (!branch) {
          return reply.status(404).send({
            error: 'Sube bulunamadi',
            success: false,
          });
        }
        saleFilter.branchId = request.query.branchId;
      }
      if (Object.keys(createdAtFilter).length > 0) {
        saleFilter.createdAt = createdAtFilter;
      }

      const top = await prisma.saleItem.groupBy({
        _count: true,
        _sum: { lineTotal: true, quantity: true },
        by: ['productId', 'productName'],
        orderBy: { _sum: { lineTotal: 'desc' } },
        take: limit,
        where: { sale: saleFilter },
      });

      return {
        data: top.map((item) => ({
          count: item._count,
          productId: item.productId,
          productName: item.productName,
          totalQuantity: item._sum.quantity ?? 0,
          totalRevenue: item._sum.lineTotal ?? 0,
        })),
        success: true,
      };
    },
  );

  server.get(
    '/sessions',
    async (
      request: FastifyRequest<{ Querystring: SessionsQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }
      if (!companyId) {
        return reply.status(400).send({
          error: 'companyId zorunludur',
          success: false,
        });
      }

      const { from, to } = resolveDateRange(request.query.from, request.query.to);
      const where: Prisma.RegisterSessionWhereInput = {
        branch: {
          companyId,
        },
        status: 'CLOSED',
      };
      if (request.query.registerId) {
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
            id: request.query.registerId,
          },
        });
        if (!register || register.branch.companyId !== companyId) {
          return reply.status(404).send({
            error: 'Kasa bulunamadi',
            success: false,
          });
        }
        where.registerId = request.query.registerId;
      }
      where.createdAt = { gte: from, lte: to };

      const sessions = await prisma.registerSession.findMany({
        include: {
          register: {
            select: { name: true },
          },
          user: {
            select: { fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        where,
      });

      return {
        data: sessions,
        success: true,
      };
    },
  );

  server.get(
    '/branch-comparison',
    async (
      request: FastifyRequest<{ Querystring: BranchComparisonQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }
      if (!companyId) {
        return reply.status(400).send({
          error: 'companyId zorunludur',
          success: false,
        });
      }

      const { from, to } = resolveDateRange(request.query.from, request.query.to);
      const [branchRows, salesRows, refundRows] = await Promise.all([
        prisma.branch.findMany({
          select: {
            id: true,
            name: true,
          },
          where: {
            companyId,
            deletedAt: null,
          },
        }),
        prisma.sale.groupBy({
          _count: true,
          _sum: {
            grandTotal: true,
            totalVat: true,
          },
          by: ['branchId'],
          where: {
            companyId,
            createdAt: {
              gte: from,
              lte: to,
            },
            deletedAt: null,
          },
        }),
        prisma.refund.groupBy({
          _count: true,
          _sum: {
            totalAmount: true,
          },
          by: ['branchId'],
          where: {
            companyId,
            createdAt: {
              gte: from,
              lte: to,
            },
          },
        }),
      ]);

      const salesByBranch = new Map(
        salesRows.map((row) => [row.branchId, row] as const),
      );
      const refundsByBranch = new Map(
        refundRows.map((row) => [row.branchId, row] as const),
      );

      const rows = branchRows
        .map((branch) => {
          const sales = salesByBranch.get(branch.id);
          const refunds = refundsByBranch.get(branch.id);
          const totalSales = sales?._sum.grandTotal ?? 0;
          const totalRefunds = refunds?._sum.totalAmount ?? 0;

          return {
            branchId: branch.id,
            branchName: branch.name,
            netSales: totalSales - totalRefunds,
            refundsCount: refunds?._count ?? 0,
            salesCount: sales?._count ?? 0,
            totalRefunds,
            totalSales,
            totalVat: sales?._sum.totalVat ?? 0,
          };
        })
        .sort((left, right) => right.netSales - left.netSales);

      return {
        data: rows,
        meta: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        success: true,
      };
    },
  );

  server.get(
    '/operations-health',
    async (
      request: FastifyRequest<{ Querystring: OperationsHealthQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }
      if (!companyId) {
        return reply.status(400).send({
          error: 'companyId zorunludur',
          success: false,
        });
      }

      const company = await prisma.company.findFirst({
        select: {
          id: true,
          name: true,
        },
        where: {
          id: companyId,
        },
      });

      if (!company) {
        return reply.status(404).send({
          error: 'Firma bulunamadi',
          success: false,
        });
      }
      if (request.query.branchId) {
        const requestedBranch = await prisma.branch.findFirst({
          select: { id: true },
          where: {
            companyId,
            deletedAt: null,
            id: request.query.branchId,
          },
        });
        if (!requestedBranch) {
          return reply.status(404).send({
            error: 'Sube bulunamadi',
            success: false,
          });
        }
      }

      const branches = await prisma.branch.findMany({
        include: {
          registers: {
            select: {
              id: true,
              isActive: true,
              name: true,
            },
            where: {
              deletedAt: null,
            },
          },
        },
        where: {
          companyId,
          deletedAt: null,
          ...(request.query.branchId ? { id: request.query.branchId } : {}),
        },
      });

      const registerIds = branches.flatMap((branch) =>
        branch.registers.map((register) => register.id),
      );

      const [openSessions, queueRows, syncRows] =
        registerIds.length > 0
          ? await Promise.all([
              prisma.registerSession.findMany({
                orderBy: {
                  updatedAt: 'desc',
                },
                select: {
                  registerId: true,
                  updatedAt: true,
                },
                where: {
                  registerId: { in: registerIds },
                  status: 'OPEN',
                },
              }),
              prisma.syncLog.groupBy({
                _count: { _all: true },
                by: ['registerId', 'status'],
                where: {
                  registerId: { in: registerIds },
                  status: {
                    in: ['PENDING', 'FAILED', 'CONFLICT'],
                  },
                },
              }),
              prisma.syncLog.groupBy({
                _max: { createdAt: true, syncedAt: true },
                by: ['registerId'],
                where: {
                  registerId: { in: registerIds },
                  status: 'SYNCED',
                },
              }),
            ])
          : [[], [], []];

      const latestOpenSessionByRegister = new Map<string, Date>();
      for (const row of openSessions) {
        if (!latestOpenSessionByRegister.has(row.registerId)) {
          latestOpenSessionByRegister.set(row.registerId, row.updatedAt);
        }
      }

      const queueByRegister = new Map<
        string,
        { failedQueueCount: number; pendingQueueCount: number }
      >();
      for (const row of queueRows) {
        const existing = queueByRegister.get(row.registerId) ?? {
          failedQueueCount: 0,
          pendingQueueCount: 0,
        };
        if (row.status === 'PENDING') {
          existing.pendingQueueCount += row._count._all;
        } else {
          existing.failedQueueCount += row._count._all;
        }
        queueByRegister.set(row.registerId, existing);
      }

      const lastSyncByRegister = new Map<string, string | null>();
      for (const row of syncRows) {
        const value = row._max.syncedAt ?? row._max.createdAt;
        lastSyncByRegister.set(row.registerId, value ? value.toISOString() : null);
      }

      let summaryLastSyncAt: string | null = null;
      const branchRows = branches.map((branch) => {
        const registerRows = branch.registers.map((register) => {
          const queue = queueByRegister.get(register.id) ?? {
            failedQueueCount: 0,
            pendingQueueCount: 0,
          };
          const openSessionUpdatedAt = latestOpenSessionByRegister.get(register.id);
          const lastSyncAt = lastSyncByRegister.get(register.id) ?? null;

          if (
            lastSyncAt &&
            (!summaryLastSyncAt ||
              new Date(lastSyncAt).getTime() > new Date(summaryLastSyncAt).getTime())
          ) {
            summaryLastSyncAt = lastSyncAt;
          }

          return {
            failedQueueCount: queue.failedQueueCount,
            id: register.id,
            isOnline: Boolean(openSessionUpdatedAt) && register.isActive,
            lastSyncAt,
            name: register.name,
            openSessionUpdatedAt: openSessionUpdatedAt
              ? openSessionUpdatedAt.toISOString()
              : null,
            pendingQueueCount: queue.pendingQueueCount,
          };
        });

        return {
          failedQueueTotal: registerRows.reduce(
            (sum, register) => sum + register.failedQueueCount,
            0,
          ),
          id: branch.id,
          lastSyncAt: registerRows
            .map((register) => register.lastSyncAt)
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null,
          name: branch.name,
          offlineRegisters: registerRows.filter((register) => !register.isOnline).length,
          onlineRegisters: registerRows.filter((register) => register.isOnline).length,
          pendingQueueTotal: registerRows.reduce(
            (sum, register) => sum + register.pendingQueueCount,
            0,
          ),
          registers: registerRows,
        };
      });

      const summary = {
        branchCount: branchRows.length,
        failedQueueTotal: branchRows.reduce((sum, branch) => sum + branch.failedQueueTotal, 0),
        lastSyncAt: summaryLastSyncAt,
        offlineRegisters: branchRows.reduce(
          (sum, branch) => sum + branch.offlineRegisters,
          0,
        ),
        onlineRegisters: branchRows.reduce((sum, branch) => sum + branch.onlineRegisters, 0),
        pendingQueueTotal: branchRows.reduce(
          (sum, branch) => sum + branch.pendingQueueTotal,
          0,
        ),
        registerCount: branchRows.reduce(
          (sum, branch) => sum + branch.registers.length,
          0,
        ),
      };

      return {
        data: {
          branches: branchRows,
          company,
          generatedAt: new Date().toISOString(),
          summary,
        },
        success: true,
      };
    },
  );
}

