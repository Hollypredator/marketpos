import type {
  SyncHeartbeatPayload,
  SyncHeartbeatResponsePayload,
  SyncPushResponsePayload,
} from '@marketpos/shared';

import {
  type CachedBundleRecord,
  type CachedCategoryRecord,
  type CustomerOpQueueRecord,
  type CachedProductRecord,
  type CachedPurchaseInvoiceItemRecord,
  type CachedPurchaseInvoiceRecord,
  type CachedSupplierRecord,
  type CachedUserRecord,
  type PendingRefundRecord,
  type PendingSaleRecord,
  type ProductOpQueueRecord,
  type PurchaseOpQueueRecord,
  type StockOpQueueRecord,
  type SupplierOpQueueRecord,
  type SyncPushResultsByEntity,
  type SyncPushSummary,
  type SyncRunResult,
} from './types';

export type { SyncRunResult };

interface ApiEnvelope<TData> {
  data?: TData;
  error?: string;
  success: boolean;
}

interface SyncPullData {
  bundles?: CachedBundleRecord[];
  categories: CachedCategoryRecord[];
  customers?: Array<Record<string, unknown>>;
  lastSyncAt?: string;
  nextCursor?: string | null;
  products: CachedProductRecord[];
  productsTotalActive?: number;
  purchaseInvoices?: (CachedPurchaseInvoiceRecord & {
    items: CachedPurchaseInvoiceItemRecord[];
  })[];
  suppliers?: CachedSupplierRecord[];
  users: CachedUserRecord[];
}

interface PullOutcome {
  bundles: CachedBundleRecord[];
  categories: CachedCategoryRecord[];
  customers: Array<Record<string, unknown>>;
  errors: string[];
  nextCursor: string | null;
  products: CachedProductRecord[];
  productsTotalActive: number | null;
  purchaseInvoiceItemsCount: number;
  purchaseInvoices: (CachedPurchaseInvoiceRecord & { items: CachedPurchaseInvoiceItemRecord[] })[];
  serverSyncAt: string | null;
  suppliers: CachedSupplierRecord[];
  users: CachedUserRecord[];
}

interface SyncPushEntityInput<TPayload> {
  localId: string;
  payload: TPayload;
}

interface SyncPushProductOpInput {
  localId: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
  payload: Record<string, unknown>;
}

interface SyncPushV2Request {
  clientSyncAt?: string | null;
  customerOps: SyncPushProductOpInput[];
  cursor?: string | null;
  registerId: string;
  productOps: SyncPushProductOpInput[];
  purchaseOps: SyncPushProductOpInput[];
  refunds: SyncPushEntityInput<Record<string, unknown>>[];
  sales: SyncPushEntityInput<Record<string, unknown>>[];
  stockOps: SyncPushEntityInput<Record<string, unknown>>[];
  supplierOps: SyncPushProductOpInput[];
}

export interface SyncRunOptions {
  accessToken?: string;
  maxPushItems?: number;
  registerId: string;
  sessionId?: string;
}

export interface SyncRunInput {
  lastSyncAt?: string | null;
  lastSyncCursor?: string | null;
  pendingCustomerOps: CustomerOpQueueRecord[];
  pendingProductOps: ProductOpQueueRecord[];
  pendingPurchaseOps: PurchaseOpQueueRecord[];
  pendingRefunds: PendingRefundRecord[];
  pendingSales: PendingSaleRecord[];
  pendingStockOps: StockOpQueueRecord[];
  pendingSupplierOps: SupplierOpQueueRecord[];
  registerId: string;
  sessionId?: string | null;
}

export interface SyncServiceConfig {
  accessToken?: string;
  apiBaseUrl: string;
  requestTimeoutMs?: number;
  syncV2Enabled?: boolean;
}

interface PushOutcome {
  errors: string[];
  failedByEntity: SyncPushResultsByEntity;
  pushedIds: string[];
  resultsByEntity: SyncPushResultsByEntity;
  summary: SyncPushSummary;
}

interface ProductOperationPayload {
  body: Record<string, unknown>;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
}

interface StockOperationPayload {
  body: Record<string, unknown>;
}

interface CustomerQueuePayload {
  id?: unknown;
  [key: string]: unknown;
}

function classifyProductOpEntity(path: string): 'productOps' | 'purchaseOps' | 'supplierOps' {
  if (path === '/api/suppliers' || path.startsWith('/api/suppliers/')) {
    return 'supplierOps';
  }
  if (path === '/api/purchase-invoices' || path.startsWith('/api/purchase-invoices/')) {
    return 'purchaseOps';
  }
  return 'productOps';
}

const MAX_RETRIES = 5;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLegacyPaymentMethod(value: unknown): 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'ON_ACCOUNT' | null {
  if (
    value === 'CASH' ||
    value === 'CREDIT_CARD' ||
    value === 'DEBIT_CARD' ||
    value === 'ON_ACCOUNT'
  ) {
    return value;
  }
  if (value === 'CARD') {
    return 'CREDIT_CARD';
  }
  if (value === 'OTHER') {
    return 'DEBIT_CARD';
  }
  return null;
}

