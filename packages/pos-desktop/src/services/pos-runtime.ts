import type {
  BackofficeSettings,
  CachedBundleRecord,
  CachedCategoryRecord,
  CachedPurchaseInvoiceItemRecord,
  CachedPurchaseInvoiceRecord,
  CompanyAccessSnapshot,
  CachedProductRecord,
  CachedSupplierRecord,
  LocalDailyReportSnapshot,
  OfflineAuthResult,
  CustomerOpQueueRecord,
  ProductOpQueueRecord,
  PurchaseOpQueueRecord,
  StockOpQueueRecord,
  SupplierOpQueueRecord,
  SyncRunResult,
  PendingSaleRecord,
} from '../electron-api';
import type {
  AuthSession,
  BackupFileRecord,
  BackupPolicy,
  BackupPolicyState,
  CashMovementRecord,
  CreatePurchaseInvoiceInput,
  CreateSupplierTransactionInput,
  CreateCustomerInput,
  CreateProductInput,
  CustomerRecord,
  DailyReport,
  HardwareStepResult,
  LogSecurityEventPayload,
  OfflineCredential,
  OfflineQueuedProductOperation,
  OfflineQueuedStockOperation,
  PendingRefund,
  PendingSale,
  PaginatedResult,
  PurchaseInvoiceRecord,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SaleReceipt,
  SaleReceiptItem,
  SecurityEventRecord,
  ShiftHandoverRecord,
  StockLevelRow,
  SupplierFormInput,
  SupplierRecord,
  SupplierTransactionRecord,
  TopProductReportRow,
  UpdateProductInput,
} from './types';

interface ApiEnvelope<TData> {
  data?: TData;
  error?: string;
  errorCode?: string;
  success: boolean;
}

interface LoginResponseData {
  accessToken: string;
  branch?: { id: string } | null;
  companyAccess: CompanyAccessSnapshot;
  refreshToken: string;
  user: {
    branchId: string | null;
    companyId: string;
    fullName: string;
    id: string;
    role: string;
    username: string;
  };
}

interface RefreshResponseData {
  accessToken: string;
  companyAccess?: CompanyAccessSnapshot;
  refreshToken: string;
}

interface RegisterSummary {
  branchId: string;
  id: string;
}

interface RegisterSessionSummary {
  id: string;
}

interface RegisterDetail {
  branchId: string;
  id: string;
  name: string;
}

interface SyncPullResponseData {
  bundles: CachedBundleRecord[];
  categories: CachedCategoryRecord[];
  customers: Array<Record<string, unknown> & { loyaltyPoints?: number }>;
  lastSyncAt?: string;
  nextCursor?: string | null;
  products: CachedProductRecord[];
  purchaseInvoices: (CachedPurchaseInvoiceRecord & {
    items: CachedPurchaseInvoiceItemRecord[];
  })[];
  suppliers: CachedSupplierRecord[];
  users: Array<{
    branchId: string | null;
    companyId: string;
    fullName: string;
    id: string;
    isActive: boolean;
    role: string;
    username: string;
  }>;
}

interface RuntimeCatalog {
  categories: CachedCategoryRecord[];
  products: CachedProductRecord[];
  bundles: CachedBundleRecord[];
}

export type CompanyAccessBlockType =
  | 'CLOCK_ROLLBACK'
  | 'OFFLINE_EXPIRED'
  | 'SUBSCRIPTION_BLOCKED';

export interface CompanyAccessBlockDetails {
  blockType: CompanyAccessBlockType;
  message: string;
  snapshot: CompanyAccessSnapshot | null;
}

class RuntimeApiError extends Error {
  public readonly data: unknown;
  public readonly errorCode?: string;
  public readonly httpStatus: number;

  public constructor(message: string, params: { data?: unknown; errorCode?: string; httpStatus: number }) {
    super(message);
    this.name = 'RuntimeApiError';
    this.data = params.data;
    this.errorCode = params.errorCode;
    this.httpStatus = params.httpStatus;
  }
}

export type ReauthReason =
  | 'CACHE_CORRUPTION'
  | 'PERMISSION_MISMATCH'
  | 'SESSION_EXPIRED'
  | 'TOKEN_EXPIRED'
  | 'UNKNOWN';

export interface ReauthRecoveryAdvice {
  action: 'AUTO_REFRESH' | 'FULL_RELOGIN' | 'MANAGER_REAUTH';
  message: string;
  reason: ReauthReason;
}

export class CompanyAccessBlockError extends Error {
  public readonly details: CompanyAccessBlockDetails;

  public constructor(details: CompanyAccessBlockDetails) {
    super(details.message);
    this.name = 'CompanyAccessBlockError';
    this.details = details;
  }
}

let runtimeApiBaseUrl: string | null = null;
const companyAccessRefreshAtByCompanyId = new Map<string, number>();
const sessionByAccessToken = new Map<string, AuthSession>();
const COMPANY_ACCESS_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 30 * 60 * 1000;
const LOCAL_SEEN_PERSIST_INTERVAL_MS = 60 * 1000;
let refreshInFlight: Promise<void> | null = null;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.trim(),
    )
  );
}

function fallbackPagination(params: {
  limit: number;
  page: number;
  total: number;
}): { limit: number; page: number; total: number; totalPages: number } {
  return {
    limit: params.limit,
    page: params.page,
    total: params.total,
    totalPages: params.total > 0 ? Math.ceil(params.total / params.limit) : 1,
  };
}

function ensureClientRequestId(value?: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length >= 8) {
    return normalized;
  }
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function createOfflineUuid(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function ensureElectronApi() {
  if (!window.electronAPI) {
    throw new Error('Electron API erisilebilir degil.');
  }
  return window.electronAPI;
}

function ensureOnlineSession(session: AuthSession): string {
  if (!session.accessToken) {
    throw new Error('Bu islem icin online oturum gereklidir.');
  }
  sessionByAccessToken.set(session.accessToken, session);
  return session.accessToken;
}

function isUnauthorizedApiError(error: unknown): error is RuntimeApiError {
  return error instanceof RuntimeApiError && error.httpStatus === 401;
}

export function classifyReauthRequirement(
  error: unknown,
  session?: AuthSession | null,
): ReauthRecoveryAdvice {
  const message = readErrorMessage(error).toLowerCase();
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return {
      action: 'FULL_RELOGIN',
      message: 'Oturum bilgisi eksik veya bozuk. Yeniden giris gerekli.',
      reason: 'CACHE_CORRUPTION',
    };
  }
  if (message.includes('forbidden') || message.includes('yetki')) {
    return {
      action: 'MANAGER_REAUTH',
      message: 'Rol/yetki uyumsuzlugu tespit edildi. Yetkili kullanici ile tekrar dogrulayin.',
      reason: 'PERMISSION_MISMATCH',
    };
  }
  if (message.includes('refresh') || message.includes('token')) {
    return {
      action: 'FULL_RELOGIN',
      message: 'Oturum suresi doldu veya yenileme basarisiz oldu. Yeniden giris yapin.',
      reason: 'TOKEN_EXPIRED',
    };
  }
  return {
    action: 'FULL_RELOGIN',
    message: 'Oturum dogrulanamadi. Yeniden giris yapin.',
    reason: 'SESSION_EXPIRED',
  };
}

async function persistRefreshedTokens(session: AuthSession): Promise<void> {
  if (!session.accessToken || !session.refreshToken) {
    return;
  }
  try {
    await ensureElectronApi().updateCachedAuthTokens({
      accessToken: session.accessToken,
      companyAccess: session.companyAccess ?? undefined,
      refreshToken: session.refreshToken,
    });
  } catch {
    // no-op: runtime should continue even if local token persistence fails.
  }
}

function shouldFallbackToOfflineReport(error: unknown): boolean {
  if (error instanceof RuntimeApiError) {
    return error.httpStatus >= 500 || error.httpStatus === 401 || error.httpStatus === 403;
  }
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('unauthorized')
  );
}

function shouldQueueOfflineWrite(error: unknown): boolean {
  if (error instanceof CompanyAccessBlockError) {
    return false;
  }
  if (error instanceof RuntimeApiError) {
    return error.httpStatus >= 500 || error.httpStatus === 401;
  }
  const message = readErrorMessage(error).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('timeout')
  );
}

async function getApiBaseUrl(): Promise<string> {
  if (runtimeApiBaseUrl) {
    return runtimeApiBaseUrl;
  }
  const runtime = await ensureElectronApi().getRuntimeInfo();
  runtimeApiBaseUrl = runtime.apiBaseUrl;
  return runtimeApiBaseUrl;
}

