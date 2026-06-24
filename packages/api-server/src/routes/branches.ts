import type { Prisma } from '@prisma/client';
import {
  createBranchSchema,
  paginationSchema,
  updateBranchSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import { ensureCompanyOwnership, resolveScopedCompanyId } from '../lib/request-scope';

interface BranchListQuery {
  companyId?: string;
}

interface IdParams {
  id: string;
}

export async function branchRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: BranchListQuery }>,
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

      const where: Prisma.BranchWhereInput = { deletedAt: null };
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }

      const [branches, total] = await Promise.all([
        prisma.branch.findMany({
          orderBy: { name: 'asc' },
          skip,
          take: limit,
          where,
        }),
        prisma.branch.count({ where }),
      ]);

      return {
        data: branches,
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
      const branch = await prisma.branch.findFirst({
        include: {
          registers: {
            where: { deletedAt: null },
          },
        },
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });

      if (!branch) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        branch.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      return {
        data: branch,
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBranchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz sube verisi',
        success: false,
      });
    }
    if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
      return;
    }

    const branch = await prisma.branch.create({
      data: parsed.data,
    });

    return reply.status(201).send({
      data: branch,
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
      const parsed = updateBranchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz sube verisi',
        success: false,
      });
    }
      if (
        typeof parsed.data.companyId === 'string' &&
        !ensureCompanyOwnership(request, reply, parsed.data.companyId)
      ) {
        return;
      }

      const existing = await prisma.branch.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      const branch = await prisma.branch.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: branch,
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
      const existing = await prisma.branch.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Sube bulunamadi',
          success: false,
        });
      }

      await prisma.branch.update({
        data: { deletedAt: new Date() },
        where: { id: request.params.id },
      });

      return {
        message: 'Sube silindi',
        success: true,
      };
    },
  );
}

