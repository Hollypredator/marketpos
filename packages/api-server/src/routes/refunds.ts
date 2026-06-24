import type { Prisma } from '@prisma/client';
import { createRefundSchema } from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

interface RefundListQuery {
  saleId?: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function refundRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createRefundSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz iade verisi',
        success: false,
      });
    }

    const { clientRequestId, items, reason, registerId, saleId, sessionId } = parsed.data;
    const normalizedClientRequestId = (clientRequestId ?? '').trim();
    if (normalizedClientRequestId.length === 0) {
      return reply.status(400).send({
        error: 'clientRequestId zorunludur',
        success: false,
      });
    }
    const user = request.user;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.findFirst({
          include: {
            items: true,
            register: true,
          },
          where: {
            id: saleId,
            ...(user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId }),
          },
        });

        if (!sale) {
          throw new Error('Satis bulunamadi');
        }
        if (sale.registerId !== registerId) {
          throw new Error('Iade kasasi satis kasasi ile uyusmuyor');
        }

        const existingRefund = await tx.refund.findFirst({
          include: { items: true },
          where: {
            clientRequestId: normalizedClientRequestId,
            companyId: sale.companyId,
          },
        });
        if (existingRefund) {
          return {
            created: false,
            refund: existingRefund,
          };
        }

        const session = await tx.registerSession.findFirst({
          where: {
            id: sessionId,
            registerId,
            status: 'OPEN',
          },
        });
        if (!session) {
          throw new Error('Gecerli acik kasa oturumu bulunamadi');
        }

        let totalAmount = 0;
        const refundItems = items.map((item) => {
          const saleItem = sale.items.find((candidate) => candidate.id === item.saleItemId);
          if (!saleItem) {
            throw new Error(`Satis kalemi bulunamadi: ${item.saleItemId}`);
          }
          if (item.quantity > saleItem.quantity) {
            throw new Error('Iade miktari satis miktarini asamaz');
          }

          const lineTotal = saleItem.unitPrice * item.quantity;
          const vatAmount = lineTotal - lineTotal / (1 + saleItem.vatRate / 100);
          totalAmount += lineTotal;

          return {
            lineTotal,
            productId: saleItem.productId,
            productName: saleItem.productName,
            quantity: item.quantity,
            saleItemId: item.saleItemId,
            unitPrice: saleItem.unitPrice,
            vatAmount,
            vatRate: saleItem.vatRate,
          };
        });

        const refundCount = await tx.refund.count({ where: { registerId } });
        const receiptNumber = `R-${Date.now()}-${refundCount + 1}`;

        const newRefund = await tx.refund.create({
          data: {
            branchId: sale.register.branchId,
            clientRequestId: normalizedClientRequestId,
            companyId: sale.companyId,
            items: { create: refundItems },
            reason,
            receiptNumber,
            registerId,
            saleId,
            totalAmount,
            userId: user.id,
          },
          include: { items: true },
        });

        for (const item of refundItems) {
          const stockLevel = await tx.stockLevel.findUnique({
            where: {
              productId_branchId: {
                branchId: sale.register.branchId,
                productId: item.productId,
              },
            },
          });

          const previousQuantity = stockLevel?.quantity ?? 0;
          const newQuantity = previousQuantity + item.quantity;

          await tx.stockLevel.upsert({
            create: {
              branchId: sale.register.branchId,
              productId: item.productId,
              quantity: newQuantity,
            },
            update: { quantity: newQuantity },
            where: {
              productId_branchId: {
                branchId: sale.register.branchId,
                productId: item.productId,
              },
            },
          });

          await tx.stockMovement.create({
            data: {
              branchId: sale.register.branchId,
              newQuantity,
              previousQuantity,
              productId: item.productId,
              quantity: item.quantity,
              reference: newRefund.receiptNumber,
              type: 'REFUND',
              userId: user.id,
            },
          });
        }

        const allRefunded = sale.items.every((saleItem) => {
          const refundedQuantity = items
            .filter((refundItem) => refundItem.saleItemId === saleItem.id)
            .reduce((sum, refundItem) => sum + refundItem.quantity, 0);
          return refundedQuantity >= saleItem.quantity;
        });

        await tx.sale.update({
          data: {
            status: allRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          },
          where: { id: saleId },
        });

        await tx.registerSession.update({
          data: {
            totalRefunds: { increment: totalAmount },
          },
          where: { id: session.id },
        });

        return {
          created: true,
          refund: newRefund,
        };
      });

      return reply.status(result.created ? 201 : 200).send({
        data: result.refund,
        success: true,
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const sale = await prisma.sale.findFirst({
        select: { companyId: true },
        where: {
          id: saleId,
          ...(user.role === 'SUPER_ADMIN' ? {} : { companyId: user.companyId }),
        },
      });
      if (!sale) {
        throw error;
      }
      const existingRefund = await prisma.refund.findFirst({
        include: { items: true },
        where: {
          clientRequestId: normalizedClientRequestId,
          companyId: sale.companyId,
        },
      });
      if (!existingRefund) {
        throw error;
      }
      return reply.status(200).send({
        data: existingRefund,
        success: true,
      });
    }
  });

  server.get(
    '/',
    async (request: FastifyRequest<{ Querystring: RefundListQuery }>) => {
      const where: Prisma.RefundWhereInput = {
        companyId: request.user.companyId,
      };
      if (request.query.saleId) {
        where.saleId = request.query.saleId;
      }

      const refunds = await prisma.refund.findMany({
        include: {
          items: true,
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        where,
      });

      return {
        data: refunds,
        success: true,
      };
    },
  );
}

