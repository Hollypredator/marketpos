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
      setErrorText('Secilen fatura bulunamadi.');
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
      setInfoText('Alis faturasi basariyla kaydedildi.');
    } catch {
      setErrorText('Fatura kaydedilirken hata olustu.');
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
      setInfoText(`Irsaliye faturaya donusturuldu: ${converted.invoiceNumber}`);
    } catch {
      setErrorText('Irsaliye faturaya donusturulemedi.');
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
    <div className="flex h-full flex-col">
      {(errorText || infoText) && (
        <div className="px-6 pt-4">
          {errorText && <div className="banner error">{errorText}</div>}
          {infoText && <div className="banner success">{infoText}</div>}
        </div>
      )}
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
