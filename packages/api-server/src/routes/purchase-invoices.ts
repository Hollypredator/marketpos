import type { Prisma, PurchaseDocumentType, PurchaseInvoiceStatus } from '@prisma/client';
import {
  createPurchaseInvoiceSchema,
  paginationSchema,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { moneyFromMinorOrFloat, roundMoney, toMinor } from '../lib/money';
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

interface PurchaseInvoiceListQuery {
  branchId?: string;
  companyId?: string;
  documentType?: PurchaseDocumentType;
  limit?: string;
  page?: string;
  status?: PurchaseInvoiceStatus;
  supplierId?: string;
}

const convertDispatchToInvoiceSchema = z.object({
  documentDate: z.string().datetime().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  invoiceNumber: z.string().trim().min(1).max(50).optional(),
  note: z.string().trim().max(500).optional(),
});

function serializeInvoiceItem(item: Record<string, unknown>): Record<string, unknown> {
  const {
    discount,
    discountMinor,
    lineTotal,
    lineTotalMinor,
    unitPrice,
    unitPriceMinor,
    vatAmount,
    vatAmountMinor,
    ...rest
  } = item;

  return {
    ...rest,
    discount: moneyFromMinorOrFloat(discount as number | undefined, discountMinor as bigint | undefined),
    lineTotal: moneyFromMinorOrFloat(lineTotal as number | undefined, lineTotalMinor as bigint | undefined),
    unitPrice: moneyFromMinorOrFloat(unitPrice as number | undefined, unitPriceMinor as bigint | undefined),
    vatAmount: moneyFromMinorOrFloat(vatAmount as number | undefined, vatAmountMinor as bigint | undefined),
  };
}

function serializeInvoice(invoice: Record<string, unknown>): Record<string, unknown> {
  const {
    grandTotal,
    grandTotalMinor,
    items,
    subtotal,
    subtotalMinor,
    totalDiscount,
    totalDiscountMinor,
    totalVat,
    totalVatMinor,
    ...rest
  } = invoice;

  const serializedItems = Array.isArray(items)
    ? items.map((item) => serializeInvoiceItem(item as Record<string, unknown>))
    : undefined;

  return {
    ...rest,
    grandTotal: moneyFromMinorOrFloat(
      grandTotal as number | undefined,
      grandTotalMinor as bigint | undefined,
    ),
    items: serializedItems,
    subtotal: moneyFromMinorOrFloat(
      subtotal as number | undefined,
      subtotalMinor as bigint | undefined,
    ),
    totalDiscount: moneyFromMinorOrFloat(
      totalDiscount as number | undefined,
      totalDiscountMinor as bigint | undefined,
    ),
    totalVat: moneyFromMinorOrFloat(
      totalVat as number | undefined,
      totalVatMinor as bigint | undefined,
    ),
  };
}

export async function purchaseInvoiceRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: PurchaseInvoiceListQuery }>,
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
      const scopedBranchId = resolveScopedBranchId(
        request,
        reply,
        request.query.branchId,
      );
      if (reply.sent) {
        return;
      }

      const where: Prisma.PurchaseInvoiceWhereInput = {
        deletedAt: null,
      };
      if (scopedCompanyId) {
        where.companyId = scopedCompanyId;
      }
      if (scopedBranchId) {
        where.branchId = scopedBranchId;
      }
      if (request.query.supplierId) {
        where.supplierId = request.query.supplierId;
      }
      if (request.query.documentType) {
        where.documentType = request.query.documentType;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }

      const [invoices, total] = await Promise.all([
        prisma.purchaseInvoice.findMany({
          include: {
            branch: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          where,
        }),
        prisma.purchaseInvoice.count({ where }),
      ]);

      return {
        data: invoices.map((invoice) =>
          serializeInvoice(invoice as unknown as Record<string, unknown>),
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
      const invoice = await prisma.purchaseInvoice.findFirst({
        include: {
          branch: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { barcode: true, name: true } } },
          },
          supplier: { select: { id: true, name: true } },
        },
        where: {
          deletedAt: null,
          id: request.params.id,
        },
      });
      if (!invoice || !isCompanyInScope(request, invoice.companyId)) {
        return reply.status(404).send({
          error: 'Alis faturasi bulunamadi',
          success: false,
        });
      }

      return {
        data: serializeInvoice(invoice as unknown as Record<string, unknown>),
        success: true,
      };
    },
  );

  server.post(
    '/',
    { preHandler: server.ensureBackofficeWriter },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const bodyObj = request.body as Record<string, unknown>;
      const parsed = createPurchaseInvoiceSchema.safeParse(bodyObj);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message ?? 'Gecersiz fatura verisi',
          success: false,
        });
      }

      const currentUserId = request.user?.id;
      if (!currentUserId) {
        return reply.status(401).send({ error: 'Yetkisiz islem', success: false });
      }

      const branch = await prisma.branch.findUnique({ where: { id: parsed.data.branchId } });
      if (!branch) {
        return reply.status(404).send({ error: 'Sube bulunamadi', success: false });
      }

      if (!ensureCompanyOwnership(request, reply, branch.companyId)) {
        return;
      }

      const supplier = await prisma.supplier.findFirst({
        where: {
          companyId: branch.companyId,
          deletedAt: null,
          id: parsed.data.supplierId,
        },
      });
      if (!supplier) {
        return reply.status(400).send({
          error: 'Tedarikci ayni firma icinde bulunamadi',
          success: false,
        });
      }

      const {
        branchId,
        dispatchNumber,
        documentDate,
        documentType,
        dueDate,
        invoiceNumber,
        items,
        note,
        supplierId,
        totalDiscount,
      } = parsed.data;

      try {
        const result = await prisma.$transaction(async (tx) => {
          let subtotalMinor = 0n;
          let totalVatMinor = 0n;

          const invoiceItems = items.map((item) => {
            const unitPriceMinor = toMinor(item.unitPrice);
            const quantityXPriceMinor = BigInt(
              Math.round(item.quantity * Number(unitPriceMinor)),
            );
            const vatAmountMinor = BigInt(
              Math.round(Number(quantityXPriceMinor) * (item.vatRate / 100)),
            );
            const discountMinor = toMinor(item.discount);
            const lineTotalMinor = quantityXPriceMinor + vatAmountMinor - discountMinor;

            subtotalMinor += quantityXPriceMinor;
            totalVatMinor += vatAmountMinor;

            return {
              discount: moneyFromMinorOrFloat(item.discount, discountMinor),
              discountMinor,
              lineTotal: moneyFromMinorOrFloat(0, lineTotalMinor),
              lineTotalMinor,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: moneyFromMinorOrFloat(item.unitPrice, unitPriceMinor),
              unitPriceMinor,
              vatAmount: moneyFromMinorOrFloat(0, vatAmountMinor),
              vatAmountMinor,
              vatRate: item.vatRate,
            };
          });

          const totalDiscountMinor = toMinor(totalDiscount);
          const grandTotalMinor = subtotalMinor + totalVatMinor - totalDiscountMinor;
          if (grandTotalMinor < 0) {
            throw new Error('Genel toplam 0 altinda olamaz');
          }

          const subtotal = moneyFromMinorOrFloat(0, subtotalMinor);
          const totalVat = moneyFromMinorOrFloat(0, totalVatMinor);
          const grandTotal = moneyFromMinorOrFloat(0, grandTotalMinor);

          const affectsStock = documentType === 'DISPATCH' || documentType === 'INVOICE';
          const affectsDebt = documentType === 'INVOICE';
          const resolvedStatus: PurchaseInvoiceStatus =
            documentType === 'ORDER' ? 'DRAFT' : 'COMPLETED';

          const invoice = await tx.purchaseInvoice.create({
            data: {
              branchId,
              companyId: branch.companyId,
              convertedAt: null,
              convertedToInvoiceId: null,
              dispatchNumber: dispatchNumber?.trim() || null,
              documentDate: documentDate ? new Date(documentDate) : null,
              documentType,
              dueDate: dueDate ? new Date(dueDate) : null,
              grandTotal,
              grandTotalMinor,
              invoiceNumber,
              note,
              sourceDispatchId: null,
              status: resolvedStatus,
              subtotal,
              subtotalMinor,
              supplierId,
              totalDiscount: roundMoney(totalDiscount),
              totalDiscountMinor,
              totalVat,
              totalVatMinor,
              userId: currentUserId,
              items: {
                create: invoiceItems,
              },
            },
          });

          if (affectsDebt) {
            await tx.supplier.update({
              data: {
                balance: { increment: grandTotal },
                balanceMinor: { increment: grandTotalMinor },
              },
              where: { id: supplierId },
            });

            await tx.supplierTransaction.create({
              data: {
                amount: grandTotal,
                amountMinor: grandTotalMinor,
                description: `Alis Faturasi #${invoiceNumber}`,
                invoiceId: invoice.id,
                supplierId,
                type: 'DEBT',
              },
            });
          }

          if (affectsStock) {
            for (const item of invoiceItems) {
              const currentStock = await tx.stockLevel.findUnique({
                where: {
                  productId_branchId: { branchId, productId: item.productId },
                },
              });
              const previousQty = currentStock?.quantity ?? 0;
              const newQty = previousQty + item.quantity;

              await tx.stockLevel.upsert({
                create: {
                  branchId,
                  productId: item.productId,
                  quantity: item.quantity,
                },
                update: {
                  quantity: { increment: item.quantity },
                },
                where: {
                  productId_branchId: { branchId, productId: item.productId },
                },
              });

              await tx.stockMovement.create({
                data: {
                  branchId,
                  newQuantity: newQty,
                  previousQuantity: previousQty,
                  productId: item.productId,
                  quantity: item.quantity,
                  reference: dispatchNumber?.trim() || invoiceNumber,
                  type: 'PURCHASE',
                  userId: currentUserId,
                },
              });

              await tx.product.update({
                data: {
                  purchasePrice: item.unitPrice,
                  purchasePriceMinor: item.unitPriceMinor,
                },
                where: { id: item.productId },
              });
            }
          }

          return invoice;
        });

        return reply.status(201).send({
          data: serializeInvoice(result as unknown as Record<string, unknown>),
          success: true,
        });
      } catch (error: unknown) {
        server.log.error(error);
        return reply.status(500).send({
          error: 'Fatura kaydedilemedi, islem geri alindi',
          success: false,
        });
      }
    },
  );

  server.post(
    '/:id/convert-to-invoice',
    { preHandler: server.ensureBackofficeWriter },
    async (
      request: FastifyRequest<{ Params: IdParams }>,
      reply: FastifyReply,
    ) => {
      const parsed = convertDispatchToInvoiceSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error:
            parsed.error.errors[0]?.message ?? 'Gecersiz irsaliye donusum verisi',
          success: false,
        });
      }

      const currentUserId = request.user?.id;
      if (!currentUserId) {
        return reply.status(401).send({ error: 'Yetkisiz islem', success: false });
      }

      const dispatch = await prisma.purchaseInvoice.findFirst({
        include: { items: true },
        where: {
          deletedAt: null,
          documentType: 'DISPATCH',
          id: request.params.id,
        },
      });
      if (!dispatch || !isCompanyInScope(request, dispatch.companyId)) {
        return reply.status(404).send({
          error: 'Irsaliye bulunamadi',
          success: false,
        });
      }
      if (dispatch.convertedToInvoiceId) {
        return reply.status(409).send({
          error: 'Bu irsaliye zaten faturaya donusturulmus',
          success: false,
        });
      }

      const invoiceNumber =
        parsed.data.invoiceNumber && parsed.data.invoiceNumber.trim().length > 0
          ? parsed.data.invoiceNumber.trim()
          : `INV-${dispatch.invoiceNumber}-${Date.now()}`;

      const existingForDispatch = await prisma.purchaseInvoice.findFirst({
        where: {
          deletedAt: null,
          sourceDispatchId: dispatch.id,
        },
      });
      if (existingForDispatch) {
        return reply.status(409).send({
          error: 'Bu irsaliye zaten faturaya donusturulmus',
          success: false,
        });
      }

      try {
        const converted = await prisma.$transaction(async (tx) => {
          const convertedInvoice = await tx.purchaseInvoice.create({
            data: {
              branchId: dispatch.branchId,
              companyId: dispatch.companyId,
              convertedAt: null,
              convertedToInvoiceId: null,
              dispatchNumber: dispatch.dispatchNumber,
              documentDate: parsed.data.documentDate
                ? new Date(parsed.data.documentDate)
                : dispatch.documentDate,
              documentType: 'INVOICE',
              dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : dispatch.dueDate,
              grandTotal: dispatch.grandTotal,
              grandTotalMinor: dispatch.grandTotalMinor,
              invoiceNumber,
              note: parsed.data.note ?? dispatch.note,
              sourceDispatchId: dispatch.id,
              status: 'COMPLETED',
              subtotal: dispatch.subtotal,
              subtotalMinor: dispatch.subtotalMinor,
              supplierId: dispatch.supplierId,
              totalDiscount: dispatch.totalDiscount,
              totalDiscountMinor: dispatch.totalDiscountMinor,
              totalVat: dispatch.totalVat,
              totalVatMinor: dispatch.totalVatMinor,
              userId: currentUserId,
              items: {
                create: dispatch.items.map((item) => ({
                  discount: item.discount,
                  discountMinor: item.discountMinor,
                  lineTotal: item.lineTotal,
                  lineTotalMinor: item.lineTotalMinor,
                  productId: item.productId,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  unitPriceMinor: item.unitPriceMinor,
                  vatAmount: item.vatAmount,
                  vatAmountMinor: item.vatAmountMinor,
                  vatRate: item.vatRate,
                })),
              },
            },
          });

          await tx.supplier.update({
            data: {
              balance: { increment: dispatch.grandTotal },
              balanceMinor: { increment: dispatch.grandTotalMinor },
            },
            where: { id: dispatch.supplierId },
          });

          await tx.supplierTransaction.create({
            data: {
              amount: dispatch.grandTotal,
              amountMinor: dispatch.grandTotalMinor,
              description: `Irsaliye Faturaya Donusum #${invoiceNumber}`,
              invoiceId: convertedInvoice.id,
              supplierId: dispatch.supplierId,
              type: 'DEBT',
            },
          });

          await tx.purchaseInvoice.update({
            data: {
              convertedAt: new Date(),
              convertedToInvoiceId: convertedInvoice.id,
            },
            where: { id: dispatch.id },
          });

          return convertedInvoice;
        });

        return reply.status(201).send({
          data: serializeInvoice(converted as unknown as Record<string, unknown>),
          success: true,
        });
      } catch (error: unknown) {
        server.log.error(error);
        return reply.status(500).send({
          error: 'Irsaliye faturaya donusturulemedi',
          success: false,
        });
      }
    },
  );
}
