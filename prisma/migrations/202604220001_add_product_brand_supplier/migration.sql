ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "brand" TEXT,
ADD COLUMN IF NOT EXISTS "supplier_id" UUID;

CREATE INDEX IF NOT EXISTS "products_supplier_id_idx" ON "products"("supplier_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_supplier_id_fkey'
  ) THEN
    ALTER TABLE "products"
    ADD CONSTRAINT "products_supplier_id_fkey"
    FOREIGN KEY ("supplier_id")
    REFERENCES "suppliers"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;