async function refreshAuthSession(session: AuthSession): Promise<void> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  if (!session.refreshToken || session.refreshToken.trim().length === 0) {
    throw new Error('Yenileme tokeni bulunamadi.');
  }

  refreshInFlight = (async () => {
    let payload: RefreshResponseData;
    try {
      payload = await requestApi<RefreshResponseData>('/api/auth/refresh', {
        body: { refreshToken: session.refreshToken },
        method: 'POST',
        skipAuthRefresh: true,
      });
    } catch (error: unknown) {
      const advice = classifyReauthRequirement(error, session);
      throw new RuntimeApiError(advice.message, {
        errorCode: 'AUTH_REFRESH_FAILED',
        httpStatus: 401,
      });
    }

    const previousAccessToken = session.accessToken;
    session.accessToken = payload.accessToken;
    session.refreshToken = payload.refreshToken;
    if (payload.companyAccess) {
      session.companyAccess = payload.companyAccess;
    }
    session.isOnline = true;

    if (previousAccessToken && previousAccessToken !== payload.accessToken) {
      sessionByAccessToken.delete(previousAccessToken);
    }
    sessionByAccessToken.set(payload.accessToken, session);
    await persistRefreshedTokens(session);
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function requestApi<TData>(
  path: string,
  options?: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
    session?: AuthSession;
    skipAuthRefresh?: boolean;
    token?: string | null;
  },
): Promise<TData> {
  const session =
    options?.session ??
    (options?.token ? sessionByAccessToken.get(options.token) ?? null : null);

  const baseUrl = await getApiBaseUrl();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = session?.accessToken ?? options?.token;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(new URL(path, baseUrl), {
    body: options?.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options?.method ?? 'GET',
  });

  const raw = await response.text();
  if (raw.length === 0) {
    throw new Error(`Bos yanit: ${path}`);
  }
  const envelope = JSON.parse(raw) as ApiEnvelope<TData>;
  if (!response.ok || !envelope.success || envelope.data === undefined) {
    const apiError = new RuntimeApiError(envelope.error ?? `API hatasi: ${response.status}`, {
      data: envelope.data,
      errorCode: envelope.errorCode,
      httpStatus: response.status,
    });

    if (
      !options?.skipAuthRefresh &&
      !path.includes('/api/auth/refresh') &&
      session &&
      session.isOnline &&
      isUnauthorizedApiError(apiError) &&
      session.refreshToken
    ) {
      await refreshAuthSession(session);
      return requestApi<TData>(path, {
        ...options,
        session,
        skipAuthRefresh: true,
      });
    }
    throw apiError;
  }
  return envelope.data;
}

async function requestApiEnvelope<TData>(
  path: string,
  options?: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
    session?: AuthSession;
    skipAuthRefresh?: boolean;
    token?: string | null;
  },
): Promise<ApiEnvelope<TData> & { pagination?: { limit: number; page: number; total: number; totalPages: number } }> {
  const session =
    options?.session ??
    (options?.token ? sessionByAccessToken.get(options.token) ?? null : null);

  const baseUrl = await getApiBaseUrl();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = session?.accessToken ?? options?.token;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(new URL(path, baseUrl), {
    body: options?.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options?.method ?? 'GET',
  });

  const raw = await response.text();
  if (raw.length === 0) {
    throw new Error(`Bos yanit: ${path}`);
  }
  const envelope = JSON.parse(raw) as ApiEnvelope<TData> & {
    pagination?: { limit: number; page: number; total: number; totalPages: number };
  };
  if (!response.ok || !envelope.success) {
    const apiError = new RuntimeApiError(envelope.error ?? `API hatasi: ${response.status}`, {
      data: envelope.data,
      errorCode: envelope.errorCode,
      httpStatus: response.status,
    });

    if (
      !options?.skipAuthRefresh &&
      !path.includes('/api/auth/refresh') &&
      session &&
      session.isOnline &&
      isUnauthorizedApiError(apiError) &&
      session.refreshToken
    ) {
      await refreshAuthSession(session);
      return requestApiEnvelope<TData>(path, {
        ...options,
        session,
        skipAuthRefresh: true,
      });
    }
    throw apiError;
  }
  return envelope;
}

function asCompanyAccessSnapshot(value: unknown): CompanyAccessSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<CompanyAccessSnapshot>;
  if (
    typeof record.companyId !== 'string' ||
    record.companyId.trim().length === 0 ||
    typeof record.checkedAt !== 'string' ||
    typeof record.offlineAccessValidUntil !== 'string' ||
    typeof record.summary !== 'string' ||
    typeof record.isAccessAllowed !== 'boolean'
  ) {
    return null;
  }

  const status =
    record.status === 'ACTIVE' ||
    record.status === 'EXPIRED' ||
    record.status === 'GRACE' ||
    record.status === 'SUSPENDED' ||
    record.status === 'UNCONFIGURED'
      ? record.status
      : null;
  const reasonCode =
    record.reasonCode === 'ACTIVE_SUBSCRIPTION' ||
    record.reasonCode === 'COMPANY_DISABLED' ||
    record.reasonCode === 'NO_PACKAGE_DATES' ||
    record.reasonCode === 'PACKAGE_EXPIRED' ||
    record.reasonCode === 'PACKAGE_EXPIRED_GRACE' ||
    record.reasonCode === 'PACKAGE_SUSPENDED'
      ? record.reasonCode
      : null;
  const operatorAction =
    record.operatorAction === 'CHECK_PLAN_DATES' ||
    record.operatorAction === 'CONTACT_SUPPORT' ||
    record.operatorAction === 'NONE' ||
    record.operatorAction === 'RENEW_PACKAGE'
      ? record.operatorAction
      : null;

  if (!status || !reasonCode || !operatorAction) {
    return null;
  }

  return {
    checkedAt: record.checkedAt,
    companyId: record.companyId,
    daysRemaining:
      typeof record.daysRemaining === 'number' && Number.isFinite(record.daysRemaining)
        ? record.daysRemaining
        : null,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
    graceEndsAt: typeof record.graceEndsAt === 'string' ? record.graceEndsAt : null,
    isAccessAllowed: record.isAccessAllowed,
    localLastSeenAt:
      typeof record.localLastSeenAt === 'string' ? record.localLastSeenAt : null,
    offlineAccessGraceDays:
      typeof record.offlineAccessGraceDays === 'number' &&
      Number.isFinite(record.offlineAccessGraceDays)
        ? record.offlineAccessGraceDays
        : 0,
    offlineAccessValidUntil: record.offlineAccessValidUntil,
    operatorAction,
    reasonCode,
    status,
    summary: record.summary,
  };
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCompanyAccessBlockError(
  params: {
    blockType: CompanyAccessBlockType;
    message: string;
    snapshot: CompanyAccessSnapshot | null;
  },
): CompanyAccessBlockError {
  return new CompanyAccessBlockError({
    blockType: params.blockType,
    message: params.message,
    snapshot: params.snapshot,
  });
}

function mergeLocalSnapshotState(
  incoming: CompanyAccessSnapshot,
  previous: CompanyAccessSnapshot | null | undefined,
): CompanyAccessSnapshot {
  if (!previous?.localLastSeenAt) {
    return incoming;
  }
  return {
    ...incoming,
    localLastSeenAt: previous.localLastSeenAt,
  };
}

function ensureClockIsTrusted(snapshot: CompanyAccessSnapshot, nowMs: number): void {
  const checkedAtMs = parseTimestamp(snapshot.checkedAt);
  if (
    checkedAtMs !== null &&
    nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < checkedAtMs
  ) {
    throw buildCompanyAccessBlockError({
      blockType: 'CLOCK_ROLLBACK',
      message:
        'Cihaz saati geri alindigi tespit edildi. Guvenlik nedeniyle offline erisim durduruldu. Lutfen internete baglanip tekrar giris yapin.',
      snapshot,
    });
  }

  const localLastSeenMs = parseTimestamp(snapshot.localLastSeenAt ?? null);
  if (
    localLastSeenMs !== null &&
    nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < localLastSeenMs
  ) {
    throw buildCompanyAccessBlockError({
      blockType: 'CLOCK_ROLLBACK',
      message:
        'Cihaz saati geri alindigi tespit edildi. Guvenlik nedeniyle offline erisim durduruldu. Lutfen internete baglanip tekrar giris yapin.',
      snapshot,
    });
  }
}

function touchLocalLastSeen(
  snapshot: CompanyAccessSnapshot,
  nowMs: number,
): { shouldPersist: boolean; snapshot: CompanyAccessSnapshot } {
  const currentMs = parseTimestamp(snapshot.localLastSeenAt ?? null);
  const targetMs = Math.max(currentMs ?? 0, nowMs);

  if (
    currentMs !== null &&
    targetMs - currentMs < LOCAL_SEEN_PERSIST_INTERVAL_MS
  ) {
    return { shouldPersist: false, snapshot };
  }

  return {
    shouldPersist: true,
    snapshot: {
      ...snapshot,
      localLastSeenAt: new Date(targetMs).toISOString(),
    },
  };
}

