import { describe, expect, it } from 'vitest';

import { buildLoginPayload } from './api';

describe('buildLoginPayload', () => {
  it('builds email-first payload for EMAIL mode', () => {
    expect(
      buildLoginPayload({
        companyId: 'ignored',
        email: 'Owner@Example.com ',
        mode: 'EMAIL',
        password: 'Secret123',
        username: 'ignored-user',
      }),
    ).toEqual({
      email: 'Owner@Example.com',
      password: 'Secret123',
    });
  });

  it('builds legacy payload for LEGACY mode', () => {
    expect(
      buildLoginPayload({
        companyId: '11111111-1111-4111-8111-111111111111',
        email: '',
        mode: 'LEGACY',
        password: 'Secret123',
        username: 'admin  ',
      }),
    ).toEqual({
      companyId: '11111111-1111-4111-8111-111111111111',
      password: 'Secret123',
      username: 'admin',
    });
  });
});
