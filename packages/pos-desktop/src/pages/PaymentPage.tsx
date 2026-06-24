import React, { useEffect, useMemo, useRef, useState } from 'react';

import { PaymentMethod, calculateChange, formatCurrency } from '@marketpos/shared';

import type { CashDrawerActionResult, PrinterActionResult } from '../electron-api';
import {
  explainHardwareRecoveryPlan,
  explainRuntimeError,
  fetchCustomers,
  getQueueStatus,
  logSecurityEvent,
  queueSale,
} from '../services/pos-runtime';
import {
  capDiscountByPolicy,
  type DiscountPolicy,
  loadDiscountPolicy,
  parseDiscountInput,
  readDiscountPolicy,
  subscribeDiscountPolicy,
} from '../services/discount-policy';
import { buildPendingSaleItems } from '../services/sale-payload';
import type { CustomerRecord, PendingSalePayment } from '../services/types';
import { getCartTotals, selectAuthSession, useApp, useToast } from '../store';
import { readIntegrationSettings, type IntegrationSettings } from '../services/integration-settings';

interface PaymentPageProps {
  onClose: () => void;
}

type PaymentMode = 'CARD' | 'CASH' | 'ON_ACCOUNT' | 'SPLIT';
type HardwareWarningKey = 'drawer' | 'printer';

const HARDWARE_WARNING_SNOOZE_MS = 10 * 60 * 1000;
const PAYMENT_LAST_MODE_STORAGE_KEY = 'marketpos:payment:last-mode';
const PAYMENT_LAST_ACTION_STORAGE_KEY = 'marketpos:payment:last-action';
const PAYMENT_LAST_SUMMARY_STORAGE_KEY = 'marketpos:payment:last-summary';
const PAYMENT_QUICK_ACTION_STORAGE_KEY = 'marketpos:payment:quick-action';
const HIGH_AMOUNT_CONFIRM_THRESHOLD = 5000;
const PAYMENT_SUMMARY_MAX_AGE_MS = 30 * 60 * 1000;
const hardwareWarningSilenceUntil = new Map<HardwareWarningKey, number>();

function parsePaymentInput(value: string): number {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeAmountInput(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const dotIndex = normalized.indexOf('.');
  if (dotIndex < 0) {
    return normalized;
  }
  return `${normalized.slice(0, dotIndex + 1)}${normalized
    .slice(dotIndex + 1)
    .replace(/\./g, '')}`;
}

function formatEditableAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }
  const fixed = amount.toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round(amount * 100);
}

function isPaymentMode(value: string | null): value is PaymentMode {
  return value === 'CARD' || value === 'CASH' || value === 'ON_ACCOUNT' || value === 'SPLIT';
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
}

function resolveQuickCashPresets(total: number, maxItems = 4): number[] {
  if (total <= 0) {
    return [];
  }
  const notePresets = [20, 50, 100, 200, 500, 1000];
  const nearNotes = notePresets.filter((amount) => amount >= total).slice(0, maxItems);
  if (nearNotes.length > 0) {
    return nearNotes;
  }
  const roundedBase = Math.ceil(total / 100) * 100;
  const fallback = [roundedBase, roundedBase + 100, roundedBase + 200, roundedBase + 500];
  return fallback.slice(0, maxItems);
}

function resolveQuickIncrementButtons(total: number, isCompactViewport: boolean): number[] {
  if (total <= 0) {
    return isCompactViewport ? [10, 20, 50, 100] : [20, 50, 100, 200];
  }
  const preferred = isCompactViewport ? [10, 20, 50, 100] : [20, 50, 100, 200];
  const dynamic = [Math.ceil(total / 10), Math.ceil(total / 5), Math.ceil(total / 2), Math.ceil(total)];
  const merged = [...preferred, ...dynamic].map((value) => Math.max(1, value));
  const unique = Array.from(new Set(merged));
  return unique.slice(0, 4);
}

interface LastPaymentAction {
  cashInput: string;
  mode: PaymentMode;
  splitCardInput: string;
  splitCashInput: string;
}

interface PaymentUiSummary {
  message: string;
  queueInfo: string;
  severity: 'error' | 'info' | 'success';
  timestamp: string;
  warnings: string[];
}

function shouldHydrateSummary(summary: PaymentUiSummary): boolean {
  const timestamp = new Date(summary.timestamp).getTime();
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  if (Date.now() - timestamp > PAYMENT_SUMMARY_MAX_AGE_MS) {
    return false;
  }
  const haystack = `${summary.message} ${summary.queueInfo} ${summary.warnings.join(' ')}`.toLowerCase();
  // Legacy validator errors can remain stale after updates; don't persist them across reopen.
  if (haystack.includes('db:queue-sale') || haystack.includes('invalid_enum_value')) {
    return false;
  }
  return true;
}

interface ShiftPaymentSummary {
  card: number;
  cash: number;
  onAccount: number;
  sales: number;
  updatedAt: string;
}

interface PaymentQuickAction {
  autoComplete?: boolean;
  fillFullAmount?: boolean;
  mode: PaymentMode;
}

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

function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case PaymentMethod.CASH:
      return 'Nakit';
    case PaymentMethod.CREDIT_CARD:
      return 'Kredi Karti';
    case PaymentMethod.DEBIT_CARD:
      return 'Banka Karti';
    case PaymentMethod.ON_ACCOUNT:
      return 'Cari';
    default:
      return method;
  }
}

function shouldNotifyHardwareWarning(key: HardwareWarningKey): boolean {
  const now = Date.now();
  const silenceUntil = hardwareWarningSilenceUntil.get(key) ?? 0;
  if (now < silenceUntil) {
    return false;
  }
  hardwareWarningSilenceUntil.set(key, now + HARDWARE_WARNING_SNOOZE_MS);
  return true;
}

function clearHardwareWarningSilence(key: HardwareWarningKey): void {
  hardwareWarningSilenceUntil.delete(key);
}