function readCompanyAccessFromApiError(error: unknown): CompanyAccessSnapshot | null {
  if (!(error instanceof RuntimeApiError) || !error.data || typeof error.data !== 'object') {
    return null;
  }

  const payload = error.data as { companyAccess?: unknown };
  return asCompanyAccessSnapshot(payload.companyAccess);
}

function ensureCompanyAccessWindow(
  companyAccess: CompanyAccessSnapshot,
  nowMs: number,
): void {
  if (
    companyAccess.status === 'EXPIRED' ||
    companyAccess.status === 'SUSPENDED' ||
    !companyAccess.isAccessAllowed
  ) {
    throw buildCompanyAccessBlockError({
      blockType: 'SUBSCRIPTION_BLOCKED',
      message: companyAccess.summary,
      snapshot: companyAccess,
    });
  }

  const offlineValidUntilMs = Date.parse(companyAccess.offlineAccessValidUntil);
  if (!Number.isFinite(offlineValidUntilMs) || nowMs > offlineValidUntilMs) {
    throw buildCompanyAccessBlockError({
      blockType: 'OFFLINE_EXPIRED',
      message:
        'Paket dogrulama suresi doldu. Lutfen internet ile tekrar online giris yapin.',
      snapshot: companyAccess,
    });
  }
}

async function ensureCompanyAccess(
  session: AuthSession,
  options?: { forceOnlineCheck?: boolean },
): Promise<CompanyAccessSnapshot> {
  const electronApi = ensureElectronApi();
  let snapshot =
    (await electronApi.getCompanyAccessSnapshot(session.user.companyId)) ?? session.companyAccess;

  const now = Date.now();
  const lastRefreshAt = companyAccessRefreshAtByCompanyId.get(session.user.companyId) ?? 0;
  const shouldTryOnlineRefresh =
    session.isOnline &&
    !!session.accessToken &&
    (options?.forceOnlineCheck ||
      !snapshot ||
      now - lastRefreshAt >= COMPANY_ACCESS_REFRESH_INTERVAL_MS);

  if (shouldTryOnlineRefresh && session.accessToken) {
    try {
      const fresh = await requestApi<CompanyAccessSnapshot>('/api/subscription/status', {
        session,
        token: session.accessToken,
      });
      snapshot = mergeLocalSnapshotState(fresh, snapshot);
      await electronApi.setCompanyAccessSnapshot(snapshot);
      companyAccessRefreshAtByCompanyId.set(session.user.companyId, now);
    } catch (error: unknown) {
      const fromError = readCompanyAccessFromApiError(error);
      if (fromError) {
        snapshot = mergeLocalSnapshotState(fromError, snapshot);
        await electronApi.setCompanyAccessSnapshot(snapshot);
      }
      if (!snapshot) {
        throw error;
      }
    }
  }

  if (!snapshot) {
    throw new Error('Paket dogrulamasi bulunamadi. Lutfen internet ile online giris yapin.');
  }

  ensureClockIsTrusted(snapshot, now);
  ensureCompanyAccessWindow(snapshot, now);

  const touched = touchLocalLastSeen(snapshot, now);
  snapshot = touched.snapshot;
  if (touched.shouldPersist) {
    await electronApi.setCompanyAccessSnapshot(snapshot);
  }

  return snapshot;
}

async function ensureCompanyAccessBestEffort(
  session: AuthSession,
  options?: { forceOnlineCheck?: boolean },
): Promise<void> {
  try {
    session.companyAccess = await ensureCompanyAccess(session, options);
  } catch {
    // Offline-first policy: sales/report flows must continue even if access validation fails.
  }
}

async function queueGenericWriteOperation(params: {
  body: Record<string, unknown>;
  localId?: string;
  method: 'DELETE' | 'POST' | 'PUT';
  path: string;
}): Promise<void> {
  const localId = ensureClientRequestId(params.localId);
  const payload: OfflineQueuedProductOperation = {
    body: params.body,
    method: params.method,
    path: params.path,
  };
  await ensureElectronApi().queueProductOp({
    localId,
    opType:
      params.method === 'POST'
        ? 'CREATE'
        : params.method === 'DELETE'
          ? 'DELETE'
          : 'UPDATE',
    payload,
  });
}

function normalizeOfflineSession(cached: OfflineAuthResult): AuthSession {
  const sessionId =
    (isUuid(cached.sessionId) ? cached.sessionId : null) ??
    (globalThis.crypto?.randomUUID?.() ??
      '00000000-0000-4000-8000-000000000001');
  const registerId =
    (isUuid(cached.registerId) ? cached.registerId : null) ??
    (globalThis.crypto?.randomUUID?.() ??
      '00000000-0000-4000-8000-000000000002');
  const session: AuthSession = {
    accessToken: cached.accessToken,
    companyAccess: cached.companyAccess ?? null,
    isOnline: false,
    refreshToken: cached.refreshToken,
    registerId,
    sessionId,
    user: {
      branchId: cached.user.branchId,
      companyId: cached.user.companyId,
      fullName: cached.user.fullName,
      id: cached.user.id,
      role: cached.user.role,
      username: cached.user.username,
    },
  };
  if (session.accessToken) {
    sessionByAccessToken.set(session.accessToken, session);
  }
  return session;
}

export async function loginOnline(input: OfflineCredential): Promise<AuthSession> {
  const electronApi = ensureElectronApi();
  const loginData = await requestApi<LoginResponseData>('/api/auth/login', {
    body: {
      companyId: input.companyId?.trim() || undefined,
      password: input.password,
      username: input.username.trim(),
    },
    method: 'POST',
  });

  const branchId = loginData.branch?.id ?? loginData.user.branchId;
  if (!branchId) {
    throw new Error('Kullanici icin sube bulunamadi.');
  }

  const registers = await requestApi<RegisterSummary[]>(
    `/api/registers?branchId=${encodeURIComponent(branchId)}`,
    { token: loginData.accessToken },
  );
  if (registers.length === 0) {
    throw new Error('Sube icin kasa kaydi bulunamadi.');
  }

  const registerId = registers[0].id;
  let sessionId: string;
  try {
    const active = await requestApi<RegisterSessionSummary>(
      `/api/stock/session/active?registerId=${encodeURIComponent(registerId)}`,
      { token: loginData.accessToken },
    );
    sessionId = active.id;
  } catch {
    const opened = await requestApi<RegisterSessionSummary>('/api/stock/session/open', {
      body: { openingBalance: 0, registerId },
      method: 'POST',
      token: loginData.accessToken,
    });
    sessionId = opened.id;
  }

  const session: AuthSession = {
    accessToken: loginData.accessToken,
    companyAccess: loginData.companyAccess,
    isOnline: true,
    refreshToken: loginData.refreshToken,
    registerId,
    sessionId,
    user: {
      branchId: loginData.user.branchId ?? branchId,
      companyId: loginData.user.companyId,
      fullName: loginData.user.fullName,
      id: loginData.user.id,
      role: loginData.user.role,
      username: loginData.user.username,
    },
  };

  await electronApi.cacheOnlineLogin({
    accessToken: session.accessToken ?? '',
    companyAccess: session.companyAccess ?? undefined,
    password: input.password,
    refreshToken: session.refreshToken ?? '',
    registerId: session.registerId,
    sessionId: session.sessionId,
    user: {
      branchId: session.user.branchId ?? branchId,
      companyId: session.user.companyId,
      fullName: session.user.fullName,
      id: session.user.id,
      isActive: true,
      role: session.user.role,
      username: session.user.username,
    },
  });
  if (session.accessToken) {
    sessionByAccessToken.set(session.accessToken, session);
  }
  companyAccessRefreshAtByCompanyId.set(session.user.companyId, Date.now());

  return session;
}

export async function loginOffline(input: OfflineCredential): Promise<AuthSession> {
  const cached = await ensureElectronApi().offlineLogin({
    companyId: input.companyId?.trim() || undefined,
    password: input.password,
    username: input.username.trim(),
  });
  if (!cached) {
    throw new Error('Offline login icin bu cihazda dogrulanmis kullanici bulunamadi.');
  }
  const session = normalizeOfflineSession(cached);
  await ensureCompanyAccessBestEffort(session);
  return session;
}

export async function restoreCachedSession(): Promise<AuthSession | null> {
  const cached = await ensureElectronApi().getCachedSession();
  if (!cached) {
    return null;
  }
  const session = normalizeOfflineSession(cached);
  await ensureCompanyAccessBestEffort(session);
  return session;
}

