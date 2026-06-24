import React, { useMemo, useState } from 'react';

import type { ProvisionTemplateSummary, SubscriptionProvisionForm } from '../domain/subscription/types';

interface ExistingCompanyOption {
  id: string;
  name: string;
  taxNumber?: string | null;
}

interface SetupWizardPageProps {
  existingCompanies: ExistingCompanyOption[];
  onProvisionFormChange: (
    updater: (current: SubscriptionProvisionForm) => SubscriptionProvisionForm,
  ) => void;
  onSubmitProvision: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  provisionErrorText: string | null;
  provisionForm: SubscriptionProvisionForm;
  provisionLoading: boolean;
  saving: boolean;
  templateErrorText: string | null;
  templateLoading: boolean;
  templates: ProvisionTemplateSummary[];
}

const STEP_TITLES = [
  'Firma Bilgileri',
  'Admin Hesabi',
  'Paket ve Template',
  'Onay',
] as const;

export function SetupWizardPage({
  existingCompanies,
  onProvisionFormChange,
  onSubmitProvision,
  provisionErrorText,
  provisionForm,
  provisionLoading,
  saving,
  templateErrorText,
  templateLoading,
  templates,
}: SetupWizardPageProps): React.ReactElement {
  const [stepIndex, setStepIndex] = useState(0);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const selectedExistingCompany = useMemo(
    () => existingCompanies.find((company) => company.id === provisionForm.companyId) ?? null,
    [existingCompanies, provisionForm.companyId],
  );
  const creatingNewCompany = provisionForm.companyId.trim().length === 0;

  const validateStep = (targetStep: number): string | null => {
    if (targetStep <= 0) {
      if (creatingNewCompany && provisionForm.companyName.trim().length < 2) {
        return 'Yeni firma acilisi icin firma adi zorunludur.';
      }
    }
    if (targetStep <= 1) {
      if (provisionForm.adminFullName.trim().length < 3) {
        return 'Admin ad soyad en az 3 karakter olmali.';
      }
      if (provisionForm.adminUsername.trim().length < 3) {
        return 'Admin kullanici adi en az 3 karakter olmali.';
      }
      if (provisionForm.adminPassword.trim().length < 6) {
        return 'Admin sifresi en az 6 karakter olmali.';
      }
      if (creatingNewCompany && provisionForm.adminEmail.trim().length === 0) {
        return 'Yeni firma acilisinda admin email zorunludur.';
      }
    }
    if (targetStep <= 2) {
      if (provisionForm.templateCode.trim().length === 0) {
        return 'Bir template secmeniz gerekiyor.';
      }
      if (provisionForm.branchName.trim().length < 2) {
        return 'Sube adi en az 2 karakter olmali.';
      }
      if (provisionForm.registerName.trim().length < 1) {
        return 'Kasa adi zorunludur.';
      }
      const packageDays = Number.parseInt(provisionForm.packageDays, 10);
      if (!Number.isFinite(packageDays) || packageDays < 1) {
        return 'Paket gunu 1 veya daha buyuk olmali.';
      }
      const graceDays = Number.parseInt(provisionForm.graceDays, 10);
      if (!Number.isFinite(graceDays) || graceDays < 1 || graceDays > 30) {
        return 'Grace gunu 1 ile 30 arasinda olmali.';
      }
    }
    return null;
  };

  const goNext = (): void => {
    const message = validateStep(stepIndex);
    if (message) {
      setValidationMessage(message);
      return;
    }
    setValidationMessage(null);
    setStepIndex((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const goBack = (): void => {
    setValidationMessage(null);
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  return (
    <section className="panel-grid">
      <article className="card">
        <h2>Firma Kurulum Wizard</h2>
        <p className="muted">
          SUPER_ADMIN icin guvenli onboarding akisi. Yeni firma acabilir veya mevcut firmaya
          template uygulayabilirsiniz.
        </p>

        <div className="steps">
          {STEP_TITLES.map((title, index) => (
            <React.Fragment key={title}>
              {index > 0 && <div className="step-divider" />}
              <button
                type="button"
                className={`step ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}`}
                onClick={() => setStepIndex(index)}
              >
                <span className="step-num">{index < stepIndex ? '✓' : index + 1}</span>
                {title}
              </button>
            </React.Fragment>
          ))}
        </div>

        {(validationMessage || provisionErrorText) && (
          <div className="banner error">{validationMessage ?? provisionErrorText}</div>
        )}

        <form className="form-grid compact" onSubmit={onSubmitProvision}>
          {stepIndex === 0 && (
            <>
              <div className="inline-row two">
                <label>
                  Mevcut Firma (opsiyonel)
                  <select
                    value={provisionForm.companyId}
                    onChange={(event) => {
                      const nextCompanyId = event.target.value;
                      onProvisionFormChange((current) => {
                        if (nextCompanyId.trim().length === 0) {
                          return {
                            ...current,
                            companyId: '',
                          };
                        }
                        const selectedCompany = existingCompanies.find(
                          (company) => company.id === nextCompanyId,
                        );
                        return {
                          ...current,
                          companyId: nextCompanyId,
                          companyName: selectedCompany?.name ?? current.companyName,
                          taxNumber: selectedCompany?.taxNumber ?? current.taxNumber,
                        };
                      });
                    }}
                  >
                    <option value="">Yeni firma acilisi</option>
                    {existingCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Yeni Firma Adi
                  <input
                    placeholder="Ornek Market"
                    value={provisionForm.companyName}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        companyName: event.target.value,
                      }))
                    }
                    disabled={!creatingNewCompany}
                  />
                </label>
              </div>
              <div className="inline-row three">
                <label>
                  Vergi No
                  <input
                    placeholder="1234567890"
                    value={provisionForm.taxNumber}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        taxNumber: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Telefon
                  <input
                    value={provisionForm.phone}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Firma Email
                  <input
                    type="email"
                    value={provisionForm.email}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Adres
                <input
                  value={provisionForm.address}
                  onChange={(event) =>
                    onProvisionFormChange((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                />
              </label>
              <p className="muted">
                {creatingNewCompany
                  ? 'Yeni tenant acilisi modunda calisiyorsunuz.'
                  : `Secili mevcut firma: ${selectedExistingCompany?.name ?? provisionForm.companyId}`}
              </p>
            </>
          )}

          {stepIndex === 1 && (
            <>
              <div className="inline-row three">
                <label>
                  Admin Kullanici
                  <input
                    value={provisionForm.adminUsername}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        adminUsername: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Admin Sifre
                  <input
                    type="password"
                    value={provisionForm.adminPassword}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        adminPassword: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Admin Ad Soyad
                  <input
                    value={provisionForm.adminFullName}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        adminFullName: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <label>
                Admin Email {creatingNewCompany ? '(zorunlu)' : '(opsiyonel)'}
                <input
                  type="email"
                  value={provisionForm.adminEmail}
                  onChange={(event) =>
                    onProvisionFormChange((current) => ({
                      ...current,
                      adminEmail: event.target.value,
                    }))
                  }
                  required={creatingNewCompany}
                />
              </label>
            </>
          )}

          {stepIndex === 2 && (
            <>
              <div className="inline-row two">
                <label>
                  Template
                  <select
                    value={provisionForm.templateCode}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        templateCode: event.target.value,
                      }))
                    }
                    required
                    disabled={templateLoading}
                  >
                    {templates.map((template) => (
                      <option key={template.code} value={template.code}>
                        {template.displayName} ({template.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sube
                  <input
                    value={provisionForm.branchName}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        branchName: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <div className="inline-row three">
                <label>
                  Kasa
                  <input
                    value={provisionForm.registerName}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        registerName: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Paket Gunu
                  <input
                    type="number"
                    min="1"
                    value={provisionForm.packageDays}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        packageDays: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Grace Gunu
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={provisionForm.graceDays}
                    onChange={(event) =>
                      onProvisionFormChange((current) => ({
                        ...current,
                        graceDays: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={provisionForm.overwriteStock}
                  onChange={(event) =>
                    onProvisionFormChange((current) => ({
                      ...current,
                      overwriteStock: event.target.checked,
                    }))
                  }
                />
                Mevcut stoklari template stok miktari ile guncelle
              </label>
            </>
          )}

          {stepIndex === 3 && (
            <div className="setup-summary">
              <h3>Onay Ozeti</h3>
              <p className="muted">
                Bu adimda provisioning islemi tetiklenir ve secilen firmada admin + template
                yapilandirmasi uygulanir.
              </p>
              <ul className="list">
                <li>
                  <strong>Firma:</strong>{' '}
                  {creatingNewCompany
                    ? provisionForm.companyName || '-'
                    : selectedExistingCompany?.name ?? provisionForm.companyId}
                </li>
                <li>
                  <strong>Admin:</strong> {provisionForm.adminFullName} ({provisionForm.adminUsername})
                </li>
                <li>
                  <strong>Admin Email:</strong> {provisionForm.adminEmail || '-'}
                </li>
                <li>
                  <strong>Template:</strong> {provisionForm.templateCode}
                </li>
                <li>
                  <strong>Sube/Kasa:</strong> {provisionForm.branchName} / {provisionForm.registerName}
                </li>
                <li>
                  <strong>Paket:</strong> {provisionForm.packageDays} gun + grace{' '}
                  {provisionForm.graceDays} gun
                </li>
              </ul>
            </div>
          )}

          <div className="inline-row three">
            <button
              className="btn"
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0 || provisionLoading || saving}
            >
              Geri
            </button>
            {stepIndex < STEP_TITLES.length - 1 ? (
              <button className="btn primary" type="button" onClick={goNext} disabled={provisionLoading || saving}>
                Devam Et
              </button>
            ) : (
              <button className="btn primary" type="submit" disabled={provisionLoading || saving}>
                {provisionLoading ? 'Provision calisiyor...' : 'Provision Baslat'}
              </button>
            )}
          </div>
        </form>
      </article>

      <article className="card">
        <h2>Template Kutuphanesi</h2>
        {templateErrorText && <p className="muted">{templateErrorText}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Kategori</th>
                <th>Urun</th>
                <th>Min Stok</th>
                <th>Acilis Stok</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.code}>
                  <td>{template.code}</td>
                  <td>{template.displayName}</td>
                  <td>{template.categoryCount}</td>
                  <td>{template.productCount}</td>
                  <td>{template.defaultMinStock}</td>
                  <td>{template.defaultOpeningStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {templateLoading && <p className="muted">Template listesi yukleniyor...</p>}
        {!templateLoading && templates.length === 0 && (
          <p className="muted">Template kaydi bulunmadi.</p>
        )}
      </article>
    </section>
  );
}
