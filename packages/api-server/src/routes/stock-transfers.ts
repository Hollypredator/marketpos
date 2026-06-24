import type { Prisma } from '@prisma/client';
import { paginationSchema } from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import prisma from '../lib/prisma';
import {
  ensureCompanyOwnership,
  isCompanyInScope,
  resolveScopedBranchId,
  resolveScopedCompanyId,
} from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface StockTransferListQuery {
  companyId?: string;
  limit?: string;
  page?: string;
  sourceBranchId?: string;
  status?: string;
  targetBranchId?: string;
}

const createStockTransferSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().min(0.001),
  })).min(1),
  note: z.string().max(500).optional(),
  sourceBranchId: z.string().uuid(),
  targetBranchId: z.string().uuid(),
});

const updateStockTransferStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED', 'CANCELLED']),
  note: z.string().max(500).optional(),
});

export async function stockTransferRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: StockTransferListQuery }>,
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

      const where: Prisma.StockTransferWhereInput = {};
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }
      if (request.query.sourceBranchId) {
        where.sourceBranchId = request.query.sourceBranchId;
      }
      if (request.query.targetBranchId) {
        where.targetBranchId = request.query.targetBranchId;
      }
      if (request.query.status) {
        where.status = request.query.status as any;
      }

      const [transfers, total] = await Promise.all([
        prisma.stockTransfer.findMany({
          include: {
            createdBy: { select: { fullName: true } },
            sourceBranch: { select: { name: true } },
            targetBranch: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.stockTransfer.count({ where }),
      ]);

      return {
        data: transfers,
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
      const transfer = await prisma.stockTransfer.findFirst({
        include: {
          createdBy: { select: { fullName: true } },
          items: {
            include: { product: { select: { barcode: true, name: true } } },
          },
          sourceBranch: { select: { name: true } },
          targetBranch: { select: { name: true } },
        },
        where: { id: request.params.id },
      });
      if (!transfer || !isCompanyInScope(request, transfer.companyId)) {
        return reply.status(404).send({ error: 'Transfer bulunamadi', success: false });
      }

      return {
        data: transfer,
        success: true,
      };
    },
  );

  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createStockTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz transfer verisi',
        success: false,
      });
    }

    const { items, note, sourceBranchId, targetBranchId } = parsed.data;

    if (sourceBranchId === targetBranchId) {
      return reply.status(400).send({ error: 'Kaynak ve hedef sube ayni olamaz', success: false });
    }

    const sourceBranch = await prisma.branch.findUnique({ where: { id: sourceBranchId } });
    const targetBranch = await prisma.branch.findUnique({ where: { id: targetBranchId } });

    if (!sourceBranch || !targetBranch || sourceBranch.companyId !== targetBranch.companyId) {
      return reply.status(400).send({ error: 'Gecersiz sube bilgileri', success: false });
    }

    if (!ensureCompanyOwnership(request, reply, sourceBranch.companyId)) {
      return;
    }

    const currentUserId = request.user.id;

    // We do NOT deduct stock from source branch yet. That happens when the target branch ACCEPTS, or we deduct now and it stays in 'transit'. 
    // Usually, you deduct from source now (creates a transit state). For simplicity, we will deduct from source when it's PENDING.
    
    try {
      const result = await prisma.$transaction(async (tx) => {
        const transfer = await tx.stockTransfer.create({
          data: {
            companyId: sourceBranch.companyId,
            createdById: currentUserId,
            note,
            sourceBranchId,
            status: 'PENDING',
            targetBranchId,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            },
          },
        });

        // Deduct from Source Branch immediately (it's in transit)
        for (const item of items) {
          const currentStock = await tx.stockLevel.findUnique({
            where: { productId_branchId: { branchId: sourceBranchId, productId: item.productId } },
          });
          const previousQuantity = currentStock?.quantity ?? 0;
          const newQuantity = previousQuantity - item.quantity;

          await tx.stockLevel.upsert({
            create: {
              branchId: sourceBranchId,
              productId: item.productId,
              quantity: -item.quantity,
            },
            update: { quantity: { decrement: item.quantity } },
            where: { productId_branchId: { branchId: sourceBranchId, productId: item.productId } },
          });

          await tx.stockMovement.create({
            data: {
              branchId: sourceBranchId,
              newQuantity,
              note: `Transfer cikisi #${transfer.id}`,
              previousQuantity,
              productId: item.productId,
              quantity: item.quantity,
              type: 'ADJUSTMENT', // Use adjustment or a new TYPE
              userId: currentUserId,
            },
          });
        }

        return transfer;
      });

      return reply.status(201).send({ data: result, success: true });
    } catch (error: unknown) {
      server.log.error(error);
      return reply.status(500).send({ error: 'Transfer olusturulamadi', success: false });
    }
  });

  server.put(
    '/:id/status',
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = updateStockTransferStatusSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Gecersiz durum verisi', success: false });
      }

      const existing = await prisma.stockTransfer.findFirst({
        include: { items: true },
        where: { id: request.params.id },
      });
      if (!existing || !isCompanyInScope(request, existing.companyId)) {
        return reply.status(404).send({ error: 'Transfer bulunamadi', success: false });
      }

      if (existing.status !== 'PENDING') {
        return reply.status(400).send({ error: 'Bu transfer zaten tamamlanmis veya iptal edilmis', success: false });
      }

      const { status } = parsed.data;
      const currentUserId = request.user.id;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.stockTransfer.update({
            data: { status, note: parsed.data.note },
            where: { id: existing.id },
          });

          if (status === 'ACCEPTED') {
            // Add to Target Branch
            for (const item of existing.items) {
              const currentStock = await tx.stockLevel.findUnique({
                where: { productId_branchId: { branchId: existing.targetBranchId, productId: item.productId } },
              });
              const previousQuantity = currentStock?.quantity ?? 0;
              const newQuantity = previousQuantity + item.quantity;

              await tx.stockLevel.upsert({
                create: {
                  branchId: existing.targetBranchId,
                  productId: item.productId,
                  quantity: item.quantity,
                },
                update: { quantity: { increment: item.quantity } },
                where: { productId_branchId: { branchId: existing.targetBranchId, productId: item.productId } },
              });

              await tx.stockMovement.create({
                data: {
                  branchId: existing.targetBranchId,
                  newQuantity,
                  note: `Transfer girisi #${existing.id}`,
                  previousQuantity,
                  productId: item.productId,
                  quantity: item.quantity,
                  type: 'ADJUSTMENT',
                  userId: currentUserId,
                },
              });
            }
          } else if (status === 'REJECTED' || status === 'CANCELLED') {
            // Revert deduction from Source Branch
            for (const item of existing.items) {
              const currentStock = await tx.stockLevel.findUnique({
                where: { productId_branchId: { branchId: existing.sourceBranchId, productId: item.productId } },
              });
              const previousQuantity = currentStock?.quantity ?? 0;
              const newQuantity = previousQuantity + item.quantity;

              await tx.stockLevel.update({
                data: { quantity: { increment: item.quantity } },
                where: { productId_branchId: { branchId: existing.sourceBranchId, productId: item.productId } },
              });

              await tx.stockMovement.create({
                data: {
                  branchId: existing.sourceBranchId,
                  newQuantity,
                  note: `Transfer iadesi #${existing.id}`,
                  previousQuantity,
                  productId: item.productId,
                  quantity: item.quantity,
                  type: 'ADJUSTMENT',
                  userId: currentUserId,
                },
              });
            }
          }
        });

        return reply.status(200).send({ success: true });
      } catch (error: unknown) {
        server.log.error(error);
        return reply.status(500).send({ error: 'Transfer durumu guncellenemedi', success: false });
      }
    },
  );
}
