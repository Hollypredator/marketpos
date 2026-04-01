import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, buildUrl, requestData, setApiAuthLifecycle } from './api-client';
import type { AuthSession } from '../../domain/shared/types';

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setApiAuthLifecycle(null);
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('refreshes token and retries request on 401', async () => {
    const fetchMock = vi.mocked(fetch);
    let currentSession: AuthSession | null = {
      accessToken: 'access-old',
      refreshToken: 'refresh-old',
      user: {
        companyId: 'company-1',
        fullName: 'Admin User',
        id: 'user-1',
        role: 'ADMIN',
        username: 'admin',
      },
    };
    const onSessionUpdate = vi.fn((next: AuthSession | null) => {
      currentSession = next;
    });
    const onUnauthorized = vi.fn();

    setApiAuthLifecycle({
      getSession: () => currentSession,
      onAccessBlocked: vi.fn(),
      onSessionUpdate,
      onUnauthorized,
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Token expired', success: false }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { accessToken: 'access-new', refreshToken: 'refresh-new' },
          success: true,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true }, success: true }));

    const data = await requestData<{ ok: boolean }>('/api/secure');

    expect(data.ok).toBe(true);
    expect(onSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      }),
    );
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const retriedHeaders = new Headers((fetchMock.mock.calls[2][1] as RequestInit).headers);
    expect(retriedHeaders.get('Authorization')).toBe('Bearer access-new');
  });

  it('logs user out when refresh fails', async () => {
    const fetchMock = vi.mocked(fetch);
    let currentSession: AuthSession | null = {
      accessToken: 'access-old',
      refreshToken: 'refresh-old',
      user: {
        companyId: 'company-1',
        fullName: 'Admin User',
        id: 'user-1',
        role: 'ADMIN',
        username: 'admin',
      },
    };
    const onUnauthorized = vi.fn();
    const onSessionUpdate = vi.fn((next: AuthSession | null) => {
      currentSession = next;
    });

    setApiAuthLifecycle({
      getSession: () => currentSession,
      onAccessBlocked: vi.fn(),
      onSessionUpdate,
      onUnauthorized,
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Token expired', success: false }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Refresh failed', success: false }));

    await expect(requestData('/api/secure')).rejects.toMatchObject({ status: 401 });
    expect(onSessionUpdate).toHaveBeenCalledWith(null);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('fires access-block callback on 402', async () => {
    const fetchMock = vi.mocked(fetch);
    const onAccessBlocked = vi.fn();

    setApiAuthLifecycle({
      getSession: () => null,
      onAccessBlocked,
      onSessionUpdate: vi.fn(),
      onUnauthorized: vi.fn(),
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(402, {
        error: 'Abonelik suresi doldu',
        errorCode: 'SUBSCRIPTION_BLOCKED',
        success: false,
      }),
    );

    await expect(requestData('/api/subscription/status')).rejects.toBeInstanceOf(ApiClientError);
    expect(onAccessBlocked).toHaveBeenCalledWith('Abonelik suresi doldu');
  });

  it('builds query params by skipping empty fields', () => {
    const target = new URL(
      buildUrl('/api/companies', { companyId: 'c-1', empty: '', missing: undefined }),
    );

    expect(target.pathname).toBe('/api/companies');
    expect(target.searchParams.get('companyId')).toBe('c-1');
    expect(target.searchParams.get('empty')).toBeNull();
    expect(target.searchParams.get('missing')).toBeNull();
  });
});