function normalizeSalePayloadForPush(payload: Record<string, unknown>): Record<string, unknown> {
  const rawPayments = payload.payments;
  if (!Array.isArray(rawPayments)) {
    return payload;
  }

  let changed = false;
  const normalizedPayments = rawPayments.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const normalizedMethod = normalizeLegacyPaymentMethod(entry.method);
    if (!normalizedMethod || normalizedMethod === entry.method) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      method: normalizedMethod,
    };
  });

  if (!changed) {
    return payload;
  }
  return {
    ...payload,
    payments: normalizedPayments,
  };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.trim(),
    )
  );
}

function normalizeQueuePayloadForPush(params: {
  localId: string;
  payload: Record<string, unknown>;
  registerId: string;
  sessionId?: string | null;
}): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    ...params.payload,
  };

  const rawClientRequestId =
    typeof params.payload.clientRequestId === 'string'
      ? params.payload.clientRequestId.trim()
      : '';
  normalized.clientRequestId =
    rawClientRequestId.length >= 8 ? rawClientRequestId : params.localId;

  if (isUuid(params.registerId)) {
    normalized.registerId = params.registerId;
  }

  if (params.sessionId && isUuid(params.sessionId)) {
    normalized.sessionId = params.sessionId;
  }

  return normalized;
}

function shouldSkipItem(failureCount: number): boolean {
  return failureCount >= MAX_RETRIES;
}

