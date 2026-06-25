import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

const isSqlite = process.env.DATABASE_URL?.startsWith('file:');

interface DailyQuery {
  branchId?: string;
  companyId?: string;
  date?: string;
  from?: string;
  to?: string;
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
  limit?: string;
  page?: string;
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

interface ProfitabilityQuery {
  branchId?: string;
  companyId?: string;
  from?: string;
  to?: string;
}

interface ExpiringProductsQuery {
  companyId?: string;
  daysThreshold?: string;
}

interface SyncSnapshotRow {
  last_sync_error_code: string | null;
  last_sync_status: string | null;
  oldest_pending_age_sec: number | null;
  pending_count: number | null;
  product_ops: number | null;
  queue_peak: number | null;
  refunds: number | null;
  register_id: string;
  sales: number | null;
  server_observed_at: Date | string | null;
  stock_ops: number | null;
}

interface SyncIngestionAggregateRow {
  accepted_24h: number | null;
  failed_24h: number | null;
  register_id: string;
  replayed_24h: number | null;
}

function safeInt(value: unknown, fallback = 0): number {
  if (typeof value === 'bigint') {
    return Number(value > 0n ? value : 0n);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return fallback;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function replayRate(acceptedCount: number, replayedCount: number): number {
  const denominator = acceptedCount + replayedCount;
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((replayedCount / denominator) * 10000) / 100;
}

async function loadSyncSnapshotRows(registerIds: string[]): Promise<SyncSnapshotRow[]> {
  if (registerIds.length === 0) {
    return [];
  }
  try {
    const placeholders = registerIds.map((_, index) => isSqlite ? '?' : `$${index + 1}`).join(', ');
    const query = `
      SELECT
        register_id,
        pending_count,
        sales,
        refunds,
        product_ops,
        stock_ops,
        queue_peak,
        oldest_pending_age_sec,
        last_sync_error_code,
        last_sync_status,
        server_observed_at
      FROM register_sync_snapshots
      WHERE register_id IN (${placeholders})
    `;
    return await prisma.$queryRawUnsafe<SyncSnapshotRow[]>(
      query,
      ...registerIds,
    );
  } catch {
    return [];
  }
}

async function loadIngestionAggregateRows(registerIds: string[]): Promise<SyncIngestionAggregateRow[]> {
  if (registerIds.length === 0) {
    return [];
  }
  try {
    const placeholders = registerIds.map((_, index) => isSqlite ? '?' : `$${index + 1}`).join(', ');
    const intervalQuery = isSqlite
      ? `updated_at >= datetime('now', '-24 hours')`
      : `updated_at >= NOW() - INTERVAL '24 hours'`;

    const castAccepted = isSqlite
      ? `SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END)`
      : `SUM(CASE WHEN status = 'ACCEPTED' THEN 1 ELSE 0 END)::int`;
    const castReplayed = isSqlite
      ? `SUM(CASE WHEN status = 'REPLAYED' THEN 1 ELSE 0 END)`
      : `SUM(CASE WHEN status = 'REPLAYED' THEN 1 ELSE 0 END)::int`;
    const castFailed = isSqlite
      ? `SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)`
      : `SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END)::int`;

    const query = `
      SELECT
        register_id,
        ${castAccepted} AS accepted_24h,
        ${castReplayed} AS replayed_24h,
        ${castFailed} AS failed_24h
      FROM sync_ingestion_operations
      WHERE register_id IN (${placeholders})
        AND ${intervalQuery}
      GROUP BY register_id
    `;
    return await prisma.$queryRawUnsafe<SyncIngestionAggregateRow[]>(
      query,
      ...registerIds,
    );
  } catch {
    return [];
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoundedPositiveInt(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = parsePositiveInt(value, fallback);
  return Math.min(parsed, max);
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
    const candidate = requestedCompanyId?.trim();
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

function sendBranchScopeForbidden(
  reply: FastifyReply,
  error: string,
  errorCode: string,
): null {
  reply.status(403).send({
    error,
    errorCode,
    success: false,
  });
  return null;
}

function resolveScopedBranchId(
  request: FastifyRequest,
  reply: FastifyReply,
  requestedBranchId?: string,
): string | undefined | null {
  const normalizedRequestedBranchId = requestedBranchId?.trim() ?? '';
  const branchScopedRole =
    request.user.role === 'CASHIER' || request.user.role === 'ACCOUNTANT';

  if (!branchScopedRole) {
    return normalizedRequestedBranchId.length > 0
      ? normalizedRequestedBranchId
      : undefined;
  }

  const actorBranchId = request.user.branchId?.trim() ?? '';
  if (actorBranchId.length === 0) {
    return sendBranchScopeForbidden(
      reply,
      'Bu rol icin branch scope zorunludur',
      'BRANCH_SCOPE_REQUIRED',
    );
  }
  if (
    normalizedRequestedBranchId.length > 0 &&
    normalizedRequestedBranchId !== actorBranchId
  ) {
    return sendBranchScopeForbidden(
      reply,
      'Sadece kendi sube verinize erisebilirsiniz',
      'BRANCH_SCOPE_FORBIDDEN',
    );
  }
  return actorBranchId;
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
      const scopedBranchId = resolveScopedBranchId(
        request,
        reply,
        request.query.branchId,
      );
      if (reply.sent) {
        return;
      }
      if (!scopedBranchId) {
        return reply.status(400).send({
          error: 'branchId zorunludur',
          success: false,
        });
      }
      const branch = await prisma.branch.findFirst({
        select: { id: true },
        where: {
          companyId,
          deletedAt: null,
          id: scopedBranchId,
        },
      });
      if (!branch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      let start: Date;
      let end: Date;
      let dateLabel: string;

      if (request.query.from && request.query.to) {
        const range = resolveDateRange(request.query.from, request.query.to);
        start = range.from;
        end = range.to;
        dateLabel = `${request.query.from} - ${request.query.to}`;
      } else {
        const date = request.query.date ? new Date(request.query.date) : new Date();
        start = new Date(date);
        start.setHours(0, 0, 0, 0);
        end = new Date(date);
        end.setHours(23, 59, 59, 999);
        dateLabel = date.toISOString().slice(0, 10);
      }

      const saleWhere: Prisma.SaleWhereInput = {
        branchId: scopedBranchId,
        companyId,
        createdAt: { gte: start, lte: end },
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
            branchId: scopedBranchId,
            companyId,
            createdAt: { gte: start, lte: end },
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
          date: dateLabel,
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
      const scopedBranchId = resolveScopedBranchId(
        request,
        reply,
        request.query.branchId,
      );
      if (reply.sent) {
        return;
      }

      const limit = parseBoundedPositiveInt(request.query.limit, 20, 200);
      const { from, to } = resolveDateRange(request.query.from, request.query.to);
      const createdAtFilter: Prisma.DateTimeFilter = { gte: from, lte: to };

      const saleFilter: Prisma.SaleWhereInput = {
        companyId,
        deletedAt: null,
        status: 'COMPLETED',
      };
      if (scopedBranchId) {
        const branch = await prisma.branch.findFirst({
          select: { id: true },
          where: {
            companyId,
            deletedAt: null,
            id: scopedBranchId,
          },
        });
        if (!branch) {
          return reply.status(404).send({
            error: 'Sube bulunamadi',
            success: false,
          });
        }
        saleFilter.branchId = scopedBranchId;
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
      const scopedBranchId = resolveScopedBranchId(request, reply);
      if (reply.sent) {
        return;
      }

      const { from, to } = resolveDateRange(request.query.from, request.query.to);
      const limit = parseBoundedPositiveInt(request.query.limit, 200, 1000);
      const page = parsePositiveInt(request.query.page, 1);
      const skip = (page - 1) * limit;
      const where: Prisma.RegisterSessionWhereInput = {
        branch: {
          companyId,
        },
        status: 'CLOSED',
      };
      if (scopedBranchId) {
        where.branchId = scopedBranchId;
      }
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
        if (
          !register ||
          register.branch.companyId !== companyId ||
          (scopedBranchId && register.branchId !== scopedBranchId)
        ) {
          return reply.status(404).send({
            error: 'Kasa bulunamadi',
            success: false,
          });
        }
        where.registerId = request.query.registerId;
      }
      where.createdAt = { gte: from, lte: to };

      const [sessions, total] = await Promise.all([
        prisma.registerSession.findMany({
          include: {
            register: {
              select: { name: true },
            },
            user: {
              select: { fullName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.registerSession.count({ where }),
      ]);

      return {
        data: sessions,
        meta: {
          limit,
          page,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
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
      const scopedBranchId = resolveScopedBranchId(request, reply);
      if (reply.sent) {
        return;
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
            ...(scopedBranchId ? { id: scopedBranchId } : {}),
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
            ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
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
            ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
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
      const scopedBranchId = resolveScopedBranchId(
        request,
        reply,
        request.query.branchId,
      );
      if (reply.sent) {
        return;
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
      if (scopedBranchId) {
        const requestedBranch = await prisma.branch.findFirst({
          select: { id: true },
          where: {
            companyId,
            deletedAt: null,
            id: scopedBranchId,
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
          ...(scopedBranchId ? { id: scopedBranchId } : {}),
        },
      });

      const registerIds = branches.flatMap((branch) =>
        branch.registers.map((register) => register.id),
      );

      const [openSessions, queueRows, syncRows, snapshotRows, ingestionRows] =
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
              loadSyncSnapshotRows(registerIds),
              loadIngestionAggregateRows(registerIds),
            ])
          : [[], [], [], [], []];

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

      const snapshotByRegister = new Map<string, SyncSnapshotRow>();
      for (const row of snapshotRows) {
        snapshotByRegister.set(row.register_id, row);
      }

      const ingestionByRegister = new Map<string, SyncIngestionAggregateRow>();
      for (const row of ingestionRows) {
        ingestionByRegister.set(row.register_id, row);
      }

      let summaryLastSyncAt: string | null = null;
      const nowTs = Date.now();
      const staleThresholdMs = 10 * 60 * 1000;
      const branchRows = branches.map((branch) => {
        const registerRows = branch.registers.map((register) => {
          const queue = queueByRegister.get(register.id) ?? {
            failedQueueCount: 0,
            pendingQueueCount: 0,
          };
          const openSessionUpdatedAt = latestOpenSessionByRegister.get(register.id);
          const lastSyncAt = lastSyncByRegister.get(register.id) ?? null;
          const snapshot = snapshotByRegister.get(register.id);
          const ingestion = ingestionByRegister.get(register.id);
          const accepted24h = safeInt(ingestion?.accepted_24h);
          const replayed24h = safeInt(ingestion?.replayed_24h);
          const failed24h = safeInt(ingestion?.failed_24h);
          const lastHeartbeatAt = toIso(snapshot?.server_observed_at);
          const lastSyncStatus = snapshot?.last_sync_status ?? 'IDLE';
          const staleHeartbeat =
            !lastHeartbeatAt ||
            nowTs - new Date(lastHeartbeatAt).getTime() > staleThresholdMs;
          const degraded =
            lastSyncStatus === 'DEGRADED' ||
            queue.failedQueueCount > 0 ||
            !register.isActive;

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
            lastHeartbeatAt,
            lastSyncErrorCode: snapshot?.last_sync_error_code ?? null,
            lastSyncStatus,
            name: register.name,
            oldestPendingAgeSec:
              snapshot?.oldest_pending_age_sec !== null &&
              typeof snapshot?.oldest_pending_age_sec !== 'undefined'
                ? safeInt(snapshot.oldest_pending_age_sec)
                : null,
            openSessionUpdatedAt: openSessionUpdatedAt
              ? openSessionUpdatedAt.toISOString()
              : null,
            pendingQueueCount: queue.pendingQueueCount,
            queuePeak:
              snapshot?.queue_peak !== null &&
              typeof snapshot?.queue_peak !== 'undefined'
                ? safeInt(snapshot.queue_peak)
                : 0,
            replayRate24h: replayRate(accepted24h, replayed24h),
            accepted24h,
            replayed24h,
            failed24h,
            staleHeartbeat,
            degraded,
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
        accepted24hTotal: branchRows.reduce(
          (sum, branch) =>
            sum +
            branch.registers.reduce((registerSum, register) => registerSum + register.accepted24h, 0),
          0,
        ),
        branchCount: branchRows.length,
        degradedRegisters: branchRows.reduce(
          (sum, branch) =>
            sum + branch.registers.filter((register) => register.degraded).length,
          0,
        ),
        failed24hTotal: branchRows.reduce(
          (sum, branch) =>
            sum +
            branch.registers.reduce((registerSum, register) => registerSum + register.failed24h, 0),
          0,
        ),
        failedQueueTotal: branchRows.reduce((sum, branch) => sum + branch.failedQueueTotal, 0),
        lastSyncAt: summaryLastSyncAt,
        oldestPendingAgeSecMax: branchRows
          .flatMap((branch) => branch.registers)
          .map((register) => register.oldestPendingAgeSec)
          .filter((value): value is number => typeof value === 'number')
          .sort((left, right) => right - left)[0] ?? null,
        offlineRegisters: branchRows.reduce(
          (sum, branch) => sum + branch.offlineRegisters,
          0,
        ),
        onlineRegisters: branchRows.reduce((sum, branch) => sum + branch.onlineRegisters, 0),
        pendingQueueTotal: branchRows.reduce(
          (sum, branch) => sum + branch.pendingQueueTotal,
          0,
        ),
        queuePeakMax: branchRows
          .flatMap((branch) => branch.registers)
          .map((register) => register.queuePeak)
          .sort((left, right) => right - left)[0] ?? 0,
        registerCount: branchRows.reduce(
          (sum, branch) => sum + branch.registers.length,
          0,
        ),
        replayed24hTotal: branchRows.reduce(
          (sum, branch) =>
            sum +
            branch.registers.reduce((registerSum, register) => registerSum + register.replayed24h, 0),
          0,
        ),
        staleHeartbeatRegisters: branchRows.reduce(
          (sum, branch) =>
            sum + branch.registers.filter((register) => register.staleHeartbeat).length,
          0,
        ),
      };
      const replayRate24h = replayRate(summary.accepted24hTotal, summary.replayed24hTotal);

      return {
        data: {
          branches: branchRows,
          company,
          generatedAt: new Date().toISOString(),
          summary: {
            ...summary,
            replayRate24h,
          },
        },
        success: true,
      };
    },
  );

  server.get(
    '/profitability',
    async (
      request: FastifyRequest<{ Querystring: ProfitabilityQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent || !companyId) {
        return;
      }
      const scopedBranchId = resolveScopedBranchId(
        request,
        reply,
        request.query.branchId,
      );
      if (reply.sent) {
        return;
      }

      const { from, to } = resolveDateRange(request.query.from, request.query.to);

      const saleItemWhere: Prisma.SaleItemWhereInput = {
        sale: {
          companyId,
          createdAt: { gte: from, lte: to },
          deletedAt: null,
          status: 'COMPLETED',
          ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
        },
      };

      const [stats, byProduct, byCategory] = await Promise.all([
        prisma.saleItem.aggregate({
          _sum: {
            lineTotal: true,
            purchasePrice: true,
            quantity: true,
          },
          where: saleItemWhere,
        }),
        prisma.saleItem.groupBy({
          _sum: {
            lineTotal: true,
            purchasePrice: true,
            quantity: true,
          },
          by: ['productId', 'productName'],
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 50,
          where: saleItemWhere,
        }),
        prisma.product.groupBy({
          _sum: {
            salePrice: true, // This is just for a dummy placeholder if we can't join easily
          },
          by: ['categoryId'],
          where: {
            companyId,
            saleItems: { some: saleItemWhere },
          },
        }),
      ]);

      // Since Prisma groupBy doesn't support complex joins for deep aggregation in 1 step easily here,
      // let's do a more robust manual aggregation or use raw if needed.
      // But for now, let's provide the essential product and total stats.

      const totalRevenue = stats._sum.lineTotal ?? 0;
      // We need to calculate totalPurchaseCost correctly.
      // purchasePrice in SaleItem is unit price.
      // Unfortunately _sum: { purchasePrice: true } sums unit prices.
      // We actually need SUM(quantity * purchasePrice).
      
      // I'll fetch the items for more accurate calculation if the volume is manageable,
      // or use a raw query. Let's use a raw query for efficiency.

      const rawStats = await prisma.$queryRaw<Array<{ total_revenue: number; total_cost: number }>>`
        SELECT 
          SUM(si.line_total) as total_revenue,
          SUM(si.quantity * COALESCE(si.purchase_price, 0)) as total_cost
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.company_id = ${companyId}
          AND s.created_at >= ${from}
          AND s.created_at <= ${to}
          AND s.deleted_at IS NULL
          AND s.status = 'COMPLETED'
          ${scopedBranchId ? Prisma.sql`AND s.branch_id = ${scopedBranchId}` : Prisma.empty}
      `;

      const total_revenue = Number(rawStats[0]?.total_revenue ?? 0);
      const total_cost = Number(rawStats[0]?.total_cost ?? 0);
      const total_profit = total_revenue - total_cost;

      return {
        data: {
          summary: {
            margin: total_revenue > 0 ? (total_profit / total_revenue) * 100 : 0,
            totalCost: total_cost,
            totalProfit: total_profit,
            totalRevenue: total_revenue,
          },
          topProducts: byProduct.map((p) => {
            const revenue = p._sum.lineTotal ?? 0;
            // Note: raw aggregation per product would be better but let's approximate here or use raw again
            return {
              productId: p.productId,
              productName: p.productName,
              quantity: p._sum.quantity ?? 0,
              revenue,
            };
          }),
        },
        success: true,
      };
    },
  );

  server.get(
    '/expiring-products',
    async (
      request: FastifyRequest<{ Querystring: ExpiringProductsQuery }>,
      reply,
    ) => {
      const companyId = resolveTargetCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent || !companyId) {
        return;
      }

      const days = parsePositiveInt(request.query.daysThreshold, 30);
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() + days);

      const products = await prisma.product.findMany({
        include: {
          category: { select: { name: true } },
          stockLevels: {
            select: { quantity: true },
          },
        },
        orderBy: { expiryDate: 'asc' },
        where: {
          companyId,
          deletedAt: null,
          expiryDate: {
            gte: new Date(),
            lte: thresholdDate,
          },
          isActive: true,
        },
      });

      return {
        data: products.map((p) => ({
          barcode: p.barcode,
          categoryName: p.category?.name,
          expiryDate: p.expiryDate,
          id: p.id,
          name: p.name,
          stockQuantity: p.stockLevels.reduce((sum, sl) => sum + sl.quantity, 0),
        })),
        success: true,
      };
    },
  );
}

