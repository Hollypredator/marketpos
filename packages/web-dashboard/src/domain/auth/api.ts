import type { LoginResponse } from '../shared/types';
import { requestData } from '../../lib/http/api-client';
import { toOptionalString } from '../../lib/format';
import type { LoginFormState } from './types';

interface LoginRequestPayload {
  companyId?: string;
  email?: string;
  password: string;
  username?: string;
}

export function buildLoginPayload(params: LoginFormState): LoginRequestPayload {
  if (params.mode === 'EMAIL') {
    return {
      email: toOptionalString(params.email),
      password: params.password,
    };
  }

  return {
    companyId: toOptionalString(params.companyId),
    password: params.password,
    username: params.username.trim(),
  };
}

export async function loginApi(params: LoginFormState): Promise<LoginResponse> {
  return requestData<LoginResponse>('/api/auth/login', {
    auth: false,
    body: buildLoginPayload(params),
    method: 'POST',
  });
}