function emptyResultsByEntity(): SyncPushResultsByEntity {
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

function emptyPushSummary(): SyncPushSummary {
  return {
    acceptedCount: 0,
    errors: [],
    failedCount: 0,
    replayedCount: 0,
    serverSyncAt: new Date().toISOString(),
  };
}

function normalizeV2PushResponse(data: SyncPushResponsePayload | undefined): {
  byEntity: SyncPushResultsByEntity;
  summary: SyncPushSummary;
} {
  if (!data) {
    return {
      byEntity: emptyResultsByEntity(),
      summary: emptyPushSummary(),
    };
  }

  return {
    byEntity: {
      customerOps: data.resultsByEntity?.customerOps ?? [],
      productOps: data.resultsByEntity?.productOps ?? [],
      purchaseOps: data.resultsByEntity?.purchaseOps ?? [],
      refunds: data.resultsByEntity?.refunds ?? [],
      sales: data.resultsByEntity?.sales ?? [],
      stockOps: data.resultsByEntity?.stockOps ?? [],
      supplierOps: data.resultsByEntity?.supplierOps ?? [],
    },
    summary: {
      acceptedCount: data.acceptedCount ?? 0,
      errors: data.errors ?? [],
      failedCount: data.failedCount ?? 0,
      replayedCount: data.replayedCount ?? 0,
      serverSyncAt: data.serverSyncAt ?? new Date().toISOString(),
    },
  };
}

export class SyncService {
  private readonly apiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly syncV2Enabled: boolean;
  private accessToken?: string;

  public constructor(config: SyncServiceConfig) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 60_000;
    this.accessToken = config.accessToken;
    this.syncV2Enabled = config.syncV2Enabled ?? false;
  }

  public setAccessToken(token?: string): void {
    this.accessToken = token;
  }

  public async sendHeartbeat(
    payload: SyncHeartbeatPayload,
  ): Promise<SyncHeartbeatResponsePayload> {
    const envelope = await this.requestJson<ApiEnvelope<SyncHeartbeatResponsePayload>>(
      new URL('/api/sync/heartbeat', this.apiBaseUrl).toString(),
      {
        body: JSON.stringify(payload),
        method: 'POST',
      },
    );
    if (!envelope.success || !envelope.data) {
      throw new Error(envelope.error ?? 'sync heartbeat basarisiz');
    }
    return envelope.data;
  }

  public async runFullSync(input: SyncRunInput): Promise<SyncRunResult> {
    if (this.syncV2Enabled) {
      return this.runV2Sync(input);
    }
    return this.runLegacySync(input);
  }

  public async pullFullSnapshot(registerId: string): Promise<PullOutcome> {
    return this.pullMasterData(registerId, null, null);
  }

  private async runLegacySync(input: SyncRunInput): Promise<SyncRunResult> {
    const errors: string[] = [];

    const salesOutcome = await this.pushQueueItems('/api/sales', input.pendingSales, 'sale', {
      registerId: input.registerId,
      sessionId: input.sessionId,
    });
    errors.push(...salesOutcome.errors);

    const refundsOutcome = await this.pushQueueItems('/api/refunds', input.pendingRefunds, 'refund', {
      registerId: input.registerId,
      sessionId: input.sessionId,
    });
    errors.push(...refundsOutcome.errors);

    const customerOpsOutcome = await this.pushCustomerOpsLegacy(input.pendingCustomerOps);
    errors.push(...customerOpsOutcome.errors);

    const productOpsOutcome = await this.pushProductOpsLegacy(input.pendingProductOps);
    errors.push(...productOpsOutcome.errors);

    const supplierOpsOutcome = await this.pushProductOpsLegacy(input.pendingSupplierOps);
    errors.push(...supplierOpsOutcome.errors);

    const purchaseOpsOutcome = await this.pushProductOpsLegacy(input.pendingPurchaseOps);
    errors.push(...purchaseOpsOutcome.errors);

    const stockOpsOutcome = await this.pushStockOpsLegacy(input.pendingStockOps);
    errors.push(...stockOpsOutcome.errors);

    const pullOutcome = await this.pullMasterData(
      input.registerId,
      input.lastSyncAt ?? null,
      input.lastSyncCursor ?? null,
    );
    errors.push(...pullOutcome.errors);

    const failedCustomerOpIds = customerOpsOutcome.failedIds;
    const failedSaleIds = salesOutcome.failedIds;
    const failedRefundIds = refundsOutcome.failedIds;
    const failedProductOpIds = productOpsOutcome.failedIds;
    const failedSupplierOpIds = supplierOpsOutcome.failedIds;
    const failedPurchaseOpIds = purchaseOpsOutcome.failedIds;
    const failedStockOpIds = stockOpsOutcome.failedIds;

    return {
      errors,
      failedCustomerOpIds,
      failedPurchaseOpIds,
      failedProductOpIds,
      failedRefundIds,
      failedSaleIds,
      failedSupplierOpIds,
      failedStockOpIds,
      nextCursor: pullOutcome.nextCursor,
      pulledBundles: pullOutcome.bundles.length,
      pulledCategories: pullOutcome.categories,
      pulledCustomers: pullOutcome.customers.length,
      pulledProducts: pullOutcome.products,
      remoteProductsTotalActive: pullOutcome.productsTotalActive,
      pulledPurchaseInvoiceItems: pullOutcome.purchaseInvoiceItemsCount,
      pulledPurchaseInvoices: pullOutcome.purchaseInvoices.length,
      pulledSuppliers: pullOutcome.suppliers,
      pulledUsers: pullOutcome.users,
      pushSummary: {
        acceptedCount:
          salesOutcome.pushedIds.length +
          refundsOutcome.pushedIds.length +
          customerOpsOutcome.pushedIds.length +
          productOpsOutcome.pushedIds.length +
          supplierOpsOutcome.pushedIds.length +
          purchaseOpsOutcome.pushedIds.length +
          stockOpsOutcome.pushedIds.length,
        errors,
        failedCount: errors.length,
        replayedCount: 0,
        serverSyncAt: new Date().toISOString(),
      },
      pushedAccepted:
        salesOutcome.pushedIds.length +
        refundsOutcome.pushedIds.length +
        customerOpsOutcome.pushedIds.length +
        productOpsOutcome.pushedIds.length +
        supplierOpsOutcome.pushedIds.length +
        purchaseOpsOutcome.pushedIds.length +
        stockOpsOutcome.pushedIds.length,
      pushedCustomerOpIds: customerOpsOutcome.pushedIds,
      pushedCustomerOps: customerOpsOutcome.pushedIds.length,
      pushedFailed: errors.length,
      pushedPurchaseOpIds: purchaseOpsOutcome.pushedIds,
      pushedPurchaseOps: purchaseOpsOutcome.pushedIds.length,
      pushedProductOpIds: productOpsOutcome.pushedIds,
      pushedProductOps: productOpsOutcome.pushedIds.length,
      pushedRefundIds: refundsOutcome.pushedIds,
      pushedRefunds: refundsOutcome.pushedIds.length,
      pushedReplayed: 0,
      pushedSaleIds: salesOutcome.pushedIds,
      pushedSales: salesOutcome.pushedIds.length,
      pushedStockOpIds: stockOpsOutcome.pushedIds,
      pushedStockOps: stockOpsOutcome.pushedIds.length,
      pushedSupplierOpIds: supplierOpsOutcome.pushedIds,
      pushedSupplierOps: supplierOpsOutcome.pushedIds.length,
      resultsByEntity: {
        customerOps: [
          ...customerOpsOutcome.pushedIds.map((id) => ({
            entity: 'customerOps' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedCustomerOpIds.map((id) => ({
            entity: 'customerOps' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        productOps: [
          ...productOpsOutcome.pushedIds.map((id) => ({
            entity: 'productOps' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedProductOpIds.map((id) => ({
            entity: 'productOps' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        purchaseOps: [
          ...purchaseOpsOutcome.pushedIds.map((id) => ({
            entity: 'purchaseOps' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedPurchaseOpIds.map((id) => ({
            entity: 'purchaseOps' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        refunds: [
          ...refundsOutcome.pushedIds.map((id) => ({
            entity: 'refunds' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedRefundIds.map((id) => ({
            entity: 'refunds' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        sales: [
          ...salesOutcome.pushedIds.map((id) => ({
            entity: 'sales' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedSaleIds.map((id) => ({
            entity: 'sales' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        stockOps: [
          ...stockOpsOutcome.pushedIds.map((id) => ({
            entity: 'stockOps' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedStockOpIds.map((id) => ({
            entity: 'stockOps' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
        supplierOps: [
          ...supplierOpsOutcome.pushedIds.map((id) => ({
            entity: 'supplierOps' as const,
            localId: id,
            operationKey: id,
            status: 'ACCEPTED' as const,
          })),
          ...failedSupplierOpIds.map((id) => ({
            entity: 'supplierOps' as const,
            error: 'legacy push failed',
            localId: id,
            operationKey: id,
            status: 'FAILED' as const,
          })),
        ],
      },
      success: errors.length === 0,
      syncedAt: pullOutcome.serverSyncAt ?? new Date().toISOString(),
      usedCursor: input.lastSyncCursor ?? null,
    };
  }

  private async runV2Sync(input: SyncRunInput): Promise<SyncRunResult> {
    const pushOutcome = await this.pushQueueItemsV2(input);

    const pullOutcome = await this.pullMasterData(
      input.registerId,
      input.lastSyncAt ?? null,
      input.lastSyncCursor ?? null,
    );

    const errors = [...pushOutcome.errors, ...pullOutcome.errors];

    return {
      errors,
      failedCustomerOpIds: pushOutcome.failedByEntity.customerOps.map((row) => row.localId),
      failedPurchaseOpIds: pushOutcome.failedByEntity.purchaseOps.map((row) => row.localId),
      failedProductOpIds: pushOutcome.failedByEntity.productOps.map((row) => row.localId),
      failedRefundIds: pushOutcome.failedByEntity.refunds.map((row) => row.localId),
      failedSaleIds: pushOutcome.failedByEntity.sales.map((row) => row.localId),
      failedSupplierOpIds: pushOutcome.failedByEntity.supplierOps.map((row) => row.localId),
      failedStockOpIds: pushOutcome.failedByEntity.stockOps.map((row) => row.localId),
      nextCursor: pullOutcome.nextCursor,
      pulledBundles: pullOutcome.bundles.length,
      pulledCategories: pullOutcome.categories,
      pulledCustomers: pullOutcome.customers.length,
      pulledProducts: pullOutcome.products,
      remoteProductsTotalActive: pullOutcome.productsTotalActive,
      pulledPurchaseInvoiceItems: pullOutcome.purchaseInvoiceItemsCount,
      pulledPurchaseInvoices: pullOutcome.purchaseInvoices.length,
      pulledSuppliers: pullOutcome.suppliers,
      pulledUsers: pullOutcome.users,
      pushedAccepted: pushOutcome.summary.acceptedCount,
      pushedCustomerOpIds: pushOutcome.resultsByEntity.customerOps
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedCustomerOps: pushOutcome.resultsByEntity.customerOps.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedFailed: pushOutcome.summary.failedCount,
      pushedPurchaseOpIds: pushOutcome.resultsByEntity.purchaseOps
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedPurchaseOps: pushOutcome.resultsByEntity.purchaseOps.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedProductOpIds: pushOutcome.resultsByEntity.productOps
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedProductOps: pushOutcome.resultsByEntity.productOps.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedRefundIds: pushOutcome.resultsByEntity.refunds
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedRefunds: pushOutcome.resultsByEntity.refunds.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedReplayed: pushOutcome.summary.replayedCount,
      pushedSaleIds: pushOutcome.resultsByEntity.sales
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedSales: pushOutcome.resultsByEntity.sales.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedStockOpIds: pushOutcome.resultsByEntity.stockOps
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedStockOps: pushOutcome.resultsByEntity.stockOps.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushedSupplierOpIds: pushOutcome.resultsByEntity.supplierOps
        .filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED')
        .map((row) => row.localId),
      pushedSupplierOps: pushOutcome.resultsByEntity.supplierOps.filter(
        (row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED',
      ).length,
      pushSummary: pushOutcome.summary,
      resultsByEntity: pushOutcome.resultsByEntity,
      success: errors.length === 0,
      syncedAt: pullOutcome.serverSyncAt ?? pushOutcome.summary.serverSyncAt,
      usedCursor: input.lastSyncCursor ?? null,
    };
  }

  private async pushQueueItemsV2(input: SyncRunInput): Promise<PushOutcome> {
    const errors: string[] = [];
    const failedByEntity = emptyResultsByEntity();

    const sales: SyncPushEntityInput<Record<string, unknown>>[] = [];
    for (const item of input.pendingSales) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = normalizeSalePayloadForPush(normalizeQueuePayloadForPush({
          localId: item.id,
          payload: JSON.parse(item.payloadData) as Record<string, unknown>,
          registerId: input.registerId,
          sessionId: input.sessionId,
        }));
        sales.push({ localId: item.id, payload });
      } catch (error: unknown) {
        const message = `sale:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.sales.push({
          entity: 'sales',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    const refunds: SyncPushEntityInput<Record<string, unknown>>[] = [];
    for (const item of input.pendingRefunds) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = normalizeQueuePayloadForPush({
          localId: item.id,
          payload: JSON.parse(item.payloadData) as Record<string, unknown>,
          registerId: input.registerId,
          sessionId: input.sessionId,
        });
        refunds.push({ localId: item.id, payload });
      } catch (error: unknown) {
        const message = `refund:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.refunds.push({
          entity: 'refunds',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    const customerOps: SyncPushProductOpInput[] = [];
    for (const item of input.pendingCustomerOps) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = JSON.parse(item.payloadData) as CustomerQueuePayload;
        const method =
          item.opType === 'UPDATE'
            ? 'PUT'
            : item.opType === 'DELETE'
              ? 'DELETE'
              : 'POST';
        if (method === 'POST') {
          customerOps.push({
            localId: item.id,
            method,
            path: '/api/customers',
            payload: payload as Record<string, unknown>,
          });
          continue;
        }

        const rawId =
          typeof payload?.id === 'string' && payload.id.trim().length > 0
            ? payload.id.trim()
            : null;
        if (!rawId) {
          throw new Error('customer id required for update/delete');
        }

        customerOps.push({
          localId: item.id,
          method,
          path: `/api/customers/${encodeURIComponent(rawId)}`,
          payload: payload as Record<string, unknown>,
        });
      } catch (error: unknown) {
        const message = `customer-op:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.customerOps.push({
          entity: 'customerOps',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    const productOps: SyncPushProductOpInput[] = [];
    const supplierOps: SyncPushProductOpInput[] = [];
    const purchaseOps: SyncPushProductOpInput[] = [];

    for (const item of input.pendingSupplierOps) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = JSON.parse(item.payloadData) as ProductOperationPayload;
        if (!payload || typeof payload.path !== 'string' || typeof payload.method !== 'string') {
          throw new Error('invalid supplier op payload');
        }
        const normalizedPath = payload.path.startsWith('/') ? payload.path : `/${payload.path}`;
        supplierOps.push({
          localId: item.id,
          method:
            payload.method === 'PUT'
              ? 'PUT'
              : payload.method === 'DELETE'
                ? 'DELETE'
                : 'POST',
          path: normalizedPath,
          payload: payload.body ?? {},
        });
      } catch (error: unknown) {
        const message = `supplier-op:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.supplierOps.push({
          entity: 'supplierOps',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    for (const item of input.pendingPurchaseOps) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = JSON.parse(item.payloadData) as ProductOperationPayload;
        if (!payload || typeof payload.path !== 'string' || typeof payload.method !== 'string') {
          throw new Error('invalid purchase op payload');
        }
        const normalizedPath = payload.path.startsWith('/') ? payload.path : `/${payload.path}`;
        purchaseOps.push({
          localId: item.id,
          method:
            payload.method === 'PUT'
              ? 'PUT'
              : payload.method === 'DELETE'
                ? 'DELETE'
                : 'POST',
          path: normalizedPath,
          payload: payload.body ?? {},
        });
      } catch (error: unknown) {
        const message = `purchase-op:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.purchaseOps.push({
          entity: 'purchaseOps',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    for (const item of input.pendingProductOps) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = JSON.parse(item.payloadData) as ProductOperationPayload;
        if (!payload || typeof payload.path !== 'string' || typeof payload.method !== 'string') {
          throw new Error('invalid product op payload');
        }
        const normalizedPath = payload.path.startsWith('/') ? payload.path : `/${payload.path}`;
        const normalizedMethod =
          payload.method === 'PUT'
            ? 'PUT'
            : payload.method === 'DELETE'
              ? 'DELETE'
              : 'POST';
        const row: SyncPushProductOpInput = {
          localId: item.id,
          method: normalizedMethod,
          path: normalizedPath,
          payload: payload.body ?? {},
        };

        const targetEntity = classifyProductOpEntity(normalizedPath);
        if (targetEntity === 'supplierOps') {
          supplierOps.push(row);
        } else if (targetEntity === 'purchaseOps') {
          purchaseOps.push(row);
        } else {
          productOps.push(row);
        }
      } catch (error: unknown) {
        const message = `product-op:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.productOps.push({
          entity: 'productOps',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    const stockOps: SyncPushEntityInput<Record<string, unknown>>[] = [];
    for (const item of input.pendingStockOps) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      try {
        const payload = JSON.parse(item.payloadData) as StockOperationPayload;
        stockOps.push({ localId: item.id, payload: payload.body ?? {} });
      } catch (error: unknown) {
        const message = `stock-op:${item.id} parse error: ${readErrorMessage(error)}`;
        errors.push(message);
        failedByEntity.stockOps.push({
          entity: 'stockOps',
          error: message,
          localId: item.id,
          operationKey: item.id,
          status: 'FAILED',
        });
      }
    }

    const payload: SyncPushV2Request = {
      clientSyncAt: new Date().toISOString(),
      customerOps,
      cursor: input.lastSyncCursor ?? undefined,
      productOps,
      purchaseOps,
      refunds,
      registerId: input.registerId,
      sales,
      stockOps,
      supplierOps,
    };

    if (
      sales.length +
        refunds.length +
        customerOps.length +
        productOps.length +
        supplierOps.length +
        purchaseOps.length +
        stockOps.length ===
      0
    ) {
      const summary = emptyPushSummary();
      summary.errors = [...errors];
      summary.failedCount =
        failedByEntity.sales.length +
        failedByEntity.refunds.length +
        failedByEntity.customerOps.length +
        failedByEntity.productOps.length +
        failedByEntity.supplierOps.length +
        failedByEntity.purchaseOps.length +
        failedByEntity.stockOps.length;
      return {
        errors,
        failedByEntity,
        pushedIds: [],
        resultsByEntity: emptyResultsByEntity(),
        summary,
      };
    }

    try {
      const envelope = await this.requestJson<ApiEnvelope<SyncPushResponsePayload>>(
        new URL('/api/sync/push', this.apiBaseUrl).toString(),
        {
          body: JSON.stringify(payload),
          method: 'POST',
        },
      );

      if (!envelope.success || !envelope.data) {
        const message = envelope.error ?? 'V2 sync push basarisiz';
        const failedAll = this.convertAllToFailed(payload, message);
        return {
          errors: [...errors, message],
          failedByEntity: failedAll,
          pushedIds: [],
          resultsByEntity: failedAll,
          summary: {
            acceptedCount: 0,
            errors: [...errors, message],
            failedCount:
              failedAll.sales.length +
              failedAll.refunds.length +
              failedAll.customerOps.length +
              failedAll.productOps.length +
              failedAll.supplierOps.length +
              failedAll.purchaseOps.length +
              failedAll.stockOps.length,
            replayedCount: 0,
            serverSyncAt: new Date().toISOString(),
          },
        };
      }

      const normalized = normalizeV2PushResponse(envelope.data);
      const mergedByEntity: SyncPushResultsByEntity = {
        customerOps: [...normalized.byEntity.customerOps, ...failedByEntity.customerOps],
        productOps: [...normalized.byEntity.productOps, ...failedByEntity.productOps],
        purchaseOps: [...normalized.byEntity.purchaseOps, ...failedByEntity.purchaseOps],
        refunds: [...normalized.byEntity.refunds, ...failedByEntity.refunds],
        sales: [...normalized.byEntity.sales, ...failedByEntity.sales],
        stockOps: [...normalized.byEntity.stockOps, ...failedByEntity.stockOps],
        supplierOps: [...normalized.byEntity.supplierOps, ...failedByEntity.supplierOps],
      };

      const mergedErrors = [
        ...errors,
        ...normalized.summary.errors,
        ...mergedByEntity.customerOps.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'customer op failed'),
        ...mergedByEntity.sales.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'sale failed'),
        ...mergedByEntity.refunds.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'refund failed'),
        ...mergedByEntity.productOps.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'product op failed'),
        ...mergedByEntity.supplierOps.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'supplier op failed'),
        ...mergedByEntity.purchaseOps.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'purchase op failed'),
        ...mergedByEntity.stockOps.filter((row) => row.status === 'FAILED').map((row) => row.error ?? 'stock op failed'),
      ];

      const pushedIds = [
        ...mergedByEntity.customerOps.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.sales.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.refunds.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.productOps.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.supplierOps.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.purchaseOps.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
        ...mergedByEntity.stockOps.filter((row) => row.status === 'ACCEPTED' || row.status === 'REPLAYED').map((row) => row.localId),
      ];

      return {
        errors: mergedErrors,
        failedByEntity: {
          customerOps: mergedByEntity.customerOps.filter((row) => row.status === 'FAILED'),
          productOps: mergedByEntity.productOps.filter((row) => row.status === 'FAILED'),
          purchaseOps: mergedByEntity.purchaseOps.filter((row) => row.status === 'FAILED'),
          refunds: mergedByEntity.refunds.filter((row) => row.status === 'FAILED'),
          sales: mergedByEntity.sales.filter((row) => row.status === 'FAILED'),
          stockOps: mergedByEntity.stockOps.filter((row) => row.status === 'FAILED'),
          supplierOps: mergedByEntity.supplierOps.filter((row) => row.status === 'FAILED'),
        },
        pushedIds,
        resultsByEntity: mergedByEntity,
        summary: {
          acceptedCount: normalized.summary.acceptedCount,
          errors: mergedErrors,
          failedCount:
            mergedByEntity.customerOps.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.sales.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.refunds.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.productOps.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.supplierOps.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.purchaseOps.filter((row) => row.status === 'FAILED').length +
            mergedByEntity.stockOps.filter((row) => row.status === 'FAILED').length,
          replayedCount: normalized.summary.replayedCount,
          serverSyncAt: normalized.summary.serverSyncAt,
        },
      };
    } catch (error: unknown) {
      const message = `sync-v2 push error: ${readErrorMessage(error)}`;
      const failedAll = this.convertAllToFailed(payload, message);
      return {
        errors: [...errors, message],
        failedByEntity: failedAll,
        pushedIds: [],
        resultsByEntity: failedAll,
        summary: {
          acceptedCount: 0,
          errors: [...errors, message],
          failedCount:
            failedAll.sales.length +
            failedAll.refunds.length +
            failedAll.customerOps.length +
            failedAll.productOps.length +
            failedAll.supplierOps.length +
            failedAll.purchaseOps.length +
            failedAll.stockOps.length,
          replayedCount: 0,
          serverSyncAt: new Date().toISOString(),
        },
      };
    }
  }

  private convertAllToFailed(payload: SyncPushV2Request, errorMessage: string): SyncPushResultsByEntity {
    return {
      customerOps: payload.customerOps.map((row) => ({
        entity: 'customerOps',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      productOps: payload.productOps.map((row) => ({
        entity: 'productOps',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      purchaseOps: payload.purchaseOps.map((row) => ({
        entity: 'purchaseOps',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      refunds: payload.refunds.map((row) => ({
        entity: 'refunds',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      sales: payload.sales.map((row) => ({
        entity: 'sales',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      stockOps: payload.stockOps.map((row) => ({
        entity: 'stockOps',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
      supplierOps: payload.supplierOps.map((row) => ({
        entity: 'supplierOps',
        error: errorMessage,
        localId: row.localId,
        operationKey: row.localId,
        status: 'FAILED',
      })),
    };
  }

  private async pushCustomerOpsLegacy(
    queue: CustomerOpQueueRecord[],
  ): Promise<{ errors: string[]; failedIds: string[]; pushedIds: string[] }> {
    const pushedIds: string[] = [];
    const errors: string[] = [];
    const failedIds: string[] = [];

    for (const item of queue) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(item.payloadData) as Record<string, unknown>;
      } catch (error: unknown) {
        errors.push(`customer-op:${item.id} parse error: ${readErrorMessage(error)}`);
        failedIds.push(item.id);
        continue;
      }

      const method =
        item.opType === 'UPDATE'
          ? 'PUT'
          : item.opType === 'DELETE'
            ? 'DELETE'
            : 'POST';
      const customerId =
        typeof payload.id === 'string' && payload.id.trim().length > 0
          ? payload.id.trim()
          : null;
      if ((method === 'PUT' || method === 'DELETE') && !customerId) {
        errors.push(`customer-op:${item.id} invalid customer id`);
        failedIds.push(item.id);
        continue;
      }

      const path =
        method === 'POST'
          ? '/api/customers'
          : `/api/customers/${encodeURIComponent(customerId as string)}`;

      try {
        const envelope = await this.requestJson<ApiEnvelope<unknown>>(
          new URL(path, this.apiBaseUrl).toString(),
          {
            body: JSON.stringify(payload),
            method,
          },
        );
        if (!envelope.success) {
          errors.push(`customer-op:${item.id} ${envelope.error ?? 'request failed'}`);
          failedIds.push(item.id);
          continue;
        }
        pushedIds.push(item.id);
      } catch (error: unknown) {
        errors.push(`customer-op:${item.id} ${readErrorMessage(error)}`);
        failedIds.push(item.id);
      }
    }

    return { errors, failedIds, pushedIds };
  }

  private async pushProductOpsLegacy(queue: ProductOpQueueRecord[]): Promise<{ errors: string[]; failedIds: string[]; pushedIds: string[] }> {
    const pushedIds: string[] = [];
    const errors: string[] = [];
    const failedIds: string[] = [];

    for (const item of queue) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      let payload: ProductOperationPayload;
      try {
        payload = JSON.parse(item.payloadData) as ProductOperationPayload;
      } catch (error: unknown) {
        errors.push(`product-op:${item.id} parse error: ${readErrorMessage(error)}`);
        failedIds.push(item.id);
        continue;
      }
      if (!payload || typeof payload !== 'object') {
        errors.push(`product-op:${item.id} invalid payload`);
        failedIds.push(item.id);
        continue;
      }
      const method =
        payload.method === 'PUT'
          ? 'PUT'
          : payload.method === 'DELETE'
            ? 'DELETE'
            : 'POST';
      if (typeof payload.path !== 'string' || payload.path.length === 0) {
        errors.push(`product-op:${item.id} invalid path`);
        failedIds.push(item.id);
        continue;
      }
      const body = payload.body && typeof payload.body === 'object' ? payload.body : {};

      try {
        const envelope = await this.requestJson<ApiEnvelope<unknown>>(
          new URL(payload.path, this.apiBaseUrl).toString(),
          {
            body: JSON.stringify(body),
            method,
          },
        );
        if (!envelope.success) {
          errors.push(`product-op:${item.id} ${envelope.error ?? 'request failed'}`);
          failedIds.push(item.id);
          continue;
        }
        pushedIds.push(item.id);
      } catch (error: unknown) {
        errors.push(`product-op:${item.id} ${readErrorMessage(error)}`);
        failedIds.push(item.id);
      }
    }
    return { errors, failedIds, pushedIds };
  }

  private async pushStockOpsLegacy(queue: StockOpQueueRecord[]): Promise<{ errors: string[]; failedIds: string[]; pushedIds: string[] }> {
    const pushedIds: string[] = [];
    const errors: string[] = [];
    const failedIds: string[] = [];

    for (const item of queue) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      let payload: StockOperationPayload;
      try {
        payload = JSON.parse(item.payloadData) as StockOperationPayload;
      } catch (error: unknown) {
        errors.push(`stock-op:${item.id} parse error: ${readErrorMessage(error)}`);
        failedIds.push(item.id);
        continue;
      }
      const body = payload?.body && typeof payload.body === 'object' ? payload.body : {};
      try {
        const envelope = await this.requestJson<ApiEnvelope<unknown>>(
          new URL('/api/stock/movement', this.apiBaseUrl).toString(),
          {
            body: JSON.stringify(body),
            method: 'POST',
          },
        );
        if (!envelope.success) {
          errors.push(`stock-op:${item.id} ${envelope.error ?? 'request failed'}`);
          failedIds.push(item.id);
          continue;
        }
        pushedIds.push(item.id);
      } catch (error: unknown) {
        errors.push(`stock-op:${item.id} ${readErrorMessage(error)}`);
        failedIds.push(item.id);
      }
    }
    return { errors, failedIds, pushedIds };
  }

  private async pullMasterData(
    registerId: string,
    lastSyncAt: string | null,
    lastSyncCursor: string | null,
  ): Promise<PullOutcome> {
    try {
      const endpoint = new URL('/api/sync/pull', this.apiBaseUrl);
      endpoint.searchParams.set('registerId', registerId);
      endpoint.searchParams.set('includePurchaseInvoices', 'false');
      if (this.syncV2Enabled && lastSyncCursor) {
        endpoint.searchParams.set('cursor', lastSyncCursor);
      } else if (lastSyncAt) {
        endpoint.searchParams.set('lastSyncAt', lastSyncAt);
      }

      const envelope = await this.requestJson<ApiEnvelope<SyncPullData>>(endpoint.toString(), {
        method: 'GET',
      });

      if (!envelope.success || !envelope.data) {
        return {
          bundles: [],
          categories: [],
          customers: [],
          errors: [envelope.error || 'Veri cekme hatasi'],
          nextCursor: null,
          products: [],
          productsTotalActive: null,
          purchaseInvoiceItemsCount: 0,
          purchaseInvoices: [],
          serverSyncAt: null,
          suppliers: [],
          users: [],
        };
      }

      const purchaseInvoices = envelope.data.purchaseInvoices || [];
      const purchaseInvoiceItemsCount = purchaseInvoices.reduce(
        (sum, invoice) => sum + (Array.isArray(invoice.items) ? invoice.items.length : 0),
        0,
      );

      return {
        bundles: envelope.data.bundles || [],
        categories: envelope.data.categories || [],
        customers: envelope.data.customers || [],
        errors: [],
        nextCursor: envelope.data.nextCursor ?? null,
        products: envelope.data.products || [],
        productsTotalActive:
          typeof envelope.data.productsTotalActive === 'number'
            ? envelope.data.productsTotalActive
            : null,
        purchaseInvoiceItemsCount,
        purchaseInvoices,
        serverSyncAt: envelope.data.lastSyncAt ?? new Date().toISOString(),
        suppliers: envelope.data.suppliers || [],
        users: envelope.data.users || [],
      };
    } catch (error: unknown) {
      return {
        bundles: [],
        categories: [],
        customers: [],
        errors: [readErrorMessage(error)],
        nextCursor: null,
        products: [],
        productsTotalActive: null,
        purchaseInvoiceItemsCount: 0,
        purchaseInvoices: [],
        serverSyncAt: null,
        suppliers: [],
        users: [],
      };
    }
  }

  private async pushQueueItems(
    endpointPath: '/api/refunds' | '/api/sales',
    queue: PendingRefundRecord[] | PendingSaleRecord[],
    entity: 'refund' | 'sale',
    context: { registerId: string; sessionId?: string | null },
  ): Promise<{ errors: string[]; failedIds: string[]; pushedIds: string[] }> {
    const pushedIds: string[] = [];
    const errors: string[] = [];
    const failedIds: string[] = [];

    for (const item of queue) {
      if (shouldSkipItem(item.failureCount)) {
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(item.payloadData);
      } catch (error: unknown) {
        errors.push(`${entity}:${item.id} parse error: ${readErrorMessage(error)}`);
        failedIds.push(item.id);
        continue;
      }

      try {
        const normalizedPayload =
          isRecord(payload)
            ? normalizeQueuePayloadForPush({
                localId: item.id,
                payload,
                registerId: context.registerId,
                sessionId: context.sessionId,
              })
            : payload;
        const envelope = await this.requestJson<ApiEnvelope<unknown>>(
          new URL(endpointPath, this.apiBaseUrl).toString(),
          {
            body: JSON.stringify(
              entity === 'sale' && isRecord(normalizedPayload)
                ? normalizeSalePayloadForPush(normalizedPayload)
                : normalizedPayload,
            ),
            method: 'POST',
          },
        );
        if (!envelope.success) {
          errors.push(`${entity}:${item.id} ${envelope.error ?? 'request failed'}`);
          failedIds.push(item.id);
          continue;
        }
        pushedIds.push(item.id);
      } catch (error: unknown) {
        errors.push(`${entity}:${item.id} ${readErrorMessage(error)}`);
        failedIds.push(item.id);
      }
    }

    return {
      errors,
      failedIds,
      pushedIds,
    };
  }

  private async requestJson<TResponse>(endpoint: string, init: RequestInit): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('Content-Type', 'application/json');
      if (this.accessToken) {
        headers.set('Authorization', `Bearer ${this.accessToken}`);
      }

      const response = await fetch(endpoint, {
        ...init,
        headers,
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (raw.length === 0) {
        throw new Error('Bos yanit alindi');
      }
      return JSON.parse(raw) as TResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}
