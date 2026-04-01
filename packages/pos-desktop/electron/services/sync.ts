import type {
  CachedCategoryRecord,
  CachedProductRecord,
  CachedUserRecord,
  PendingRefundRecord,
  PendingSaleRecord,
} from './database';

interface ApiEnvelope<TData> {
  data?: TData;
  error?: string;
  success: boolean;
}

interface SyncPullData {
  categories: CachedCategoryRecord[];
  products: CachedProductRecord[];
  users: CachedUserRecord[];
}

export interface SyncRunOptions {
  accessToken?: string;
  maxPushItems?: number;
  registerId: string;
}

export interface SyncRunInput {
  lastSyncAt?: string | null;
  pendingRefunds: PendingRefundRecord[];
  pendingSales: PendingSaleRecord[];
  registerId: string;
}

export interface SyncRunResult {
  errors: string[];
  pulledCategories: CachedCategoryRecord[];
  pulledProducts: CachedProductRecord[];
  pulledUsers: CachedUserRecord[];
  pushedRefundIds: string[];
  pushedRefunds: number;
  pushedSaleIds: string[];
  pushedSales: number;
  success: boolean;
  syncedAt: string;
}

export interface SyncServiceConfig {
  accessToken?: string;
  apiBaseUrl: string;
  requestTimeoutMs?: number;
}

interface PushOutcome {
  errors: string[];
  pushedIds: string[];
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

export class SyncService {
  private readonly apiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private accessToken?: string;

  public constructor(config: SyncServiceConfig) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
    this.accessToken = config.accessToken;
  }

  public setAccessToken(token?: string): void {
    this.accessToken = token;
  }

  public async runFullSync(input: SyncRunInput): Promise<SyncRunResult> {
    const errors: string[] = [];

    const salesOutcome = await this.pushQueueItems(
      '/api/sales',
      input.pendingSales,
      'sale',
    );
    errors.push(...salesOutcome.errors);

    const refundsOutcome = await this.pushQueueItems(
      '/api/refunds',
      input.pendingRefunds,
      'refund',
    );
    errors.push(...refundsOutcome.errors);

    const pullOutcome = await this.pullMasterData(input.registerId, input.lastSyncAt ?? null);
    errors.push(...pullOutcome.errors);

    return {
      errors,
      pulledCategories: pullOutcome.categories,
      pulledProducts: pullOutcome.products,
      pulledUsers: pullOutcome.users,
      pushedRefundIds: refundsOutcome.pushedIds,
      pushedRefunds: refundsOutcome.pushedIds.length,
      pushedSaleIds: salesOutcome.pushedIds,
      pushedSales: salesOutcome.pushedIds.length,
      success: errors.length === 0,
      syncedAt: new Date().toISOString(),
    };
  }

  private async pullMasterData(
    registerId: string,
    lastSyncAt: string | null,
  ): Promise<{
    categories: CachedCategoryRecord[];
    errors: string[];
    products: CachedProductRecord[];
    users: CachedUserRecord[];
  }> {
    try {
      const endpoint = new URL('/api/sync/pull', this.apiBaseUrl);
      endpoint.searchParams.set('registerId', registerId);
      if (lastSyncAt) {
        endpoint.searchParams.set('lastSyncAt', lastSyncAt);
      }

      const envelope = await this.requestJson<ApiEnvelope<SyncPullData>>(
        endpoint.toString(),
        { method: 'GET' },
      );

      if (!envelope.success) {
        return {
          categories: [],
          errors: [envelope.error ?? 'Cloud pull basarisiz oldu.'],
          products: [],
          users: [],
        };
      }

      return {
        categories: envelope.data?.categories ?? [],
        errors: [],
        products: envelope.data?.products ?? [],
        users: envelope.data?.users ?? [],
      };
    } catch (error: unknown) {
      return {
        categories: [],
        errors: [readErrorMessage(error)],
        products: [],
        users: [],
      };
    }
  }

  private async pushQueueItems(
    endpointPath: '/api/refunds' | '/api/sales',
    queue: PendingRefundRecord[] | PendingSaleRecord[],
    entity: 'refund' | 'sale',
  ): Promise<PushOutcome> {
    const pushedIds: string[] = [];
    const errors: string[] = [];

    for (const item of queue) {
      let payload: unknown;
      try {
        payload = JSON.parse(item.payloadData);
      } catch (error: unknown) {
        errors.push(`${entity}:${item.id} parse error: ${readErrorMessage(error)}`);
        continue;
      }

      try {
        const envelope = await this.requestJson<ApiEnvelope<unknown>>(
          new URL(endpointPath, this.apiBaseUrl).toString(),
          {
            body: JSON.stringify(payload),
            method: 'POST',
          },
        );
        if (!envelope.success) {
          errors.push(`${entity}:${item.id} ${envelope.error ?? 'request failed'}`);
          continue;
        }
        pushedIds.push(item.id);
      } catch (error: unknown) {
        errors.push(`${entity}:${item.id} ${readErrorMessage(error)}`);
      }
    }

    return {
      errors,
      pushedIds,
    };
  }

  private async requestJson<TResponse>(
    endpoint: string,
    init: RequestInit,
  ): Promise<TResponse> {
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
