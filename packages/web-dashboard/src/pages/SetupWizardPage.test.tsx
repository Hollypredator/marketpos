import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SetupWizardPage } from './SetupWizardPage';
import type { SubscriptionProvisionForm } from '../domain/subscription/types';

const BASE_FORM: SubscriptionProvisionForm = {
  address: '',
  adminEmail: '',
  adminFullName: 'Sistem Yoneticisi',
  adminPassword: 'Strong123',
  adminUsername: 'admin',
  branchName: 'Merkez',
  companyId: '',
  companyName: '',
  email: '',
  graceDays: '7',
  overwriteStock: false,
  packageDays: '365',
  phone: '',
  registerName: 'Kasa 1',
  taxNumber: '',
  templateCode: 'bakkal-v1',
};

const TEMPLATES = [
  {
    categoryCount: 12,
    code: 'bakkal-v1',
    defaultMinStock: 5,
    defaultOpeningStock: 20,
    displayName: 'Bakkal Baslangic',
    productCount: 120,
  },
];

function renderWizard(formOverrides: Partial<SubscriptionProvisionForm> = {}) {
  function Harness(): React.ReactElement {
    const [form, setForm] = useState<SubscriptionProvisionForm>({
      ...BASE_FORM,
      ...formOverrides,
    });

    return (
      <SetupWizardPage
        existingCompanies={[
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Demo Firma',
            taxNumber: '1234567890',
          },
        ]}
        onProvisionFormChange={(updater) => {
          setForm((current) => updater(current));
        }}
        onSubmitProvision={async (event) => {
          event.preventDefault();
        }}
        provisionErrorText={null}
        provisionForm={form}
        provisionLoading={false}
        saving={false}
        templateErrorText={null}
        templateLoading={false}
        templates={TEMPLATES}
      />
    );
  }

  return render(<Harness />);
}

describe('SetupWizardPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('requires company name when creating a new tenant', async () => {
    renderWizard();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Devam Et' }));

    expect(screen.getByText('Yeni firma acilisi icin firma adi zorunludur.')).toBeTruthy();
  });

  it('treats adminEmail as optional when an existing company is selected', async () => {
    renderWizard();
    const user = userEvent.setup();

    await user.selectOptions(
      screen.getAllByLabelText('Mevcut Firma (opsiyonel)')[0],
      '11111111-1111-4111-8111-111111111111',
    );
    await user.click(screen.getByRole('button', { name: 'Devam Et' }));
    await user.click(screen.getByRole('button', { name: 'Devam Et' }));

    expect(screen.getByLabelText('Template')).toBeTruthy();
    expect(screen.queryByText('Yeni firma acilisinda admin email zorunludur.')).toBeNull();
  });
});
