import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '@marketpos/shared';

import {
  convertDispatchToInvoice,
  createPurchaseInvoice,
  createSupplier,
  createSupplierTransaction,
  deleteSupplier,
  explainRuntimeError,
  fetchPurchaseInvoices,
  fetchSuppliers,
  fetchSupplierTransactions,
  updateSupplier,
} from '../services/pos-runtime';
import type {
  CreatePurchaseInvoiceInput,
  PurchaseInvoiceRecord,
  SupplierFormInput,
  SupplierRecord,
  SupplierTransactionRecord,
} from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

type TabKey = 'invoices' | 'suppliers';
type SupplierTxType = '' | 'DEBT' | 'PAYMENT';
type InvoiceTypeFilter = '' | 'DISPATCH' | 'INVOICE' | 'ORDER';

interface SupplierFormState {
  address: string;
  email: string;
  name: string;
  phone: string;
  taxNumber: string;
}

interface InvoiceDraftItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const EMPTY_SUPPLIER_FORM: SupplierFormState = {
  address: '',
  email: '',
  name: '',
  phone: '',
  taxNumber: '',
};

function toIsoFromDateInput(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toDateInputValue(value?: string | null): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

export default function SuppliersPage(): React.ReactElement {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [activeTab, setActiveTab] = useState<TabKey>('suppliers');

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierPage, setSupplierPage] = useState(1);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [isSuppliersLoading, setSuppliersLoading] = useState(false);

  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [isSupplierFormOpen, setSupplierFormOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(EMPTY_SUPPLIER_FORM);
  const [isSupplierSaving, setSupplierSaving] = useState(false);

  const [ledgerSupplier, setLedgerSupplier] = useState<SupplierRecord | null>(null);
  const [txTypeFilter, setTxTypeFilter] = useState<SupplierTxType>('');
  const [txDateFrom, setTxDateFrom] = useState('');
  const [txDateTo, setTxDateTo] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [transactions, setTransactions] = useState<SupplierTransactionRecord[]>([]);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [isTransactionsLoading, setTransactionsLoading] = useState(false);
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txEntryType, setTxEntryType] = useState<'DEBT' | 'PAYMENT'>('PAYMENT');
  const [isTxSaving, setTxSaving] = useState(false);

  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState<InvoiceTypeFilter>('');
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoices, setInvoices] = useState<PurchaseInvoiceRecord[]>([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [isInvoicesLoading, setInvoicesLoading] = useState(false);
  const [convertingInvoiceId, setConvertingInvoiceId] = useState<string | null>(null);

  const [isInvoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [isInvoiceSaving, setInvoiceSaving] = useState(false);
  const [invoiceSupplierId, setInvoiceSupplierId] = useState('');
  const [invoiceType, setInvoiceType] = useState<'DISPATCH' | 'INVOICE' | 'ORDER'>('INVOICE');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dispatchNo, setDispatchNo] = useState('');
  const [documentDate, setDocumentDate] = useState(toDateInputValue(new Date().toISOString()));
  const [dueDate, setDueDate] = useState(toDateInputValue(new Date().toISOString()));
  const [invoiceNote, setInvoiceNote] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceDraftItem[]>([]);

  const branchId = activeSession?.user.branchId ?? null;

  const loadSuppliers = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setSuppliersLoading(true);
    try {
      const result = await fetchSuppliers(activeSession, {
        limit: 20,
        page: supplierPage,
        search: supplierSearch,
      });
      setSuppliers(result.data);
      setSupplierTotal(result.pagination.total);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setSuppliersLoading(false);
    }
  };

  const loadTransactions = async (): Promise<void> => {
    if (!activeSession || !ledgerSupplier) {
      return;
    }
    setTransactionsLoading(true);
    try {
      const result = await fetchSupplierTransactions(activeSession, ledgerSupplier.id, {
        dateFrom: txDateFrom ? new Date(`${txDateFrom}T00:00:00.000Z`).toISOString() : undefined,
        dateTo: txDateTo ? new Date(`${txDateTo}T23:59:59.999Z`).toISOString() : undefined,
        limit: 20,
        page: txPage,
        type: txTypeFilter || undefined,
      });
      setTransactions(result.data);
      setTransactionTotal(result.pagination.total);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setTransactionsLoading(false);
    }
  };

  const loadInvoices = async (): Promise<void> => {
    if (!activeSession || !branchId) {
      return;
    }
    setInvoicesLoading(true);
    try {
      const result = await fetchPurchaseInvoices(activeSession, {
        branchId,
        documentType: invoiceTypeFilter || undefined,
        limit: 20,
        page: invoicePage,
      });
      setInvoices(result.data);
      setInvoiceTotal(result.pagination.total);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setInvoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadSuppliers();
  }, [activeSession?.sessionId, supplierPage, supplierSearch]);

  useEffect(() => {
    if (ledgerSupplier) {
      void loadTransactions();
    }
  }, [activeSession?.sessionId, ledgerSupplier?.id, txPage, txTypeFilter, txDateFrom, txDateTo]);

  useEffect(() => {
    if (activeTab === 'invoices') {
      void loadInvoices();
    }
  }, [activeSession?.sessionId, activeTab, branchId, invoicePage, invoiceTypeFilter]);

  const handleOpenNewSupplier = (): void => {
    setEditingSupplier(null);
    setSupplierForm(EMPTY_SUPPLIER_FORM);
    setSupplierFormOpen(true);
  };

  const handleOpenEditSupplier = (supplier: SupplierRecord): void => {
    setEditingSupplier(supplier);
    setSupplierForm({
      address: supplier.address ?? '',
      email: supplier.email ?? '',
      name: supplier.name,
      phone: supplier.phone ?? '',
      taxNumber: supplier.taxNumber ?? '',
    });
    setSupplierFormOpen(true);
  };

  const handleSaveSupplier = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    if (!supplierForm.name.trim()) {
      toast.error('Tedarikci adi zorunludur.');
      return;
    }
    setSupplierSaving(true);
    try {
      const payload: SupplierFormInput = {
        address: supplierForm.address || undefined,
        email: supplierForm.email || undefined,
        name: supplierForm.name.trim(),
        phone: supplierForm.phone || undefined,
        taxNumber: supplierForm.taxNumber || undefined,
      };
      if (editingSupplier) {
        await updateSupplier(activeSession, editingSupplier.id, payload);
        toast.success(
          activeSession.isOnline && activeSession.accessToken
            ? 'Tedarikci guncellendi.'
            : 'Tedarikci guncellemesi offline kuyruga alindi.',
        );
      } else {
        await createSupplier(activeSession, payload);
        toast.success(
          activeSession.isOnline && activeSession.accessToken
            ? 'Tedarikci olusturuldu.'
            : 'Tedarikci olusturma offline kuyruga alindi.',
        );
      }
      setSupplierFormOpen(false);
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setSupplierSaving(false);
    }
  };

  const handleDeleteSupplier = async (supplier: SupplierRecord): Promise<void> => {
    if (!activeSession) {
      return;
    }
    if (!window.confirm(`${supplier.name} silinsin mi?`)) {
      return;
    }
    try {
      await deleteSupplier(activeSession, supplier.id);
      toast.success(
        activeSession.isOnline && activeSession.accessToken
          ? 'Tedarikci silindi.'
          : 'Tedarikci silme offline kuyruga alindi.',
      );
      await loadSuppliers();
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    }
  };

  const handleCreateTransaction = async (): Promise<void> => {
    if (!activeSession || !ledgerSupplier) {
      return;
    }
    const amount = Number.parseFloat(txAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Gecerli bir tutar girin.');
      return;
    }
    setTxSaving(true);
    try {
      await createSupplierTransaction(activeSession, ledgerSupplier.id, {
        amount,
        description: txDescription.trim() || undefined,
        type: txEntryType,
      });
      setTxAmount('');
      setTxDescription('');
      toast.success(
        activeSession.isOnline && activeSession.accessToken
          ? 'Hareket kaydedildi.'
          : 'Hareket offline kuyruga alindi.',
      );
      await Promise.all([loadTransactions(), loadSuppliers()]);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setTxSaving(false);
    }
  };

  const resetInvoiceForm = (): void => {
    setInvoiceSupplierId('');
    setInvoiceType('INVOICE');
    setInvoiceNo('');
    setDispatchNo('');
    setDocumentDate(toDateInputValue(new Date().toISOString()));
    setDueDate(toDateInputValue(new Date().toISOString()));
    setInvoiceNote('');
    setInvoiceItems([]);
  };

  const handleAddInvoiceItem = (): void => {
    const firstProduct = state.products[0];
    if (!firstProduct) {
      toast.error('Kalem eklemek icin urun bulunamadi.');
      return;
    }
    setInvoiceItems((current) => [
      ...current,
      {
        productId: firstProduct.id,
        quantity: 1,
        unitPrice: Math.max(0, firstProduct.salePrice ?? 0),
        vatRate: Math.max(0, Number(firstProduct.vatRate ?? 10)),
      },
    ]);
  };

  const handleUpdateInvoiceItem = (
    index: number,
    patch: Partial<InvoiceDraftItem>,
  ): void => {
    setInvoiceItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const handleRemoveInvoiceItem = (index: number): void => {
    setInvoiceItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const invoiceSubtotal = invoiceItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const handleCreateInvoice = async (): Promise<void> => {
    if (!activeSession || !branchId) {
      return;
    }
    if (!invoiceSupplierId) {
      toast.error('Tedarikci secin.');
      return;
    }
    if (!invoiceNo.trim()) {
      toast.error('Belge numarasi zorunludur.');
      return;
    }
    if (invoiceType === 'DISPATCH' && !dispatchNo.trim()) {
      toast.error('Irsaliye tipinde dispatch no zorunludur.');
      return;
    }
    if (invoiceItems.length === 0) {
      toast.error('En az bir kalem ekleyin.');
      return;
    }

    const payload: CreatePurchaseInvoiceInput = {
      branchId,
      dispatchNumber: invoiceType === 'DISPATCH' ? dispatchNo.trim() : undefined,
      documentDate: toIsoFromDateInput(documentDate),
      documentType: invoiceType,
      dueDate: toIsoFromDateInput(dueDate),
      invoiceNumber: invoiceNo.trim(),
      items: invoiceItems.map((item) => ({
        discount: 0,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
      })),
      note: invoiceNote.trim() || undefined,
      supplierId: invoiceSupplierId,
      totalDiscount: 0,
    };

    setInvoiceSaving(true);
    try {
      await createPurchaseInvoice(activeSession, payload);
      toast.success(
        activeSession.isOnline && activeSession.accessToken
          ? 'Alis belgesi kaydedildi.'
          : 'Alis belgesi offline kuyruga alindi.',
      );
      setInvoiceFormOpen(false);
      resetInvoiceForm();
      await Promise.all([loadInvoices(), loadSuppliers()]);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handleConvertDispatch = async (invoice: PurchaseInvoiceRecord): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setConvertingInvoiceId(invoice.id);
    try {
      await convertDispatchToInvoice(activeSession, invoice.id, {
        documentDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
        invoiceNumber: `INV-${Date.now()}`,
      });
      toast.success(
        activeSession.isOnline && activeSession.accessToken
          ? 'Irsaliye faturaya donusturuldu.'
          : 'Irsaliye donusumu offline kuyruga alindi.',
      );
      await Promise.all([loadInvoices(), loadSuppliers()]);
    } catch (error: unknown) {
      toast.error(explainRuntimeError(error));
    } finally {
      setConvertingInvoiceId(null);
    }
  };

  const totalSupplierPages = Math.max(1, Math.ceil(supplierTotal / 20));
  const totalTxPages = Math.max(1, Math.ceil(transactionTotal / 20));
  const totalInvoicePages = Math.max(1, Math.ceil(invoiceTotal / 20));

  return (
    <div className="page-shell">
      <div className="header" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="header-title" style={{ color: 'var(--text-primary)' }}>Tedarikci & Alis Belgeleri</h2>
        <div className="header-info" style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className={`btn btn-sm ${activeTab === 'suppliers' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('suppliers')}
            type="button"
          >
            Tedarikciler
          </button>
          <button
            className={`btn btn-sm ${activeTab === 'invoices' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('invoices')}
            type="button"
          >
            Alis Belgeleri
          </button>
        </div>
      </div>

      <div className="stock-page stock-page-neo">
        {activeTab === 'suppliers' && (
          <>
            {ledgerSupplier ? (
              <div className="stock-main-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="card stock-section">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 className="card-title stock-section-title">
                      {ledgerSupplier.name} - Hareketler
                    </h3>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setLedgerSupplier(null);
                        setTxPage(1);
                      }}
                      type="button"
                    >
                      Listeye Don
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: '1rem' }}>
                    <select className="input" onChange={(event) => { setTxTypeFilter(event.target.value as SupplierTxType); setTxPage(1); }} value={txTypeFilter}>
                      <option value="">Tum Tipler</option>
                      <option value="DEBT">Borc</option>
                      <option value="PAYMENT">Odeme</option>
                    </select>
                    <input className="input" type="date" value={txDateFrom} onChange={(event) => { setTxDateFrom(event.target.value); setTxPage(1); }} />
                    <input className="input" type="date" value={txDateTo} onChange={(event) => { setTxDateTo(event.target.value); setTxPage(1); }} />
                    <div style={{ alignSelf: 'center', color: 'var(--text-secondary)', textAlign: 'right' }}>
                      Bakiye: <strong>{formatCurrency(ledgerSupplier.balance)}</strong>
                    </div>
                  </div>

                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '1rem', padding: '0.75rem' }}>
                    <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                      <select className="input" onChange={(event) => setTxEntryType(event.target.value as 'DEBT' | 'PAYMENT')} value={txEntryType}>
                        <option value="PAYMENT">Odeme</option>
                        <option value="DEBT">Ek Borc</option>
                      </select>
                      <input className="input" type="number" min="0.01" step="0.01" placeholder="Tutar" value={txAmount} onChange={(event) => setTxAmount(event.target.value)} />
                      <input className="input" type="text" placeholder="Aciklama" value={txDescription} onChange={(event) => setTxDescription(event.target.value)} />
                      <button className="btn btn-primary" disabled={isTxSaving} onClick={() => void handleCreateTransaction()} type="button">
                        {isTxSaving ? 'Kaydediliyor...' : 'Hareket Kaydet'}
                      </button>
                    </div>
                  </div>

                  <div className="table-wrapper stock-table-wrapper">
                    <table className="table stock-table">
                      <thead>
                        <tr>
                          <th>Tarih</th>
                          <th>Tip</th>
                          <th>Belge</th>
                          <th>Aciklama</th>
                          <th style={{ textAlign: 'right' }}>Tutar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isTransactionsLoading ? (
                          <tr><td colSpan={5} className="stock-empty-cell">Yukleniyor...</td></tr>
                        ) : transactions.length === 0 ? (
                          <tr><td colSpan={5} className="stock-empty-cell">Hareket yok.</td></tr>
                        ) : (
                          transactions.map((row) => (
                            <tr key={row.id}>
                              <td>{new Date(row.createdAt).toLocaleString('tr-TR')}</td>
                              <td>{row.type === 'PAYMENT' ? 'Odeme' : 'Borc'}</td>
                              <td>{row.invoice ? `${row.invoice.invoiceNumber} (${row.invoice.documentType})` : '-'}</td>
                              <td>{row.description || '-'}</td>
                              <td style={{ color: row.type === 'PAYMENT' ? '#ef4444' : '#10b981', textAlign: 'right' }}>
                                {(row.type === 'PAYMENT' ? '-' : '+') + formatCurrency(row.amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className="btn btn-ghost btn-sm" disabled={txPage <= 1} onClick={() => setTxPage((current) => Math.max(1, current - 1))} type="button">Geri</button>
                    <span style={{ alignSelf: 'center' }}>{txPage} / {totalTxPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={txPage >= totalTxPages} onClick={() => setTxPage((current) => Math.min(totalTxPages, current + 1))} type="button">Ileri</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="stock-main-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="card stock-section">
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <input
                      className="input"
                      style={{ maxWidth: '320px' }}
                      type="text"
                      placeholder="Tedarikci ara..."
                      value={supplierSearch}
                      onChange={(event) => {
                        setSupplierSearch(event.target.value);
                        setSupplierPage(1);
                      }}
                    />
                    <button className="btn btn-primary" onClick={handleOpenNewSupplier} type="button">
                      Yeni Tedarikci
                    </button>
                  </div>

                  <div className="table-wrapper stock-table-wrapper">
                    <table className="table stock-table">
                      <thead>
                        <tr>
                          <th>Ad</th>
                          <th>Telefon</th>
                          <th>Vergi No</th>
                          <th style={{ textAlign: 'right' }}>Bakiye</th>
                          <th style={{ textAlign: 'right' }}>Islem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isSuppliersLoading ? (
                          <tr><td colSpan={5} className="stock-empty-cell">Yukleniyor...</td></tr>
                        ) : suppliers.length === 0 ? (
                          <tr><td colSpan={5} className="stock-empty-cell">Tedarikci yok.</td></tr>
                        ) : (
                          suppliers.map((supplier) => (
                            <tr key={supplier.id}>
                              <td>{supplier.name}</td>
                              <td>{supplier.phone || '-'}</td>
                              <td>{supplier.taxNumber || '-'}</td>
                              <td style={{ textAlign: 'right' }}>{formatCurrency(supplier.balance)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setLedgerSupplier(supplier); setTxPage(1); }} type="button">Hareket</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEditSupplier(supplier)} type="button">Duzenle</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => void handleDeleteSupplier(supplier)} type="button">Sil</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button className="btn btn-ghost btn-sm" disabled={supplierPage <= 1} onClick={() => setSupplierPage((current) => Math.max(1, current - 1))} type="button">Geri</button>
                    <span style={{ alignSelf: 'center' }}>{supplierPage} / {totalSupplierPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={supplierPage >= totalSupplierPages} onClick={() => setSupplierPage((current) => Math.min(totalSupplierPages, current + 1))} type="button">Ileri</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'invoices' && (
          <div className="stock-main-grid" style={{ gridTemplateColumns: '1fr' }}>
            <div className="card stock-section">
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select
                    className="input"
                    value={invoiceTypeFilter}
                    onChange={(event) => {
                      setInvoiceTypeFilter(event.target.value as InvoiceTypeFilter);
                      setInvoicePage(1);
                    }}
                  >
                    <option value="">Tum Belgeler</option>
                    <option value="ORDER">Siparis</option>
                    <option value="DISPATCH">Irsaliye</option>
                    <option value="INVOICE">Fatura</option>
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    resetInvoiceForm();
                    setInvoiceFormOpen(true);
                  }}
                  type="button"
                >
                  Yeni Belge
                </button>
              </div>

              <div className="table-wrapper stock-table-wrapper">
                <table className="table stock-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Tip</th>
                      <th>Belge No</th>
                      <th>Tedarikci</th>
                      <th style={{ textAlign: 'right' }}>Toplam</th>
                      <th style={{ textAlign: 'right' }}>Durum</th>
                      <th style={{ textAlign: 'right' }}>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isInvoicesLoading ? (
                      <tr><td colSpan={7} className="stock-empty-cell">Yukleniyor...</td></tr>
                    ) : invoices.length === 0 ? (
                      <tr><td colSpan={7} className="stock-empty-cell">Belge bulunamadi.</td></tr>
                    ) : (
                      invoices.map((invoice) => (
                        <tr key={invoice.id}>
                          <td>{invoice.documentDate ? new Date(invoice.documentDate).toLocaleDateString('tr-TR') : '-'}</td>
                          <td>{invoice.documentType === 'ORDER' ? 'Siparis' : invoice.documentType === 'DISPATCH' ? 'Irsaliye' : 'Fatura'}</td>
                          <td>{invoice.documentType === 'DISPATCH' && invoice.dispatchNumber ? invoice.dispatchNumber : invoice.invoiceNumber}</td>
                          <td>{invoice.supplierName || invoice.supplierId}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(invoice.grandTotal)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {invoice.documentType === 'DISPATCH' && invoice.convertedToInvoiceId ? 'Faturalasti' : invoice.status}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {invoice.documentType === 'DISPATCH' && !invoice.convertedToInvoiceId && (
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={convertingInvoiceId === invoice.id}
                                onClick={() => void handleConvertDispatch(invoice)}
                                type="button"
                              >
                                {convertingInvoiceId === invoice.id ? 'Donusuyor...' : 'Faturaya Donustur'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn btn-ghost btn-sm" disabled={invoicePage <= 1} onClick={() => setInvoicePage((current) => Math.max(1, current - 1))} type="button">Geri</button>
                <span style={{ alignSelf: 'center' }}>{invoicePage} / {totalInvoicePages}</span>
                <button className="btn btn-ghost btn-sm" disabled={invoicePage >= totalInvoicePages} onClick={() => setInvoicePage((current) => Math.min(totalInvoicePages, current + 1))} type="button">Ileri</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isSupplierFormOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '560px' }}>
            <h3>{editingSupplier ? 'Tedarikci Duzenle' : 'Yeni Tedarikci'}</h3>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: '1fr 1fr' }}>
              <input className="input" placeholder="Ad" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} />
              <input className="input" placeholder="Telefon" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} />
              <input className="input" placeholder="E-posta" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} />
              <input className="input" placeholder="Vergi No" value={supplierForm.taxNumber} onChange={(event) => setSupplierForm((current) => ({ ...current, taxNumber: event.target.value }))} />
              <input className="input" placeholder="Adres" value={supplierForm.address} onChange={(event) => setSupplierForm((current) => ({ ...current, address: event.target.value }))} style={{ gridColumn: '1 / span 2' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => setSupplierFormOpen(false)} type="button">Iptal</button>
              <button className="btn btn-primary" disabled={isSupplierSaving} onClick={() => void handleSaveSupplier()} type="button">
                {isSupplierSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isInvoiceFormOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '920px' }}>
            <h3>Yeni Alis Belgesi</h3>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <select className="input" value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as 'DISPATCH' | 'INVOICE' | 'ORDER')}>
                <option value="INVOICE">Fatura</option>
                <option value="DISPATCH">Irsaliye</option>
                <option value="ORDER">Siparis</option>
              </select>
              <select className="input" value={invoiceSupplierId} onChange={(event) => setInvoiceSupplierId(event.target.value)}>
                <option value="">Tedarikci Secin</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
              <input className="input" placeholder="Belge No" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
              <input className="input" placeholder="Irsaliye No" value={dispatchNo} onChange={(event) => setDispatchNo(event.target.value)} disabled={invoiceType !== 'DISPATCH'} />
              <input className="input" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
              <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              <input className="input" placeholder="Not" value={invoiceNote} onChange={(event) => setInvoiceNote(event.target.value)} style={{ gridColumn: '1 / span 2' }} />
            </div>

            <div style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong>Kalemler</strong>
                <button className="btn btn-ghost btn-sm" onClick={handleAddInvoiceItem} type="button">Kalem Ekle</button>
              </div>
              <div className="table-wrapper stock-table-wrapper" style={{ maxHeight: '260px' }}>
                <table className="table stock-table">
                  <thead>
                    <tr>
                      <th>Urun</th>
                      <th>Miktar</th>
                      <th>Birim</th>
                      <th>KDV %</th>
                      <th style={{ textAlign: 'right' }}>Toplam</th>
                      <th style={{ textAlign: 'right' }}>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.length === 0 ? (
                      <tr><td colSpan={6} className="stock-empty-cell">Kalem yok.</td></tr>
                    ) : (
                      invoiceItems.map((item, index) => (
                        <tr key={`item-${index}`}>
                          <td>
                            <select className="input" value={item.productId} onChange={(event) => handleUpdateInvoiceItem(index, { productId: event.target.value })}>
                              {state.products.map((product) => (
                                <option key={product.id} value={product.id}>{product.name}</option>
                              ))}
                            </select>
                          </td>
                          <td><input className="input" type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => handleUpdateInvoiceItem(index, { quantity: Number.parseFloat(event.target.value) || 0 })} /></td>
                          <td><input className="input" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => handleUpdateInvoiceItem(index, { unitPrice: Number.parseFloat(event.target.value) || 0 })} /></td>
                          <td><input className="input" type="number" min="0" step="1" value={item.vatRate} onChange={(event) => handleUpdateInvoiceItem(index, { vatRate: Number.parseInt(event.target.value, 10) || 0 })} /></td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(item.quantity * item.unitPrice)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveInvoiceItem(index)} type="button">Kaldir</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '0.75rem', textAlign: 'right' }}>
                Ara Toplam: <strong>{formatCurrency(invoiceSubtotal)}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-ghost" onClick={() => setInvoiceFormOpen(false)} type="button">Iptal</button>
              <button className="btn btn-primary" disabled={isInvoiceSaving} onClick={() => void handleCreateInvoice()} type="button">
                {isInvoiceSaving ? 'Kaydediliyor...' : 'Belgeyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
