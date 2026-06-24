import { createHash } from 'node:crypto';

import type {
  SyncPushResultStatus,
} from '@marketpos/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { moneyFromMinorOrFloat } from '../lib/money';
import prisma from '../lib/prisma';

const isSqlite = process.env.DATABASE_URL?.startsWith('file:');
const SYNC_V2_ENABLED = (process.env.SYNC_V2_ENABLED ?? 'false').toLowerCase() === 'true';

const pushSaleEntrySchema = z.object({
  localId: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushRefundEntrySchema = z.object({
  localId: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushProductOpEntrySchema = z.object({
  localId: z.string().trim().min(1),
  method: z.enum(['DELETE', 'POST', 'PUT']),
  path: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushCustomerOpEntrySchema = z.object({
  localId: z.string().trim().min(1),
  method: z.enum(['DELETE', 'POST', 'PUT']),
  path: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushSupplierOpEntrySchema = z.object({
  localId: z.string().trim().min(1),
  method: z.enum(['DELETE', 'POST', 'PUT']),
  path: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushPurchaseOpEntrySchema = z.object({
  localId: z.string().trim().min(1),
  method: z.enum(['DELETE', 'POST', 'PUT']),
  path: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const pushStockOpEntrySchema = z.object({
  localId: z.string().trim().min(1),
  payload: z.record(z.unknown()),
});

const syncPushSchema = z.object({
  clientSyncAt: z.string().datetime().optional().nullable(),
  customerOps: z.array(pushCustomerOpEntrySchema).default([]),
  cursor: z.string().trim().min(1).optional().nullable(),
  productOps: z.array(pushProductOpEntrySchema).default([]),
  purchaseOps: z.array(pushPurchaseOpEntrySchema).default([]),
  refunds: z.array(pushRefundEntrySchema).default([]),
  registerId: z.string().uuid(),
  sales: z.array(pushSaleEntrySchema).default([]),
  stockOps: z.array(pushStockOpEntrySchema).default([]),
  supplierOps: z.array(pushSupplierOpEntrySchema).default([]),
});

const syncHeartbeatSchema = z.object({
  clientObservedAt: z.string().datetime(),
  lastSyncErrorCode: z.string().trim().min(1).optional().nullable(),
  lastSyncedAt: z.string().datetime().optional().nullable(),
  lastSyncStatus: z.enum(['DEGRADED', 'IDLE', 'OK']),
  oldestPendingAgeSec: z.number().int().min(0).optional().nullable(),
  pendingCount: z.number().int().min(0),
  productOps: z.number().int().min(0),
  queuePeak: z.number().int().min(0),
  refunds: z.number().int().min(0),
  registerId: z.string().uuid(),
  sales: z.number().int().min(0),
  stockOps: z.number().int().min(0),
});

const syncPullQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  includePurchaseInvoices: z.enum(['false', 'true']).optional(),
  lastSyncAt: z.string().datetime().optional(),
  registerId: z.string().uuid(),
});

interface SyncPullQuery {
  cursor?: string;
  includePurchaseInvoices?: string;
  lastSyncAt?: string;
  registerId: string;
}

interface SyncHeartbeatResponsePayload {
  serverObservedAt: string;
}

type SyncEntity =
  | 'customerOps'
  | 'productOps'
  | 'purchaseOps'
  | 'refunds'
  | 'sales'
  | 'stockOps'
  | 'supplierOps';

interface SyncPushEntityResult {
  entity: SyncEntity;
  error?: string;
  errorCode?: string;
  localId: string;
  operationKey: string;
  status: SyncPushResultStatus;
}

interface SyncPushResponsePayload {
  acceptedCount: number;
  errors: string[];
  failedCount: number;
  replayedCount: number;
  resultsByEntity: {
    customerOps: SyncPushEntityResult[];
    productOps: SyncPushEntityResult[];
    purchaseOps: SyncPushEntityResult[];
    refunds: SyncPushEntityResult[];
    sales: SyncPushEntityResult[];
    stockOps: SyncPushEntityResult[];
    supplierOps: SyncPushEntityResult[];
  };
  serverSyncAt: string;
}

interface IngestionRow {
  entity_type: string;
  error_code: string | null;
  error_message: string | null;
  local_id: string;
  operation_key: string;
  payload_hash: string | null;
  status: string;
}

interface PushEntryTask {
  entity: SyncEntity;
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  operationKey: string;
  path: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}

export function serializeSyncProduct(product: Record<string, unknown>): Record<string, unknown> {
  const { purchasePrice, purchasePriceMinor, salePrice, salePriceMinor, ...rest } = product;
  return {
    ...rest,
    purchasePrice: moneyFromMinorOrFloat(
      purchasePrice as number | undefined,
      purchasePriceMinor as bigint | undefined,
    ),
    salePrice: moneyFromMinorOrFloat(
      salePrice as number | undefined,
      salePriceMinor as bigint | undefined,
    ),
  };
}

export function serializeSyncSupplier(supplier: Record<string, unknown>): Record<string, unknown> {
  const { balance, balanceMinor, ...rest } = supplier;
  return {
    ...rest,
    balance: moneyFromMinorOrFloat(
      balance as number | undefined,
      balanceMinor as bigint | undefined,
    ),
  };
}

export function serializeSyncPurchaseInvoice(
  invoice: Record<string, unknown>,
): Record<string, unknown> {
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
    ? items.map((item) => {
        const {
          discount,
          discountMinor,
          lineTotal,
          lineTotalMinor,
          unitPrice,
          unitPriceMinor,
          vatAmount,
          vatAmountMinor,
          ...itemRest
        } = item as Record<string, unknown>;
        return {
          ...itemRest,
          discount: moneyFromMinorOrFloat(
            discount as number | undefined,
            discountMinor as bigint | undefined,
          ),
          lineTotal: moneyFromMinorOrFloat(
            lineTotal as number | undefined,
            lineTotalMinor as bigint | undefined,
          ),
          unitPrice: moneyFromMinorOrFloat(
            unitPrice as number | undefined,
            unitPriceMinor as bigint | undefined,
          ),
          vatAmount: moneyFromMinorOrFloat(
            vatAmount as number | undefined,
            vatAmountMinor as bigint | undefined,
          ),
        };
      })
    : [];

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

let ingestionTableReadyPromise: Promise<void> | null = null;
let snapshotTableReadyPromise: Promise<void> | null = null;

async function ensureIngestionTableReady(): Promise<void> {
  if (ingestionTableReadyPromise) {
    return ingestionTableReadyPromise;
  }

  const query = isSqlite
    ? `
      CREATE TABLE IF NOT EXISTS sync_ingestion_operations (
        register_id TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_hash TEXT,
        error_code TEXT,
        error_message TEXT,
        processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (register_id, operation_key)
      )
    `
    : `
      CREATE TABLE IF NOT EXISTS sync_ingestion_operations (
        register_id TEXT NOT NULL,
        operation_key TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_hash TEXT,
        error_code TEXT,
        error_message TEXT,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (register_id, operation_key)
      )
    `;

  ingestionTableReadyPromise = prisma
    .$executeRawUnsafe(query)
    .then(async () => {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_sync_ingestion_register_status
        ON sync_ingestion_operations (register_id, status, updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_sync_ingestion_register_entity
        ON sync_ingestion_operations (register_id, entity_type, updated_at DESC)
      `);
    });

  return ingestionTableReadyPromise;
}

async function ensureSnapshotTableReady(): Promise<void> {
  if (snapshotTableReadyPromise) {
    return snapshotTableReadyPromise;
  }

  const query = isSqlite
    ? `
      CREATE TABLE IF NOT EXISTS register_sync_snapshots (
        register_id TEXT PRIMARY KEY,
        pending_count INTEGER NOT NULL DEFAULT 0,
        sales INTEGER NOT NULL DEFAULT 0,
        refunds INTEGER NOT NULL DEFAULT 0,
        product_ops INTEGER NOT NULL DEFAULT 0,
        stock_ops INTEGER NOT NULL DEFAULT 0,
        queue_peak INTEGER NOT NULL DEFAULT 0,
        oldest_pending_age_sec INTEGER,
        last_sync_error_code TEXT,
        last_sync_status TEXT NOT NULL DEFAULT 'IDLE',
        last_synced_at DATETIME,
        client_observed_at DATETIME NOT NULL,
        server_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    : `
      CREATE TABLE IF NOT EXISTS register_sync_snapshots (
        register_id TEXT PRIMARY KEY,
        pending_count INTEGER NOT NULL DEFAULT 0,
        sales INTEGER NOT NULL DEFAULT 0,
        refunds INTEGER NOT NULL DEFAULT 0,
        product_ops INTEGER NOT NULL DEFAULT 0,
        stock_ops INTEGER NOT NULL DEFAULT 0,
        queue_peak INTEGER NOT NULL DEFAULT 0,
        oldest_pending_age_sec INTEGER,
        last_sync_error_code TEXT,
        last_sync_status TEXT NOT NULL DEFAULT 'IDLE',
        last_synced_at TIMESTAMPTZ,
        client_observed_at TIMESTAMPTZ NOT NULL,
        server_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

  snapshotTableReadyPromise = prisma
    .$executeRawUnsafe(query)
    .then(async () => {
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_sync_snapshots_updated
        ON register_sync_snapshots (updated_at DESC)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_sync_snapshots_status
        ON register_sync_snapshots (last_sync_status, updated_at DESC)
      `);
    });

  return snapshotTableReadyPromise;
}

function normalizePart(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.replace(/\s+/g, '_');
}

function normalizeClientRequestId(payload: Record<string, unknown>): string | null {
  const raw = payload.clientRequestId;
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function extractEntityIdFromPath(path: string | undefined, prefix: string): string | null {
  if (!path || !path.startsWith(prefix)) {
    return null;
  }
  const rest = path.slice(prefix.length);
  const [entityId] = rest.split('/');
  if (!entityId || entityId.trim().length === 0) {
    return null;
  }
  return entityId;
}

function toOperationKey(entity: SyncEntity, task: {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path?: string;
  payload: Record<string, unknown>;
}): string {
  if (entity === 'sales') {
    const clientRequestId = normalizeClientRequestId(task.payload) ?? task.localId;
    return `SALE:${normalizePart(clientRequestId, task.localId)}:POST`;
  }

  if (entity === 'refunds') {
    const clientRequestId = normalizeClientRequestId(task.payload) ?? task.localId;
    return `REFUND:${normalizePart(clientRequestId, task.localId)}:POST`;
  }

  if (entity === 'productOps' || entity === 'supplierOps' || entity === 'purchaseOps' || entity === 'customerOps') {
    const payloadId =
      typeof task.payload.id === 'string' && task.payload.id.trim().length > 0
        ? task.payload.id
        : null;
    const pathId =
      entity === 'supplierOps'
        ? extractEntityIdFromPath(task.path, '/api/suppliers/')
        : entity === 'purchaseOps'
          ? extractEntityIdFromPath(task.path, '/api/purchase-invoices/')
          : entity === 'customerOps'
            ? extractEntityIdFromPath(task.path, '/api/customers/')
            : extractEntityIdFromPath(task.path, '/api/products/');
    const entityId = payloadId ?? pathId ?? task.localId;
    const prefix =
      entity === 'supplierOps'
        ? 'SUPPLIER_OP'
        : entity === 'purchaseOps'
          ? 'PURCHASE_OP'
          : entity === 'customerOps'
            ? 'CUSTOMER_OP'
            : 'PRODUCT_OP';
    return `${prefix}:${normalizePart(entityId, task.localId)}:${task.method}`;
  }

  const movementId =
    normalizeClientRequestId(task.payload) ??
    (typeof task.payload.productId === 'string' && task.payload.productId.trim().length > 0
      ? `${task.payload.productId}:${task.localId}`
      : task.localId);
  return `STOCK_OP:${normalizePart(movementId, task.localId)}:${task.method}`;
}

function isAllowedProductPath(path: string): boolean {
  if (path === '/api/products') {
    return true;
  }
  return /^\/api\/products\/[a-zA-Z0-9-_.~%]+$/u.test(path);
}

function isAllowedSupplierPath(path: string): boolean {
  if (path === '/api/suppliers') {
    return true;
  }
  if (/^\/api\/suppliers\/[a-zA-Z0-9-_.~%]+$/u.test(path)) {
    return true;
  }
  return /^\/api\/suppliers\/[a-zA-Z0-9-_.~%]+\/transactions$/u.test(path);
}

function isAllowedPurchasePath(path: string): boolean {
  if (path === '/api/purchase-invoices') {
    return true;
  }
  if (/^\/api\/purchase-invoices\/[a-zA-Z0-9-_.~%]+$/u.test(path)) {
    return true;
  }
  return /^\/api\/purchase-invoices\/[a-zA-Z0-9-_.~%]+\/convert-to-invoice$/u.test(path);
}

function isAllowedCustomerPath(path: string): boolean {
  if (path === '/api/customers') {
    return true;
  }
  return /^\/api\/customers\/[a-zA-Z0-9-_.~%]+$/u.test(path);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

function toDateOrEpoch(value: string | undefined): Date {
  if (!value) {
    return new Date(0);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date(0);
  }
  return parsed;
}

function toOptionalDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function encodeCursor(lastSyncAt: string): string {
  return Buffer.from(JSON.stringify({ lastSyncAt }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): Date {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { lastSyncAt?: unknown };
    if (typeof parsed.lastSyncAt !== 'string') {
      throw new Error('cursor payload gecersiz');
    }
    const date = new Date(parsed.lastSyncAt);
    if (!Number.isFinite(date.getTime())) {
      throw new Error('cursor zaman bilgisi gecersiz');
    }
    return date;
  } catch (error: unknown) {
    throw new Error(`Gecersiz cursor: ${readErrorMessage(error)}`);
  }
}

async function loadIngestionRow(registerId: string, operationKey: string): Promise<IngestionRow | null> {
  const query = isSqlite
    ? `
      SELECT entity_type, error_code, error_message, local_id, operation_key, payload_hash, status
      FROM sync_ingestion_operations
      WHERE register_id = ? AND operation_key = ?
      LIMIT 1
    `
    : `
      SELECT entity_type, error_code, error_message, local_id, operation_key, payload_hash, status
      FROM sync_ingestion_operations
      WHERE register_id = $1 AND operation_key = $2
      LIMIT 1
    `;
  const rows = await prisma.$queryRawUnsafe<IngestionRow[]>(
    query,
    registerId,
    operationKey,
  );
  return rows[0] ?? null;
}

async function upsertIngestionRow(params: {
  entityType: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  localId: string;
  operationKey: string;
  payloadHash: string;
  registerId: string;
  status: SyncPushResultStatus;
}): Promise<void> {
  const query = isSqlite
    ? `
      INSERT INTO sync_ingestion_operations (
        register_id,
        operation_key,
        entity_type,
        local_id,
        status,
        payload_hash,
        error_code,
        error_message,
        processed_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (register_id, operation_key)
      DO UPDATE SET
        entity_type = excluded.entity_type,
        local_id = excluded.local_id,
        status = excluded.status,
        payload_hash = excluded.payload_hash,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        processed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `
    : `
      INSERT INTO sync_ingestion_operations (
        register_id,
        operation_key,
        entity_type,
        local_id,
        status,
        payload_hash,
        error_code,
        error_message,
        processed_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (register_id, operation_key)
      DO UPDATE SET
        entity_type = EXCLUDED.entity_type,
        local_id = EXCLUDED.local_id,
        status = EXCLUDED.status,
        payload_hash = EXCLUDED.payload_hash,
        error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message,
        processed_at = NOW(),
        updated_at = NOW()
    `;

  await prisma.$executeRawUnsafe(
    query,
    params.registerId,
    params.operationKey,
    params.entityType,
    params.localId,
    params.status,
    params.payloadHash,
    params.errorCode ?? null,
    params.errorMessage ?? null,
  );
}

async function processPushTask(params: {
  authHeader: string | undefined;
  registerId: string;
  server: FastifyInstance;
  task: PushEntryTask;
}): Promise<SyncPushEntityResult> {
  const existing = await loadIngestionRow(params.registerId, params.task.operationKey);
  if (existing && (existing.status === 'ACCEPTED' || existing.status === 'REPLAYED')) {
    await upsertIngestionRow({
      entityType: params.task.entity,
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      payloadHash: params.task.payloadHash,
      registerId: params.registerId,
      status: 'REPLAYED',
    });

    return {
      entity: params.task.entity,
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      status: 'REPLAYED',
    };
  }

  try {
    const response = await params.server.inject({
      headers: params.authHeader ? { authorization: params.authHeader } : undefined,
      method: params.task.method,
      payload: params.task.payload,
      url: params.task.path,
    });

    const body = response.body.length > 0 ? (JSON.parse(response.body) as Record<string, unknown>) : null;
    const success =
      response.statusCode >= 200 &&
      response.statusCode < 300 &&
      body &&
      body.success === true;

    if (success) {
      await upsertIngestionRow({
        entityType: params.task.entity,
        localId: params.task.localId,
        operationKey: params.task.operationKey,
        payloadHash: params.task.payloadHash,
        registerId: params.registerId,
        status: 'ACCEPTED',
      });

      return {
        entity: params.task.entity,
        localId: params.task.localId,
        operationKey: params.task.operationKey,
        status: 'ACCEPTED',
      };
    }

    const errorCode = typeof body?.errorCode === 'string' ? body.errorCode : null;
    const error = typeof body?.error === 'string' ? body.error : `HTTP_${response.statusCode}`;

    await upsertIngestionRow({
      entityType: params.task.entity,
      errorCode,
      errorMessage: error,
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      payloadHash: params.task.payloadHash,
      registerId: params.registerId,
      status: 'FAILED',
    });

    return {
      entity: params.task.entity,
      error,
      ...(errorCode ? { errorCode } : {}),
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      status: 'FAILED',
    };
  } catch (error: unknown) {
    const message = readErrorMessage(error);
    await upsertIngestionRow({
      entityType: params.task.entity,
      errorMessage: message,
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      payloadHash: params.task.payloadHash,
      registerId: params.registerId,
      status: 'FAILED',
    });
    return {
      entity: params.task.entity,
      error: message,
      localId: params.task.localId,
      operationKey: params.task.operationKey,
      status: 'FAILED',
    };
  }
}

function buildPushTasks(payload: z.infer<typeof syncPushSchema>): PushEntryTask[] {
  const salesTasks: PushEntryTask[] = payload.sales.map((entry) => {
    const task: PushEntryTask = {
      entity: 'sales',
      localId: entry.localId,
      method: 'POST',
      operationKey: '',
      path: '/api/sales',
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('sales', task);
    return task;
  });

  const refundTasks: PushEntryTask[] = payload.refunds.map((entry) => {
    const task: PushEntryTask = {
      entity: 'refunds',
      localId: entry.localId,
      method: 'POST',
      operationKey: '',
      path: '/api/refunds',
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('refunds', task);
    return task;
  });

  const productTasks: PushEntryTask[] = payload.productOps.map((entry) => {
    const normalizedPath = entry.path.startsWith('/') ? entry.path : `/${entry.path}`;
    const task: PushEntryTask = {
      entity: 'productOps',
      localId: entry.localId,
      method: entry.method,
      operationKey: '',
      path: normalizedPath,
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('productOps', task);
    return task;
  });

  const customerTasks: PushEntryTask[] = payload.customerOps.map((entry) => {
    const normalizedPath = entry.path.startsWith('/') ? entry.path : `/${entry.path}`;
    const task: PushEntryTask = {
      entity: 'customerOps',
      localId: entry.localId,
      method: entry.method,
      operationKey: '',
      path: normalizedPath,
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('customerOps', task);
    return task;
  });

  const supplierTasks: PushEntryTask[] = payload.supplierOps.map((entry) => {
    const normalizedPath = entry.path.startsWith('/') ? entry.path : `/${entry.path}`;
    const task: PushEntryTask = {
      entity: 'supplierOps',
      localId: entry.localId,
      method: entry.method,
      operationKey: '',
      path: normalizedPath,
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('supplierOps', task);
    return task;
  });

  const purchaseTasks: PushEntryTask[] = payload.purchaseOps.map((entry) => {
    const normalizedPath = entry.path.startsWith('/') ? entry.path : `/${entry.path}`;
    const task: PushEntryTask = {
      entity: 'purchaseOps',
      localId: entry.localId,
      method: entry.method,
      operationKey: '',
      path: normalizedPath,
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('purchaseOps', task);
    return task;
  });

  const stockTasks: PushEntryTask[] = payload.stockOps.map((entry) => {
    const task: PushEntryTask = {
      entity: 'stockOps',
      localId: entry.localId,
      method: 'POST',
      operationKey: '',
      path: '/api/stock/movement',
      payload: entry.payload,
      payloadHash: hashPayload(entry.payload),
    };
    task.operationKey = toOperationKey('stockOps', task);
    return task;
  });

  return [
    ...salesTasks,
    ...refundTasks,
    ...customerTasks,
    ...productTasks,
    ...supplierTasks,
    ...purchaseTasks,
    ...stockTasks,
  ];
}

function initialResultsMap(): SyncPushResponsePayload['resultsByEntity'] {
  return {
    customerOps: [],
    productOps: [],
    purchaseOps: [],
    refunds: [],
    sales: [],
    stockOps: [],
    supplierOps: [],
  };
}

export async function syncRoutes(server: FastifyInstance): Promise<void> {
  server.addHook('onRequest', server.authenticate);
  server.addHook('onRequest', server.ensureCompanyAccess);

  server.post('/heartbeat', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = syncHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz heartbeat verisi',
        success: false,
      });
    }

    const payload = parsed.data;
    const register = await prisma.register.findFirst({
      include: {
        branch: {
          select: {
            companyId: true,
          },
        },
      },
      where: {
        deletedAt: null,
        id: payload.registerId,
      },
    });
    if (!register) {
      return reply.status(404).send({
        error: 'Kasa bulunamadi',
        success: false,
      });
    }
    if (
      request.user.role !== 'SUPER_ADMIN' &&
      register.branch.companyId !== request.user.companyId
    ) {
      return reply.status(403).send({
        error: 'Sadece kendi firma kasalarina heartbeat gonderebilirsiniz',
        success: false,
      });
    }

    await ensureSnapshotTableReady();

    const clientObservedAt = new Date(payload.clientObservedAt);
    const serverObservedAt = new Date();

    const query = isSqlite
      ? `
        INSERT INTO register_sync_snapshots (
          register_id,
          pending_count,
          sales,
          refunds,
          product_ops,
          stock_ops,
          queue_peak,
          oldest_pending_age_sec,
          last_sync_error_code,
          last_sync_status,
          last_synced_at,
          client_observed_at,
          server_observed_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (register_id)
        DO UPDATE SET
          pending_count = excluded.pending_count,
          sales = excluded.sales,
          refunds = excluded.refunds,
          product_ops = excluded.product_ops,
          stock_ops = excluded.stock_ops,
          queue_peak = excluded.queue_peak,
          oldest_pending_age_sec = excluded.oldest_pending_age_sec,
          last_sync_error_code = excluded.last_sync_error_code,
          last_sync_status = excluded.last_sync_status,
          last_synced_at = excluded.last_synced_at,
          client_observed_at = excluded.client_observed_at,
          server_observed_at = excluded.server_observed_at,
          updated_at = CURRENT_TIMESTAMP
      `
      : `
        INSERT INTO register_sync_snapshots (
          register_id,
          pending_count,
          sales,
          refunds,
          product_ops,
          stock_ops,
          queue_peak,
          oldest_pending_age_sec,
          last_sync_error_code,
          last_sync_status,
          last_synced_at,
          client_observed_at,
          server_observed_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        ON CONFLICT (register_id)
        DO UPDATE SET
          pending_count = EXCLUDED.pending_count,
          sales = EXCLUDED.sales,
          refunds = EXCLUDED.refunds,
          product_ops = EXCLUDED.product_ops,
          stock_ops = EXCLUDED.stock_ops,
          queue_peak = EXCLUDED.queue_peak,
          oldest_pending_age_sec = EXCLUDED.oldest_pending_age_sec,
          last_sync_error_code = EXCLUDED.last_sync_error_code,
          last_sync_status = EXCLUDED.last_sync_status,
          last_synced_at = EXCLUDED.last_synced_at,
          client_observed_at = EXCLUDED.client_observed_at,
          server_observed_at = EXCLUDED.server_observed_at,
          updated_at = NOW()
      `;

    await prisma.$executeRawUnsafe(
      query,
      payload.registerId,
      payload.pendingCount,
      payload.sales,
      payload.refunds,
      payload.productOps,
      payload.stockOps,
      payload.queuePeak,
      payload.oldestPendingAgeSec ?? null,
      payload.lastSyncErrorCode ?? null,
      payload.lastSyncStatus,
      toOptionalDate(payload.lastSyncedAt),
      clientObservedAt,
      serverObservedAt,
    );

    const responseData: SyncHeartbeatResponsePayload = {
      serverObservedAt: serverObservedAt.toISOString(),
    };

    return {
      data: responseData,
      success: true,
    };
  });

  server.post('/push', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!SYNC_V2_ENABLED) {
      return reply.status(409).send({
        error: 'SYNC_V2_DISABLED',
        errorCode: 'SYNC_V2_DISABLED',
        success: false,
      });
    }

    const parsed = syncPushSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.errors[0]?.message ?? 'Gecersiz senkronizasyon verisi',
        success: false,
      });
    }

    const { registerId } = parsed.data;
    const register = await prisma.register.findFirst({
      include: {
        branch: {
          select: {
            companyId: true,
          },
        },
      },
      where: {
        deletedAt: null,
        id: registerId,
      },
    });

    if (!register) {
      return reply.status(404).send({
        error: 'Kasa bulunamadi',
        success: false,
      });
    }

    if (
      request.user.role !== 'SUPER_ADMIN' &&
      register.branch.companyId !== request.user.companyId
    ) {
      return reply.status(403).send({
        error: 'Sadece kendi firma kasalarina senkronizasyon yapabilirsiniz',
        success: false,
      });
    }

    await ensureIngestionTableReady();

    const resultsByEntity = initialResultsMap();
    const tasks = buildPushTasks(parsed.data);

    for (const task of tasks) {
      const isPathAllowed =
        task.entity === 'productOps'
          ? isAllowedProductPath(task.path)
          : task.entity === 'supplierOps'
            ? isAllowedSupplierPath(task.path)
            : task.entity === 'purchaseOps'
              ? isAllowedPurchasePath(task.path)
              : task.entity === 'customerOps'
                ? isAllowedCustomerPath(task.path)
                : true;
      if (!isPathAllowed) {
        resultsByEntity[task.entity].push({
          entity: task.entity,
          error: `Gecersiz ${task.entity} path`,
          errorCode: 'INVALID_PATH',
          localId: task.localId,
          operationKey: task.operationKey,
          status: 'FAILED',
        });
        continue;
      }

      const result = await processPushTask({
        authHeader: request.headers.authorization,
        registerId,
        server,
        task,
      });
      resultsByEntity[result.entity].push(result);
    }

    const allResults = [
      ...resultsByEntity.customerOps,
      ...resultsByEntity.sales,
      ...resultsByEntity.refunds,
      ...resultsByEntity.productOps,
      ...resultsByEntity.supplierOps,
      ...resultsByEntity.purchaseOps,
      ...resultsByEntity.stockOps,
    ];

    const acceptedCount = allResults.filter((row) => row.status === 'ACCEPTED').length;
    const replayedCount = allResults.filter((row) => row.status === 'REPLAYED').length;
    const failedRows = allResults.filter((row) => row.status === 'FAILED');
    const failedCount = failedRows.length;
    const errors = failedRows.map((row) => `${row.entity}:${row.localId}:${row.error ?? 'unknown'}`);
    const serverSyncAt = new Date().toISOString();

    await prisma.syncLog.create({
      data: {
        data: JSON.stringify({
          acceptedCount,
          failedCount,
          replayedCount,
          resultsByEntity,
          serverSyncAt,
        }),
        operation: 'INSERT',
        recordId: 'batch',
        registerId,
        status: failedCount > 0 ? 'FAILED' : 'SYNCED',
        tableName: 'push',
      },
    });

    return {
      data: {
        acceptedCount,
        errors,
        failedCount,
        replayedCount,
        resultsByEntity,
        serverSyncAt,
      },
      success: true,
    };
  });

  server.get(
    '/pull',
    async (
      request: FastifyRequest<{ Querystring: SyncPullQuery }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = syncPullQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          error: parsedQuery.error.errors[0]?.message ?? 'Gecersiz sync pull sorgusu',
          success: false,
        });
      }

      const query = parsedQuery.data;
      const register = await prisma.register.findUnique({
        include: { branch: true },
        where: { id: query.registerId },
      });
      if (!register) {
        return reply.status(404).send({
          error: 'Kasa bulunamadi',
          success: false,
        });
      }
      if (
        request.user.role !== 'SUPER_ADMIN' &&
        register.branch.companyId !== request.user.companyId
      ) {
        return reply.status(403).send({
          error: 'Sadece kendi firma kasalarina erisebilirsiniz',
          success: false,
        });
      }

      let since = toDateOrEpoch(query.lastSyncAt);
      if (typeof query.cursor === 'string' && query.cursor.trim().length > 0) {
        try {
          since = decodeCursor(query.cursor.trim());
        } catch (error: unknown) {
          return reply.status(400).send({
            error: readErrorMessage(error),
            success: false,
          });
        }
      }

      const includePurchaseInvoices = query.includePurchaseInvoices === 'true';

      const scopedCompanyId = register.branch.companyId;
      const purchaseInvoicesPromise = includePurchaseInvoices
        ? prisma.purchaseInvoice.findMany({
            include: {
              items: true,
            },
            where: {
              branchId: register.branchId,
              updatedAt: { gt: since },
            },
          })
        : Promise.resolve([]);
      const [products, productsTotalActive, categories, users, stockLevels, suppliers, purchaseInvoices, customers] = await Promise.all([
        prisma.product.findMany({
          where: {
            companyId: scopedCompanyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.product.count({
          where: {
            companyId: scopedCompanyId,
            isActive: true,
          },
        }),
        prisma.category.findMany({
          where: {
            companyId: scopedCompanyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.user.findMany({
          select: {
            branchId: true,
            companyId: true,
            fullName: true,
            id: true,
            isActive: true,
            role: true,
            username: true,
          },
          where: {
            companyId: scopedCompanyId,
            updatedAt: { gt: since },
          },
        }),
        prisma.stockLevel.findMany({
          where: {
            branchId: register.branchId,
            updatedAt: { gt: since },
          },
        }),
        prisma.supplier.findMany({
          where: {
            companyId: scopedCompanyId,
            updatedAt: { gt: since },
          },
        }),
        purchaseInvoicesPromise,
        prisma.customer.findMany({
          where: {
            companyId: scopedCompanyId,
            updatedAt: { gt: since },
          },
        }),
      ]);

      const serverSyncAt = new Date().toISOString();
      const nextCursor = encodeCursor(serverSyncAt);
      const serializedProducts = products.map((product) =>
        serializeSyncProduct(product as unknown as Record<string, unknown>),
      );
      const serializedSuppliers = suppliers.map((supplier) =>
        serializeSyncSupplier(supplier as unknown as Record<string, unknown>),
      );
      const serializedPurchaseInvoices = purchaseInvoices.map((invoice) =>
        serializeSyncPurchaseInvoice(invoice as unknown as Record<string, unknown>),
      );

      return {
        data: {
          branches: [register.branch],
          bundles: [],
          categories,
          cursor: query.cursor ?? null,
          customers,
          lastSyncAt: serverSyncAt,
          nextCursor,
          products: serializedProducts,
          productsTotalActive,
          purchaseInvoices: serializedPurchaseInvoices,
          registers: [register],
          stockLevels,
          suppliers: serializedSuppliers,
          users,
        },
        success: true,
      };
    },
  );
}
