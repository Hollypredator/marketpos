import type { Prisma } from '@prisma/client';
import {
  calculateLineTotal,
  calculateLineVat,
  createSaleSchema,
  generateReceiptNumber,
  type VatRate,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';

interface IdParams {
  id: string;
}

interface ReceiptParams {
  receiptNumber: string;
}

interface SaleListQuery {
  branchId?: string;
  from?: string;
  limit?: string;
  page?: string;
  to?: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function saleRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz satis verisi',
        success: false,
      });
    }

    const { items, note, payments, registerId, sessionId } = parsed.data;
    const user = request.user;

    const sale = await prisma.$transaction(async (tx) => {
      const register = await tx.register.findUnique({
        include: { branch: true },
        where: { id: registerId },
      });
      if (!register) {
        throw new Error('Kasa bulunamadi');
      }
      if (
        user.role !== 'SUPER_ADMIN' &&
        register.branch.companyId !== user.companyId
      ) {
        throw new Error('Kasa bu firma kapsaminda degil');
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

      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: {
          companyId: register.branch.companyId,
          id: { in: productIds },
        },
      });
      const productMap = new Map(products.map((product) => [product.id, product]));

      let subtotal = 0;
      let totalDiscount = 0;
      let totalVat = 0;

      const saleItems = items.map((item) => {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Urun bulunamadi: ${item.productId}`);
        }

        const lineTotal = calculateLineTotal(
          item.quantity,
          item.unitPrice,
          item.discount ?? 0,
        );
        const vatAmount = calculateLineVat(lineTotal, product.vatRate as VatRate);

        subtotal += lineTotal - vatAmount;
        totalVat += vatAmount;
        totalDiscount += item.discount ?? 0;

        return {
          barcode: product.barcode,
          discount: item.discount ?? 0,
          lineTotal,
          productId: item.productId,
          productName: product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          vatAmount,
          vatRate: product.vatRate,
        };
      });

      const grandTotal = subtotal + totalVat;
      const saleCount = await tx.sale.count({ where: { registerId } });
      const receiptNumber = generateReceiptNumber(register.name, saleCount + 1);

      const newSale = await tx.sale.create({
        data: {
          branchId: register.branchId,
          companyId: user.companyId,
          grandTotal,
          items: { create: saleItems },
          note,
          payments: {
            create: payments.map((payment) => ({
              amount: payment.amount,
              method: payment.method,
              reference: payment.reference,
            })),
          },
          receiptNumber,
          registerId,
          sessionId,
          subtotal,
          totalDiscount,
          totalVat,
          userId: user.id,
        },
        include: { items: true, payments: true },
      });

      for (const item of items) {
        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            productId_branchId: {
              branchId: register.branchId,
              productId: item.productId,
            },
          },
        });

        const previousQuantity = stockLevel?.quantity ?? 0;
        const newQuantity = previousQuantity - item.quantity;

        await tx.stockLevel.upsert({
          create: {
            branchId: register.branchId,
            productId: item.productId,
            quantity: newQuantity,
          },
          update: { quantity: newQuantity },
          where: {
            productId_branchId: {
              branchId: register.branchId,
              productId: item.productId,
            },
          },
        });

        await tx.stockMovement.create({
          data: {
            branchId: register.branchId,
            newQuantity,
            previousQuantity,
            productId: item.productId,
            quantity: -item.quantity,
            reference: newSale.receiptNumber,
            type: 'SALE',
            userId: user.id,
          },
        });
      }

      const cardPayment = payments
        .filter((payment) => payment.method !== 'CASH')
        .reduce((sum, payment) => sum + payment.amount, 0);
      const cashPayment = payments
        .filter((payment) => payment.method === 'CASH')
        .reduce((sum, payment) => sum + payment.amount, 0);

      await tx.registerSession.update({
        data: {
          totalCardSales: { increment: cardPayment },
          totalCashSales: { increment: cashPayment },
          totalSalesCount: { increment: 1 },
        },
        where: { id: session.id },
      });

      return newSale;
    });

    return reply.status(201).send({
      data: sale,
      success: true,
    });
  });

  server.get(
    '/',
    async (request: FastifyRequest<{ Querystring: SaleListQuery }>) => {
      const limit = parsePositiveInt(request.query.limit, 20);
      const page = parsePositiveInt(request.query.page, 1);
      const skip = (page - 1) * limit;

      const where: Prisma.SaleWhereInput = {
        companyId: request.user.companyId,
        deletedAt: null,
      };

      if (request.query.branchId) {
        where.branchId = request.query.branchId;
      }
      if (request.query.from || request.query.to) {
        where.createdAt = {};
        if (request.query.from) {
          where.createdAt.gte = new Date(request.query.from);
        }
        if (request.query.to) {
          where.createdAt.lte = new Date(request.query.to);
        }
      }

      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          include: {
            items: true,
            payments: true,
            user: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.sale.count({ where }),
      ]);

      return {
        data: sales,
        pagination: { limit, page, total, totalPages: Math.ceil(total / limit) },
        success: true,
      };
    },
  );

  server.get(
    '/receipt/:receiptNumber',
    async (
      request: FastifyRequest<{ Params: ReceiptParams }>,
      reply: FastifyReply,
    ) => {
      const sale = await prisma.sale.findFirst({
        include: {
          branch: true,
          items: true,
          payments: true,
          register: true,
          user: { select: { fullName: true } },
        },
        where: {
          receiptNumber: request.params.receiptNumber,
          ...(request.user.role === 'SUPER_ADMIN'
            ? {}
            : { companyId: request.user.companyId }),
        },
      });

      if (!sale) {
        return reply.status(404).send({
          error: 'Fis bulunamadi',
          success: false,
        });
      }

      return {
        data: sale,
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
      const sale = await prisma.sale.findFirst({
        include: {
          branch: { select: { name: true } },
          items: true,
          payments: true,
          register: { select: { name: true } },
          user: { select: { fullName: true } },
        },
        where: {
          ...(request.user.role === 'SUPER_ADMIN'
            ? {}
            : { companyId: request.user.companyId }),
          deletedAt: null,
          id: request.params.id,
        },
      });

      if (!sale) {
        return reply.status(404).send({
          error: 'Satis bulunamadi',
          success: false,
        });
      }

      return {
        data: sale,
        success: true,
      };
    },
  );
}

