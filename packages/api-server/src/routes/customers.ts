import type { Prisma } from '@prisma/client';
import {
  createCustomerSchema,
  paginationSchema,
  updateCustomerSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import {
  ensureCompanyOwnership,
  isCompanyInScope,
  resolveScopedCompanyId,
} from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface CustomerListQuery {
  activeOnly?: string;
  companyId?: string;
  limit?: string;
  page?: string;
  search?: string;
}

export async function customerRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: CustomerListQuery }>,
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

      const where: Prisma.CustomerWhereInput = {
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
          { name: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search } },
          { taxNumber: { contains: search } },
        ];
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
          skip,
          take: limit,
          where,
        }),
        prisma.customer.count({ where }),
      ]);

      return {
        data: customers,
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
      const customer = await prisma.customer.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!customer || !isCompanyInScope(request, customer.companyId)) {
        return reply.status(404).send({
          error: 'Musteri bulunamadi',
          success: false,
        });
      }

      return {
        data: customer,
        success: true,
      };
    },
  );

  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz musteri verisi',
        success: false,
      });
    }
    if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
      return;
    }

    const customer = await prisma.customer.create({
      data: parsed.data,
    });
    return reply.status(201).send({
      data: customer,
      success: true,
    });
  });

  server.put(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateCustomerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz musteri verisi',
          success: false,
        });
      }

      const existing = await prisma.customer.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Musteri bulunamadi',
          success: false,
        });
      }

      const customer = await prisma.customer.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: customer,
        success: true,
      };
    },
  );

  server.delete(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.customer.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({
          error: 'Musteri bulunamadi',
          success: false,
        });
      }

      await prisma.customer.update({
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
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.customer.findFirst({
        where: { deletedAt: null, id: request.params.id },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({ error: 'Musteri bulunamadi', success: false });
      }

      const transactions = await prisma.customerTransaction.findMany({
        where: { customerId: request.params.id },
        orderBy: { createdAt: 'desc' },
      });

      return { data: transactions, success: true };
    },
  );

  server.post(
    '/:id/transactions',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const existing = await prisma.customer.findFirst({
        where: { deletedAt: null, id: request.params.id },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({ error: 'Musteri bulunamadi', success: false });
      }

      const body = request.body as { amount?: number; description?: string; type?: 'PAYMENT' | 'DEBT' };
      if (!body.amount || body.amount <= 0 || !body.type) {
        return reply.status(400).send({ error: 'Gecersiz islem verisi', success: false });
      }

      await prisma.$transaction(async (tx) => {
        await tx.customerTransaction.create({
          data: {
            customerId: request.params.id,
            amount: body.amount!,
            type: body.type!,
            description: body.description,
          }
        });

        const balanceChange = body.type === 'PAYMENT' ? -(body.amount!) : body.amount!;
        
        await tx.customer.update({
          where: { id: request.params.id },
          data: { balance: { increment: balanceChange } }
        });
      });

      return reply.status(201).send({ success: true });
    },
  );
}
