import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';
import {
  createUserSchema,
  paginationSchema,
  updateUserSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import { canAssignRole, canManageRole } from '../lib/role-hierarchy';
import { ensureCompanyOwnership, resolveScopedCompanyId } from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface UserListQuery {
  companyId?: string;
}

function sendHierarchyForbidden(reply: FastifyReply): FastifyReply {
  return reply.status(403).send({
    error: 'Firma ici rol hiyerarsisi nedeniyle bu isleme yetkiniz yok',
    errorCode: 'ROLE_HIERARCHY_FORBIDDEN',
    success: false,
  });
}

export async function userRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);
  server.addHook('onRequest', server.ensureBackofficeWriter);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: UserListQuery }>,
      reply: FastifyReply,
    ) => {
      const { limit, page } = paginationSchema.parse(request.query);
      const skip = (page - 1) * limit;
      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent) {
        return;
      }

      const where: Prisma.UserWhereInput = { deletedAt: null };
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          orderBy: { fullName: 'asc' },
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
          skip,
          take: limit,
          where,
        }),
        prisma.user.count({ where }),
      ]);

      return {
        data: users,
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
      const user = await prisma.user.findFirst({
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
          deletedAt: null,
          id: request.params.id,
        },
      });

      if (!user) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        user.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }

      return {
        data: user,
        success: true,
      };
    },
  );

  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz kullanici verisi',
        success: false,
      });
    }
    if (!ensureCompanyOwnership(request, reply, parsed.data.companyId)) {
      return;
    }
    if (parsed.data.branchId) {
      const branch = await prisma.branch.findFirst({
        where: {
          companyId: parsed.data.companyId,
          deletedAt: null,
          id: parsed.data.branchId,
        },
      });
      if (!branch) {
        return reply.status(400).send({
          error: 'Sube ayni firma icinde bulunamadi',
          success: false,
        });
      }
    }
    if (!canAssignRole(request.user.role, parsed.data.role)) {
      return sendHierarchyForbidden(reply);
    }

    const { password, ...rest } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        ...rest,
        passwordHash,
      },
      select: {
        branchId: true,
        companyId: true,
        createdAt: true,
        fullName: true,
        id: true,
        isActive: true,
        role: true,
        updatedAt: true,
        username: true,
      },
    });

    return reply.status(201).send({
      data: user,
      success: true,
    });
  });

  server.put(
    '/:id',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateUserSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz kullanici verisi',
          success: false,
        });
      }
      const existing = await prisma.user.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }
      if (existing.id === request.user.id) {
        if (parsed.data.isActive === false) {
          return reply.status(400).send({
            error: 'Kendi hesabinizi pasife cekemezsiniz',
            errorCode: 'SELF_DEACTIVATION_FORBIDDEN',
            success: false,
          });
        }
        if (parsed.data.role && parsed.data.role !== existing.role) {
          return reply.status(400).send({
            error: 'Kendi rolunuzu bu ekrandan degistiremezsiniz',
            errorCode: 'SELF_ROLE_CHANGE_FORBIDDEN',
            success: false,
          });
        }
      } else if (!canManageRole(request.user.role, existing.role)) {
        return sendHierarchyForbidden(reply);
      }
      if (
        parsed.data.role &&
        !canAssignRole(request.user.role, parsed.data.role)
      ) {
        return sendHierarchyForbidden(reply);
      }
      const targetCompanyId = existing.companyId;
      if (typeof parsed.data.branchId === 'string') {
        const branch = await prisma.branch.findFirst({
          where: {
            companyId: targetCompanyId,
            deletedAt: null,
            id: parsed.data.branchId,
          },
        });
        if (!branch) {
          return reply.status(400).send({
            error: 'Sube ayni firma icinde bulunamadi',
            success: false,
          });
        }
      }

      const { password, ...rest } = parsed.data;
      const updateData: Prisma.UserUpdateInput = { ...rest };
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }

      const user = await prisma.user.update({
        data: updateData,
        select: {
          branchId: true,
          companyId: true,
          createdAt: true,
          fullName: true,
          id: true,
          isActive: true,
          role: true,
          updatedAt: true,
          username: true,
        },
        where: { id: request.params.id },
      });

      return {
        data: user,
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
      const existing = await prisma.user.findFirst({
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!existing) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        existing.companyId !== request.user.companyId
      ) {
        return reply.status(404).send({
          error: 'Kullanici bulunamadi',
          success: false,
        });
      }
      if (existing.id === request.user.id) {
        return reply.status(400).send({
          error: 'Kendi hesabinizi silemezsiniz',
          errorCode: 'SELF_DELETE_FORBIDDEN',
          success: false,
        });
      }
      if (!canManageRole(request.user.role, existing.role)) {
        return sendHierarchyForbidden(reply);
      }

      await prisma.user.update({
        data: {
          deletedAt: new Date(),
          isActive: false,
        },
        where: { id: request.params.id },
      });

      return {
        message: 'Kullanici silindi',
        success: true,
      };
    },
  );
}

