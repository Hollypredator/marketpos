ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "price_tier" TEXT NOT NULL DEFAULT 'RETAIL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PriceTier') THEN
    CREATE TYPE "PriceTier" AS ENUM ('RETAIL', 'WHOLESALE');
  END IF;
END $$;

ALTER TABLE "customers"
ALTER COLUMN "price_tier" TYPE "PriceTier" USING "price_tier"::"PriceTier";

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "wholesale_price" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "invoice_template_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "header_text" TEXT,
  "footer_note" TEXT,
  "logo_url" TEXT,
  "tax_office" TEXT,
  "trade_registry_no" TEXT,
  "sales_label" TEXT,
  "purchase_label" TEXT,
  "dispatch_label" TEXT,
  "sales_header" TEXT,
  "purchase_header" TEXT,
  "dispatch_header" TEXT,
  "sales_footer" TEXT,
  "purchase_footer" TEXT,
  "dispatch_footer" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_template_configs_company_id_key"
  ON "invoice_template_configs" ("company_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoice_template_configs_company_id_fkey'
  ) THEN
    ALTER TABLE "invoice_template_configs"
    ADD CONSTRAINT "invoice_template_configs_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