function resolveSplitValues(total: number, cashInput: string): { card: number; cash: number } {
  const parsedCash = parsePaymentInput(cashInput);
  const cash = Number.isFinite(parsedCash) ? Math.max(0, Math.min(total, parsedCash)) : 0;
  const card = Math.max(0, total - cash);
  return { card, cash };
}

function resolveShiftSummaryStorageKey(registerId: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  return `marketpos:payment:shift-summary:${registerId ?? 'unknown'}:${today}`;
}

function createLocalReceiptNumber(registerId: string | null): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replaceAll('-', '');
  const timePart = now.toISOString().slice(11, 19).replaceAll(':', '');
  return `YEREL-${registerId ?? 'REG'}-${datePart}-${timePart}`;
}

function readLastPaymentAction(): LastPaymentAction | null {
  try {
    const raw = window.localStorage.getItem(PAYMENT_LAST_ACTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LastPaymentAction;
    if (!isPaymentMode(parsed?.mode ?? null)) {
      return null;
    }
    return {
      cashInput: typeof parsed.cashInput === 'string' ? parsed.cashInput : '',
      mode: parsed.mode,
      splitCardInput: typeof parsed.splitCardInput === 'string' ? parsed.splitCardInput : '',
      splitCashInput: typeof parsed.splitCashInput === 'string' ? parsed.splitCashInput : '',
    };
  } catch {
    return null;
  }
}

function readPaymentQuickAction(): PaymentQuickAction | null {
  try {
    const raw = window.localStorage.getItem(PAYMENT_QUICK_ACTION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PaymentQuickAction;
    if (!isPaymentMode(parsed?.mode ?? null)) {
      return null;
    }
    return {
      autoComplete: parsed.autoComplete === true,
      fillFullAmount: parsed.fillFullAmount === true,
      mode: parsed.mode,
    };
  } catch {
    return null;
  }
}

function buildReceiptLines(args: {
  cart: ReturnType<typeof useApp>['state']['cart'];
  cashierName: string;
  paidAmount: number;
  payments: PendingSalePayment[];
  registerId: string;
  total: number;
  receiptNumber: string;
}): string[] {
  const header = [
    'MARKETPOS',
    `Tarih: ${new Date().toLocaleString('tr-TR')}`,
    `Kasa: ${args.registerId}`,
    `Kasiyer: ${args.cashierName}`,
    `FIS NO: ${args.receiptNumber}`,
    '-----------------------------',
  ];
  const itemLines = args.cart.flatMap((item) => [
    `${item.name}`,
    `${item.quantity} x ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.lineTotal)}`,
  ]);
  const paymentLines = args.payments.map(
    (payment) =>
      `Odeme ${formatPaymentMethodLabel(payment.method)}: ${formatCurrency(payment.amount)}`,
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
  const submitLockRef = useRef(false);
  const [cashInput, setCashInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [note, setNote] = useState('');
  const [splitCashInput, setSplitCashInput] = useState('');
  const [splitCardInput, setSplitCardInput] = useState('');
  const [billingType, setBillingType] = useState<'RETAIL' | 'E_ARCHIVE' | 'E_INVOICE'>('RETAIL');
  const [isYNOKCProcessing, setIsYNOKCProcessing] = useState(false);
  const [lastPaymentAction, setLastPaymentAction] = useState<LastPaymentAction | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentUiSummary | null>(null);
  const [shiftSummary, setShiftSummary] = useState<ShiftPaymentSummary>({
    card: 0,
    cash: 0,
    onAccount: 0,
    sales: 0,
    updatedAt: '',
  });
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([]);
  const [isCustomerLoading, setIsCustomerLoading] = useState(false);
  const [customerLoadError, setCustomerLoadError] = useState('');
  const [pendingQuickAction, setPendingQuickAction] = useState<PaymentQuickAction | null>(null);
  const [discountPolicy, setDiscountPolicy] = useState<DiscountPolicy>(() =>
    readDiscountPolicy(state.user?.companyId),
  );
  const [viewportSize, setViewportSize] = useState(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
  }));
  const [integrations, setIntegrations] = useState<IntegrationSettings>(() => readIntegrationSettings());

  const totals = getCartTotals(state);
  const shiftSummaryStorageKey = useMemo(
    () => resolveShiftSummaryStorageKey(state.registerId),
    [state.registerId],
  );
  const activeSession = useMemo(() => selectAuthSession(state), [state]);
  useEffect(() => {
    let cancelled = false;
    void loadDiscountPolicy(activeSession?.user.companyId ?? state.user?.companyId).then(
      (policy) => {
        if (!cancelled) {
          setDiscountPolicy(policy);
        }
      },
    );
    const unsubscribe = subscribeDiscountPolicy((policy) => setDiscountPolicy(policy));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [activeSession?.user.companyId, state.user?.companyId]);
  const splitAuto = useMemo(
    () => resolveSplitValues(totals.grandTotal, cashInput),
    [cashInput, totals.grandTotal],
  );
  const splitManual = useMemo(() => {
    const cash = Math.max(0, Math.min(totals.grandTotal, parsePaymentInput(splitCashInput)));
    const card = Math.max(0, Math.min(totals.grandTotal, parsePaymentInput(splitCardInput)));
    return { card, cash };
  }, [splitCardInput, splitCashInput, totals.grandTotal]);
  const isManualSplit = splitCashInput.trim().length > 0 || splitCardInput.trim().length > 0;
  const split = isManualSplit ? splitManual : splitAuto;

  const cashInputAmount = parsePaymentInput(cashInput);
  const paidAmount =
    mode === 'CASH'
      ? cashInputAmount
      : mode === 'SPLIT'
        ? split.cash + split.card
        : totals.grandTotal;
  const totalMinor = toMinorUnits(totals.grandTotal);
  const paidMinor = toMinorUnits(paidAmount);
  const hasCustomerSelected = Boolean(state.activeCustomerId);
  const isCashEnough = paidMinor >= totalMinor;
  const isSplitValid =
    split.cash > 0 && split.card > 0 && toMinorUnits(split.cash + split.card) === totalMinor;
  const isActionLocked = isSubmitting || submitLockRef.current;
  const canComplete =
    state.cart.length > 0 &&
    !isActionLocked &&
    (mode === 'CASH'
      ? isCashEnough
      : mode === 'SPLIT'
        ? isSplitValid
        : mode === 'ON_ACCOUNT'
          ? hasCustomerSelected
          : true);

  const payments: PendingSalePayment[] = useMemo(() => {
    if (mode === 'CASH') {
      return [{ amount: totals.grandTotal, method: PaymentMethod.CASH }];
    }
    if (mode === 'CARD') {
      return [{ amount: totals.grandTotal, method: PaymentMethod.CREDIT_CARD }];
    }
    if (mode === 'ON_ACCOUNT') {
      return [{ amount: totals.grandTotal, method: PaymentMethod.ON_ACCOUNT }];
    }
    return [
      { amount: split.cash, method: PaymentMethod.CASH },
      { amount: split.card, method: PaymentMethod.CREDIT_CARD },
    ];
  }, [mode, split.card, split.cash, totals.grandTotal]);



  const enteredAmount =
    mode === 'CASH' || mode === 'SPLIT' ? cashInputAmount : totals.grandTotal;
  const displayEnteredAmount = enteredAmount.toLocaleString('tr-TR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  const remainingAmount = Math.max(0, (totalMinor - paidMinor) / 100);
  const isCompactViewport = viewportSize.width <= 1180 || viewportSize.height <= 820;
  const isPhoneViewport = viewportSize.width <= 1024 || viewportSize.height <= 768;
  const quickCashPresets = useMemo(
    () => resolveQuickCashPresets(totals.grandTotal, isPhoneViewport ? 3 : 4),
    [isPhoneViewport, totals.grandTotal],
  );
  const quickIncrementButtons = useMemo(
    () => resolveQuickIncrementButtons(totals.grandTotal, isCompactViewport),
    [isCompactViewport, totals.grandTotal],
  );
  const isKeypadEnabled = mode === 'CASH' || mode === 'SPLIT';

  const openCustomerPicker = (): void => {
    setCustomerLoadError('');
    setIsCustomerPickerOpen(true);
  };

  const closeCustomerPicker = (): void => {
    setIsCustomerPickerOpen(false);
  };

  const applySplitFromCashAmount = (cashAmount: number): void => {
    const normalizedCash = Math.max(0, Math.min(totals.grandTotal, Number(cashAmount.toFixed(2))));
    const cardAmount = Math.max(0, Number((totals.grandTotal - normalizedCash).toFixed(2)));
    setSplitCashInput(formatEditableAmount(normalizedCash));
    setSplitCardInput(formatEditableAmount(cardAmount));
  };

  const applySplitFromCardAmount = (cardAmount: number): void => {
    const normalizedCard = Math.max(0, Math.min(totals.grandTotal, Number(cardAmount.toFixed(2))));
    const cashAmount = Math.max(0, Number((totals.grandTotal - normalizedCard).toFixed(2)));
    setSplitCardInput(formatEditableAmount(normalizedCard));
    setSplitCashInput(formatEditableAmount(cashAmount));
  };

  const applyLastPaymentPreset = (): void => {
    if (!lastPaymentAction || isActionLocked) {
      return;
    }
    selectPaymentMode(lastPaymentAction.mode);
    setCashInput(lastPaymentAction.cashInput);
    setSplitCashInput(lastPaymentAction.splitCashInput);
    setSplitCardInput(lastPaymentAction.splitCardInput);
  };

  const appendCashInput = (digit: string): void => {
    if (!isKeypadEnabled) {
      return;
    }
    const normalizedDigit = digit === ',' ? '.' : digit;
    if (mode === 'SPLIT') {
      const nextCashInput = sanitizeAmountInput(splitCashInput + normalizedDigit);
      if (normalizedDigit === '.' && splitCashInput.includes('.')) {
        return;
      }
      applySplitFromCashAmount(parsePaymentInput(nextCashInput));
      return;
    }
    if (normalizedDigit === '.' && cashInput.includes('.')) {
      return;
    }
    setCashInput((current) => current + normalizedDigit);
  };

  const setCashInputAmount = (amount: number): void => {
    const rounded = Math.max(0, Number(amount.toFixed(2)));
    if (rounded <= 0) {
      setCashInput('');
      return;
    }
    setCashInput(rounded.toString());
  };

  const applyQuickAmount = (amount: number): void => {
    if (!isKeypadEnabled) {
      setMode('CASH');
    }
    if (mode === 'SPLIT') {
      applySplitFromCashAmount(amount);
      return;
    }
    setCashInputAmount(amount);
  };

  const increaseCashInput = (amount: number): void => {
    if (!isKeypadEnabled) {
      setMode('CASH');
    }
    if (mode === 'SPLIT') {
      applySplitFromCashAmount(split.cash + amount);
      return;
    }
    setCashInputAmount(cashInputAmount + amount);
  };

  const applyCartDiscount = (): void => {
    const policy = discountPolicy;
    const discount = window.prompt(
      `Genel sepet indirimi girin (TL veya %). Maks ${policy.maxCartDiscountPercent}%`,
      state.cartDiscountAmount.toString(),
    );
    if (discount === null) {
      return;
    }
    const parsed = parseDiscountInput(discount, totals.subtotal);
    if (parsed === null) {
      toast.error('Gecersiz indirim degeri. Ornek: 25 veya 10%');
      return;
    }
    const capped = capDiscountByPolicy(parsed, totals.subtotal, policy, 'CART');
    dispatch({ type: 'SET_CART_DISCOUNT', payload: capped });
    if (capped < parsed) {
      toast.info(
        `Genel indirim politika geregi %${policy.maxCartDiscountPercent} ve ${policy.maxCartDiscountAmount.toFixed(2)} TL ile sinirlandi.`,
      );
    }
  };

  const toggleSplitMode = (): void => {
    if (mode === 'SPLIT') {
      setMode('CASH');
      setSplitCashInput('');
      setSplitCardInput('');
      return;
    }
    setMode('SPLIT');
    applySplitFromCashAmount(cashInputAmount);
  };

  const selectPaymentMode = (nextMode: PaymentMode): void => {
    setMode(nextMode);
    if (nextMode === 'SPLIT') {
      applySplitFromCashAmount(cashInputAmount);
    }
    if (nextMode !== 'SPLIT') {
      setSplitCashInput('');
      setSplitCardInput('');
    }
    if (nextMode === 'ON_ACCOUNT' && !state.activeCustomerId) {
      openCustomerPicker();
    }
  };

  const assignCustomer = (customer: CustomerRecord): void => {
    const customerName = customer.fullName ?? customer.name ?? 'Musteri';
    dispatch({
      payload: {
        customerId: customer.id,
        customerName,
      },
      type: 'SET_CUSTOMER',
    });
    toast.success(`${customerName} secildi.`);
    closeCustomerPicker();
  };

  const completePayment = async (): Promise<void> => {
    if (submitLockRef.current) {
      return;
    }
    if (!activeSession) {
      toast.error('Aktif oturum bulunamadi.');
      return;
    }
    if (mode === 'ON_ACCOUNT' && !state.activeCustomerId) {
      toast.error('Cari odeme icin once musteri secin.');
      openCustomerPicker();
      return;
    }
    if (!canComplete) {
      return;
    }
    if (totals.grandTotal >= HIGH_AMOUNT_CONFIRM_THRESHOLD) {
      const confirmed = window.confirm(
        `${formatCurrency(totals.grandTotal)} tutarli odeme alinacak. Onayliyor musunuz?`,
      );
      if (!confirmed) {
        return;
      }
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const previousQueuedSales = state.queueSales;
      const localReceiptNumber = createLocalReceiptNumber(activeSession.registerId);
      const queuedRecord = await queueSale(activeSession, {
        customerId: state.activeCustomerId ?? undefined,
        items: buildPendingSaleItems(state.cart),
        localReceiptNumber,
        note: note.trim() || undefined,
        payments,
        registerId: activeSession.registerId,
        sessionId: activeSession.sessionId,
        totalCartDiscount: state.cartDiscountAmount,
      });

      let finalReceiptNumber = localReceiptNumber;
      try {
        const parsedPayload = JSON.parse(queuedRecord.payloadData);
        if (typeof parsedPayload.localReceiptNumber === 'string') {
          finalReceiptNumber = parsedPayload.localReceiptNumber;
        }
      } catch {}

      const receiptLines = buildReceiptLines({
        cart: state.cart,
        cashierName: state.user?.fullName ?? '-',
        paidAmount,
        payments,
        registerId: state.registerId ?? '-',
        total: totals.grandTotal,
        receiptNumber: finalReceiptNumber,
      });

      // Handle e-Invoice / e-Archive submission if selected
      if (billingType !== 'RETAIL' && window.electronAPI) {
        try {
          const customer = customerResults.find((c) => c.id === state.activeCustomerId);
          await window.electronAPI.createEInvoice({
            customerName:
              customer?.fullName ?? customer?.name ?? state.activeCustomerName ?? 'Perakende Musteri',
            customerTaxNumber: customer?.taxNumber || undefined,
            issueDate: new Date().toISOString(),
            totalAmount: totals.grandTotal,
            totalVat: totals.totalVat,
            items: state.cart.map(item => ({
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              vatRate: item.vatRate,
              total: item.lineTotal,
            })),
          });
          toast.success(`${billingType === 'E_INVOICE' ? 'e-Fatura' : 'e-Arşiv'} oluşturuldu.`);
        } catch (einvoiceErr) {
          toast.error('Fatura oluşturulurken hata oluştu, ancak satış kaydedildi.');
        }
      }

      const queueStatus = await getQueueStatus();
      dispatch({ payload: queueStatus, type: 'SET_QUEUE_STATUS' });
      if (window.electronAPI) {
        await window.electronAPI.markFirstSale();
      }
      const queuedDelta = Math.max(0, queueStatus.sales - previousQueuedSales);

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
      if (printerResult?.success) {
        clearHardwareWarningSilence('printer');
      } else if (printerResult && shouldNotifyHardwareWarning('printer')) {
        hardwareWarnings.push(describeHardwareResult('Fis', printerResult));
      }
      if (drawerResult?.success) {
        clearHardwareWarningSilence('drawer');
      } else if (drawerResult && shouldNotifyHardwareWarning('drawer')) {
        hardwareWarnings.push(describeHardwareResult('Cekmece', drawerResult));
      }

      const queueInfo = !activeSession.isOnline
        ? `Offline mod: satis kuyruga alindi (${queuedDelta} yeni).`
        : queuedDelta > 0
          ? `Satis kuyruga alindi (${queuedDelta} yeni), senkron bekliyor.`
          : 'Satis merkeze gonderildi ve kuyruk temiz.';
      const uiSummary: PaymentUiSummary =
        hardwareWarnings.length > 0
          ? {
              message: 'Satis tamamlandi, donanim uyarisi mevcut.',
              queueInfo,
              severity: 'error',
              timestamp: new Date().toISOString(),
              warnings: hardwareWarnings,
            }
          : {
              message: mode === 'ON_ACCOUNT' ? 'Cari satis tamamlandi.' : 'Satis tamamlandi.',
              queueInfo,
              severity: queuedDelta > 0 || !activeSession.isOnline ? 'info' : 'success',
              timestamp: new Date().toISOString(),
              warnings: [],
            };
      setPaymentSummary(uiSummary);

      const nextShiftSummary: ShiftPaymentSummary = {
        card:
          shiftSummary.card +
          payments
            .filter((payment) => payment.method === PaymentMethod.CREDIT_CARD || payment.method === PaymentMethod.DEBIT_CARD)
            .reduce((sum, payment) => sum + payment.amount, 0),
        cash:
          shiftSummary.cash +
          payments
            .filter((payment) => payment.method === PaymentMethod.CASH)
            .reduce((sum, payment) => sum + payment.amount, 0),
        onAccount:
          shiftSummary.onAccount +
          payments
            .filter((payment) => payment.method === PaymentMethod.ON_ACCOUNT)
            .reduce((sum, payment) => sum + payment.amount, 0),
        sales: shiftSummary.sales + 1,
        updatedAt: new Date().toISOString(),
      };
      setShiftSummary(nextShiftSummary);
      try {
        window.localStorage.setItem(shiftSummaryStorageKey, JSON.stringify(nextShiftSummary));
      } catch {
        // Ignore storage failures.
      }

      const lastAction: LastPaymentAction = {
        cashInput: mode === 'CASH' ? formatEditableAmount(cashInputAmount) : '',
        mode,
        splitCardInput: mode === 'SPLIT' ? formatEditableAmount(split.card) : '',
        splitCashInput: mode === 'SPLIT' ? formatEditableAmount(split.cash) : '',
      };
      setLastPaymentAction(lastAction);
      try {
        window.localStorage.setItem(PAYMENT_LAST_ACTION_STORAGE_KEY, JSON.stringify(lastAction));
      } catch {
        // Ignore storage failures.
      }

      if (hardwareWarnings.length > 0) {
        toast.error('Satis kaydedildi ancak donanim islemlerinde uyari olustu.');
        for (const warning of hardwareWarnings) {
          toast.info(warning);
        }
      } else {
        if (queuedDelta > 0 || !activeSession.isOnline) {
          toast.info(uiSummary.message);
        } else {
          toast.success(uiSummary.message);
        }
      }
      onClose();
    } catch (caughtError: unknown) {
      const errorMessage = explainRuntimeError(caughtError);
      setPaymentSummary({
        message: `Odeme hatasi: ${errorMessage}`,
        queueInfo: activeSession.isOnline
          ? 'Satis tamamlanmadi. Baglanti ve yetki durumunu kontrol edin.'
          : 'Offline modda islem basarisiz oldu; yerel kuyruğu kontrol edin.',
        severity: 'error',
        timestamp: new Date().toISOString(),
        warnings: [],
      });
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  useEffect(() => {
    const onResize = (): void => {
      setViewportSize({
        height: window.innerHeight,
        width: window.innerWidth,
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      const storedMode = window.localStorage.getItem(PAYMENT_LAST_MODE_STORAGE_KEY);
      if (isPaymentMode(storedMode)) {
        setMode(storedMode);
      }
    } catch {
      // Ignore localStorage read errors.
    }
    setLastPaymentAction(readLastPaymentAction());
    setPendingQuickAction(readPaymentQuickAction());
    try {
      window.localStorage.removeItem(PAYMENT_QUICK_ACTION_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
    try {
      const rawSummary = window.localStorage.getItem(PAYMENT_LAST_SUMMARY_STORAGE_KEY);
      if (rawSummary) {
        const parsed = JSON.parse(rawSummary) as PaymentUiSummary;
        if (typeof parsed?.message === 'string' && typeof parsed?.queueInfo === 'string') {
          const normalizedSummary: PaymentUiSummary = {
            message: parsed.message,
            queueInfo: parsed.queueInfo,
            severity:
              parsed.severity === 'error' || parsed.severity === 'info' ? parsed.severity : 'success',
            timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : new Date().toISOString(),
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item) => typeof item === 'string') : [],
          };
          if (shouldHydrateSummary(normalizedSummary)) {
            setPaymentSummary(normalizedSummary);
          } else {
            window.localStorage.removeItem(PAYMENT_LAST_SUMMARY_STORAGE_KEY);
          }
        }
      }
    } catch {
      // Ignore storage parse errors.
    }
  }, []);

  useEffect(() => {
    if (!pendingQuickAction || state.cart.length === 0) {
      return;
    }
    selectPaymentMode(pendingQuickAction.mode);
    if (pendingQuickAction.fillFullAmount) {
      if (pendingQuickAction.mode === 'SPLIT') {
        applySplitFromCashAmount(totals.grandTotal);
      } else if (pendingQuickAction.mode === 'CASH') {
        setCashInputAmount(totals.grandTotal);
      }
    }
    if (pendingQuickAction.autoComplete) {
      const timerId = window.setTimeout(() => {
        void completePayment();
      }, 80);
      setPendingQuickAction(null);
      return () => window.clearTimeout(timerId);
    }
    setPendingQuickAction(null);
  }, [applySplitFromCashAmount, completePayment, pendingQuickAction, state.cart.length, totals.grandTotal]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAYMENT_LAST_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [mode]);

  useEffect(() => {
    if (!paymentSummary) {
      return;
    }
    if (!shouldHydrateSummary(paymentSummary)) {
      try {
        window.localStorage.removeItem(PAYMENT_LAST_SUMMARY_STORAGE_KEY);
      } catch {
        // Ignore storage failures.
      }
      return;
    }
    try {
      window.localStorage.setItem(PAYMENT_LAST_SUMMARY_STORAGE_KEY, JSON.stringify(paymentSummary));
    } catch {
      // Ignore storage failures.
    }
  }, [paymentSummary]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(shiftSummaryStorageKey);
      if (!raw) {
        setShiftSummary({
          card: 0,
          cash: 0,
          onAccount: 0,
          sales: 0,
          updatedAt: '',
        });
        return;
      }
      const parsed = JSON.parse(raw) as ShiftPaymentSummary;
      setShiftSummary({
        card: Number.isFinite(parsed.card) ? parsed.card : 0,
        cash: Number.isFinite(parsed.cash) ? parsed.cash : 0,
        onAccount: Number.isFinite(parsed.onAccount) ? parsed.onAccount : 0,
        sales: Number.isFinite(parsed.sales) ? parsed.sales : 0,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      });
    } catch {
      setShiftSummary({
        card: 0,
        cash: 0,
        onAccount: 0,
        sales: 0,
        updatedAt: '',
      });
    }
  }, [shiftSummaryStorageKey]);

  useEffect(() => {
    if (!isCustomerPickerOpen) {
      return;
    }
    if (!activeSession?.accessToken) {
      setCustomerLoadError('Musteri listesi icin online ve aktif oturum gerekli.');
      setCustomerResults([]);
      return;
    }
    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsCustomerLoading(true);
        try {
          const customers = await fetchCustomers(activeSession, {
            activeOnly: true,
            limit: 100,
            page: 1,
            search: customerSearch.trim() || undefined,
          });
          if (isCancelled) {
            return;
          }
          setCustomerResults(customers);
          setCustomerLoadError('');
        } catch (caughtError: unknown) {
          if (isCancelled) {
            return;
          }
          setCustomerResults([]);
          setCustomerLoadError(explainRuntimeError(caughtError));
        } finally {
          if (!isCancelled) {
            setIsCustomerLoading(false);
          }
        }
      })();
    }, 220);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeSession, customerSearch, isCustomerPickerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isActionLocked) {
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
        }
        return;
      }
      if (isCustomerPickerOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeCustomerPicker();
        }
        return;
      }
      if (isTextEntryTarget(event.target)) {
        return;
      }
      if (isKeypadEnabled) {
        if (/^[0-9]$/.test(event.key)) {
          event.preventDefault();
          appendCashInput(event.key);
          return;
        }
        if (event.key === ',' || event.key === '.') {
          event.preventDefault();
          appendCashInput(',');
          return;
        }
        if (event.key === 'Backspace') {
          event.preventDefault();
          if (mode === 'SPLIT') {
            const nextValue = splitCashInput.slice(0, -1);
            applySplitFromCashAmount(parsePaymentInput(nextValue));
          } else {
            setCashInput((current) => current.slice(0, -1));
          }
          return;
        }
        if (event.key === 'Delete') {
          event.preventDefault();
          if (mode === 'SPLIT') {
            setSplitCashInput('');
            setSplitCardInput(formatEditableAmount(totals.grandTotal));
          } else {
            setCashInput('');
          }
          return;
        }
      }
      if (event.key === 'F9') {
        event.preventDefault();
        applyLastPaymentPreset();
        return;
      }
      if (event.key === '=') {
        event.preventDefault();
        applyQuickAmount(totals.grandTotal);
        return;
      }
      if (event.key === 'F1') {
        event.preventDefault();
        selectPaymentMode('CASH');
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        selectPaymentMode('CARD');
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        selectPaymentMode('SPLIT');
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        selectPaymentMode('ON_ACCOUNT');
        return;
      }
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
  }, [applyLastPaymentPreset, applyQuickAmount, applySplitFromCashAmount, completePayment, isActionLocked, isCustomerPickerOpen, isKeypadEnabled, mode, onClose, splitCashInput, totals.grandTotal]);

  return (
    <div className="payment-overlay payment-page">
      <div className={`payment-gopos-modal ${isCompactViewport ? 'is-compact' : ''} ${isPhoneViewport ? 'is-phone' : ''}`}>
        <section className="payment-gopos-column payment-gopos-left">
          <div className="payment-gopos-header">
            <h3>Siparis Detaylari</h3>
            <button className="payment-gopos-secondary-btn" disabled type="button">
              Urun Secerek Ode
            </button>
          </div>

          <p className="payment-gopos-subtitle">Odenecek Urunler ({state.cart.length})</p>
          <div className="payment-gopos-item-list">
            {state.cart.map((item) => (
              <div className="payment-gopos-item-row" key={item.productId}>
                <span>{item.quantity}x {item.name}</span>
                <strong>{formatCurrency(item.lineTotal)}</strong>
              </div>
            ))}
            {state.cart.length === 0 && (
              <div className="payment-gopos-empty">Sepette urun yok.</div>
            )}
          </div>

          <div className="payment-gopos-summary">
            <h4>Odeme Ozeti</h4>
            <div className="payment-gopos-summary-row">
              <span>Ara Toplam</span>
              <strong>{formatCurrency(totals.subtotal)}</strong>
            </div>
            <div className="payment-gopos-summary-row">
              <span>KDV</span>
              <strong>{formatCurrency(totals.totalVat)}</strong>
            </div>
            <div className="payment-gopos-summary-row total">
              <span>Kalan Tutar</span>
              <strong>{formatCurrency(remainingAmount)}</strong>
            </div>
          </div>
        </section>

        <section className="payment-gopos-column payment-gopos-center">
          <div className="payment-gopos-amount-card">
            <div className="payment-gopos-amount-row">
              <span>ODENECEK TUTAR</span>
              <strong>{formatCurrency(totals.grandTotal)}</strong>
            </div>
            <div className="payment-gopos-amount-row">
              <span>Girilen Tutar</span>
              <strong className="entered">{displayEnteredAmount}</strong>
            </div>
          </div>

          {quickCashPresets.length > 0 && (
            <div className="payment-gopos-presets">
              {quickCashPresets.map((amount) => (
                <button
                  key={amount}
                  className="payment-gopos-preset tactile-press"
                  disabled={isActionLocked || !isKeypadEnabled}
                  onClick={() => applyQuickAmount(amount)}
                  type="button"
                >
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>
          )}

          {mode === 'SPLIT' && (
            <div className="payment-gopos-split-editor">
              <label className="payment-gopos-split-field">
                <span>Nakit</span>
                <input
                  className="input"
                  inputMode="decimal"
                  onChange={(event) => {
                    const sanitized = sanitizeAmountInput(event.target.value);
                    setSplitCashInput(sanitized);
                    applySplitFromCashAmount(parsePaymentInput(sanitized));
                  }}
                  placeholder="0"
                  type="text"
                  value={splitCashInput}
                />
              </label>
              <label className="payment-gopos-split-field">
                <span>Kart</span>
                <input
                  className="input"
                  inputMode="decimal"
                  onChange={(event) => {
                    const sanitized = sanitizeAmountInput(event.target.value);
                    setSplitCardInput(sanitized);
                    applySplitFromCardAmount(parsePaymentInput(sanitized));
                  }}
                  placeholder="0"
                  type="text"
                  value={splitCardInput}
                />
              </label>
            </div>
          )}

          <div className={`payment-gopos-keypad ${isKeypadEnabled ? '' : 'disabled'}`}>
            <button
              className="payment-gopos-key payment-gopos-key-accent payment-gopos-key-wide tactile-press"
              disabled={isActionLocked || !isKeypadEnabled}
              onClick={() => applyQuickAmount(totals.grandTotal)}
              type="button"
            >
              Tumu
            </button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('7')} type="button">7</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('8')} type="button">8</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('9')} type="button">9</button>

            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => increaseCashInput(quickIncrementButtons[0] ?? 20)} type="button">{`+${quickIncrementButtons[0] ?? 20}`}</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => increaseCashInput(quickIncrementButtons[1] ?? 50)} type="button">{`+${quickIncrementButtons[1] ?? 50}`}</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('4')} type="button">4</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('5')} type="button">5</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('6')} type="button">6</button>

            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => increaseCashInput(quickIncrementButtons[2] ?? 100)} type="button">{`+${quickIncrementButtons[2] ?? 100}`}</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => increaseCashInput(quickIncrementButtons[3] ?? 200)} type="button">{`+${quickIncrementButtons[3] ?? 200}`}</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('1')} type="button">1</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('2')} type="button">2</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('3')} type="button">3</button>

            <button className="payment-gopos-key tactile-press" disabled={isActionLocked} onClick={applyCartDiscount} type="button">% Iskonto</button>
            <button
              className={`payment-gopos-key tactile-press ${mode === 'SPLIT' ? 'payment-gopos-key-selected' : ''}`}
              disabled={isActionLocked}
              onClick={toggleSplitMode}
              type="button"
            >
              Bol
            </button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput(',')} type="button">,</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => appendCashInput('0')} type="button">0</button>
            <button className="payment-gopos-key tactile-press" disabled={isActionLocked || !isKeypadEnabled} onClick={() => mode === 'SPLIT' ? applySplitFromCashAmount(parsePaymentInput(splitCashInput.slice(0, -1))) : setCashInput((current) => current.slice(0, -1))} type="button">Sil</button>
          </div>

          {mode === 'ON_ACCOUNT' ? (
            <div className="payment-gopos-change ok">
              Tutar cari hesaba yazilacak.
            </div>
          ) : mode === 'SPLIT' ? (
            <div className="payment-gopos-split-summary">
              <span>Nakit: {formatCurrency(split.cash)}</span>
              <span>Kart: {formatCurrency(split.card)}</span>
            </div>
          ) : (
            <div className={`payment-gopos-change ${isCashEnough ? 'ok' : 'warn'}`}>
              {isCashEnough
                ? `Para Ustu: ${formatCurrency(calculateChange(totals.grandTotal, paidAmount))}`
                : `Eksik Tutar: ${formatCurrency(remainingAmount)}`}
            </div>
          )}

          {isCompactViewport && (
            <div className="payment-gopos-fast-actions">
              <button
                className="btn btn-success btn-block payment-gopos-fast-complete"
                disabled={!canComplete}
                onClick={() => void completePayment()}
                type="button"
              >
                {isSubmitting ? 'Isleniyor...' : 'Hizli Odeme Al'}
              </button>
              <button
                className="btn btn-ghost btn-block"
                disabled={!lastPaymentAction || isActionLocked}
                onClick={applyLastPaymentPreset}
                type="button"
              >
                Son Odemeyi Uygula
              </button>
            </div>
          )}
        </section>

        <aside className="payment-gopos-column payment-gopos-right">
          <div className="payment-gopos-header">
            <h3>Odeme Yap</h3>
          </div>

          <div className="payment-gopos-method-list">
            <button
              className={`payment-gopos-method cash tactile-press ${mode === 'CASH' ? 'active' : ''}`}
              disabled={isActionLocked}
              onClick={() => selectPaymentMode('CASH')}
              type="button"
            >
              Nakit
            </button>
            <button
              className={`payment-gopos-method card tactile-press ${mode === 'CARD' ? 'active' : ''}`}
              disabled={isActionLocked}
              onClick={() => selectPaymentMode('CARD')}
              type="button"
            >
              Kredi Karti
            </button>
            <button
              className={`payment-gopos-method split tactile-press ${mode === 'SPLIT' ? 'active' : ''}`}
              disabled={isActionLocked}
              onClick={() => selectPaymentMode('SPLIT')}
              type="button"
            >
              Bol
            </button>
            <button
              className={`payment-gopos-method muted tactile-press ${mode === 'ON_ACCOUNT' ? 'active' : ''}`}
              disabled={isActionLocked}
              onClick={() => selectPaymentMode('ON_ACCOUNT')}
              type="button"
            >
              Cari
            </button>
            {integrations.isYNOKCEnabled && (
              <button
                className={`payment-gopos-method card tactile-press ${isYNOKCProcessing ? 'loading' : ''}`}
                disabled={isActionLocked || isYNOKCProcessing}
                onClick={async () => {
                  if (!window.electronAPI) return;
                  setIsYNOKCProcessing(true);
                  try {
                    const result = await window.electronAPI.processYNOKCPayment({
                      amount: totals.grandTotal,
                      paymentType: 'CREDIT_CARD',
                      registerId: state.registerId || 'REG1',
                    });
                    if (result.status === 'SUCCESS') {
                      toast.success('OKC odemesi basarili.');
                      selectPaymentMode('CARD');
                      void completePayment();
                    }
                  } catch (err: any) {
                    toast.error(`OKC Hatasi: ${err.message}`);
                  } finally {
                    setIsYNOKCProcessing(false);
                  }
                }}
                type="button"
              >
                YN ÖKC
              </button>
            )}
          </div>

          {integrations.isEInvoiceEnabled && (
            <div className="payment-gopos-billing-options">
              <div className="payment-gopos-subtitle">Belge Tipi</div>
              <div className="payment-gopos-billing-tabs">
                <button 
                  className={`billing-tab tactile-press ${billingType === 'RETAIL' ? 'active' : ''}`}
                  onClick={() => setBillingType('RETAIL')}
                  type="button"
                >
                  Perakende Fis
                </button>
                <button 
                  className={`billing-tab tactile-press ${billingType === 'E_ARCHIVE' ? 'active' : ''}`}
                  onClick={() => setBillingType('E_ARCHIVE')}
                  type="button"
                >
                  e-Arşiv
                </button>
                <button 
                  className={`billing-tab tactile-press ${billingType === 'E_INVOICE' ? 'active' : ''}`}
                  onClick={() => setBillingType('E_INVOICE')}
                  type="button"
                >
                  e-Fatura
                </button>
              </div>
            </div>
          )}

          <div className="payment-card-hint">
            <div className="payment-card-hint-title">Klavye Kisayollari</div>
            <div className="payment-card-hint-text">F1 Nakit, F2 Kart, F3 Bol, F4 Cari, F9 Son Odeme</div>
            <div className="payment-card-hint-text">Rakam, Backspace ve Delete ile tutar girisi</div>
          </div>

          {mode === 'ON_ACCOUNT' && (
            <div
              className={`payment-gopos-change ${
                hasCustomerSelected ? 'ok' : 'warn'
              }`}
            >
              {hasCustomerSelected
                ? `Musteri: ${state.activeCustomerName ?? '-'}`
                : 'Cari odeme icin once satis ekranindan musteri secin.'}
              {!hasCustomerSelected && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={openCustomerPicker}
                  style={{ marginLeft: '0.5rem' }}
                  type="button"
                >
                  Musteri Sec
                </button>
              )}
            </div>
          )}

          <div className="payment-gopos-note">
            <label htmlFor="payment-note">Not (Opsiyonel)</label>
            <input
              id="payment-note"
              className="input"
              onChange={(event) => setNote(event.target.value)}
              disabled={isActionLocked}
              placeholder="Satis notu"
              type="text"
              value={note}
            />
          </div>

          {paymentSummary && (
            <div className={`payment-status-card ${paymentSummary.severity}`}>
              <strong>{paymentSummary.message}</strong>
              <span>{paymentSummary.queueInfo}</span>
              {paymentSummary.warnings.map((warning, index) => (
                <span key={`${warning}-${index}`}>{warning}</span>
              ))}
              <small>{new Date(paymentSummary.timestamp).toLocaleTimeString('tr-TR')}</small>
            </div>
          )}

          <div className="payment-shift-summary">
            <h4>Vardiya Ozeti</h4>
            <div className="payment-shift-row"><span>Satis</span><strong>{shiftSummary.sales}</strong></div>
            <div className="payment-shift-row"><span>Nakit</span><strong>{formatCurrency(shiftSummary.cash)}</strong></div>
            <div className="payment-shift-row"><span>Kart</span><strong>{formatCurrency(shiftSummary.card)}</strong></div>
            <div className="payment-shift-row"><span>Cari</span><strong>{formatCurrency(shiftSummary.onAccount)}</strong></div>
          </div>

          <div className="payment-gopos-right-actions">
            <button
              className="btn btn-ghost btn-block"
              disabled={!lastPaymentAction || isActionLocked}
              onClick={applyLastPaymentPreset}
              type="button"
            >
              Son Odemeyi Uygula
            </button>
            <button
              className="btn btn-success btn-block"
              disabled={!canComplete}
              onClick={() => void completePayment()}
              type="button"
            >
              {isSubmitting ? 'Isleniyor...' : 'D.Odeme'}
            </button>
            <button
              className="payment-gopos-close-btn"
              disabled={isActionLocked}
              onClick={onClose}
              type="button"
            >
              Pencereyi Kapat
            </button>
          </div>
        </aside>
      </div>
      {isCustomerPickerOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Musteri secimi">
          <div className="modal-card sale-customer-modal">
            <div className="modal-header">
              <div>
                <h3 style={{ marginBottom: '0.35rem' }}>Cari Musteri Secimi</h3>
                <p className="modal-caption">Cari odemeye devam etmek icin musteri secin.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={closeCustomerPicker} type="button">
                Kapat
              </button>
            </div>
            <div className="sale-customer-search-row">
              <input
                autoFocus
                className="input"
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Musteri adi veya telefon ara"
                type="text"
                value={customerSearch}
              />
              <button className="btn btn-ghost" onClick={() => setCustomerSearch('')} type="button">
                Temizle
              </button>
            </div>
            <div className="sale-customer-list">
              {isCustomerLoading ? (
                <div className="sale-customer-empty">Musteriler yukleniyor...</div>
              ) : customerLoadError.length > 0 ? (
                <div className="sale-customer-empty">{customerLoadError}</div>
              ) : customerResults.length === 0 ? (
                <div className="sale-customer-empty">Kayitli musteri bulunamadi.</div>
              ) : (
                customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    className={`sale-customer-list-item ${
                      state.activeCustomerId === customer.id ? 'active' : ''
                    }`}
                    onClick={() => assignCustomer(customer)}
                    type="button"
                  >
                    <span className="sale-customer-list-name">{customer.fullName ?? customer.name}</span>
                    <span className="sale-customer-list-meta">
                      {customer.phone || '-'} | Bakiye: {customer.balance.toFixed(2)} TL
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