export async function loadCatalog(
  session: AuthSession,
  options?: { skipRemoteSyncPull?: boolean },
): Promise<RuntimeCatalog> {
  const electronApi = ensureElectronApi();
  await ensureCompanyAccessBestEffort(session);

  if (!options?.skipRemoteSyncPull && session.isOnline && session.accessToken) {
    try {
      const syncData = await requestApi<SyncPullResponseData>(
        `/api/sync/pull?registerId=${encodeURIComponent(session.registerId)}&includePurchaseInvoices=false`,
        { session, token: session.accessToken },
      );
      await electronApi.cacheSyncData({
        bundles: syncData.bundles ?? [],
        categories: syncData.categories ?? [],
        customers: syncData.customers ?? [],
        products: syncData.products ?? [],
        purchaseInvoices: syncData.purchaseInvoices ?? [],
        suppliers: syncData.suppliers ?? [],
        users: syncData.users ?? [],
      });
    } catch (caughtError: unknown) {
      console.warn('Online catalog load failed, falling back to local cache:', caughtError);
    }
  }

  const [categories, products, bundles] = await Promise.all([
    electronApi.getCachedCategories(session.user.companyId),
    electronApi.getCachedProducts({ companyId: session.user.companyId }),
    electronApi.listCachedBundles(session.user.companyId),
  ]);

  return { categories, products, bundles };
}

export async function fetchCustomers(
  session: AuthSession,
  params?: {
    activeOnly?: boolean;
    limit?: number;
    page?: number;
    search?: string;
  },
): Promise<CustomerRecord[]> {
  if (session.isOnline && session.accessToken) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      const token = ensureOnlineSession(session);
      const search = params?.search?.trim();
      const query = new URLSearchParams();
      query.set('companyId', session.user.companyId);
      query.set('activeOnly', params?.activeOnly === false ? 'false' : 'true');
      query.set('limit', String(Math.max(1, Math.min(100, params?.limit ?? 100))));
      query.set('page', String(params?.page ?? 1));
      if (search && search.length > 0) {
        query.set('search', search);
      }

      const remote = await requestApi<Array<CustomerRecord & { fullName?: string; name?: string; priceTier?: 'RETAIL' | 'WHOLESALE' }>>(
        `/api/customers?${query.toString()}`,
        { token },
      );
      return remote.map((row) => ({
        ...row,
        fullName: row.fullName ?? row.name ?? 'Musteri',
        name: row.name ?? row.fullName ?? 'Musteri',
      }));
    } catch (error: unknown) {
      console.error('Customer fetch failed, falling back to local:', error);
    }
  }

  const cached = await ensureElectronApi().getCachedCustomers(
    session.user.companyId,
    params?.search,
  );
  return cached.map((row) => ({
    address: row.address ?? null,
    balance: row.balance ?? 0,
    companyId: row.companyId,
    email: row.email ?? null,
    fullName: row.fullName,
    id: row.id,
    isActive: row.isActive,
    loyaltyPoints: row.loyaltyPoints ?? 0,
    name: row.fullName,
    phone: row.phone ?? null,
    priceTier: row.priceTier,
    taxNumber: row.taxNumber ?? null,
  }));
}

export async function createCustomer(
  session: AuthSession,
  data: any,
): Promise<any> {
  const normalized = {
    ...data,
    name:
      typeof data?.name === 'string'
        ? data.name
        : typeof data?.fullName === 'string'
          ? data.fullName
          : undefined,
  };
  if (session.isOnline && session.accessToken) {
    try {
      const token = ensureOnlineSession(session);
      return await requestApi<any>('/api/customers', {
        body: { ...normalized, companyId: session.user.companyId },
        method: 'POST',
        token,
      });
    } catch (error: unknown) {
      console.error('Customer creation failed online, queuing locally:', error);
    }
  }

  return await ensureElectronApi().queueCustomerOp({
    opType: 'CREATE',
    payload: { ...normalized, companyId: session.user.companyId },
  });
}

export async function updateCustomer(
  session: AuthSession,
  id: string,
  data: any,
): Promise<any> {
  const normalized = {
    ...data,
    name:
      typeof data?.name === 'string'
        ? data.name
        : typeof data?.fullName === 'string'
          ? data.fullName
          : undefined,
  };
  if (session.isOnline && session.accessToken) {
    try {
      const token = ensureOnlineSession(session);
      return await requestApi<any>(`/api/customers/${id}`, {
        body: normalized,
        method: 'PUT',
        token,
      });
    } catch (error: unknown) {
      console.error('Customer update failed online, queuing locally:', error);
    }
  }

  return await ensureElectronApi().queueCustomerOp({
    opType: 'UPDATE',
    payload: { ...normalized, id },
  });
}

export async function fetchSuppliers(
  session: AuthSession,
  params?: {
    activeOnly?: boolean;
    limit?: number;
    page?: number;
    search?: string;
  },
): Promise<PaginatedResult<SupplierRecord>> {
  await ensureCompanyAccessBestEffort(session);
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));

  if (session.isOnline && session.accessToken) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      const token = ensureOnlineSession(session);
      const query = new URLSearchParams();
      query.set('companyId', session.user.companyId);
      query.set('activeOnly', params?.activeOnly === false ? 'false' : 'true');
      query.set('limit', String(limit));
      query.set('page', String(page));
      if (params?.search?.trim()) {
        query.set('search', params.search.trim());
      }

      const envelope = await requestApiEnvelope<SupplierRecord[]>(
        `/api/suppliers?${query.toString()}`,
        { token },
      );
      const data = envelope.data ?? [];
      return {
        data,
        pagination:
          envelope.pagination ??
          fallbackPagination({
            limit,
            page,
            total: data.length,
          }),
      };
    } catch (error: unknown) {
      console.warn('Supplier fetch failed, falling back to local cache:', error);
    }
  }

  const cached = await ensureElectronApi().getCachedSuppliers(session.user.companyId);
  const searchTerm = params?.search?.trim().toLowerCase();
  const filtered = cached.filter((row) => {
    if (params?.activeOnly !== false && !row.isActive) {
      return false;
    }
    if (!searchTerm) {
      return true;
    }
    return (
      row.name.toLowerCase().includes(searchTerm) ||
      (row.phone ?? '').toLowerCase().includes(searchTerm) ||
      (row.taxNumber ?? '').toLowerCase().includes(searchTerm)
    );
  });
  const start = (page - 1) * limit;
  const paged = filtered.slice(start, start + limit);
  return {
    data: paged.map((row) => ({
      balance: row.balance ?? 0,
      companyId: row.companyId,
      id: row.id,
      isActive: row.isActive,
      name: row.name,
      phone: row.phone ?? null,
      taxNumber: row.taxNumber ?? null,
    })),
    pagination: fallbackPagination({
      limit,
      page,
      total: filtered.length,
    }),
  };
}

export async function createSupplier(
  session: AuthSession,
  payload: SupplierFormInput,
): Promise<SupplierRecord> {
  const body = {
    ...payload,
    companyId: session.user.companyId,
  };

  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      return await requestApi<SupplierRecord>('/api/suppliers', {
        body,
        method: 'POST',
        token: ensureOnlineSession(session),
      });
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  await queueGenericWriteOperation({
    body,
    method: 'POST',
    path: '/api/suppliers',
  });

  return {
    balance: 0,
    companyId: session.user.companyId,
    id: createOfflineUuid('sup'),
    isActive: true,
    name: payload.name,
    phone: payload.phone ?? null,
    taxNumber: payload.taxNumber ?? null,
  };
}

export async function updateSupplier(
  session: AuthSession,
  supplierId: string,
  payload: Partial<SupplierFormInput>,
): Promise<SupplierRecord> {
  const path = `/api/suppliers/${encodeURIComponent(supplierId)}`;
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      return await requestApi<SupplierRecord>(path, {
        body: payload,
        method: 'PUT',
        token: ensureOnlineSession(session),
      });
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  await queueGenericWriteOperation({
    body: payload as Record<string, unknown>,
    method: 'PUT',
    path,
  });

  return {
    balance: 0,
    companyId: session.user.companyId,
    id: supplierId,
    isActive: true,
    name: payload.name ?? 'Tedarikci',
    phone: payload.phone ?? null,
    taxNumber: payload.taxNumber ?? null,
  };
}

export async function deleteSupplier(
  session: AuthSession,
  supplierId: string,
): Promise<void> {
  const path = `/api/suppliers/${encodeURIComponent(supplierId)}`;
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      await requestApi<{ success: boolean }>(path, {
        method: 'DELETE',
        token: ensureOnlineSession(session),
      });
      return;
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }
  await queueGenericWriteOperation({
    body: {},
    method: 'DELETE',
    path,
  });
}

