import { requestData, requestOk } from '../../lib/http/api-client';
import { toOptionalString } from '../../lib/format';
import type { User, UserRole } from './types';

export async function listUsersApi(companyId: string): Promise<User[]> {
  return requestData<User[]>('/api/users', {
    query: { companyId, limit: '200', page: '1' },
  });
}

export async function createUserApi(payload: {
  branchId: string;
  companyId: string;
  email: string;
  fullName: string;
  password: string;
  pin: string;
  role: UserRole;
  username: string;
}): Promise<User> {
  return requestData<User>('/api/users', {
    body: {
      branchId: toOptionalString(payload.branchId),
      companyId: payload.companyId,
      email: toOptionalString(payload.email)?.toLowerCase(),
      fullName: payload.fullName.trim(),
      password: payload.password,
      pin: toOptionalString(payload.pin),
      role: payload.role,
      username: payload.username.trim(),
    },
    method: 'POST',
  });
}

export async function updateUserApi(
  userId: string,
  payload: {
    branchId: string;
    email: string;
    fullName: string;
    isActive: boolean;
    password: string;
    pin: string;
    role: UserRole;
    username: string;
  },
): Promise<User> {
  const nextPayload: {
    branchId: string | null;
    email?: string | null;
    fullName: string;
    isActive: boolean;
    password?: string;
    pin: string | null;
    role: UserRole;
    username: string;
  } = {
    branchId: payload.branchId.length > 0 ? payload.branchId : null,
    fullName: payload.fullName.trim(),
    isActive: payload.isActive,
    pin: payload.pin.trim().length > 0 ? payload.pin.trim() : null,
    role: payload.role,
    username: payload.username.trim(),
  };
  if (payload.email.trim().length > 0) {
    nextPayload.email = payload.email.trim().toLowerCase();
  } else {
    nextPayload.email = null;
  }
  const nextPassword = payload.password.trim();
  if (nextPassword.length > 0) {
    nextPayload.password = nextPassword;
  }

  return requestData<User>(`/api/users/${userId}`, {
    body: nextPayload,
    method: 'PUT',
  });
}

export async function deleteUserApi(userId: string): Promise<void> {
  await requestOk(`/api/users/${userId}`, { method: 'DELETE' });
}
