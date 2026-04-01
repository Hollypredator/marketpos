export interface StoredAuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    companyId: string;
    role: string;
    [key: string]: unknown;
  };
}

export function persistStoredAuthSession(
  storageKey: string,
  session: StoredAuthSession | null,
): void {
  if (!session) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

export function readStoredAuthSession(storageKey: string): StoredAuthSession | null {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredAuthSession;
    if (
      typeof parsed.accessToken === 'string' &&
      parsed.accessToken.length > 0 &&
      typeof parsed.refreshToken === 'string' &&
      parsed.refreshToken.length > 0 &&
      typeof parsed.user?.id === 'string' &&
      typeof parsed.user?.companyId === 'string' &&
      typeof parsed.user?.role === 'string'
    ) {
      return parsed;
    }
  } catch {
    // ignore malformed payload
  }

  window.localStorage.removeItem(storageKey);
  return null;
}

