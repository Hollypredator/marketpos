import React, { useMemo, useState } from 'react';

import type { PurchaseInvoiceForm } from '../../domain/invoices/api';
import { useInvoiceMutations, useInvoicesQuery } from '../../domain/invoices/hooks';
import { useSuppliersQuery } from '../../domain/suppliers/hooks';
import { PurchaseInvoiceFormPage } from './PurchaseInvoiceFormPage';
import { PurchaseInvoiceListPage } from './PurchaseInvoiceListPage';

interface PurchaseInvoicesPageProps {
  branchId: string;
  companyId: string;
  products: any[];
  toMoney: (value: number) => string;
}

export function PurchaseInvoicesPage({ branchId, companyId, products, toMoney }: PurchaseInvoicesPageProps): React.ReactElement {
  const [convertingInvoiceId, setConvertingInvoiceId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [infoText, setInfoText] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: invoicesData, isLoading: isInvoicesLoading } = useInvoicesQuery(branchId, page);
  const { data: suppliersData } = useSuppliersQuery(companyId, 1);
  const { convertDispatchToInvoice, createInvoice, isConverting, isCreating } = useInvoiceMutations();

  const invoiceRows = useMemo(() => invoicesData?.data ?? [], [invoicesData?.data]);

  const handleAddClick = (): void => {
    setErrorText(null);
    setInfoText(null);
    setIsFormOpen(true);
  };

  const handleViewClick = (invoiceId: string): void => {
    const invoice = invoiceRows.find((row) => row.id === invoiceId);
    if (!invoice) {
      setErrorText('Seçilen fatura bulunamadı.');
      return;
    }
    setInfoText(`Fatura: ${invoice.invoiceNumber} | Toplam: ${toMoney(invoice.grandTotal)}`);
  };

  const handleSave = async (form: PurchaseInvoiceForm): Promise<void> => {
    try {
      setErrorText(null);
      setInfoText(null);
      await createInvoice({ branchId, payload: form });
      setIsFormOpen(false);
      setInfoText('Alış faturası başarıyla kaydedildi.');
    } catch {
      setErrorText('Fatura kaydedilirken hata oluştu.');
    }
  };

  const handleConvertClick = async (dispatchId: string): Promise<void> => {
    try {
      setErrorText(null);
      setInfoText(null);
      setConvertingInvoiceId(dispatchId);
      const nowIso = new Date().toISOString();
      const converted = await convertDispatchToInvoice({
        dispatchId,
        payload: {
          documentDate: nowIso,
          dueDate: nowIso,
          invoiceNumber: `INV-${Date.now()}`,
        },
      });
      setInfoText(`İrsaliye faturaya dönüştürüldü: ${converted.invoiceNumber}`);
    } catch {
      setErrorText('İrsaliye faturaya dönüştürülemedi.');
    } finally {
      setConvertingInvoiceId(null);
    }
  };

  if (isFormOpen) {
    return (
      <PurchaseInvoiceFormPage
        onCancel={() => setIsFormOpen(false)}
        onSave={handleSave}
        products={products}
        saving={isCreating}
        suppliers={suppliersData?.data ?? []}
        toMoney={toMoney}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {errorText && <div className="banner error">{errorText}</div>}
      {infoText && <div className="banner success">{infoText}</div>}
      
      <PurchaseInvoiceListPage
        convertingInvoiceId={isConverting ? convertingInvoiceId : null}
        invoices={invoiceRows}
        isLoading={isInvoicesLoading}
        onAddClick={handleAddClick}
        onConvertClick={handleConvertClick}
        onPageChange={setPage}
        onViewClick={handleViewClick}
        page={page}
        toMoney={toMoney}
        totalItems={invoicesData?.pagination?.total ?? 0}
      />
    </div>
  );
}
