import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import {
  calculateLineTotal,
  calculateLineVat,
  createSaleSchema,
  type VatRate,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import prisma from '../lib/prisma';
import { resolveScopedCompanyId } from '../lib/request-scope';

interface IdParams {
  id: string;
}

interface ReceiptParams {
  receiptNumber: string;
}

interface SaleListQuery {
  companyId?: string;
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function localDateToken(date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function localTimeToken(date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}${mm}${ss}`;
}

function sanitizeSegment(value: string, maxLength: number): string {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, maxLength);
  return normalized.length > 0 ? normalized : 'X';
}

function buildSpecialReceiptNumber(params: {
  branchId: string;
  registerName: string;
}): string {
  const date = new Date();
  const datePart = localDateToken(date);
  const timePart = localTimeToken(date);
  const registerPart = sanitizeSegment(params.registerName, 4);
  const branchPart = sanitizeSegment(params.branchId.replace(/-/gu, ''), 3);
  const nonce = randomUUID().replace(/-/gu, '').slice(0, 6).toUpperCase();
  return `MP-${datePart}-${branchPart}${registerPart}-${timePart}-${nonce}`;
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

    const { clientRequestId, customerId, items, note, payments, registerId, sessionId } =
      parsed.data;
    const normalizedClientRequestId = (clientRequestId ?? '').trim();
    if (normalizedClientRequestId.length === 0) {
      return reply.status(400).send({
        error: 'clientRequestId zorunludur',
        success: false,
      });
    }
    const user = request.user;

    const loadSaleForReplay = async (companyId: string) =>
      prisma.sale.findFirst({
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
          payments: true,
        },
        where: {
          clientRequestId: normalizedClientRequestId,
          companyId,
        },
      });

    try {
      const result = await prisma.$transaction(async (tx) => {
        const register = await tx.register.findUnique({
          include: { 
            branch: {
              include: { company: true }
            } 
          },
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

        const existingSale = await tx.sale.findFirst({
          include: {
            customer: { select: { id: true, name: true } },
            items: true,
            payments: true,
          },
          where: {
            clientRequestId: normalizedClientRequestId,
            companyId: register.branch.companyId,
          },
        });
        if (existingSale) {
          return { created: false, sale: existingSale };
        }

        const requestedSession = await tx.registerSession.findFirst({
          where: {
            id: sessionId,
            registerId,
          },
        });

        let resolvedSession =
          requestedSession?.status === 'OPEN' ? requestedSession : null;
        if (!resolvedSession) {
          resolvedSession = await tx.registerSession.findFirst({
            orderBy: {
              updatedAt: 'desc',
            },
            where: {
              registerId,
              status: 'OPEN',
            },
          });
        }
        if (!resolvedSession) {
          resolvedSession = await tx.registerSession.create({
            data: {
              branchId: register.branchId,
              note: 'AUTO_OPEN_FOR_OFFLINE_SYNC',
              openingBalance: 0,
              registerId,
              status: 'OPEN',
              userId: user.id,
            },
          });
        }

        let resolvedCustomerId: string | null = null;
        let resolvedCustomerTier: 'RETAIL' | 'WHOLESALE' = 'RETAIL';
        if (customerId) {
          const customer = await tx.customer.findFirst({
            select: { id: true, priceTier: true },
            where: {
              companyId: register.branch.companyId,
              deletedAt: null,
              id: customerId,
              isActive: true,
            },
          });
          if (!customer) {
            throw new Error('Musteri bulunamadi');
          }
          resolvedCustomerId = customer.id;
          resolvedCustomerTier = (customer.priceTier as 'RETAIL' | 'WHOLESALE') ?? 'RETAIL';
        }

        const company = register.branch.company;
        const requestedCartDiscount = parsed.data.totalCartDiscount ?? 0;

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

          const resolvedUnitPrice =
            resolvedCustomerTier === 'WHOLESALE' &&
            typeof product.wholesalePrice === 'number' &&
            product.wholesalePrice >= 0
              ? product.wholesalePrice
              : product.salePrice;

          // Price verification by resolved customer tier
          if (Math.abs(item.unitPrice - resolvedUnitPrice) > 0.01) {
            throw new Error(
              `Fiyat uyumsuzlugu: ${product.name} icin beklenen ${resolvedUnitPrice}, gelen ${item.unitPrice}`,
            );
          }

          // Item Discount Policy Enforcement
          const itemGross = item.quantity * item.unitPrice;
          const maxAllowedItemDiscount = (itemGross * company.maxItemDiscountPercent) / 100;
          if (item.discount > maxAllowedItemDiscount + 0.01) {
             throw new Error(`Urun indirim limiti asildi: ${product.name} (%${company.maxItemDiscountPercent})`);
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
            purchasePrice: product.purchasePrice,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            vatAmount,
            vatRate: product.vatRate,
          };
        });

        const cartSubtotalBeforeCartDiscount = subtotal + totalVat;
        const maxAllowedCartDiscount = (cartSubtotalBeforeCartDiscount * company.maxCartDiscountPercent) / 100;
        
        if (requestedCartDiscount > maxAllowedCartDiscount + 0.01) {
          throw new Error(`Sepet indirim limiti asildi (%${company.maxCartDiscountPercent})`);
        }

        const grandTotal = cartSubtotalBeforeCartDiscount - requestedCartDiscount;
        const onAccountPayment = payments
          .filter((payment) => payment.method === 'ON_ACCOUNT')
          .reduce((sum, payment) => sum + payment.amount, 0);
        if (onAccountPayment > 0 && !resolvedCustomerId) {
          throw new Error('Cari satis icin musteri secimi zorunludur');
        }
        const receiptNumber = buildSpecialReceiptNumber({
          branchId: register.branchId,
          registerName: register.name,
        });

        const newSale = await tx.sale.create({
          data: {
            branchId: register.branchId,
            clientRequestId: normalizedClientRequestId,
            companyId: register.branch.companyId,
            customerId: resolvedCustomerId,
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
            sessionId: resolvedSession.id,
            subtotal,
            totalCartDiscount: requestedCartDiscount,
            totalDiscount: totalDiscount + requestedCartDiscount,
            totalVat,
            userId: user.id,
          },
          include: {
            customer: { select: { id: true, name: true } },
            items: true,
            payments: true,
          },
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

        if (onAccountPayment > 0 && resolvedCustomerId) {
          await tx.customer.update({
            data: {
              balance: { increment: onAccountPayment },
            },
            where: { id: resolvedCustomerId },
          });
          await tx.customerTransaction.create({
            data: {
              amount: onAccountPayment,
              customerId: resolvedCustomerId,
              description: `${newSale.receiptNumber} no'lu satis`,
              saleId: newSale.id,
              type: 'DEBT',
            },
          });
        }

        const cardPayment = payments
          .filter(
            (payment) =>
              payment.method === 'CREDIT_CARD' || payment.method === 'DEBIT_CARD',
          )
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
          where: { id: resolvedSession.id },
        });

        return { created: true, sale: newSale };
      });

      return reply.status(result.created ? 201 : 200).send({
        data: result.sale,
        success: true,
      });
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const register = await prisma.register.findUnique({
        include: { branch: true },
        where: { id: registerId },
      });
      if (!register) {
        throw error;
      }
      const existingSale = await loadSaleForReplay(register.branch.companyId);
      if (!existingSale) {
        throw error;
      }
      return reply.status(200).send({
        data: existingSale,
        success: true,
      });
    }
  });

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: SaleListQuery }>,
      reply: FastifyReply,
    ) => {
      const limit = parsePositiveInt(request.query.limit, 20);
      const page = parsePositiveInt(request.query.page, 1);
      const skip = (page - 1) * limit;

      const scopedCompanyId = resolveScopedCompanyId(
        request,
        reply,
        request.query.companyId,
      );
      if (reply.sent || !scopedCompanyId) {
        return;
      }

      const where: Prisma.SaleWhereInput = {
        companyId: scopedCompanyId,
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
            customer: { select: { id: true, name: true } },
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
          customer: { select: { id: true, name: true } },
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
          customer: { select: { id: true, name: true } },
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

