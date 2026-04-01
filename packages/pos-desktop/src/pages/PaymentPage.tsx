import React, { useEffect, useMemo, useState } from 'react';

import { PaymentMethod, calculateChange, formatCurrency } from '@marketpos/shared';

import Numpad from '../components/Numpad';
import type { CashDrawerActionResult, PrinterActionResult } from '../electron-api';
import ReceiptPreview from '../components/ReceiptPreview';
import {
  explainHardwareRecoveryPlan,
  explainRuntimeError,
  getQueueStatus,
  logSecurityEvent,
  queueSale,
} from '../services/pos-runtime';
import type { PendingSalePayment } from '../services/types';
import { getQuickAmountsByPreset } from '../services/ui-preset';
import { getCartTotals, selectAuthSession, useApp, useToast } from '../store';

interface PaymentPageProps {
  onClose: () => void;
}

type PaymentMode = 'CARD' | 'CASH' | 'SPLIT';

function describeHardwareResult(
  label: string,
  result: {
    errorCode?: string;
    message: string;
    operatorAction: string;
    success: boolean;
  },
): string {
  if (result.success) {
    return `${label}: Basarili`;
  }
  const operatorHint = explainHardwareRecoveryPlan({
    errorCode: result.errorCode as
      | 'NO_LAST_RECEIPT'
      | 'NO_RECEIPT_CONTENT'
      | 'PRINTER_NOT_CONNECTED'
      | 'PRINT_FAILED'
      | 'UNKNOWN'
      | undefined,
    message: result.message,
    operatorAction: result.operatorAction as
      | 'CHECK_HARDWARE_SETTINGS'
      | 'CHECK_PRINTER_CONNECTION'
      | 'NONE'
      | 'RETRY_PRINT',
  });
  return operatorHint.length > 0
    ? `${label}: ${result.message} ${operatorHint}`
    : `${label}: ${result.message}`;
}

function resolveSplitValues(total: number, cashInput: string): { card: number; cash: number } {
  const parsedCash = Number.parseFloat(cashInput || '0');
  const cash = Number.isFinite(parsedCash) ? Math.max(0, Math.min(total, parsedCash)) : 0;
  const card = Math.max(0, total - cash);
  return { card, cash };
}

function buildReceiptLines(args: {
  cart: ReturnType<typeof useApp>['state']['cart'];
  cashierName: string;
  paidAmount: number;
  payments: PendingSalePayment[];
  registerId: string;
  total: number;
}): string[] {
  const header = [
    'MARKETPOS',
    `Tarih: ${new Date().toLocaleString('tr-TR')}`,
    `Kasa: ${args.registerId}`,
    `Kasiyer: ${args.cashierName}`,
    '-----------------------------',
  ];
  const itemLines = args.cart.flatMap((item) => [
    `${item.name}`,
    `${item.quantity} x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)}`,
  ]);
  const paymentLines = args.payments.map(
    (payment) => `Odeme ${payment.method}: ${formatCurrency(payment.amount)}`,
  );
  const footer = [
    '-----------------------------',
    ...paymentLines,
    `Toplam: ${formatCurrency(args.total)}`,
    `Alinan: ${formatCurrency(args.paidAmount)}`,
    `Para Ustu: ${formatCurrency(calculateChange(args.total, args.paidAmount))}`,
    'Iyi gunler dileriz.',
  ];
  return [...header, ...itemLines, ...footer];
}

