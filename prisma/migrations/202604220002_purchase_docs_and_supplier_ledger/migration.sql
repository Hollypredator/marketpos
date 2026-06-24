ALTER TABLE "purchase_invoices"
ADD COLUMN IF NOT EXISTS "document_type" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN IF NOT EXISTS "dispatch_number" TEXT,
ADD COLUMN IF NOT EXISTS "document_date" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'PurchaseDocumentType'
  ) THEN
    CREATE TYPE "PurchaseDocumentType" AS ENUM ('ORDER', 'DISPATCH', 'INVOICE');
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'purchase_invoices' AND column_name = 'document_type'
  ) THEN
    ALTER TABLE "purchase_invoices"
    ALTER COLUMN "document_type" TYPE "PurchaseDocumentType"
    USING ("document_type"::text::"PurchaseDocumentType");
  END IF;
END
$$;
