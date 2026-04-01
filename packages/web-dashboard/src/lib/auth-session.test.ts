import { beforeEach, describe, expect, it } from 'vitest';

import {
  persistStoredAuthSession,
  readStoredAuthSession,
  type StoredAuthSession,
} from './auth-session';

class MemoryStorage {
  private readonly map = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  public removeItem(key: string): void {
    this.map.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const storageKey = 'test-auth-session';
const sampleSession: StoredAuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  user: {
    companyId: 'company-1',
    id: 'user-1',
    role: 'ADMIN',
  },
};

describe('auth-session storage', () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      localStorage: new MemoryStorage(),
    };
  });

  it('persists and reads a valid session', () => {
    persistStoredAuthSession(storageKey, sampleSession);
    const restored = readStoredAuthSession(storageKey);

    expect(restored).toEqual(sampleSession);
  });

  it('returns null and clears malformed session payload', () => {
    const windowRef = globalThis as unknown as {
      window: { localStorage: MemoryStorage };
    };
    windowRef.window.localStorage.setItem(storageKey, '{broken-json');

    const restored = readStoredAuthSession(storageKey);

    expect(restored).toBeNull();
    expect(windowRef.window.localStorage.getItem(storageKey)).toBeNull();
  });
});
