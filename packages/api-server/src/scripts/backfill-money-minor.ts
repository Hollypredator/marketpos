import prisma from '../lib/prisma';

interface DriftRow {
  balance_minor: bigint;
  computed_minor: bigint;
  supplier_id: string;
}

function asCount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return 0;
}

async function runBackfill(): Promise<void> {
  const updatedRows = await prisma.$transaction(async (tx) => {
    const productRows = await tx.$executeRawUnsafe(`
      UPDATE products
      SET
        purchase_price_minor = ROUND(COALESCE(purchase_price, 0)::numeric * 100)::bigint,
        sale_price_minor = ROUND(COALESCE(sale_price, 0)::numeric * 100)::bigint
    `);

    const supplierTransactionRows = await tx.$executeRawUnsafe(`
      UPDATE supplier_transactions
      SET amount_minor = ROUND(COALESCE(amount, 0)::numeric * 100)::bigint
    `);

    const purchaseInvoiceRows = await tx.$executeRawUnsafe(`
      UPDATE purchase_invoices
      SET
        subtotal_minor = ROUND(COALESCE(subtotal, 0)::numeric * 100)::bigint,
        total_vat_minor = ROUND(COALESCE(total_vat, 0)::numeric * 100)::bigint,
        total_discount_minor = ROUND(COALESCE(total_discount, 0)::numeric * 100)::bigint,
        grand_total_minor = ROUND(COALESCE(grand_total, 0)::numeric * 100)::bigint
    `);

    const purchaseInvoiceItemRows = await tx.$executeRawUnsafe(`
      UPDATE purchase_invoice_items
      SET
        unit_price_minor = ROUND(COALESCE(unit_price, 0)::numeric * 100)::bigint,
        vat_amount_minor = ROUND(COALESCE(vat_amount, 0)::numeric * 100)::bigint,
        discount_minor = ROUND(COALESCE(discount, 0)::numeric * 100)::bigint,
        line_total_minor = ROUND(COALESCE(line_total, 0)::numeric * 100)::bigint
    `);

    const supplierBalanceRows = await tx.$executeRawUnsafe(`
      UPDATE suppliers AS s
      SET balance_minor = COALESCE(t.total_minor, 0)
      FROM (
        SELECT
          supplier_id,
          COALESCE(
            SUM(
              CASE
                WHEN type = 'PAYMENT' THEN -amount_minor
                ELSE amount_minor
              END
            ),
            0
          ) AS total_minor
        FROM supplier_transactions
        GROUP BY supplier_id
      ) AS t
      WHERE s.id = t.supplier_id
    `);

    const suppliersWithoutTransactionsRows = await tx.$executeRawUnsafe(`
      UPDATE suppliers AS s
      SET balance_minor = 0
      WHERE NOT EXISTS (
        SELECT 1
        FROM supplier_transactions AS st
        WHERE st.supplier_id = s.id
      )
    `);

    return {
      productRows: asCount(productRows),
      purchaseInvoiceItemRows: asCount(purchaseInvoiceItemRows),
      purchaseInvoiceRows: asCount(purchaseInvoiceRows),
      supplierBalanceRows: asCount(supplierBalanceRows),
      supplierTransactionRows: asCount(supplierTransactionRows),
      suppliersWithoutTransactionsRows: asCount(suppliersWithoutTransactionsRows),
    };
  });

  const drifts = await prisma.$queryRawUnsafe<DriftRow[]>(`
    SELECT
      s.id AS supplier_id,
      s.balance_minor,
      COALESCE(
        (
          SELECT SUM(
            CASE
              WHEN st.type = 'PAYMENT' THEN -st.amount_minor
              ELSE st.amount_minor
            END
          )
          FROM supplier_transactions AS st
          WHERE st.supplier_id = s.id
        ),
        0
      ) AS computed_minor
    FROM suppliers AS s
    WHERE s.balance_minor <> COALESCE(
      (
        SELECT SUM(
          CASE
            WHEN st.type = 'PAYMENT' THEN -st.amount_minor
            ELSE st.amount_minor
          END
        )
        FROM supplier_transactions AS st
        WHERE st.supplier_id = s.id
      ),
      0
    )
    LIMIT 20
  `);

  console.log('[backfill-money-minor] Updated rows:', updatedRows);
  if (drifts.length > 0) {
    console.warn('[backfill-money-minor] Balance drift detected:', drifts);
  } else {
    console.log('[backfill-money-minor] Supplier balance_minor is consistent with transaction minors.');
  }
}

runBackfill()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[backfill-money-minor] Failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
