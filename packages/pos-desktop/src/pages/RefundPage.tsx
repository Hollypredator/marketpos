import React, { useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';
import {
  explainRuntimeError,
  fetchSaleByReceipt,
  getQueueStatus,
  logSecurityEvent,
  queueRefund,
} from '../services/pos-runtime';
import type { SaleReceipt } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

export default function RefundPage() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantityMap, setQuantityMap] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [sale, setSale] = useState<SaleReceipt | null>(null);
  const [isApprovalOpen, setApprovalOpen] = useState(false);

  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const selectedTotal = useMemo(() => {
    if (!sale) {
      return 0;
    }
    return sale.items.reduce((sum, item) => {
      const quantity = quantityMap[item.id] ?? 0;
      if (quantity <= 0) {
        return sum;
      }
      return sum + quantity * item.unitPrice;
    }, 0);
  }, [quantityMap, sale]);

  const canSubmitRefund = Boolean(
    sale &&
      activeSession &&
      !isSubmitting &&
      Object.values(quantityMap).some((value) => value > 0),
  );

  const searchReceipt = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Aktif oturum bulunamadi.');
      return;
    }
    if (receiptNo.trim().length === 0) {
      return;
    }

    setIsSearching(true);
    try {
      const foundSale = await fetchSaleByReceipt(activeSession, receiptNo.trim());
      setSale(foundSale);
      const emptyMap: Record<string, number> = {};
      for (const item of foundSale.items) {
        emptyMap[item.id] = 0;
      }
      setQuantityMap(emptyMap);
      toast.success('Fis bulundu.');
    } catch (caughtError: unknown) {
      setSale(null);
      setQuantityMap({});
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSearching(false);
    }
  };

  const setItemQuantity = (itemId: string, value: number, max: number): void => {
    const clamped = Math.max(0, Math.min(max, value));
    setQuantityMap((current) => ({ ...current, [itemId]: clamped }));
  };

  const submitRefund = async (): Promise<void> => {
    if (!activeSession || !sale) {
      toast.error('Iade icin gerekli oturum bulunamadi.');
      return;
    }
    if (!canSubmitRefund) {
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Iade nedeni en az 3 karakter olmalidir.');
      return;
    }
    setApprovalOpen(true);
  };

  const executeRefund = async (approval: ManagerApprovalPayload): Promise<void> => {
    if (!activeSession || !sale) {
      toast.error('Iade icin gerekli oturum bulunamadi.');
      return;
    }

    const selectedItems = sale.items
      .map((item) => ({ quantity: quantityMap[item.id] ?? 0, saleItemId: item.id }))
      .filter((item) => item.quantity > 0);

    if (selectedItems.length === 0) {
      toast.error('Iade edilecek urun secilmedi.');
      return;
    }

    setIsSubmitting(true);
    try {
      await queueRefund(activeSession, {
        items: selectedItems,
        reason: `${reason.trim()} | Onay: ${approval.reason}`,
        registerId: activeSession.registerId,
        reportItems: sale.items
          .map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: quantityMap[item.id] ?? 0,
            unitPrice: item.unitPrice,
          }))
          .filter((item) => item.quantity > 0),
        saleId: sale.id,
        sessionId: activeSession.sessionId,
        totalAmount: selectedTotal,
      });

      const queueStatus = await getQueueStatus();
      dispatch({ payload: queueStatus, type: 'SET_QUEUE_STATUS' });
      setApprovalOpen(false);
      try {
        await logSecurityEvent({
          eventType: 'REFUND_APPROVED',
          managerUserId: approval.managerUserId,
          message: `Iade yonetici onayi ile tamamlandi. Fis=${sale.receiptNumber}`,
          metadataJson: JSON.stringify({
            itemCount: selectedItems.length,
            managerMethod: approval.method,
            operatorUserId: activeSession.user.id,
            receiptNumber: sale.receiptNumber,
            total: selectedTotal,
          }),
          operatorUserId: activeSession.user.id,
          reason: approval.reason,
          severity: 'WARN',
        });
      } catch {
        // Audit log failure should not rollback successful refund queueing.
      }

      toast.success('Iade kuyruga alindi.');
      setSale(null);
      setReason('');
      setReceiptNo('');
      setQuantityMap({});
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Iade</span>
      </div>

      <div style={{ margin: '0 auto', maxWidth: '900px', overflow: 'auto', padding: '1.5rem', width: '100%' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
            Fis Numarasi ile Ara
          </h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              className="input"
              onChange={(event) => setReceiptNo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void searchReceipt();
                }
              }}
              placeholder="Fis numarasi"
              type="text"
              value={receiptNo}
            />
            <button
              className="btn btn-primary"
              disabled={isSearching || receiptNo.trim().length === 0}
              onClick={() => void searchReceipt()}
              type="button"
            >
              {isSearching ? 'Araniyor...' : 'Ara'}
            </button>
          </div>
        </div>

        {sale && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Fis: {sale.receiptNumber}</h3>
              <span className="badge badge-success">{formatCurrency(sale.grandTotal)}</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {new Date(sale.createdAt).toLocaleString('tr-TR')}
            </p>

            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {sale.items.map((item) => {
                const selectedQuantity = quantityMap[item.id] ?? 0;
                const singleRefundQty = Math.min(1, item.quantity);
                return (
                  <div
                    key={item.id}
                    style={{
                      alignItems: 'center',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      display: 'grid',
                      gap: '0.75rem',
                      gridTemplateColumns: '1fr auto auto auto',
                      padding: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        Satilan: {item.quantity} | Birim: {formatCurrency(item.unitPrice)}
                      </div>
                    </div>
                    <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItemQuantity(item.id, selectedQuantity - 1, item.quantity)}
                        type="button"
                      >
                        -
                      </button>
                      <span style={{ minWidth: '2rem', textAlign: 'center' }}>{selectedQuantity}</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItemQuantity(item.id, selectedQuantity + 1, item.quantity)}
                        type="button"
                      >
                        +
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItemQuantity(item.id, singleRefundQty, item.quantity)}
                        type="button"
                      >
                        1 Adet
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setItemQuantity(item.id, item.quantity, item.quantity)}
                        type="button"
                      >
                        Tamami
                      </button>
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {formatCurrency(selectedQuantity * item.unitPrice)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="login-field" style={{ marginTop: '1rem' }}>
              <label htmlFor="refund-reason">Iade Nedeni (Opsiyonel)</label>
              <input
                id="refund-reason"
                className="input"
                onChange={(event) => setReason(event.target.value)}
                placeholder="Kisa iade nedeni"
                type="text"
                value={reason}
              />
            </div>

            <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Iade Tutari: {formatCurrency(selectedTotal)}
              </div>
              <button
                className="btn btn-danger btn-lg"
                disabled={!canSubmitRefund}
                onClick={() => void submitRefund()}
                type="button"
              >
                {isSubmitting ? 'Isleniyor...' : 'Iadeyi Tamamla'}
              </button>
            </div>
          </div>
        )}
      </div>

      {isApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Iadeyi Onayla"
          companyId={state.user?.companyId}
          description="Iade islemi kritik bir aksiyondur ve yonetici onayi gerektirir."
          onCancel={() => setApprovalOpen(false)}
          onApproved={executeRefund}
          reasonLabel="Onay Nedeni"
          reasonPlaceholder="Ornek: Musteri urunu iade etti"
          requireReason
        />
      )}
    </>
  );
}
