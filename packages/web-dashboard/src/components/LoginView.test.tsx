import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { LoginView } from './LoginView';

describe('LoginView', () => {
  it('switches from email mode to legacy mode via segmented control', async () => {
    const onChangeMode = vi.fn();
    const user = userEvent.setup();

    render(
      <LoginView
        accessBlockedMessage={null}
        banner={null}
        login={{
          companyId: '',
          email: 'admin@example.com',
          mode: 'EMAIL',
          password: 'Strong123',
          username: 'admin',
        }}
        onChangeEmail={vi.fn()}
        onChangeCompanyId={vi.fn()}
        onChangeMode={onChangeMode}
        onChangePassword={vi.fn()}
        onChangeUsername={vi.fn()}
        onSubmit={async (event) => {
          event.preventDefault();
        }}
        saving={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Legacy Giris' }));
    expect(onChangeMode).toHaveBeenCalledWith('LEGACY');
  });

  it('renders legacy company input when mode is LEGACY', () => {
    render(
      <LoginView
        accessBlockedMessage={null}
        banner={null}
        login={{
          companyId: '11111111-1111-4111-8111-111111111111',
          email: '',
          mode: 'LEGACY',
          password: 'Strong123',
          username: 'admin',
        }}
        onChangeEmail={vi.fn()}
        onChangeCompanyId={vi.fn()}
        onChangeMode={vi.fn()}
        onChangePassword={vi.fn()}
        onChangeUsername={vi.fn()}
        onSubmit={async (event) => {
          event.preventDefault();
        }}
        saving={false}
      />,
    );

    expect(screen.getByLabelText('Firma ID (opsiyonel, SUPER_ADMIN icin)')).toBeTruthy();
  });

  it('shows access block banner and disables submit while saving', () => {
    render(
      <LoginView
        accessBlockedMessage="Abonelik suresi doldu."
        banner={null}
        login={{
          companyId: '',
          email: 'admin@example.com',
          mode: 'EMAIL',
          password: 'Strong123',
          username: 'admin',
        }}
        onChangeEmail={vi.fn()}
        onChangeCompanyId={vi.fn()}
        onChangeMode={vi.fn()}
        onChangePassword={vi.fn()}
        onChangeUsername={vi.fn()}
        onSubmit={async (event) => {
          event.preventDefault();
        }}
        saving
      />,
    );

    expect(screen.getByText('Abonelik suresi doldu.')).toBeTruthy();
    const submitButton = screen.getByRole('button', { name: 'Giris yapiliyor...' }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });
});
