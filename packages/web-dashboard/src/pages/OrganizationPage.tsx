import React, { useMemo, useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { useClientPagination } from '../hooks/use-client-pagination';

interface CompanyRow {
  id: string;
  isActive: boolean;
  licenseKey?: string | null;
  maxCartDiscountPercent: number;
  maxItemDiscountPercent: number;
  name: string;
  taxNumber?: string | null;
}

interface BranchRow {
  id: string;
  isActive: boolean;
  name: string;
  phone?: string | null;
}

interface CompanyCreateForm {
  address: string;
  email: string;
  maxCartDiscountPercent: string;
  maxItemDiscountPercent: string;
  name: string;
  phone: string;
  taxNumber: string;
}

interface CompanyEditForm {
  address: string;
  email: string;
  isActive: boolean;
  maxCartDiscountPercent: string;
  maxItemDiscountPercent: string;
  name: string;
  phone: string;
  taxNumber: string;
}

interface BranchCreateForm {
  address: string;
  name: string;
  phone: string;
}

interface BranchEditForm {
  address: string;
  isActive: boolean;
  name: string;
  phone: string;
}

interface OrganizationPageProps {
  branchErrorText: string | null;
  branchCreateForm: BranchCreateForm;
  branchEditForm: BranchEditForm;
  branchId: string;
  branchLoading: boolean;
  branches: BranchRow[];
  companiesErrorText: string | null;
  companiesLoading: boolean;
  companies: CompanyRow[];
  companyCreateForm: CompanyCreateForm;
  companyEditForm: CompanyEditForm;
  companyId: string;
  onBranchCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onBranchDelete: () => Promise<void>;
  onBranchEditChange: (updater: (current: BranchEditForm) => BranchEditForm) => void;
  onBranchSelect: (branchId: string) => void;
  onBranchUpdate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCompanyCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCompanyCreateChange: (updater: (current: CompanyCreateForm) => CompanyCreateForm) => void;
  onCompanyDelete: () => Promise<void>;
  onCompanyEditChange: (updater: (current: CompanyEditForm) => CompanyEditForm) => void;
  onCompanySelect: (companyId: string) => void;
  onCompanyUpdate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onInvoiceTemplateFormChange: (
    updater: (current: {
      footerNote: string;
      headerText: string;
      logoUrl: string;
      taxOffice: string;
      tradeRegistryNo: string;
      salesFooterNote: string;
      salesHeaderText: string;
      salesLabel: string;
      purchaseFooterNote: string;
      purchaseHeaderText: string;
      purchaseLabel: string;
      dispatchFooterNote: string;
      dispatchHeaderText: string;
      dispatchLabel: string;
    }) => {
      footerNote: string;
      headerText: string;
      logoUrl: string;
      taxOffice: string;
      tradeRegistryNo: string;
      salesFooterNote: string;
      salesHeaderText: string;
      salesLabel: string;
      purchaseFooterNote: string;
      purchaseHeaderText: string;
      purchaseLabel: string;
      dispatchFooterNote: string;
      dispatchHeaderText: string;
      dispatchLabel: string;
    },
  ) => void;
  onInvoiceTemplateSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onNewBranchChange: (updater: (current: BranchCreateForm) => BranchCreateForm) => void;
  saving: boolean;
  selectedBranch: BranchRow | null;
  selectedCompany: CompanyRow | null;
  selectedCompanyName: string;
  invoiceTemplateForm: {
    footerNote: string;
    headerText: string;
    logoUrl: string;
    taxOffice: string;
    tradeRegistryNo: string;
    salesFooterNote: string;
    salesHeaderText: string;
    salesLabel: string;
    purchaseFooterNote: string;
    purchaseHeaderText: string;
    purchaseLabel: string;
    dispatchFooterNote: string;
    dispatchHeaderText: string;
    dispatchLabel: string;
  };
}

export function OrganizationPage({
  branchErrorText,
  branchCreateForm,
  branchEditForm,
  branchId,
  branchLoading,
  branches,
  companiesErrorText,
  companiesLoading,
  companies,
  companyCreateForm,
  companyEditForm,
  companyId,
  onBranchCreate,
  onBranchDelete,
  onBranchEditChange,
  onBranchSelect,
  onBranchUpdate,
  onCompanyCreate,
  onCompanyCreateChange,
  onCompanyDelete,
  onCompanyEditChange,
  onCompanySelect,
  onCompanyUpdate,
  onInvoiceTemplateFormChange,
  onInvoiceTemplateSave,
  onNewBranchChange,
  saving,
  selectedBranch,
  selectedCompany,
  selectedCompanyName,
  invoiceTemplateForm,
}: OrganizationPageProps): React.ReactElement {
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatusFilter, setCompanyStatusFilter] = useState<'ACTIVE' | 'ALL' | 'PASSIVE'>('ALL');
  const [branchSearch, setBranchSearch] = useState('');
  const [branchStatusFilter, setBranchStatusFilter] = useState<'ACTIVE' | 'ALL' | 'PASSIVE'>('ALL');

  const normalizedCompanySearch = companySearch.trim().toLocaleLowerCase('tr-TR');
  const filteredCompanies = useMemo(
    () =>
      companies.filter((company) => {
        if (companyStatusFilter === 'ACTIVE' && !company.isActive) {
          return false;
        }
        if (companyStatusFilter === 'PASSIVE' && company.isActive) {
          return false;
        }
        if (normalizedCompanySearch.length === 0) {
          return true;
        }

        const haystack =
          `${company.name} ${company.taxNumber ?? ''}`.toLocaleLowerCase('tr-TR');
        return haystack.includes(normalizedCompanySearch);
      }),
    [companies, companyStatusFilter, normalizedCompanySearch],
  );

  const normalizedBranchSearch = branchSearch.trim().toLocaleLowerCase('tr-TR');
  const filteredBranches = useMemo(
    () =>
      branches.filter((branch) => {
        if (branchStatusFilter === 'ACTIVE' && !branch.isActive) {
          return false;
        }
        if (branchStatusFilter === 'PASSIVE' && branch.isActive) {
          return false;
        }
        if (normalizedBranchSearch.length === 0) {
          return true;
        }

        const haystack =
          `${branch.name} ${branch.phone ?? ''}`.toLocaleLowerCase('tr-TR');
        return haystack.includes(normalizedBranchSearch);
      }),
    [branchStatusFilter, branches, normalizedBranchSearch],
  );

  const companiesPagination = useClientPagination(filteredCompanies, { pageSize: 20 });
  const branchesPagination = useClientPagination(filteredBranches, { pageSize: 20 });

  return (
    <section className="panel-grid two-col">
      <article className="card">
        <h2>Firmalar ({companiesPagination.total}/{companies.length})</h2>

        <div className="inline-row three">
          <input
            placeholder="Firma ara (ad/vergi no)"
            value={companySearch}
            onChange={(event) => setCompanySearch(event.target.value)}
          />
          <select
            value={companyStatusFilter}
            onChange={(event) =>
              setCompanyStatusFilter(event.target.value as 'ACTIVE' | 'ALL' | 'PASSIVE')
            }
          >
            <option value="ALL">Tum durumlar</option>
            <option value="ACTIVE">Sadece aktif</option>
            <option value="PASSIVE">Sadece pasif</option>
          </select>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setCompanySearch('');
              setCompanyStatusFilter('ALL');
            }}
            disabled={
              companySearch.trim().length === 0 &&
              companyStatusFilter === 'ALL'
            }
          >
            Filtreyi Temizle
          </button>
        </div>

        <ul className="list">
          {companiesPagination.visibleRows.map((company) => (
            <li key={company.id} className={company.id === companyId ? 'active' : ''}>
              <button className="list-button" type="button" onClick={() => onCompanySelect(company.id)}>
                <span>{company.name}</span>
                <small>{company.taxNumber ?? 'Vergi no yok'}</small>
                {company.licenseKey && (
                  <small style={{ color: 'var(--fg-2)', marginLeft: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    LISANS: {company.licenseKey.slice(0, 12)}...
                  </small>
                )}
              </button>
              <span className={`state-pill ${company.isActive ? 'ok' : 'off'}`}>
                {company.isActive ? 'Aktif' : 'Pasif'}
              </span>
            </li>
          ))}
        </ul>
        {companiesLoading && <p className="muted">Firmalar yukleniyor...</p>}
        {!companiesLoading && companiesErrorText && <p className="muted">{companiesErrorText}</p>}
        {!companiesLoading && !companiesErrorText && companiesPagination.total === 0 && (
          <p className="muted">Firma kaydi bulunmadi.</p>
        )}
        <PaginationControls
          onPageChange={companiesPagination.setPage}
          page={companiesPagination.page}
          pageSize={companiesPagination.pageSize}
          total={companiesPagination.total}
        />

        <form className="form-grid compact" onSubmit={onCompanyCreate}>
          <h3>Yeni Firma</h3>
          <input
            placeholder="Firma adi"
            value={companyCreateForm.name}
            onChange={(event) =>
              onCompanyCreateChange((current) => ({ ...current, name: event.target.value }))
            }
            required
          />
          <div className="inline-row two">
            <input
              placeholder="Vergi no"
              value={companyCreateForm.taxNumber}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, taxNumber: event.target.value }))
              }
            />
            <input
              placeholder="Telefon"
              value={companyCreateForm.phone}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </div>
          <div className="inline-row two">
            <input
              type="email"
              placeholder="Email"
              value={companyCreateForm.email}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, email: event.target.value }))
              }
            />
            <input
              placeholder="Adres"
              value={companyCreateForm.address}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, address: event.target.value }))
              }
            />
          </div>
          <div className="inline-row two">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Urun indirim limiti (%)"
              value={companyCreateForm.maxItemDiscountPercent}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, maxItemDiscountPercent: event.target.value }))
              }
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Sepet indirim limiti (%)"
              value={companyCreateForm.maxCartDiscountPercent}
              onChange={(event) =>
                onCompanyCreateChange((current) => ({ ...current, maxCartDiscountPercent: event.target.value }))
              }
            />
          </div>
          <button className="btn primary" type="submit" disabled={saving}>
            Firma Ekle
          </button>
        </form>

        <form className="form-grid compact" onSubmit={onCompanyUpdate}>
          <h3>Secili Firmayi Guncelle</h3>
          <input
            placeholder="Firma adi"
            value={companyEditForm.name}
            onChange={(event) =>
              onCompanyEditChange((current) => ({ ...current, name: event.target.value }))
            }
            required
            disabled={!selectedCompany}
          />
          <div className="inline-row two">
            <input
              placeholder="Vergi no"
              value={companyEditForm.taxNumber}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, taxNumber: event.target.value }))
              }
              disabled={!selectedCompany}
            />
            <input
              placeholder="Telefon"
              value={companyEditForm.phone}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, phone: event.target.value }))
              }
              disabled={!selectedCompany}
            />
          </div>
          <div className="inline-row two">
            <input
              type="email"
              placeholder="Email"
              value={companyEditForm.email}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, email: event.target.value }))
              }
              disabled={!selectedCompany}
            />
            <input
              placeholder="Adres"
              value={companyEditForm.address}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, address: event.target.value }))
              }
              disabled={!selectedCompany}
            />
          </div>
          <div className="inline-row two">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Urun indirim limiti (%)"
              value={companyEditForm.maxItemDiscountPercent}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, maxItemDiscountPercent: event.target.value }))
              }
              disabled={!selectedCompany}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              placeholder="Sepet indirim limiti (%)"
              value={companyEditForm.maxCartDiscountPercent}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, maxCartDiscountPercent: event.target.value }))
              }
              disabled={!selectedCompany}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={companyEditForm.isActive}
              onChange={(event) =>
                onCompanyEditChange((current) => ({ ...current, isActive: event.target.checked }))
              }
              disabled={!selectedCompany}
            />
            Aktif firma
          </label>
          <div className="action-row">
            <button className="btn primary" type="submit" disabled={!selectedCompany || saving}>
              Guncelle
            </button>
            <button className="btn danger" type="button" disabled={!selectedCompany || saving} onClick={() => void onCompanyDelete()}>
              Sil
            </button>
          </div>
        </form>
      </article>

      <article className="card">
        <h2>Subeler ({branchesPagination.total}/{branches.length})</h2>
        <p className="muted">Aktif firma: {selectedCompanyName}</p>

        <div className="inline-row three">
          <input
            placeholder="Sube ara (ad/telefon)"
            value={branchSearch}
            onChange={(event) => setBranchSearch(event.target.value)}
          />
          <select
            value={branchStatusFilter}
            onChange={(event) =>
              setBranchStatusFilter(event.target.value as 'ACTIVE' | 'ALL' | 'PASSIVE')
            }
          >
            <option value="ALL">Tum durumlar</option>
            <option value="ACTIVE">Sadece aktif</option>
            <option value="PASSIVE">Sadece pasif</option>
          </select>
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setBranchSearch('');
              setBranchStatusFilter('ALL');
            }}
            disabled={
              branchSearch.trim().length === 0 &&
              branchStatusFilter === 'ALL'
            }
          >
            Filtreyi Temizle
          </button>
        </div>

        <ul className="list">
          {branchesPagination.visibleRows.map((branch) => (
            <li key={branch.id} className={branch.id === branchId ? 'active' : ''}>
              <button className="list-button" type="button" onClick={() => onBranchSelect(branch.id)}>
                <span>{branch.name}</span>
                <small>{branch.phone ?? 'Telefon yok'}</small>
              </button>
              <span className={`state-pill ${branch.isActive ? 'ok' : 'off'}`}>
                {branch.isActive ? 'Aktif' : 'Pasif'}
              </span>
            </li>
          ))}
        </ul>
        {branchLoading && <p className="muted">Subeler yukleniyor...</p>}
        {!branchLoading && branchErrorText && <p className="muted">{branchErrorText}</p>}
        {!branchLoading && !branchErrorText && branchesPagination.total === 0 && (
          <p className="muted">Sube kaydi bulunmadi.</p>
        )}
        <PaginationControls
          onPageChange={branchesPagination.setPage}
          page={branchesPagination.page}
          pageSize={branchesPagination.pageSize}
          total={branchesPagination.total}
        />

        <form className="form-grid compact" onSubmit={onBranchCreate}>
          <h3>Yeni Sube</h3>
          <input
            placeholder="Sube adi"
            value={branchCreateForm.name}
            onChange={(event) =>
              onNewBranchChange((current) => ({ ...current, name: event.target.value }))
            }
            required
            disabled={companyId.length === 0}
          />
          <div className="inline-row two">
            <input
              placeholder="Telefon"
              value={branchCreateForm.phone}
              onChange={(event) =>
                onNewBranchChange((current) => ({ ...current, phone: event.target.value }))
              }
              disabled={companyId.length === 0}
            />
            <input
              placeholder="Adres"
              value={branchCreateForm.address}
              onChange={(event) =>
                onNewBranchChange((current) => ({ ...current, address: event.target.value }))
              }
              disabled={companyId.length === 0}
            />
          </div>
          <button className="btn primary" type="submit" disabled={companyId.length === 0 || saving}>
            Sube Ekle
          </button>
        </form>

        <form className="form-grid compact" onSubmit={onBranchUpdate}>
          <h3>Secili Subeyi Guncelle</h3>
          <input
            placeholder="Sube adi"
            value={branchEditForm.name}
            onChange={(event) =>
              onBranchEditChange((current) => ({ ...current, name: event.target.value }))
            }
            required
            disabled={!selectedBranch}
          />
          <div className="inline-row two">
            <input
              placeholder="Telefon"
              value={branchEditForm.phone}
              onChange={(event) =>
                onBranchEditChange((current) => ({ ...current, phone: event.target.value }))
              }
              disabled={!selectedBranch}
            />
            <input
              placeholder="Adres"
              value={branchEditForm.address}
              onChange={(event) =>
                onBranchEditChange((current) => ({ ...current, address: event.target.value }))
              }
              disabled={!selectedBranch}
            />
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={branchEditForm.isActive}
              onChange={(event) =>
                onBranchEditChange((current) => ({ ...current, isActive: event.target.checked }))
              }
              disabled={!selectedBranch}
            />
            Aktif sube
          </label>
          <div className="action-row">
            <button className="btn primary" type="submit" disabled={!selectedBranch || saving}>
              Guncelle
            </button>
            <button className="btn danger" type="button" disabled={!selectedBranch || saving} onClick={() => void onBranchDelete()}>
              Sil
            </button>
          </div>
        </form>
      </article>

      <article className="card">
        <h2>Kurumsal Fatura Sablonu</h2>
        <form className="form-grid compact" onSubmit={onInvoiceTemplateSave}>
          <div className="inline-row two">
            <input placeholder="Genel baslik" value={invoiceTemplateForm.headerText} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, headerText: event.target.value }))} />
            <input placeholder="Logo URL" value={invoiceTemplateForm.logoUrl} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, logoUrl: event.target.value }))} />
          </div>
          <div className="inline-row two">
            <input placeholder="Vergi Dairesi" value={invoiceTemplateForm.taxOffice} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, taxOffice: event.target.value }))} />
            <input placeholder="Ticaret Sicil No" value={invoiceTemplateForm.tradeRegistryNo} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, tradeRegistryNo: event.target.value }))} />
          </div>
          <input placeholder="Genel dipnot" value={invoiceTemplateForm.footerNote} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, footerNote: event.target.value }))} />
          <div className="inline-row three">
            <input placeholder="Satis etiketi" value={invoiceTemplateForm.salesLabel} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, salesLabel: event.target.value }))} />
            <input placeholder="Alis etiketi" value={invoiceTemplateForm.purchaseLabel} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, purchaseLabel: event.target.value }))} />
            <input placeholder="Irsaliye etiketi" value={invoiceTemplateForm.dispatchLabel} onChange={(event) => onInvoiceTemplateFormChange((current) => ({ ...current, dispatchLabel: event.target.value }))} />
          </div>
          <button className="btn primary" type="submit" disabled={saving || !selectedCompany}>
            Sablonu Kaydet
          </button>
        </form>
      </article>
    </section>
  );
}
