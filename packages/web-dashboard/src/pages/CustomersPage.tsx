import React, { useState } from 'react';

import { PaginationControls } from '../components/PaginationControls';
import { useClientPagination } from '../hooks/use-client-pagination';
import type { Customer, CustomerTransaction } from '../domain/customers/api';

interface CustomersPageProps {
  companyId: string;
  customers: Customer[];
  customersLoading: boolean;
  customersError: string | null;
  selectedCustomerId: string;
  onSelectCustomer: (id: string) => void;
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  /* create */
  customerForm: { name: string; phone: string; email: string; address: string; taxNumber: string };
  onCustomerFormChange: (form: { name: string; phone: string; email: string; address: string; taxNumber: string }) => void;
  onCreateCustomer: () => void;
  isCreating: boolean;
  /* edit */
  customerEditForm: { name: string; phone: string; email: string; address: string; taxNumber: string };
  onCustomerEditFormChange: (form: { name: string; phone: string; email: string; address: string; taxNumber: string }) => void;
  onUpdateCustomer: () => void;
  isUpdating: boolean;
  /* delete */
  onDeleteCustomer: () => void;
  isDeleting: boolean;
  /* transactions */
  transactions: CustomerTransaction[];
  transactionsLoading: boolean;
  transactionForm: { type: 'DEBT' | 'PAYMENT'; amount: string; description: string };
  onTransactionFormChange: (form: { type: 'DEBT' | 'PAYMENT'; amount: string; description: string }) => void;
  onCreateTransaction: () => void;
  isCreatingTransaction: boolean;
  /* formatting */
  toMoney: (value: number) => string;
  toDateTime: (value?: string | null) => string;
}