export async function fetchSupplierTransactions(
  session: AuthSession,
  supplierId: string,
  params?: {
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    page?: number;
    type?: 'DEBT' | 'PAYMENT';
  },
): Promise<PaginatedResult<SupplierTransactionRecord>> {
  await ensureCompanyAccessBestEffort(session);
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));

  if (!session.accessToken || !session.isOnline) {
    return {
      data: [],
      pagination: fallbackPagination({ limit, page, total: 0 }),
    };
  }

  session.companyAccess = await ensureCompanyAccess(session);
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  query.set('page', String(page));
  if (params?.type) {
    query.set('type', params.type);
  }
  if (params?.dateFrom) {
    query.set('dateFrom', params.dateFrom);
  }
  if (params?.dateTo) {
    query.set('dateTo', params.dateTo);
  }

  const envelope = await requestApiEnvelope<SupplierTransactionRecord[]>(
    `/api/suppliers/${encodeURIComponent(supplierId)}/transactions?${query.toString()}`,
    { token: ensureOnlineSession(session) },
  );
  const data = envelope.data ?? [];
  return {
    data,
    pagination:
      envelope.pagination ??
      fallbackPagination({
        limit,
        page,
        total: data.length,
      }),
  };
}

export async function createSupplierTransaction(
  session: AuthSession,
  supplierId: string,
  payload: CreateSupplierTransactionInput,
): Promise<SupplierTransactionRecord> {
  const path = `/api/suppliers/${encodeURIComponent(supplierId)}/transactions`;
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      return await requestApi<SupplierTransactionRecord>(path, {
        body: payload,
        method: 'POST',
        token: ensureOnlineSession(session),
      });
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  await queueGenericWriteOperation({
    body: { ...payload },
    method: 'POST',
    path,
  });

  return {
    amount: payload.amount,
    createdAt: new Date().toISOString(),
    description: payload.description ?? null,
    id: createOfflineUuid('sup-tx'),
    invoice: null,
    invoiceId: payload.invoiceId ?? null,
    supplierId,
    type: payload.type,
  };
}

export async function fetchPurchaseInvoices(
  session: AuthSession,
  params?: {
    branchId?: string;
    documentType?: 'DISPATCH' | 'INVOICE' | 'ORDER';
    limit?: number;
    page?: number;
    status?: 'CANCELLED' | 'COMPLETED' | 'DRAFT';
    supplierId?: string;
  },
): Promise<PaginatedResult<PurchaseInvoiceRecord>> {
  await ensureCompanyAccessBestEffort(session);
  const branchId = params?.branchId ?? session.user.branchId;
  if (!branchId) {
    throw new Error('Alis belgeleri icin branchId bulunamadi.');
  }
  const page = Math.max(1, params?.page ?? 1);
  const limit = Math.max(1, Math.min(100, params?.limit ?? 50));

  if (session.isOnline && session.accessToken) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      const query = new URLSearchParams();
      query.set('branchId', branchId);
      query.set('limit', String(limit));
      query.set('page', String(page));
      if (params?.documentType) {
        query.set('documentType', params.documentType);
      }
      if (params?.status) {
        query.set('status', params.status);
      }
      if (params?.supplierId) {
        query.set('supplierId', params.supplierId);
      }

      const envelope = await requestApiEnvelope<any[]>(
        `/api/purchase-invoices?${query.toString()}`,
        { token: ensureOnlineSession(session) },
      );
      const data = (envelope.data ?? []).map((row) => ({
        branchId: row.branchId,
        convertedAt: row.convertedAt ?? null,
        convertedToInvoiceId: row.convertedToInvoiceId ?? null,
        createdAt: row.createdAt,
        dispatchNumber: row.dispatchNumber ?? null,
        documentDate: row.documentDate ?? null,
        documentType: row.documentType,
        dueDate: row.dueDate ?? null,
        grandTotal: row.grandTotal ?? 0,
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        sourceDispatchId: row.sourceDispatchId ?? null,
        status: row.status,
        subtotal: row.subtotal ?? 0,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name,
        totalDiscount: row.totalDiscount ?? 0,
        totalVat: row.totalVat ?? 0,
        updatedAt: row.updatedAt,
      } satisfies PurchaseInvoiceRecord));

      return {
        data,
        pagination:
          envelope.pagination ??
          fallbackPagination({
            limit,
            page,
            total: data.length,
          }),
      };
    } catch (error: unknown) {
      console.warn('Purchase invoice fetch failed, falling back to cache:', error);
    }
  }

  const cached = await ensureElectronApi().getCachedPurchaseInvoices({
    branchId,
    companyId: session.user.companyId,
    documentType: params?.documentType,
    limit,
    page,
    supplierId: params?.supplierId,
  });

  return {
    data: cached.data.map((row) => ({
      branchId: row.branchId,
      convertedAt: row.convertedAt ?? null,
      convertedToInvoiceId: row.convertedToInvoiceId ?? null,
      createdAt: row.createdAt,
      dispatchNumber: row.dispatchNumber ?? null,
      documentDate: row.documentDate ?? row.invoiceDate,
      documentType: row.documentType ?? 'INVOICE',
      dueDate: row.dueDate ?? null,
      grandTotal: row.grandTotal ?? row.totalGrandTotal ?? 0,
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      items: row.items,
      sourceDispatchId: row.sourceDispatchId ?? null,
      status: (row.status as PurchaseInvoiceRecord['status']) ?? 'COMPLETED',
      subtotal: row.subtotal ?? 0,
      supplierId: row.supplierId,
      totalDiscount: row.totalDiscount ?? 0,
      totalVat: row.totalVat ?? 0,
      updatedAt: row.updatedAt,
    })),
    pagination: cached.pagination,
  };
}

export async function createPurchaseInvoice(
  session: AuthSession,
  payload: CreatePurchaseInvoiceInput,
): Promise<PurchaseInvoiceRecord> {
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      const created = await requestApi<any>('/api/purchase-invoices', {
        body: payload,
        method: 'POST',
        token: ensureOnlineSession(session),
      });
      return {
        branchId: created.branchId,
        convertedAt: created.convertedAt ?? null,
        convertedToInvoiceId: created.convertedToInvoiceId ?? null,
        createdAt: created.createdAt,
        dispatchNumber: created.dispatchNumber ?? null,
        documentDate: created.documentDate ?? null,
        documentType: created.documentType,
        dueDate: created.dueDate ?? null,
        grandTotal: created.grandTotal ?? 0,
        id: created.id,
        invoiceNumber: created.invoiceNumber,
        sourceDispatchId: created.sourceDispatchId ?? null,
        status: created.status,
        subtotal: created.subtotal ?? 0,
        supplierId: created.supplierId,
        supplierName: created.supplier?.name,
        totalDiscount: created.totalDiscount ?? 0,
        totalVat: created.totalVat ?? 0,
        updatedAt: created.updatedAt,
      };
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  await queueGenericWriteOperation({
    body: { ...payload },
    method: 'POST',
    path: '/api/purchase-invoices',
  });

  const nowIso = new Date().toISOString();
  const offlineGrandTotal = payload.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  return {
    branchId: payload.branchId,
    convertedAt: null,
    convertedToInvoiceId: null,
    createdAt: nowIso,
    dispatchNumber: payload.dispatchNumber ?? null,
    documentDate: payload.documentDate ?? null,
    documentType: payload.documentType,
    dueDate: payload.dueDate ?? null,
    grandTotal: offlineGrandTotal,
    id: createOfflineUuid('pinv'),
    invoiceNumber: payload.invoiceNumber,
    sourceDispatchId: null,
    status: 'DRAFT',
    subtotal: offlineGrandTotal,
    supplierId: payload.supplierId,
    totalDiscount: payload.totalDiscount ?? 0,
    totalVat: 0,
    updatedAt: nowIso,
  };
}

