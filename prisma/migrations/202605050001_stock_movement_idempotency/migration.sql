-- Add idempotency key for offline-first stock movement retries.
ALTER TABLE "stock_movements"
ADD COLUMN "client_request_id" TEXT;

CREATE UNIQUE INDEX "stock_movements_branch_id_client_request_id_key"
ON "stock_movements"("branch_id", "client_request_id");
