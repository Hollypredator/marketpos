import type { LoginResponse } from '../shared/types';
import { requestData } from '../../lib/http/api-client';
import { toOptionalString } from '../../lib/format';

export async function loginApi(params: {
  companyId: string;
  password: string;
  username: string;
}): Promise<LoginResponse> {
  return requestData<LoginResponse>('/api/auth/login', {
    auth: false,
    body: {
      companyId: toOptionalString(params.companyId),
      password: params.password,
      username: params.username.trim(),
    },
    method: 'POST',
  });
}
