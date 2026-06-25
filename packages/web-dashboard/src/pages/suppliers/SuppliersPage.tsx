import React, { useEffect, useMemo, useState } from 'react';

import type { Supplier, SupplierForm } from '../../domain/suppliers/api';
import {
  useSupplierMutations,
  useSupplierTransactionsQuery,
  useSuppliersQuery,
} from '../../domain/suppliers/hooks';
import { PurchaseInvoicesPage } from '../invoices/PurchaseInvoicesPage';
import { SupplierFormPage } from './SupplierFormPage';
import { SupplierLedgerPage } from './SupplierLedgerPage';
import { SupplierListPage } from './SupplierListPage';

interface SuppliersPageProps {
  branchId: string;
  companyId: string;
  products: any[];
  toMoney: (value: number) => string;
}

export function SuppliersPage({ branchId, companyId, products, toMoney }: SuppliersPageProps): React.ReactElement {
  const [activeSubTab, setActiveSubTab] = useState<'invoices' | 'suppliers'>('suppliers');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerFilters, setLedgerFilters] = useState<{
    dateFrom: string;
    dateTo: string;
    type: '' | 'DEBT' | 'PAYMENT';
  }>({
    dateFrom: '',
    dateTo: '',
    type: '',
  });
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSuppliersQuery(companyId, page);
  const ledgerQueryFilters = useMemo(
    () => ({
      dateFrom: ledgerFilters.dateFrom
        ? new Date(`${ledgerFilters.dateFrom}T00:00:00.000Z`).toISOString()
        : undefined,
      dateTo: ledgerFilters.dateTo
        ? new Date(`${ledgerFilters.dateTo}T23:59:59.999Z`).toISOString()
        : undefined,
      limit: 50,
      page: ledgerPage,
      type: ledgerFilters.type || undefined,
    }),
    [ledgerFilters.dateFrom, ledgerFilters.dateTo, ledgerFilters.type, ledgerPage],
  );
  const { data: transactions, isLoading: isTransactionsLoading } = useSupplierTransactionsQuery(
    ledgerSupplier?.id ?? '',
    ledgerQueryFilters,
  );
  const {
    createSupplier,
    createSupplierTransaction,
    deleteSupplier,
    isCreating,
    isCreatingTransaction,
    isUpdating,
    updateSupplier,
  } = useSupplierMutations();

  useEffect(() => {
    if (!ledgerSupplier) {
      return;
    }
    const refreshed = data?.data.find((supplier) => supplier.id === ledgerSupplier.id) ?? null;
    if (
      refreshed &&
      (refreshed.balance !== ledgerSupplier.balance ||
        refreshed.name !== ledgerSupplier.name ||
        refreshed.updatedAt !== ledgerSupplier.updatedAt)
    ) {
      setLedgerSupplier(refreshed);
    }
  }, [data?.data, ledgerSupplier]);

  const handleAddClick = (): void => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleEditClick = (supplier: Supplier): void => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleLedgerClick = (supplier: Supplier): void => {
    setErrorText(null);
    setLedgerPage(1);
    setLedgerFilters({
      dateFrom: '',
      dateTo: '',
      type: '',
    });
    setLedgerSupplier(supplier);
  };

  const handleDeleteClick = async (supplier: Supplier): Promise<void> => {
    try {
      setErrorText(null);
      await deleteSupplier(supplier.id);
    } catch {
      setErrorText('Tedarikçi silinirken hata oluştu.');
    }
  };

  const handleSave = async (form: SupplierForm): Promise<void> => {
    try {
      setErrorText(null);
      if (editingSupplier) {
        await updateSupplier({ id: editingSupplier.id, payload: form });
      } else {
        await createSupplier({ companyId, payload: form });
      }
      setIsFormOpen(false);
    } catch {
      setErrorText('Tedarikçi kaydedilirken hata oluştu.');
    }
  };

  const handleCreateTransaction = async (payload: {
    amount: number;
    description?: string;
    type: 'DEBT' | 'PAYMENT';
  }): Promise<void> => {
    if (!ledgerSupplier) {
      return;
    }
    try {
      setErrorText(null);
      await createSupplierTransaction({
        payload,
        supplierId: ledgerSupplier.id,
      });
    } catch {
      setErrorText('Tedarikçi hareketi kaydedilemedi.');
    }
  };

  if (isFormOpen) {
    return (
      <SupplierFormPage
        initialData={
          editingSupplier
            ? {
                address: editingSupplier.address ?? '',
                email: editingSupplier.email ?? '',
                name: editingSupplier.name,
                phone: editingSupplier.phone ?? '',
                taxNumber: editingSupplier.taxNumber ?? '',
              }
            : null
        }
        onCancel={() => setIsFormOpen(false)}
        onSave={handleSave}
        saving={isCreating || isUpdating}
      />
    );
  }

  if (ledgerSupplier) {
    return (
      <SupplierLedgerPage
        creating={isCreatingTransaction}
        isLoading={isTransactionsLoading}
        ledgerFilters={ledgerFilters}
        onBack={() => setLedgerSupplier(null)}
        onChangeLedgerFilters={(next) => {
          setLedgerFilters(next);
          setLedgerPage(1);
        }}
        onCreateTransaction={handleCreateTransaction}
        onPageChange={setPage}
        pagination={
          transactions?.pagination ?? {
            limit: 50,
            page: ledgerPage,
            total: 0,
            totalPages: 1,
          }
        }
        supplier={ledgerSupplier}
        toMoney={toMoney}
        transactions={transactions?.data ?? []}
      />
    );
  }

  return (
    <section className="panel-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {errorText && <div className="banner error">{errorText}</div>}
        <div className="tabs-row" style={{ alignSelf: 'flex-start' }}>
          <button
            className={`tab-btn ${activeSubTab === 'suppliers' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('suppliers')}
            type="button"
          >
            Tedarikçiler
          </button>
          <button
            className={`tab-btn ${activeSubTab === 'invoices' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('invoices')}
            type="button"
          >
            Alış Faturaları
          </button>
        </div>
      </div>

      <div>
        {activeSubTab === 'suppliers' ? (
          <SupplierListPage
            isLoading={isLoading}
            onAddClick={handleAddClick}
            onDeleteClick={handleDeleteClick}
            onEditClick={handleEditClick}
            onLedgerClick={handleLedgerClick}
            onPageChange={setPage}
            page={page}
            suppliers={data?.data ?? []}
            toMoney={toMoney}
            totalItems={data?.pagination?.total ?? 0}
          />
        ) : (
          <PurchaseInvoicesPage branchId={branchId} companyId={companyId} products={products} toMoney={toMoney} />
        )}
      </div>
    </section>
  );
}
