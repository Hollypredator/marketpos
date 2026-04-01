import type {
  CachedCategoryRecord,
  CompanyAccessSnapshot,
  CachedProductRecord,
  OfflineAuthResult,
  SyncRunResult,
} from '../electron-api';
import type {
  AuthSession,
  BackupFileRecord,
  BackupPolicy,
  BackupPolicyState,
  CashMovementRecord,
  CreateProductInput,
  DailyReport,
  HardwareStepResult,
  LogSecurityEventPayload,
  OfflineCredential,
  PendingRefund,
  PendingSale,
  RecordCashMovementPayload,
  RecordShiftHandoverPayload,
  SaleReceipt,
  SecurityEventRecord,
  ShiftHandoverRecord,
  StockLevelRow,
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

interface RegisterSummary {
  id: string;
}

interface RegisterSessionSummary {
  id: string;
}

interface SyncPullResponseData {
  categories: CachedCategoryRecord[];
  products: CachedProductRecord[];
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
const COMPANY_ACCESS_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 30 * 60 * 1000;
const LOCAL_SEEN_PERSIST_INTERVAL_MS = 60 * 1000;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Bilinmeyen hata';
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
  return session.accessToken;
}

async function getApiBaseUrl(): Promise<string> {
  if (runtimeApiBaseUrl) {
    return runtimeApiBaseUrl;
  }
  const runtime = await ensureElectronApi().getRuntimeInfo();
  runtimeApiBaseUrl = runtime.apiBaseUrl;
  return runtimeApiBaseUrl;
}

async function requestApi<TData>(
  path: string,
  options?: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
    token?: string | null;
  },
): Promise<TData> {
  const baseUrl = await getApiBaseUrl();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options?.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
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
    throw new RuntimeApiError(envelope.error ?? `API hatasi: ${response.status}`, {
      data: envelope.data,
      errorCode: envelope.errorCode,
      httpStatus: response.status,
    });
  }
  return envelope.data;
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
  session: Pick<AuthSession, 'accessToken' | 'companyAccess' | 'isOnline' | 'user'>,
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

function normalizeOfflineSession(cached: OfflineAuthResult): AuthSession {
  const sessionId =
    cached.sessionId ??
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-offline-session`);
  const registerId = cached.registerId ?? 'offline-register';
  return {
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
      branchId: loginData.user.branchId,
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
      branchId: session.user.branchId,
      companyId: session.user.companyId,
      fullName: session.user.fullName,
      id: session.user.id,
      isActive: true,
      role: session.user.role,
      username: session.user.username,
    },
  });
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
  session.companyAccess = await ensureCompanyAccess(session);
  return session;
}

export async function restoreCachedSession(): Promise<AuthSession | null> {
  const cached = await ensureElectronApi().getCachedSession();
  if (!cached) {
    return null;
  }
  const session = normalizeOfflineSession(cached);
  session.companyAccess = await ensureCompanyAccess(session);
  return session;
}

export async function loadCatalog(session: AuthSession): Promise<RuntimeCatalog> {
  const electronApi = ensureElectronApi();
  session.companyAccess = await ensureCompanyAccess(session);

  if (session.isOnline && session.accessToken) {
    try {
      const syncData = await requestApi<SyncPullResponseData>(
        `/api/sync/pull?registerId=${encodeURIComponent(session.registerId)}`,
        { token: session.accessToken },
      );
      await electronApi.cacheSyncData(syncData);
    } catch {
      // Ignore network failures and use local cache.
    }
  }

  const [categories, products] = await Promise.all([
    electronApi.getCachedCategories(session.user.companyId),
    electronApi.getCachedProducts({
      companyId: session.user.companyId,
    }),
  ]);

  return { categories, products };
}

export async function queueSale(session: AuthSession, payload: PendingSale): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  await ensureElectronApi().queueSale({ sale: payload });
  if (session.isOnline && session.accessToken) {
    try {
      await runSync(session);
    } catch {
      // Keep queued locally; sync will retry automatically.
    }
  }
}

export async function queueRefund(
  session: AuthSession,
  payload: PendingRefund,
): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  await ensureElectronApi().queueRefund({ refund: payload });
  if (session.isOnline && session.accessToken) {
    try {
      await runSync(session);
    } catch {
      // Keep queued locally; sync will retry automatically.
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
  });
}

export async function getQueueStatus(): Promise<{ refunds: number; sales: number }> {
  return ensureElectronApi().getQueueStatus();
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
  session.companyAccess = await ensureCompanyAccess(session);
  return requestApi<SaleReceipt>(
    `/api/sales/receipt/${encodeURIComponent(receiptNumber.trim())}`,
    { token: ensureOnlineSession(session) },
  );
}

export async function fetchDailyReport(session: AuthSession): Promise<DailyReport> {
  session.companyAccess = await ensureCompanyAccess(session);
  const branchId = session.user.branchId;
  if (!branchId) {
    throw new Error('Gunluk rapor icin branchId bulunamadi.');
  }
  return requestApi<DailyReport>(`/api/reports/daily?branchId=${encodeURIComponent(branchId)}`, {
    token: ensureOnlineSession(session),
  });
}

export async function fetchTopProducts(
  session: AuthSession,
  limit = 10,
): Promise<TopProductReportRow[]> {
  session.companyAccess = await ensureCompanyAccess(session);
  const branchId = session.user.branchId;
  if (!branchId) {
    throw new Error('Top urunler icin branchId bulunamadi.');
  }
  return requestApi<TopProductReportRow[]>(
    `/api/reports/top-products?branchId=${encodeURIComponent(branchId)}&limit=${limit}`,
    { token: ensureOnlineSession(session) },
  );
}

export async function fetchStockLevels(session: AuthSession): Promise<StockLevelRow[]> {
  session.companyAccess = await ensureCompanyAccess(session);
  const branchId = session.user.branchId;
  if (!branchId) {
    throw new Error('Stok seviyesi icin branchId bulunamadi.');
  }
  return requestApi<StockLevelRow[]>(
    `/api/stock/levels?branchId=${encodeURIComponent(branchId)}`,
    { token: ensureOnlineSession(session) },
  );
}

export async function createStockMovement(
  session: AuthSession,
  payload: {
    note?: string;
    productId: string;
    quantity: number;
    reference?: string;
  },
): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  const branchId = session.user.branchId;
  if (!branchId) {
    throw new Error('Stok hareketi icin branchId bulunamadi.');
  }

  await requestApi<{ id: string }>('/api/stock/movement', {
    body: {
      branchId,
      note: payload.note,
      productId: payload.productId,
      quantity: payload.quantity,
      reference: payload.reference,
    },
    method: 'POST',
    token: ensureOnlineSession(session),
  });
}

export async function createProduct(
  session: AuthSession,
  payload: CreateProductInput,
): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  await requestApi<{ id: string }>('/api/products', {
    body: {
      ...payload,
      companyId: session.user.companyId,
      unitType: 'PIECE',
    },
    method: 'POST',
    token: ensureOnlineSession(session),
  });
}

export async function updateProduct(
  session: AuthSession,
  productId: string,
  payload: UpdateProductInput,
): Promise<void> {
  session.companyAccess = await ensureCompanyAccess(session);
  await requestApi<{ id: string }>(`/api/products/${encodeURIComponent(productId)}`, {
    body: payload,
    method: 'PUT',
    token: ensureOnlineSession(session),
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
