ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "purchase_price_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "sale_price_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "suppliers"
ADD COLUMN IF NOT EXISTS "balance_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "supplier_transactions"
ADD COLUMN IF NOT EXISTS "amount_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "purchase_invoices"
ADD COLUMN IF NOT EXISTS "source_dispatch_id" UUID,
ADD COLUMN IF NOT EXISTS "converted_to_invoice_id" UUID,
ADD COLUMN IF NOT EXISTS "converted_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "total_vat_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "total_discount_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "grand_total_minor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "purchase_invoice_items"
ADD COLUMN IF NOT EXISTS "unit_price_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "vat_amount_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discount_minor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "line_total_minor" BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "purchase_invoices_source_dispatch_id_idx"
  ON "purchase_invoices" ("source_dispatch_id");
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoices_source_dispatch_id_key"
  ON "purchase_invoices" ("source_dispatch_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_source_dispatch_id_fkey'
  ) THEN
    ALTER TABLE "purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_source_dispatch_id_fkey"
    FOREIGN KEY ("source_dispatch_id")
    REFERENCES "purchase_invoices"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_converted_to_invoice_id_fkey'
  ) THEN
    ALTER TABLE "purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_converted_to_invoice_id_fkey"
    FOREIGN KEY ("converted_to_invoice_id")
    REFERENCES "purchase_invoices"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;

UPDATE "products"
SET
  "purchase_price_minor" = ROUND("purchase_price" * 100)::BIGINT,
  "sale_price_minor" = ROUND("sale_price" * 100)::BIGINT
WHERE "purchase_price_minor" = 0
  AND ("purchase_price" <> 0 OR "sale_price" <> 0);

UPDATE "suppliers"
SET
  "balance_minor" = ROUND("balance" * 100)::BIGINT
WHERE "balance_minor" = 0
  AND "balance" <> 0;

UPDATE "supplier_transactions"
SET
  "amount_minor" = ROUND("amount" * 100)::BIGINT
WHERE "amount_minor" = 0
  AND "amount" <> 0;

UPDATE "purchase_invoices"
SET
  "subtotal_minor" = ROUND("subtotal" * 100)::BIGINT,
  "total_vat_minor" = ROUND("total_vat" * 100)::BIGINT,
  "total_discount_minor" = ROUND("total_discount" * 100)::BIGINT,
  "grand_total_minor" = ROUND("grand_total" * 100)::BIGINT
WHERE "subtotal_minor" = 0
  AND ("subtotal" <> 0 OR "total_vat" <> 0 OR "total_discount" <> 0 OR "grand_total" <> 0);

UPDATE "purchase_invoice_items"
SET
  "unit_price_minor" = ROUND("unit_price" * 100)::BIGINT,
  "vat_amount_minor" = ROUND("vat_amount" * 100)::BIGINT,
  "discount_minor" = ROUND("discount" * 100)::BIGINT,
  "line_total_minor" = ROUND("line_total" * 100)::BIGINT
WHERE "unit_price_minor" = 0
  AND ("unit_price" <> 0 OR "vat_amount" <> 0 OR "discount" <> 0 OR "line_total" <> 0);
