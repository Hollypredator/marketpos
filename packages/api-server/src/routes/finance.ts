import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import prisma from '../lib/prisma';
import { resolveScopedBranchId, resolveScopedCompanyId } from '../lib/request-scope';

interface SummaryQuery {
  branchId?: string;
  companyId?: string;
  dateFrom?: string;
  dateTo?: string;
  supplierId?: string;
}

const invoiceTemplatePayloadSchema = z.object({
  dispatch: z
    .object({
      footerNote: z.string().trim().max(1000).optional().nullable(),
      headerText: z.string().trim().max(1000).optional().nullable(),
      label: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
  footerNote: z.string().trim().max(1000).optional().nullable(),
  headerText: z.string().trim().max(1000).optional().nullable(),
  logoUrl: z.string().trim().url().max(1000).optional().nullable(),
  purchase: z
    .object({
      footerNote: z.string().trim().max(1000).optional().nullable(),
      headerText: z.string().trim().max(1000).optional().nullable(),
      label: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
  sales: z
    .object({
      footerNote: z.string().trim().max(1000).optional().nullable(),
      headerText: z.string().trim().max(1000).optional().nullable(),
      label: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
  taxOffice: z.string().trim().max(200).optional().nullable(),
  tradeRegistryNo: z.string().trim().max(200).optional().nullable(),
});

function parseOptionalDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function ensureDateRange(dateFrom?: string, dateTo?: string): { from: Date; to: Date } {
  const now = new Date();
  const from = parseOptionalDate(dateFrom) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = parseOptionalDate(dateTo) ?? now;
  const normalizedFrom = new Date(from);
  normalizedFrom.setHours(0, 0, 0, 0);
  const normalizedTo = new Date(to);
  normalizedTo.setHours(23, 59, 59, 999);
  return normalizedFrom <= normalizedTo
    ? { from: normalizedFrom, to: normalizedTo }
    : { from: normalizedTo, to: normalizedFrom };
}

function mapTemplate(row: {
  headerText: string | null;
  footerNote: string | null;
  logoUrl: string | null;
  taxOffice: string | null;
  tradeRegistryNo: string | null;
  salesLabel: string | null;
  purchaseLabel: string | null;
  dispatchLabel: string | null;
  salesHeader: string | null;
  purchaseHeader: string | null;
  dispatchHeader: string | null;
  salesFooter: string | null;
  purchaseFooter: string | null;
  dispatchFooter: string | null;
}) {
  return {
    dispatch: {
      footerNote: row.dispatchFooter,
      headerText: row.dispatchHeader,
      label: row.dispatchLabel,
    },
    footerNote: row.footerNote,
    headerText: row.headerText,
    logoUrl: row.logoUrl,
    purchase: {
      footerNote: row.purchaseFooter,
      headerText: row.purchaseHeader,
      label: row.purchaseLabel,
    },
    sales: {
      footerNote: row.salesFooter,
      headerText: row.salesHeader,
      label: row.salesLabel,
    },
    taxOffice: row.taxOffice,
    tradeRegistryNo: row.tradeRegistryNo,
  };
}

export async function financeRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/invoice-templates',
    async (request: FastifyRequest<{ Querystring: { companyId?: string } }>, reply: FastifyReply) => {
      const scopedCompanyId = resolveScopedCompanyId(request, reply, request.query.companyId, {
        requiredForSuperAdmin: true,
      });
      if (reply.sent || !scopedCompanyId) {
        return;
      }

      const existing = await prisma.invoiceTemplateConfig.findUnique({
        where: { companyId: scopedCompanyId },
      });

      return {
        data: existing
          ? mapTemplate(existing)
          : {
              dispatch: { footerNote: null, headerText: null, label: 'Irsaliye' },
              footerNote: null,
              headerText: null,
              logoUrl: null,
              purchase: { footerNote: null, headerText: null, label: 'Alis Faturasi' },
              sales: { footerNote: null, headerText: null, label: 'Satis Faturasi' },
              taxOffice: null,
              tradeRegistryNo: null,
            },
        success: true,
      };
    },
  );

  server.put(
    '/invoice-templates',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest<{ Querystring: { companyId?: string } }>, reply: FastifyReply) => {
      const scopedCompanyId = resolveScopedCompanyId(request, reply, request.query.companyId, {
        requiredForSuperAdmin: true,
      });
      if (reply.sent || !scopedCompanyId) {
        return;
      }

      const parsed = invoiceTemplatePayloadSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz sablon verisi',
          success: false,
        });
      }

      const payload = parsed.data;
      const updated = await prisma.invoiceTemplateConfig.upsert({
        where: { companyId: scopedCompanyId },
        update: {
          dispatchFooter: payload.dispatch?.footerNote ?? null,
          dispatchHeader: payload.dispatch?.headerText ?? null,
          dispatchLabel: payload.dispatch?.label ?? null,
          footerNote: payload.footerNote ?? null,
          headerText: payload.headerText ?? null,
          logoUrl: payload.logoUrl ?? null,
          purchaseFooter: payload.purchase?.footerNote ?? null,
          purchaseHeader: payload.purchase?.headerText ?? null,
          purchaseLabel: payload.purchase?.label ?? null,
          salesFooter: payload.sales?.footerNote ?? null,
          salesHeader: payload.sales?.headerText ?? null,
          salesLabel: payload.sales?.label ?? null,
          taxOffice: payload.taxOffice ?? null,
          tradeRegistryNo: payload.tradeRegistryNo ?? null,
        },
        create: {
          companyId: scopedCompanyId,
          dispatchFooter: payload.dispatch?.footerNote ?? null,
          dispatchHeader: payload.dispatch?.headerText ?? null,
          dispatchLabel: payload.dispatch?.label ?? null,
          footerNote: payload.footerNote ?? null,
          headerText: payload.headerText ?? null,
          logoUrl: payload.logoUrl ?? null,
          purchaseFooter: payload.purchase?.footerNote ?? null,
          purchaseHeader: payload.purchase?.headerText ?? null,
          purchaseLabel: payload.purchase?.label ?? null,
          salesFooter: payload.sales?.footerNote ?? null,
          salesHeader: payload.sales?.headerText ?? null,
          salesLabel: payload.sales?.label ?? null,
          taxOffice: payload.taxOffice ?? null,
          tradeRegistryNo: payload.tradeRegistryNo ?? null,
        },
      });

      return { data: mapTemplate(updated), success: true };
    },
  );

  server.get(
    '/ledger-summary',
    async (request: FastifyRequest<{ Querystring: SummaryQuery }>, reply: FastifyReply) => {
      const scopedCompanyId = resolveScopedCompanyId(request, reply, request.query.companyId, {
        requiredForSuperAdmin: true,
      });
      if (reply.sent || !scopedCompanyId) {
        return;
      }

      const scopedBranchId = resolveScopedBranchId(request, reply, request.query.branchId);
      if (reply.sent) {
        return;
      }

      const { from, to } = ensureDateRange(request.query.dateFrom, request.query.dateTo);
      const supplierFilter: Prisma.SupplierTransactionWhereInput = {
        supplier: {
          companyId: scopedCompanyId,
          deletedAt: null,
        },
      };
      if (request.query.supplierId) {
        supplierFilter.supplierId = request.query.supplierId;
      }
      if (scopedBranchId) {
        supplierFilter.invoice = { branchId: scopedBranchId };
      }

      const beforeRangeDebt = await prisma.supplierTransaction.aggregate({
        where: {
          ...supplierFilter,
          createdAt: { lt: from },
          type: 'DEBT',
        },
        _sum: { amount: true },
      });
      const beforeRangePayment = await prisma.supplierTransaction.aggregate({
        where: {
          ...supplierFilter,
          createdAt: { lt: from },
          type: 'PAYMENT',
        },
        _sum: { amount: true },
      });

      const inRangeDebt = await prisma.supplierTransaction.aggregate({
        where: {
          ...supplierFilter,
          createdAt: { gte: from, lte: to },
          type: 'DEBT',
        },
        _sum: { amount: true },
      });
      const inRangePayment = await prisma.supplierTransaction.aggregate({
        where: {
          ...supplierFilter,
          createdAt: { gte: from, lte: to },
          type: 'PAYMENT',
        },
        _sum: { amount: true },
      });

      const openingBalance = (beforeRangeDebt._sum.amount ?? 0) - (beforeRangePayment._sum.amount ?? 0);
      const totalDebt = inRangeDebt._sum.amount ?? 0;
      const totalPayment = inRangePayment._sum.amount ?? 0;
      const netChange = totalDebt - totalPayment;
      const closingBalance = openingBalance + netChange;

      const now = new Date();
      const last30Days = new Date(now);
      last30Days.setDate(last30Days.getDate() - 30);

      const [last30DaysPaymentAgg, dueInvoices] = await Promise.all([
        prisma.supplierTransaction.aggregate({
          where: {
            ...supplierFilter,
            createdAt: { gte: last30Days, lte: now },
            type: 'PAYMENT',
          },
          _sum: { amount: true },
        }),
        prisma.purchaseInvoice.aggregate({
          where: {
            companyId: scopedCompanyId,
            deletedAt: null,
            documentType: 'INVOICE',
            dueDate: { lt: now },
            ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
            ...(request.query.supplierId ? { supplierId: request.query.supplierId } : {}),
          },
          _sum: { grandTotal: true },
        }),
      ]);

      return {
        data: {
          closingBalance,
          dueAmount: dueInvoices._sum.grandTotal ?? 0,
          from: from.toISOString(),
          last30DaysPayments: last30DaysPaymentAgg._sum.amount ?? 0,
          netChange,
          openingBalance,
          to: to.toISOString(),
          totalDebt,
          totalPayment,
        },
        success: true,
      };
    },
  );
}
