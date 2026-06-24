import type { Prisma } from '@prisma/client';
import {
  createSupplierSchema,
  paginationSchema,
  updateSupplierSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { moneyFromMinorOrFloat, toMinor } from '../lib/money';
import prisma from '../lib/prisma';
import {
  ensureCompanyOwnership,
  isCompanyInScope,
  resolveScopedCompanyId,
} from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface SupplierListQuery {
  activeOnly?: string;
  companyId?: string;
  limit?: string;
  page?: string;
  search?: string;
}

interface SupplierTransactionListQuery {
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  page?: string;
  type?: 'DEBT' | 'PAYMENT';
}

const supplierTransactionCreateSchema = z.object({
  amount: z.number().positive(),
  description: z.string().trim().max(500).optional(),
  invoiceId: z.string().uuid().optional(),
  type: z.enum(['DEBT', 'PAYMENT']),
});

function parseOptionalDate(value?: string): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function serializeSupplier(row: Record<string, unknown>): Record<string, unknown> {
  const { balance, balanceMinor, ...rest } = row;
  return {
    ...rest,
    balance: moneyFromMinorOrFloat(
      balance as number | undefined,
      balanceMinor as bigint | undefined,
    ),
  };
}

function serializeSupplierTransaction(row: Record<string, unknown>): Record<string, unknown> {
  const { amount, amountMinor, ...rest } = row;
  return {
    ...rest,
    amount: moneyFromMinorOrFloat(
      amount as number | undefined,
      amountMinor as bigint | undefined,
    ),
  };
}

export async function supplierRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: SupplierListQuery }>,
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

      const where: Prisma.SupplierWhereInput = {
        deletedAt: null,
      };
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }
      if (request.query.activeOnly !== 'false') {
        where.isActive = true;
      }
      const search = request.query.search?.trim();
      if (search && search.length > 0) {
        where.OR = [
          { email: { contains: search } },
          { name: { contains: search } },
          { phone: { contains: search } },
          { taxNumber: { contains: search } },
        ];
      }

      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
          skip,
          take: limit,
          where,
        }),
        prisma.supplier.count({ where }),
      ]);

      return {
        data: suppliers.map((supplier) =>
          serializeSupplier(supplier as unknown as Record<string, unknown>),
        ),
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
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
      const supplier = await prisma.supplier.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!supplier || !isCompanyInScope(request, supplier.companyId)) {
        return reply.status(404).send({
          error: 'Tedarikci bulunamadi',
          success: false,
        });
      }

      return {
        data: serializeSupplier(supplier as unknown as Record<string, unknown>),
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodyObj = request.body as Record<string, unknown>;
      const parsed = createSupplierSchema.safeParse(bodyObj);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz tedarikci verisi',
          success: false,
        });
      }
      const targetCompanyId =
        typeof bodyObj.companyId === 'string' ? bodyObj.companyId : undefined;
      if (!ensureCompanyOwnership(request, reply, targetCompanyId)) {
        return;
      }

      const supplier = await prisma.supplier.create({
        data: {
          ...parsed.data,
          balanceMinor: 0n,
          companyId: targetCompanyId!,
        },
      });
      return reply.status(201).send({
        data: serializeSupplier(supplier as unknown as Record<string, unknown>),
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
      const parsed = updateSupplierSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz tedarikci verisi',
          success: false,
        });
      }

      const existing = await prisma.supplier.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Tedarikci bulunamadi',
          success: false,
        });
      }

      const supplier = await prisma.supplier.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: serializeSupplier(supplier as unknown as Record<string, unknown>),
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
      const existing = await prisma.supplier.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Tedarikci bulunamadi',
          success: false,
        });
      }

      await prisma.supplier.update({
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
        where: { id: request.params.id },
      });

      return {
        success: true,
      };
    },
  );

  server.get(
    '/:id/transactions',
    async (
      request: FastifyRequest<{ Params: IdParams; Querystring: SupplierTransactionListQuery }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.supplier.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Tedarikci bulunamadi',
          success: false,
        });
      }

      const { limit, page } = paginationSchema.parse(request.query);
      const skip = (page - 1) * limit;

      const where: Prisma.SupplierTransactionWhereInput = {
        supplierId: request.params.id,
      };
      if (request.query.type) {
        where.type = request.query.type;
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

      const [transactions, total] = await Promise.all([
        prisma.supplierTransaction.findMany({
          include: {
            invoice: {
              select: {
                documentType: true,
                id: true,
                invoiceNumber: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.supplierTransaction.count({ where }),
      ]);

      return {
        data: transactions.map((transaction) =>
          serializeSupplierTransaction(
            transaction as unknown as Record<string, unknown>,
          ),
        ),
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
        success: true,
      };
    },
  );

  server.post(
    '/:id/transactions',
    { preHandler: server.ensureBackofficeWriter },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.supplier.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Tedarikci bulunamadi',
          success: false,
        });
      }

      const parsed = supplierTransactionCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz tedarikci hareketi',
          success: false,
        });
      }

      if (parsed.data.invoiceId) {
        const linkedInvoice = await prisma.purchaseInvoice.findFirst({
          where: {
            companyId: existing.companyId,
            deletedAt: null,
            id: parsed.data.invoiceId,
            supplierId: existing.id,
          },
        });
        if (!linkedInvoice) {
          return reply.status(400).send({
            error: 'invoiceId ayni firma ve tedarikciye ait olmali',
            success: false,
          });
        }
      }

      const amountMinor = toMinor(parsed.data.amount);
      const balanceChange = parsed.data.type === 'PAYMENT' ? -parsed.data.amount : parsed.data.amount;
      const balanceChangeMinor = parsed.data.type === 'PAYMENT' ? -amountMinor : amountMinor;

      const transaction = await prisma.$transaction(async (tx) => {
        const created = await tx.supplierTransaction.create({
          data: {
            amount: parsed.data.amount,
            amountMinor,
            description: parsed.data.description,
            invoiceId: parsed.data.invoiceId,
            supplierId: request.params.id,
            type: parsed.data.type,
          },
        });

        await tx.supplier.update({
          data: {
            balance: { increment: balanceChange },
            balanceMinor: { increment: balanceChangeMinor },
          },
          where: { id: request.params.id },
        });

        return created;
      });

      return reply.status(201).send({
        data: serializeSupplierTransaction(
          transaction as unknown as Record<string, unknown>,
        ),
        success: true,
      });
    },
  );
}
