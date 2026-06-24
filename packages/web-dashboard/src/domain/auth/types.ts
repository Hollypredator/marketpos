import type { AuthSession, UserRole } from '../shared/types';

export type LoginMode = 'EMAIL' | 'LEGACY';

export interface LoginFormState {
  email: string;
  mode: LoginMode;
  companyId: string;
  password: string;
  username: string;
}

export interface AuthContextValue {
  accessBlockedMessage: string | null;
  clearAccessBlockedMessage: () => void;
  isAuthenticated: boolean;
  isBackofficeWriter: boolean;
  isSuperAdmin: boolean;
  login: (credentials: LoginFormState) => Promise<void>;
  logout: () => void;
  role: UserRole | null;
  session: AuthSession | null;
}
