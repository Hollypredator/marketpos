import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { persistStoredAuthSession, readStoredAuthSession, type StoredAuthSession } from '../../lib/auth-session';
import { setApiAuthLifecycle } from '../../lib/http/api-client';
import { resolveFallbackTab, tabPath } from '../../lib/route-access';
import { loginApi } from './api';
import type { AuthContextValue, LoginFormState } from './types';
import type { AuthSession } from '../shared/types';

const SESSION_STORAGE_KEY = 'marketpos.web.session.v1';

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const navigate = useNavigate();
  const [session, setSession] = useState<AuthSession | null>(() => {
    const persisted = readStoredAuthSession(SESSION_STORAGE_KEY) as AuthSession | null;
    return persisted;
  });
  const sessionRef = useRef<AuthSession | null>(session);
  const [accessBlockedMessage, setAccessBlockedMessage] = useState<string | null>(null);

  const applySession = useCallback((nextSession: AuthSession | null) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    persistStoredAuthSession(SESSION_STORAGE_KEY, nextSession as StoredAuthSession | null);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setApiAuthLifecycle({
      getSession: () => sessionRef.current,
      onAccessBlocked: (message: string) => {
        setAccessBlockedMessage(message);
        applySession(null);
        navigate('/login', { replace: true });
      },
      onSessionUpdate: (nextSession: AuthSession | null) => {
        applySession(nextSession);
      },
      onUnauthorized: () => {
        applySession(null);
        navigate('/login', { replace: true });
      },
    });

    return () => {
      setApiAuthLifecycle(null);
    };
  }, [applySession, navigate]);

  const login = useCallback(
    async (credentials: LoginFormState) => {
      const data = await loginApi(credentials);
      const nextSession: AuthSession = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      };
      applySession(nextSession);
      setAccessBlockedMessage(null);
      const fallback = resolveFallbackTab(nextSession.user.role);
      navigate(tabPath(fallback), { replace: true });
    },
    [applySession, navigate],
  );

  const logout = useCallback(() => {
    applySession(null);
    setAccessBlockedMessage(null);
    navigate('/login', { replace: true });
  }, [applySession, navigate]);

  const value = useMemo<AuthContextValue>(() => {
    const role = session?.user.role ?? null;
      return {
        accessBlockedMessage,
        clearAccessBlockedMessage: () => setAccessBlockedMessage(null),
        isAuthenticated: Boolean(session),
        isBackofficeWriter: role === 'SUPER_ADMIN',
        isSuperAdmin: role === 'SUPER_ADMIN',
        login,
        logout,
      role,
      session,
    };
  }, [accessBlockedMessage, login, logout, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
