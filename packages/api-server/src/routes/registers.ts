import type { Prisma } from '@prisma/client';
import { createRegisterSchema, updateRegisterSchema } from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

interface IdParams {
  id: string;
}

interface RegisterListQuery {
  branchId?: string;
}

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: RegisterListQuery }>,
      reply: FastifyReply,
    ) => {
      const where: Prisma.RegisterWhereInput = { deletedAt: null };
      if (request.query.branchId) {
        const branch = await prisma.branch.findFirst({
          where: {
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
        if (
          request.user.role !== 'SUPER_ADMIN' &&
          branch.companyId !== request.user.companyId
        ) {
          return reply.status(403).send({
            error: 'Sadece kendi firma subelerine erisebilirsiniz',
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

      const registers = await prisma.register.findMany({
        orderBy: { name: 'asc' },
        where,
      });

      return {
        data: registers,
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz kasa verisi',
        success: false,
      });
    }

    const branch = await prisma.branch.findFirst({
      where: {
        deletedAt: null,
        id: parsed.data.branchId,
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
      return reply.status(403).send({
        error: 'Sadece kendi firma subelerine kasa ekleyebilirsiniz',
        success: false,
      });
    }

    const register = await prisma.register.create({
      data: parsed.data,
    });

    return reply.status(201).send({
      data: register,
      success: true,
    });
    },
  );

  server.get(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
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
          id: request.params.id,
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
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }

      return {
        data: {
          branchId: register.branchId,
          id: register.id,
          isActive: register.isActive,
          name: register.name,
        },
        success: true,
      };
    },
  );

  server.put(
    '/:id',
    { preHandler: server.ensureBackofficeWriter },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateRegisterSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz kasa verisi',
        success: false,
      });
    }

      const existing = await prisma.register.findFirst({
        include: { branch: true },
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.branch.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }

      if (typeof parsed.data.branchId === 'string') {
        const targetBranch = await prisma.branch.findFirst({
          where: {
            deletedAt: null,
            id: parsed.data.branchId,
          },
        });
        if (!targetBranch) {
          return reply.status(404).send({
            error: 'Sube bulunamadi',
            success: false,
          });
        }
        if (
          request.user.role !== 'SUPER_ADMIN' &&
          targetBranch.companyId !== request.user.companyId
        ) {
          return reply.status(403).send({
            error: 'Sadece kendi firma subelerine kasa tasiyabilirsiniz',
            success: false,
          });
        }
      }

      const register = await prisma.register.update({
        data: parsed.data,
        where: { id: request.params.id },
      });

      return {
        data: register,
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
      const existing = await prisma.register.findFirst({
        include: { branch: true },
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.branch.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }

      await prisma.register.update({
        data: { deletedAt: new Date() },
        where: { id: request.params.id },
      });

      return {
        message: 'Kasa silindi',
        success: true,
      };
    },
  );
}

