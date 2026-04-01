import type {
  ApiEnvelope,
  ApiErrorModel,
  AuthSession,
  RefreshResponse,
} from '../../domain/shared/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  auth?: boolean;
  body?: unknown;
  method?: HttpMethod;
  query?: Record<string, string | undefined>;
  skipAuthRefresh?: boolean;
  tokenOverride?: string;
}

interface AuthLifecycleHandlers {
  getSession: () => AuthSession | null;
  onAccessBlocked: (message: string) => void;
  onSessionUpdate: (session: AuthSession | null) => void;
  onUnauthorized: () => void;
}

let authLifecycleHandlers: AuthLifecycleHandlers | null = null;

export class ApiClientError extends Error {
  public readonly status: number;

  public readonly errorCode: string | null;

  public readonly data: unknown;

  public constructor(model: ApiErrorModel) {
    super(model.message);
    this.name = 'ApiClientError';
    this.status = model.status;
    this.errorCode = model.errorCode;
    this.data = model.data;
  }
}

export function setApiAuthLifecycle(handlers: AuthLifecycleHandlers | null): void {
  authLifecycleHandlers = handlers;
}

export function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const target = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string' && value.length > 0) {
        target.searchParams.set(key, value);
      }
    }
  }
  return target.toString();
}

function toError(payload: ApiEnvelope<unknown>, status: number): ApiClientError {
  return new ApiClientError({
    data: payload.data,
    errorCode: payload.errorCode ?? null,
    message: payload.error ?? payload.message ?? `API hatasi: ${status}`,
    status,
  });
}

async function parseEnvelope<T>(res: Response): Promise<ApiEnvelope<T>> {
  const text = await res.text();
  if (text.length === 0) {
    return { success: res.ok } as ApiEnvelope<T>;
  }
  return JSON.parse(text) as ApiEnvelope<T>;
}

async function refreshSession(session: AuthSession): Promise<AuthSession> {
  const refreshed = await requestData<RefreshResponse>('/api/auth/refresh', {
    auth: false,
    body: { refreshToken: session.refreshToken },
    method: 'POST',
    skipAuthRefresh: true,
  });
  return {
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    user: session.user,
  };
}

export async function requestEnvelope<T>(
  path: string,
  options?: RequestOptions,
): Promise<ApiEnvelope<T>> {
  const method = options?.method ?? 'GET';
  const useAuth = options?.auth !== false;
  const session = authLifecycleHandlers?.getSession() ?? null;

  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = options?.tokenOverride ?? (useAuth ? session?.accessToken : undefined);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(buildUrl(path, options?.query), {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await parseEnvelope<T>(res);
  if (res.ok && payload.success) {
    return payload;
  }

  const error = toError(payload, res.status);
  const canTryRefresh =
    !options?.skipAuthRefresh &&
    useAuth &&
    res.status === 401 &&
    !path.includes('/api/auth/refresh') &&
    session?.refreshToken &&
    authLifecycleHandlers !== null;

  if (canTryRefresh) {
    try {
      const refreshed = await refreshSession(session);
      authLifecycleHandlers?.onSessionUpdate(refreshed);
      return requestEnvelope<T>(path, {
        ...options,
        skipAuthRefresh: true,
        tokenOverride: refreshed.accessToken,
      });
    } catch {
      authLifecycleHandlers?.onSessionUpdate(null);
      authLifecycleHandlers?.onUnauthorized();
      throw error;
    }
  }

  if (res.status === 402) {
    authLifecycleHandlers?.onAccessBlocked(error.message);
  } else if (res.status === 401 && !path.includes('/api/auth/refresh')) {
    authLifecycleHandlers?.onUnauthorized();
  }

  throw error;
}

export async function requestData<T>(path: string, options?: RequestOptions): Promise<T> {
  const payload = await requestEnvelope<T>(path, options);
  if (typeof payload.data === 'undefined') {
    throw new Error('API data bos geldi');
  }
  return payload.data;
}

export async function requestOk(path: string, options?: RequestOptions): Promise<void> {
  await requestEnvelope(path, options);
}