export default function PaymentPage({ onClose }: PaymentPageProps) {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [cashInput, setCashInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [note, setNote] = useState('');

  const totals = getCartTotals(state.cart);
  const activeSession = useMemo(() => selectAuthSession(state), [state]);
  const split = useMemo(
    () => resolveSplitValues(totals.grandTotal, cashInput),
    [cashInput, totals.grandTotal],
  );

  const paidAmount =
    mode === 'CASH'
      ? Number.isFinite(Number.parseFloat(cashInput || '0'))
        ? Number.parseFloat(cashInput || '0')
        : 0
      : mode === 'CARD'
        ? totals.grandTotal
        : split.cash + split.card;
  const isCashEnough = paidAmount >= totals.grandTotal;
  const isSplitValid =
    split.cash > 0 && split.card > 0 && Math.abs(split.cash + split.card - totals.grandTotal) < 0.01;
  const canComplete =
    state.cart.length > 0 &&
    !isSubmitting &&
    (mode === 'CASH' ? isCashEnough : mode === 'CARD' ? true : isSplitValid);

  const payments: PendingSalePayment[] = useMemo(() => {
    if (mode === 'CASH') {
      return [{ amount: totals.grandTotal, method: PaymentMethod.CASH }];
    }
    if (mode === 'CARD') {
      return [{ amount: totals.grandTotal, method: PaymentMethod.CREDIT_CARD }];
    }
    return [
      { amount: split.cash, method: PaymentMethod.CASH },
      { amount: split.card, method: PaymentMethod.CREDIT_CARD },
    ];
  }, [mode, split.card, split.cash, totals.grandTotal]);

  const quickAmounts = useMemo(
    () => getQuickAmountsByPreset(totals.grandTotal, state.uiPreset),
    [state.uiPreset, totals.grandTotal],
  );

  const receiptLines = buildReceiptLines({
    cart: state.cart,
    cashierName: state.user?.fullName ?? '-',
    paidAmount,
    payments,
    registerId: state.registerId ?? '-',
    total: totals.grandTotal,
  });

  const appendCashInput = (digit: string): void => {
    if (mode !== 'CASH' && mode !== 'SPLIT') {
      return;
    }
    if (digit === '.' && cashInput.includes('.')) {
      return;
    }
    setCashInput((current) => current + digit);
  };

  const completePayment = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Aktif oturum bulunamadi.');
      return;
    }
    if (!canComplete) {
      return;
    }

    setIsSubmitting(true);
    try {
      await queueSale(activeSession, {
        items: state.cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        note: note.trim() || undefined,
        payments,
        registerId: activeSession.registerId,
        sessionId: activeSession.sessionId,
      });

      const queueStatus = await getQueueStatus();
      dispatch({ payload: queueStatus, type: 'SET_QUEUE_STATUS' });

      let printerResult: PrinterActionResult | null = null;
      let drawerResult: CashDrawerActionResult | null = null;

      if (window.electronAPI) {
        try {
          printerResult = await window.electronAPI.printReceipt({ lines: receiptLines });
        } catch (caughtError: unknown) {
          printerResult = {
            errorCode: 'UNKNOWN',
            message: explainRuntimeError(caughtError),
            operatorAction: 'CHECK_HARDWARE_SETTINGS',
            printedAt: new Date().toISOString(),
            success: false,
          };
        }

        if (mode === 'CASH' || (mode === 'SPLIT' && split.cash > 0)) {
          try {
            drawerResult = await window.electronAPI.openCashDrawer({
              operatorId: activeSession.user.id,
              reason: mode === 'SPLIT' ? 'sale-payment-split' : 'sale-payment',
            });
          } catch (caughtError: unknown) {
            drawerResult = {
              errorCode: 'UNKNOWN',
              message: explainRuntimeError(caughtError),
              openedAt: new Date().toISOString(),
              operatorAction: 'CHECK_HARDWARE_SETTINGS',
              success: false,
            };
          }
        }
      }

      if (mode === 'SPLIT') {
        try {
          await logSecurityEvent({
            eventType: 'PAYMENT_SPLIT',
            managerUserId: null,
            message: `Split odeme uygulandi. Nakit=${split.cash.toFixed(2)} Kart=${split.card.toFixed(2)}`,
            metadataJson: JSON.stringify({
              cardAmount: split.card,
              cashAmount: split.cash,
              operatorUserId: activeSession.user.id,
              registerId: activeSession.registerId,
            }),
            operatorUserId: activeSession.user.id,
            severity: 'INFO',
          });
        } catch {
          // Logging must not block the payment completion flow.
        }
      }

      dispatch({ type: 'CLEAR_CART' });

      const hardwareWarnings: string[] = [];
      if (printerResult && !printerResult.success) {
        hardwareWarnings.push(describeHardwareResult('Fis', printerResult));
      }
      if (drawerResult && !drawerResult.success) {
        hardwareWarnings.push(describeHardwareResult('Cekmece', drawerResult));
      }

      if (hardwareWarnings.length > 0) {
        toast.error('Satis kaydedildi ancak donanim islemlerinde uyari olustu.');
        for (const warning of hardwareWarnings) {
          toast.info(warning);
        }
      } else {
        toast.success('Satis tamamlandi.');
      }
      onClose();
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void completePayment();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [completePayment, onClose]);

  return (
    <>
      <div className="header">
        <span className="header-title">Odeme</span>
        <div className="header-info">
          <span>Sepet: {state.cart.length} kalem</span>
          <span>|</span>
          <span>{state.user?.fullName}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1.2fr 1fr', padding: '1rem' }}>
        <div className="card">
          <div className="payment-total">TOPLAM: {formatCurrency(totals.grandTotal)}</div>

          <div className="payment-methods">
            <button
              type="button"
              className={`payment-method-btn ${mode === 'CASH' ? 'selected' : ''}`}
              onClick={() => {
                setMode('CASH');
                setCashInput('');
              }}
            >
              Nakit
            </button>
            <button
              type="button"
              className={`payment-method-btn ${mode === 'CARD' ? 'selected' : ''}`}
              onClick={() => setMode('CARD')}
            >
              Kredi Karti
            </button>
            <button
              type="button"
              className={`payment-method-btn ${mode === 'SPLIT' ? 'selected' : ''}`}
              onClick={() => {
                setMode('SPLIT');
                setCashInput('');
              }}
            >
              Split
            </button>
          </div>

          {mode === 'CASH' || mode === 'SPLIT' ? (
            <>
              {quickAmounts.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gap: '0.5rem',
                    gridTemplateColumns: `repeat(${Math.min(quickAmounts.length, 4)}, 1fr)`,
                    marginBottom: '0.75rem',
                  }}
                >
                  {quickAmounts.map((amount) => (
                    <button
                      key={amount}
                      className="btn btn-ghost"
                      onClick={() => setCashInput(amount.toString())}
                      type="button"
                    >
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
              )}

              <div className="payment-input-display">{cashInput || '0'} TL</div>

              {mode === 'SPLIT' ? (
                <div className="card" style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Nakit</span>
                    <strong>{formatCurrency(split.cash)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Kart</span>
                    <strong>{formatCurrency(split.card)}</strong>
                  </div>
                </div>
              ) : (
                <div className={`payment-change ${isCashEnough ? 'has-change' : 'insufficient'}`}>
                  {isCashEnough
                    ? `Para Ustu: ${formatCurrency(calculateChange(totals.grandTotal, paidAmount))}`
                    : `Eksik Tutar: ${formatCurrency(totals.grandTotal - paidAmount)}`}
                </div>
              )}

              <Numpad
                disabled={isSubmitting}
                onBackspace={() => setCashInput((current) => current.slice(0, -1))}
                onClear={() => setCashInput('')}
                onDigit={appendCashInput}
                onEnter={() => void completePayment()}
              />
            </>
          ) : (
            <div className="card" style={{ marginBottom: '1rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem' }}>Kart cihazindan {formatCurrency(totals.grandTotal)} tahsil edin.</p>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Odeme alindiktan sonra "Satisi Tamamla" butonuna basin.
              </p>
            </div>
          )}

          <div className="login-field">
            <label htmlFor="payment-note">Not (Opsiyonel)</label>
            <input
              id="payment-note"
              className="input"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Satis notu"
              type="text"
              value={note}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn btn-ghost btn-lg" disabled={isSubmitting} onClick={onClose} type="button" style={{ flex: 1 }}>
              Geri Don
            </button>
            <button
              className="btn btn-success btn-lg"
              disabled={!canComplete}
              onClick={() => void completePayment()}
              type="button"
              style={{ flex: 2 }}
            >
              {isSubmitting ? 'Isleniyor...' : 'Satisi Tamamla'}
            </button>
          </div>
        </div>

        <div>
          <ReceiptPreview lines={receiptLines} />
        </div>
      </div>
    </>
  );
}
