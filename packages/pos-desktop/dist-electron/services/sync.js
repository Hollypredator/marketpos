"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
function readErrorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    return 'Bilinmeyen hata';
}
class SyncService {
    apiBaseUrl;
    requestTimeoutMs;
    accessToken;
    constructor(config) {
        this.apiBaseUrl = config.apiBaseUrl;
        this.requestTimeoutMs = config.requestTimeoutMs ?? 15_000;
        this.accessToken = config.accessToken;
    }
    setAccessToken(token) {
        this.accessToken = token;
    }
    async runFullSync(input) {
        const errors = [];
        const salesOutcome = await this.pushQueueItems('/api/sales', input.pendingSales, 'sale');
        errors.push(...salesOutcome.errors);
        const refundsOutcome = await this.pushQueueItems('/api/refunds', input.pendingRefunds, 'refund');
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
    async pullMasterData(registerId, lastSyncAt) {
        try {
            const endpoint = new URL('/api/sync/pull', this.apiBaseUrl);
            endpoint.searchParams.set('registerId', registerId);
            if (lastSyncAt) {
                endpoint.searchParams.set('lastSyncAt', lastSyncAt);
            }
            const envelope = await this.requestJson(endpoint.toString(), { method: 'GET' });
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
        }
        catch (error) {
            return {
                categories: [],
                errors: [readErrorMessage(error)],
                products: [],
                users: [],
            };
        }
    }
    async pushQueueItems(endpointPath, queue, entity) {
        const pushedIds = [];
        const errors = [];
        for (const item of queue) {
            let payload;
            try {
                payload = JSON.parse(item.payloadData);
            }
            catch (error) {
                errors.push(`${entity}:${item.id} parse error: ${readErrorMessage(error)}`);
                continue;
            }
            try {
                const envelope = await this.requestJson(new URL(endpointPath, this.apiBaseUrl).toString(), {
                    body: JSON.stringify(payload),
                    method: 'POST',
                });
                if (!envelope.success) {
                    errors.push(`${entity}:${item.id} ${envelope.error ?? 'request failed'}`);
                    continue;
                }
                pushedIds.push(item.id);
            }
            catch (error) {
                errors.push(`${entity}:${item.id} ${readErrorMessage(error)}`);
            }
        }
        return {
            errors,
            pushedIds,
        };
    }
    async requestJson(endpoint, init) {
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
            return JSON.parse(raw);
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.SyncService = SyncService;
//# sourceMappingURL=sync.js.map