export async function convertDispatchToInvoice(
  session: AuthSession,
  dispatchId: string,
  payload?: {
    documentDate?: string | null;
    dueDate?: string | null;
    invoiceNumber?: string;
    note?: string;
  },
): Promise<PurchaseInvoiceRecord> {
  const path = `/api/purchase-invoices/${encodeURIComponent(dispatchId)}/convert-to-invoice`;
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      const converted = await requestApi<any>(
        path,
        {
          body: payload ?? {},
          method: 'POST',
          token: ensureOnlineSession(session),
        },
      );
      return {
        branchId: converted.branchId,
        convertedAt: converted.convertedAt ?? null,
        convertedToInvoiceId: converted.convertedToInvoiceId ?? null,
        createdAt: converted.createdAt,
        dispatchNumber: converted.dispatchNumber ?? null,
        documentDate: converted.documentDate ?? null,
        documentType: converted.documentType,
        dueDate: converted.dueDate ?? null,
        grandTotal: converted.grandTotal ?? 0,
        id: converted.id,
        invoiceNumber: converted.invoiceNumber,
        sourceDispatchId: converted.sourceDispatchId ?? null,
        status: converted.status,
        subtotal: converted.subtotal ?? 0,
        supplierId: converted.supplierId,
        supplierName: converted.supplier?.name,
        totalDiscount: converted.totalDiscount ?? 0,
        totalVat: converted.totalVat ?? 0,
        updatedAt: converted.updatedAt,
      };
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  await queueGenericWriteOperation({
    body: { ...(payload ?? {}) },
    method: 'POST',
    path,
  });

  return {
    branchId: session.user.branchId ?? 'offline-branch',
    convertedAt: new Date().toISOString(),
    convertedToInvoiceId: createOfflineUuid('pinv'),
    createdAt: new Date().toISOString(),
    dispatchNumber: null,
    documentDate: payload?.documentDate ?? null,
    documentType: 'INVOICE',
    dueDate: payload?.dueDate ?? null,
    grandTotal: 0,
    id: dispatchId,
    invoiceNumber: payload?.invoiceNumber ?? `INV-${Date.now()}`,
    sourceDispatchId: dispatchId,
    status: 'DRAFT',
    subtotal: 0,
    supplierId: '',
    totalDiscount: 0,
    totalVat: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getLocalSetting(
  key: string,
  defaultValue?: string,
): Promise<string | null> {
  return await ensureElectronApi().getLocalSetting(key, defaultValue);
}

export async function setLocalSetting(
  key: string,
  value: string,
): Promise<void> {
  await ensureElectronApi().setLocalSetting(key, value);
}

export async function saveDailyAutomationSettings(settings: {
  autoCloseEnabled: boolean;
  autoCloseTime: string;
  autoOpenEnabled: boolean;
  autoOpenTime: string;
  autoOpenCash: number;
}): Promise<void> {
  await Promise.all([
    setLocalSetting('marketpos_auto_close_enabled', String(settings.autoCloseEnabled)),
    setLocalSetting('marketpos_auto_close_time', settings.autoCloseTime),
    setLocalSetting('marketpos_auto_open_enabled', String(settings.autoOpenEnabled)),
    setLocalSetting('marketpos_auto_open_time', settings.autoOpenTime),
    setLocalSetting('marketpos_auto_open_cash', String(settings.autoOpenCash)),
  ]);
}


export async function queueSale(session: AuthSession, payload: PendingSale): Promise<PendingSaleRecord> {
  await ensureCompanyAccessBestEffort(session);
  const clientRequestId = ensureClientRequestId(payload.clientRequestId);
  const record = await ensureElectronApi().queueSale({
    localId: clientRequestId,
    sale: {
      ...payload,
      clientRequestId,
    },
  });
  if (session.isOnline && session.accessToken) {
    try {
      await runSync(session);
    } catch {
      session.isOnline = false;
    }
  }
  return record;
}

export async function queueRefund(
  session: AuthSession,
  payload: PendingRefund,
): Promise<void> {
  await ensureCompanyAccessBestEffort(session);
  const clientRequestId = ensureClientRequestId(payload.clientRequestId);
  await ensureElectronApi().queueRefund({
    localId: clientRequestId,
    refund: {
      ...payload,
      clientRequestId,
    },
  });
  if (session.isOnline && session.accessToken) {
    try {
      await runSync(session);
    } catch {
      session.isOnline = false;
    }
  }
}

export async function runSync(session: AuthSession): Promise<SyncRunResult | null> {
  if (!session.accessToken) {
    return null;
  }
  session.companyAccess = await ensureCompanyAccess(session, { forceOnlineCheck: true });
  return ensureElectronApi().runSync({
    accessToken: session.accessToken,
    registerId: session.registerId,
    sessionId: session.sessionId,
  });
}

export async function getQueueStatus(): Promise<{
  customerOps: number;
  lastSyncErrorCode: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: 'DEGRADED' | 'IDLE' | 'OK';
  oldestPendingAgeSec: number | null;
  pendingCount: number;
  productOps: number;
  purchaseOps: number;
  queuePeak: number;
  refunds: number;
  sales: number;
  stockOps: number;
  supplierOps: number;
  queueByEntity: {
    customerOps: { failed: number; pending: number; queued: number; synced: number };
    productOps: { failed: number; pending: number; queued: number; synced: number };
    purchaseOps: { failed: number; pending: number; queued: number; synced: number };
    refunds: { failed: number; pending: number; queued: number; synced: number };
    sales: { failed: number; pending: number; queued: number; synced: number };
    stockOps: { failed: number; pending: number; queued: number; synced: number };
    supplierOps: { failed: number; pending: number; queued: number; synced: number };
  };
}> {
  return ensureElectronApi().getQueueStatus();
}

export async function getBackofficeSettings(): Promise<BackofficeSettings> {
  return ensureElectronApi().getBackofficeSettings();
}

export async function setBackofficeSettings(payload: {
  operatorUserId?: string | null;
  patch: Partial<BackofficeSettings>;
}): Promise<BackofficeSettings> {
  return ensureElectronApi().setBackofficeSettings(payload);
}

export async function listPendingProductOps(limit = 200): Promise<ProductOpQueueRecord[]> {
  return ensureElectronApi().listPendingProductOps(limit);
}

export async function listPendingCustomerOps(limit = 200): Promise<CustomerOpQueueRecord[]> {
  return ensureElectronApi().listPendingCustomerOps(limit);
}

export async function listPendingSupplierOps(limit = 200): Promise<SupplierOpQueueRecord[]> {
  return ensureElectronApi().listPendingSupplierOps(limit);
}

export async function listPendingPurchaseOps(limit = 200): Promise<PurchaseOpQueueRecord[]> {
  return ensureElectronApi().listPendingPurchaseOps(limit);
}

export async function listPendingStockOps(limit = 200): Promise<StockOpQueueRecord[]> {
  return ensureElectronApi().listPendingStockOps(limit);
}

export async function createBackup(): Promise<BackupFileRecord> {
  return ensureElectronApi().createBackup();
}

export async function getBackupPolicy(): Promise<BackupPolicyState> {
  return ensureElectronApi().getBackupPolicy();
}

export async function listBackups(): Promise<BackupFileRecord[]> {
  return ensureElectronApi().listBackups();
}

export async function restoreBackup(fileName: string): Promise<BackupFileRecord> {
  return ensureElectronApi().restoreBackup({ fileName });
}

export async function setBackupPolicy(
  payload: BackupPolicy,
): Promise<BackupPolicyState> {
  return ensureElectronApi().setBackupPolicy(payload);
}

export async function logSecurityEvent(
  payload: LogSecurityEventPayload,
): Promise<SecurityEventRecord> {
  return ensureElectronApi().logSecurityEvent(payload);
}

export async function listSecurityEvents(limit = 100): Promise<SecurityEventRecord[]> {
  return ensureElectronApi().listSecurityEvents(limit);
}

export async function recordShiftHandover(
  payload: RecordShiftHandoverPayload,
): Promise<ShiftHandoverRecord> {
  return ensureElectronApi().recordShiftHandover(payload);
}

export async function listShiftHandovers(
  registerId: string,
  limit = 100,
): Promise<ShiftHandoverRecord[]> {
  return ensureElectronApi().listShiftHandovers({ limit, registerId });
}

export async function recordCashMovement(
  payload: RecordCashMovementPayload,
): Promise<CashMovementRecord> {
  return ensureElectronApi().recordCashMovement(payload);
}

export async function listCashMovements(
  registerId: string,
  limit = 100,
): Promise<CashMovementRecord[]> {
  return ensureElectronApi().listCashMovements({ limit, registerId });
}

export async function fetchSaleByReceipt(
  session: AuthSession,
  receiptNumber: string,
): Promise<SaleReceipt> {
  const normalizedReceipt = receiptNumber.trim();
  if (normalizedReceipt.length === 0) {
    throw new Error('Fis numarasi zorunludur.');
  }

  if (session.accessToken && session.isOnline) {
    session.companyAccess = await ensureCompanyAccess(session);
    return requestApi<SaleReceipt>(
      `/api/sales/receipt/${encodeURIComponent(normalizedReceipt)}`,
      { token: ensureOnlineSession(session) },
    );
  }

  const pending = await ensureElectronApi().listPendingSales(500);
  const targetIndex = pending.findIndex((row, index) => {
    let payload: any = {};
    try {
      payload = JSON.parse(row.payloadData);
    } catch {
      payload = {};
    }
    const localReceipt = typeof payload.localReceiptNumber === 'string'
      ? payload.localReceiptNumber
      : `YEREL-${String(index + 1).padStart(4, '0')}`;
    return localReceipt === normalizedReceipt;
  });

  if (targetIndex < 0) {
    throw new Error('Offline modda fis bulunamadi.');
  }

  const row = pending[targetIndex];
  let payload: any = {};
  try {
    payload = JSON.parse(row.payloadData);
  } catch {
    payload = {};
  }
  const localReceipt =
    typeof payload.localReceiptNumber === 'string'
      ? payload.localReceiptNumber
      : `YEREL-${String(targetIndex + 1).padStart(4, '0')}`;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const payments = Array.isArray(payload.payments) ? payload.payments : [];

  const saleItems: SaleReceiptItem[] = items.map((item: any, index: number) => ({
    id: `${row.id}-item-${index + 1}`,
    lineTotal: Number(item.lineTotal ?? item.unitPrice ?? 0) * Number(item.quantity ?? 1),
    productId: String(item.productId ?? `unknown-${index + 1}`),
    productName: String(item.productName ?? item.name ?? 'Urun'),
    quantity: Number(item.quantity ?? 1),
    saleId: row.id,
    unitPrice: Number(item.unitPrice ?? 0),
    vatAmount: Number(item.vatAmount ?? 0),
    vatRate: Number(item.vatRate ?? 0),
  }));

  return {
    branch: null,
    createdAt: row.createdAt,
    grandTotal: payments.reduce(
      (sum: number, payment: any) => sum + Number(payment?.amount ?? 0),
      0,
    ),
    id: row.id,
    items: saleItems,
    payments: payments.map((payment: any) => ({
      amount: Number(payment?.amount ?? 0),
      method: payment?.method,
    })),
    receiptNumber: localReceipt,
    register: null,
    status: 'COMPLETED',
  };
}

export async function fetchSales(
  session: AuthSession,
  params?: { branchId?: string; limit?: number; page?: number },
): Promise<{ data: any[]; pagination: any }> {
  await ensureCompanyAccessBestEffort(session);
  const { branchId, limit = 20, page = 1 } = params ?? {};

  if (!session.accessToken || !session.isOnline) {
    return readLocalSales(session, limit);
  }

  if (await hasPendingQueueItems()) {
    return readLocalSales(session, limit);
  }

  const branchQuery = branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';
  const token = ensureOnlineSession(session);

  try {
    const data = await requestApi<any[]>(
      `/api/sales?limit=${limit}&page=${page}${branchQuery}`,
      { token },
    );
    return { data, pagination: null };
  } catch (error: unknown) {
    if (!shouldFallbackToOfflineReport(error)) {
      throw error;
    }
    session.isOnline = false;
    return readLocalSales(session, limit);
  }
}

async function readLocalSales(session: AuthSession, limit: number): Promise<{ data: any[]; pagination: any }> {
  const pending = await ensureElectronApi().listPendingSales(limit);
  const localData = pending.map((row, index) => {
    let payload: any = {};
    try {
      payload = JSON.parse(row.payloadData);
    } catch {
      payload = {};
    }
    return {
      createdAt: row.createdAt,
      grandTotal: Array.isArray(payload.payments)
        ? payload.payments.reduce((sum: number, payment: { amount?: unknown }) => {
            const amount = typeof payment?.amount === 'number'
              ? payment.amount
              : Number.parseFloat(String(payment?.amount ?? '0'));
            return sum + (Number.isFinite(amount) ? amount : 0);
          }, 0)
        : 0,
      id: row.id,
      payments: Array.isArray(payload.payments) ? payload.payments : [],
      receiptNumber: typeof payload.localReceiptNumber === 'string'
        ? payload.localReceiptNumber
        : `YEREL-${String(index + 1).padStart(4, '0')}`,
      syncStatus: row.syncStatus,
      user: session.user,
    };
  });
  return { data: localData, pagination: null };
}

async function getOfflineDailyReportSnapshot(
  session: AuthSession,
  limit = 10,
): Promise<LocalDailyReportSnapshot> {
  return ensureElectronApi().getLocalDailyReport({
    companyId: session.user.companyId,
    limit,
    registerId: session.registerId,
  });
}

async function resolveSessionBranchId(session: AuthSession): Promise<string | null> {
  if (session.user.branchId && session.user.branchId.trim().length > 0) {
    return session.user.branchId;
  }
  if (!session.accessToken || !session.isOnline) {
    return null;
  }
  try {
    const register = await requestApi<RegisterDetail>(
      `/api/registers/${encodeURIComponent(session.registerId)}`,
      { token: ensureOnlineSession(session) },
    );
    if (register.branchId && register.branchId.trim().length > 0) {
      session.user.branchId = register.branchId;
      return register.branchId;
    }
  } catch {
    // no-op: fallback handled by caller
  }
  return null;
}

async function hasPendingQueueItems(): Promise<boolean> {
  try {
    const status = await ensureElectronApi().getQueueStatus();
    return status.pendingCount > 0;
  } catch {
    return false;
  }
}

export async function fetchDailyReport(session: AuthSession, date?: string): Promise<DailyReport> {
  try {
    session.companyAccess = await ensureCompanyAccess(session);
  } catch {
    const offline = await getOfflineDailyReportSnapshot(session);
    return offline.report as unknown as DailyReport;
  }
  if (!session.accessToken || !session.isOnline) {
    const offline = await getOfflineDailyReportSnapshot(session);
    return offline.report as unknown as DailyReport;
  }

  if (await hasPendingQueueItems()) {
    const offline = await getOfflineDailyReportSnapshot(session);
    return offline.report as unknown as DailyReport;
  }

  const branchId = await resolveSessionBranchId(session);
  if (!branchId) {
    const offline = await getOfflineDailyReportSnapshot(session);
    return offline.report as unknown as DailyReport;
  }

  try {
    const queryDate = date ? `&date=${encodeURIComponent(date)}` : '';
    return await requestApi<DailyReport>(
      `/api/reports/daily?branchId=${encodeURIComponent(branchId)}${queryDate}`,
      {
        token: ensureOnlineSession(session),
      },
    );
  } catch (error: unknown) {
    if (!shouldFallbackToOfflineReport(error)) {
      throw error;
    }
    session.isOnline = false;
    const offline = await getOfflineDailyReportSnapshot(session);
    return offline.report as unknown as DailyReport;
  }
}

export async function fetchTopProducts(
  session: AuthSession,
  limit = 10,
  date?: string,
): Promise<TopProductReportRow[]> {
  try {
    session.companyAccess = await ensureCompanyAccess(session);
  } catch {
    const offline = await getOfflineDailyReportSnapshot(session, limit);
    return offline.topProducts;
  }
  if (!session.accessToken || !session.isOnline) {
    const offline = await getOfflineDailyReportSnapshot(session, limit);
    return offline.topProducts;
  }

  if (await hasPendingQueueItems()) {
    const offline = await getOfflineDailyReportSnapshot(session, limit);
    return offline.topProducts;
  }

  const branchId = await resolveSessionBranchId(session);
  if (!branchId) {
    const offline = await getOfflineDailyReportSnapshot(session, limit);
    return offline.topProducts;
  }

  try {
    const queryDate = date ? `&from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}` : '';
    return await requestApi<TopProductReportRow[]>(
      `/api/reports/top-products?branchId=${encodeURIComponent(branchId)}&limit=${limit}${queryDate}`,
      { token: ensureOnlineSession(session) },
    );
  } catch (error: unknown) {
    if (!shouldFallbackToOfflineReport(error)) {
      throw error;
    }
    session.isOnline = false;
    const offline = await getOfflineDailyReportSnapshot(session, limit);
    return offline.topProducts;
  }
}

export async function fetchSessions(
  session: AuthSession,
  from?: string,
  to?: string,
): Promise<{ data: any[]; meta: any }> {
  session.companyAccess = await ensureCompanyAccess(session);
  const token = ensureOnlineSession(session);
  const branchId = (await resolveSessionBranchId(session)) ?? '';
  const fromQuery = from ? `&from=${encodeURIComponent(from)}` : '';
  const toQuery = to ? `&to=${encodeURIComponent(to)}` : '';
  const data = await requestApi<any[]>(
    `/api/reports/sessions?branchId=${encodeURIComponent(branchId)}${fromQuery}${toQuery}`,
    { token },
  );
  return { data, meta: null };
}

export async function fetchStockLevels(session: AuthSession): Promise<StockLevelRow[]> {
  const branchId = session.user.branchId ?? 'offline-branch';
  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      return await requestApi<StockLevelRow[]>(
        `/api/stock/levels?branchId=${encodeURIComponent(branchId)}`,
        { token: ensureOnlineSession(session) },
      );
    } catch (error: unknown) {
      if (!shouldFallbackToOfflineReport(error) && !shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  const [products, pendingStockOps] = await Promise.all([
    ensureElectronApi().getCachedProducts({
      companyId: session.user.companyId,
    }),
    ensureElectronApi().listPendingStockOps(1000),
  ]);

  const quantityByProductId = new Map<string, number>();
  for (const operation of pendingStockOps) {
    let payload: any = {};
    try {
      payload = JSON.parse(operation.payloadData);
    } catch {
      payload = {};
    }
    const body = payload?.body ?? {};
    const productId =
      typeof body.productId === 'string' ? body.productId : null;
    const quantity =
      typeof body.quantity === 'number' ? body.quantity : Number(body.quantity);
    if (!productId || !Number.isFinite(quantity)) {
      continue;
    }
    quantityByProductId.set(
      productId,
      (quantityByProductId.get(productId) ?? 0) + quantity,
    );
  }

  return products.map((product) => ({
    branchId,
    id: `offline-stock-${product.id}`,
    product: {
      barcode: product.barcode,
      id: product.id,
      isActive: product.isActive,
      minStock: 0,
      name: product.name,
      salePrice: product.salePrice,
    },
    productId: product.id,
    quantity: quantityByProductId.get(product.id) ?? 0,
    updatedAt: new Date().toISOString(),
  }));
}

export async function createStockMovement(
  session: AuthSession,
  payload: {
    clientRequestId?: string;
    note?: string;
    productId: string;
    quantity: number;
    reference?: string;
  },
): Promise<void> {
  const branchId = session.user.branchId;
  if (!branchId) {
    throw new Error('Stok hareketi icin branchId bulunamadi.');
  }
  const clientRequestId = ensureClientRequestId(payload.clientRequestId);
  const body = {
    branchId,
    clientRequestId,
    note: payload.note,
    productId: payload.productId,
    quantity: payload.quantity,
    reference: payload.reference,
    registerId: session.registerId,
  };

  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      await requestApi<{ id: string }>('/api/stock/movement', {
        body,
        method: 'POST',
        token: ensureOnlineSession(session),
      });
      return;
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  const offlinePayload: OfflineQueuedStockOperation = { body };
  await ensureElectronApi().queueStockOp({
    localId: clientRequestId,
    opType: 'MOVEMENT',
    payload: offlinePayload,
  });
}

export async function createProduct(
  session: AuthSession,
  payload: CreateProductInput,
): Promise<void> {
  const productId = payload.id ?? createOfflineUuid('prd');
  const clientRequestId = ensureClientRequestId(payload.clientRequestId);
  const body = {
    ...payload,
    clientRequestId,
    companyId: payload.companyId ?? session.user.companyId,
    id: productId,
    unitType: 'PIECE',
  };

  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      await requestApi<{ id: string }>('/api/products', {
        body,
        method: 'POST',
        token: ensureOnlineSession(session),
      });
      return;
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  const offlinePayload: OfflineQueuedProductOperation = {
    body,
    method: 'POST',
    path: '/api/products',
  };
  await ensureElectronApi().queueProductOp({
    localId: clientRequestId,
    opType: 'CREATE',
    payload: offlinePayload,
  });
}

export async function updateProduct(
  session: AuthSession,
  productId: string,
  payload: UpdateProductInput,
): Promise<void> {
  const clientRequestId = ensureClientRequestId(payload.clientRequestId);
  const body = {
    ...payload,
    clientRequestId,
    companyId: payload.companyId ?? session.user.companyId,
    id: payload.id ?? productId,
  };

  if (session.accessToken && session.isOnline) {
    try {
      session.companyAccess = await ensureCompanyAccess(session);
      await requestApi<{ id: string }>(`/api/products/${encodeURIComponent(productId)}`, {
        body,
        method: 'PUT',
        token: ensureOnlineSession(session),
      });
      return;
    } catch (error: unknown) {
      if (!shouldQueueOfflineWrite(error)) {
        throw error;
      }
      session.isOnline = false;
    }
  }

  const offlinePayload: OfflineQueuedProductOperation = {
    body,
    method: 'PUT',
    path: `/api/products/${encodeURIComponent(productId)}`,
  };
  await ensureElectronApi().queueProductOp({
    localId: clientRequestId,
    opType: 'UPDATE',
    payload: offlinePayload,
  });
}

export async function closeSession(
  session: AuthSession,
  closingBalance: number,
  note?: string,
): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  await requestApi<{ id: string }>(`/api/stock/session/${session.sessionId}/close`, {
    body: {
      closingBalance,
      note,
    },
    method: 'POST',
    token: ensureOnlineSession(session),
  });
}

export type DesktopRole = 'ACCOUNTANT' | 'ADMIN' | 'CASHIER' | 'SUPER_ADMIN';

function normalizeDesktopRole(role: string | undefined): DesktopRole {
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT') {
    return role;
  }
  return 'CASHIER';
}

export function canAccessDesktopPage(
  role: string | undefined,
  page:
    | 'campaigns'
    | 'customers'
    | 'dashboard'
    | 'diagnostics'
    | 'expenses'
    | 'operations'
    | 'payment'
    | 'quick'
    | 'refund'
    | 'report'
    | 'sale'
    | 'shift'
    | 'stock'
    | 'suppliers',
): boolean {
  const normalizedRole = normalizeDesktopRole(role);
  if (normalizedRole === 'ADMIN' || normalizedRole === 'SUPER_ADMIN') {
    return true;
  }
  if (normalizedRole === 'ACCOUNTANT') {
    return (
      page === 'dashboard' ||
      page === 'report' ||
      page === 'operations' ||
      page === 'customers' ||
      page === 'suppliers' ||
      page === 'shift'
    );
  }
  if (normalizedRole === 'CASHIER') {
    return (
      page === 'sale' ||
      page === 'payment' ||
      page === 'quick' ||
      page === 'refund' ||
      page === 'expenses' ||
      page === 'customers' ||
      page === 'shift'
    );
  }
  return false;
}

export function canWriteOperations(role: string | undefined): boolean {
  const normalizedRole = normalizeDesktopRole(role);
  return normalizedRole === 'ADMIN' || normalizedRole === 'SUPER_ADMIN';
}

export function explainRuntimeError(error: unknown): string {
  if (isCompanyAccessBlockError(error)) {
    return error.message;
  }

  if (error instanceof RuntimeApiError && error.errorCode === 'SUBSCRIPTION_BLOCKED') {
    const companyAccess = readCompanyAccessFromApiError(error);
    if (companyAccess) {
      return companyAccess.summary;
    }
  }

  const message = readErrorMessage(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('failed to fetch') || normalized.includes('econnrefused')) {
    return 'Sunucuya baglanilamadi. Ag baglantisini ve API servisinin acik oldugunu kontrol edin.';
  }
  if (normalized.includes('yetkisiz')) {
    return 'Oturum yetkisi gecersiz. Lutfen tekrar giris yapin.';
  }
  if (normalized.includes('paket') || normalized.includes('yenileme') || normalized.includes('erisim kapatildi')) {
    return message;
  }
  if (normalized.includes('kasa bulunamadi')) {
    return 'Kasa kaydi bulunamadi. Sunucu kayitlarini kontrol edin.';
  }
  return message;
}

export function isCompanyAccessBlockError(
  error: unknown,
): error is CompanyAccessBlockError {
  return error instanceof CompanyAccessBlockError;
}

export function readCompanyAccessBlockDetails(
  error: CompanyAccessBlockError,
): CompanyAccessBlockDetails {
  return error.details;
}

export function explainHardwareOperatorAction(
  action: HardwareStepResult['operatorAction'],
): string {
  switch (action) {
    case 'CHECK_HARDWARE_SETTINGS':
      return 'Yazici ayarlarini kontrol edin.';
    case 'CHECK_PRINTER_CONNECTION':
      return 'Yazici baglantisini ve guc durumunu kontrol edin.';
    case 'RETRY_PRINT':
      return 'Yazdirma islemini tekrar deneyin.';
    default:
      return '';
  }
}

export function explainHardwareRecoveryPlan(result: {
  errorCode?: HardwareStepResult['errorCode'];
  message: string;
  operatorAction: HardwareStepResult['operatorAction'];
}): string {
  const normalized = result.message.toLowerCase();

  if (normalized.includes('kagit') || normalized.includes('paper')) {
    return 'Yazici kapagini acip kagit rulosunu kontrol edin, kapagi kapatip yeniden test edin.';
  }
  if (normalized.includes('timeout')) {
    return 'Yaziciya giden ag/USB baglantisini, IP/port ayarini ve timeout degerini kontrol edin.';
  }
  if (
    result.errorCode === 'PRINTER_NOT_CONNECTED' ||
    normalized.includes('baglanilamadi') ||
    normalized.includes('not connected')
  ) {
    return 'Yazici gucunu, kablo/ag baglantisini ve secilen yazici hedefini kontrol edin.';
  }

  const byAction = explainHardwareOperatorAction(result.operatorAction);
  if (byAction.length > 0) {
    return byAction;
  }

  return 'Donanim ayarlarini ve baglanti durumunu kontrol edip islemi tekrar deneyin.';
}

export async function renewLicense(licenseKey: string): Promise<CompanyAccessSnapshot> {
  const result = await requestApi<CompanyAccessSnapshot>('/api/license/renew', {
    body: { licenseKey },
    method: 'POST',
  });
  return result;
}