export function CustomersPage({
  customers,
  customersLoading,
  customersError,
  selectedCustomerId,
  onSelectCustomer,
  customerSearch,
  onCustomerSearchChange,
  customerForm,
  onCustomerFormChange,
  onCreateCustomer,
  isCreating,
  customerEditForm,
  onCustomerEditFormChange,
  onUpdateCustomer,
  isUpdating,
  onDeleteCustomer,
  isDeleting,
  transactions,
  transactionsLoading,
  transactionForm,
  onTransactionFormChange,
  onCreateTransaction,
  isCreatingTransaction,
  toMoney,
  toDateTime,
}: CustomersPageProps): React.ReactElement {
  const [activePanel, setActivePanel] = useState<'detail' | 'create'>('detail');
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null;
  const customersPagination = useClientPagination(customers, { pageSize: 25 });
  const transactionsPagination = useClientPagination(transactions, { pageSize: 15 });

  const totalDebt = transactions.filter((t) => t.type === 'DEBT').reduce((s, t) => s + t.amount, 0);
  const totalPayment = transactions.filter((t) => t.type === 'PAYMENT').reduce((s, t) => s + t.amount, 0);

  return (
    <section className="sub-layout-grid">
      {/* Left — List */}
      <div>
        <article className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Müşteriler ({customers.length})</div>
              <div className="card-sub">Müşteri kartları ve cari hesaplar</div>
            </div>
            <div className="inline-row-items">
              <button
                type="button"
                className={`btn tab ${activePanel === 'create' ? 'active' : ''}`}
                onClick={() => setActivePanel(activePanel === 'create' ? 'detail' : 'create')}
              >
                + Yeni Müşteri
              </button>
            </div>
          </div>

          <div className="filter-bar">
            <div className="filter-input">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="7" cy="7" r="5"/>
                <path d="M11 11l3.5 3.5" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="İsim, telefon, e-posta veya vergi no ile ara..."
                value={customerSearch}
                onChange={(e) => onCustomerSearchChange(e.target.value)}
              />
            </div>
          </div>

          {customersError && <div className="banner error">{customersError}</div>}
          {customersLoading && <p className="muted">Yükleniyor...</p>}

          <div className="table-wrap tall">
            <table>
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Telefon</th>
                  <th>Bakiye</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {customersPagination.visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '2rem' }}>
                      Müşteri bulunamadı
                    </td>
                  </tr>
                ) : (
                  customersPagination.visibleRows.map((customer: Customer) => (
                    <tr
                      key={customer.id}
                      className={customer.id === selectedCustomerId ? 'row-selected' : ''}
                      onClick={() => { onSelectCustomer(customer.id); setActivePanel('detail'); }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <div className="stacked-row">
                          <strong style={{ color: 'var(--fg-1)' }}>{customer.name}</strong>
                          {customer.email && <small>{customer.email}</small>}
                        </div>
                      </td>
                      <td>{customer.phone ?? '—'}</td>
                      <td>
                        <span style={{ color: customer.balance > 0 ? 'var(--red)' : customer.balance < 0 ? 'var(--emerald)' : 'var(--fg-3)' }}>
                          {toMoney(customer.balance)}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${customer.isActive ? 'green' : 'red'}`}>
                          {customer.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={customersPagination.page}
            pageSize={customersPagination.pageSize}
            onPageChange={customersPagination.setPage}
            total={customers.length}
          />
        </article>
      </div>

      {/* Right — Detail / Create */}
      <div>
        {activePanel === 'create' ? (
          <article className="card">
            <h2>Yeni Müşteri</h2>
            <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onCreateCustomer(); }}>
              <label>
                Müşteri Adı *
                <input
                  type="text"
                  value={customerForm.name}
                  onChange={(e) => onCustomerFormChange({ ...customerForm, name: e.target.value })}
                  required
                />
              </label>
              <div className="inline-row">
                <label>
                  Telefon
                  <input
                    type="text"
                    value={customerForm.phone}
                    onChange={(e) => onCustomerFormChange({ ...customerForm, phone: e.target.value })}
                  />
                </label>
                <label>
                  E-posta
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => onCustomerFormChange({ ...customerForm, email: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Adres
                <input
                  type="text"
                  value={customerForm.address}
                  onChange={(e) => onCustomerFormChange({ ...customerForm, address: e.target.value })}
                />
              </label>
              <label>
                Vergi No
                <input
                  type="text"
                  value={customerForm.taxNumber}
                  onChange={(e) => onCustomerFormChange({ ...customerForm, taxNumber: e.target.value })}
                />
              </label>
              <button type="submit" className="btn primary" disabled={isCreating || customerForm.name.trim().length === 0}>
                {isCreating ? 'Oluşturuluyor...' : 'Müşteri Ekle'}
              </button>
            </form>
          </article>
        ) : selectedCustomer ? (
          <>
            {/* Customer info card */}
            <article className="card">
              <h2>{selectedCustomer.name}</h2>
              <div className="metric-grid" style={{ marginTop: '12px' }}>
                <div className={`metric-card ${selectedCustomer.balance > 0 ? '' : 'success'}`}>
                  <span>Bakiye</span>
                  <strong>{toMoney(selectedCustomer.balance)}</strong>
                </div>
                <div className="metric-card">
                  <span>Fiyat Grubu</span>
                  <strong style={{ fontSize: '14px' }}>{selectedCustomer.priceTier === 'WHOLESALE' ? 'Toptan' : 'Perakende'}</strong>
                </div>
              </div>

              <form className="form-grid" style={{ marginTop: '14px' }} onSubmit={(e) => { e.preventDefault(); onUpdateCustomer(); }}>
                <label>
                  Müşteri Adı
                  <input
                    type="text"
                    value={customerEditForm.name}
                    onChange={(e) => onCustomerEditFormChange({ ...customerEditForm, name: e.target.value })}
                  />
                </label>
                <div className="inline-row">
                  <label>
                    Telefon
                    <input
                      type="text"
                      value={customerEditForm.phone}
                      onChange={(e) => onCustomerEditFormChange({ ...customerEditForm, phone: e.target.value })}
                    />
                  </label>
                  <label>
                    E-posta
                    <input
                      type="email"
                      value={customerEditForm.email}
                      onChange={(e) => onCustomerEditFormChange({ ...customerEditForm, email: e.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Adres
                  <input
                    type="text"
                    value={customerEditForm.address}
                    onChange={(e) => onCustomerEditFormChange({ ...customerEditForm, address: e.target.value })}
                  />
                </label>
                <label>
                  Vergi No
                  <input
                    type="text"
                    value={customerEditForm.taxNumber}
                    onChange={(e) => onCustomerEditFormChange({ ...customerEditForm, taxNumber: e.target.value })}
                  />
                </label>
                <div className="action-row">
                  <button type="submit" className="btn primary" disabled={isUpdating}>
                    {isUpdating ? 'Kaydediliyor...' : 'Güncelle'}
                  </button>
                  <button type="button" className="btn danger" disabled={isDeleting} onClick={onDeleteCustomer}>
                    {isDeleting ? 'Siliniyor...' : 'Sil'}
                  </button>
                </div>
              </form>
            </article>

            {/* Transactions */}
            <article className="card" style={{ marginTop: '14px' }}>
              <h2>İşlem Geçmişi</h2>
              <div className="metric-grid" style={{ marginTop: '8px', marginBottom: '10px' }}>
                <div className="metric-card">
                  <span>Toplam Borç</span>
                  <strong style={{ color: 'var(--red)' }}>{toMoney(totalDebt)}</strong>
                </div>
                <div className="metric-card">
                  <span>Toplam Ödeme</span>
                  <strong style={{ color: 'var(--emerald)' }}>{toMoney(totalPayment)}</strong>
                </div>
              </div>

              <form className="form-grid compact" onSubmit={(e) => { e.preventDefault(); onCreateTransaction(); }}>
                <div className="inline-row three">
                  <label>
                    Tip
                    <select
                      value={transactionForm.type}
                      onChange={(e) => onTransactionFormChange({ ...transactionForm, type: e.target.value as 'DEBT' | 'PAYMENT' })}
                    >
                      <option value="PAYMENT">Ödeme (Tahsilat)</option>
                      <option value="DEBT">Borç</option>
                    </select>
                  </label>
                  <label>
                    Tutar
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => onTransactionFormChange({ ...transactionForm, amount: e.target.value })}
                    />
                  </label>
                  <label>
                    Açıklama
                    <input
                      type="text"
                      value={transactionForm.description}
                      onChange={(e) => onTransactionFormChange({ ...transactionForm, description: e.target.value })}
                      placeholder="Opsiyonel"
                    />
                  </label>
                </div>
                <button type="submit" className="btn primary" disabled={isCreatingTransaction || Number(transactionForm.amount) <= 0}>
                  {isCreatingTransaction ? 'Kaydediliyor...' : 'İşlem Ekle'}
                </button>
              </form>

              {transactionsLoading && <p className="muted" style={{ marginTop: '8px' }}>Yükleniyor...</p>}
              <div className="table-wrap" style={{ marginTop: '6px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Tip</th>
                      <th>Tutar</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionsPagination.visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>
                          İşlem geçmişi boş
                        </td>
                      </tr>
                    ) : (
                      transactionsPagination.visibleRows.map((tx: CustomerTransaction) => (
                        <tr key={tx.id}>
                          <td>{toDateTime(tx.createdAt)}</td>
                          <td>
                            <span className={`pill ${tx.type === 'PAYMENT' ? 'green' : 'red'}`}>
                              {tx.type === 'PAYMENT' ? 'Ödeme' : 'Borç'}
                            </span>
                          </td>
                          <td>{toMoney(tx.amount)}</td>
                          <td>{tx.description ?? '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <PaginationControls
                page={transactionsPagination.page}
                pageSize={transactionsPagination.pageSize}
                onPageChange={transactionsPagination.setPage}
                total={transactions.length}
              />
            </article>
          </>
        ) : (
          <article className="card">
            <div className="empty-state">
              <div className="empty-state-title">Müşteri seçin</div>
              <div className="empty-state-sub">Sol listeden bir müşteri seçerek detaylarını görüntüleyin</div>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}
