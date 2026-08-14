import React, { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import CartItem from '../components/CartItem';
import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';
import ProductCard from '../components/ProductCard';
import {
  createCustomer,
  explainRuntimeError,
  fetchCustomers,
  logSecurityEvent,
} from '../services/pos-runtime';
import {
  capDiscountByPercent,
  capDiscountByPolicy,
  type DiscountPolicy,
  loadDiscountPolicy,
  parseDiscountInput,
  readDiscountPolicy,
  subscribeDiscountPolicy,
} from '../services/discount-policy';
import { getUiPresetDefinition, sortProductsByPreset } from '../services/ui-preset';
import type { CustomerRecord } from '../services/types';
import { parseScaleBarcode } from '@marketpos/shared';
import { getCartTotals, selectAuthSession, useApp, useToast } from '../store';

interface SalePageProps {
  onOpenPayment: () => void;
}

const PRODUCTS_PER_PAGE = 36;
const PAYMENT_QUICK_ACTION_STORAGE_KEY = 'marketpos:payment:quick-action';

export default function SalePage({ onOpenPayment }: SalePageProps) {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [productPage, setProductPage] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [isClearApprovalOpen, setClearApprovalOpen] = useState(false);
  const [isCustomerModalOpen, setCustomerModalOpen] = useState(false);
  const [isCustomerLoading, setCustomerLoading] = useState(false);
  const [isCustomerCreating, setCustomerCreating] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerRecord[]>([]);
  const [customerNameInput, setCustomerNameInput] = useState('');
  const [customerPhoneInput, setCustomerPhoneInput] = useState('');
  const [discountPolicy, setDiscountPolicy] = useState<DiscountPolicy>(() =>
    readDiscountPolicy(state.user?.companyId),
  );

  const totals = getCartTotals(state);
  const activeSession = useMemo(() => selectAuthSession(state), [state]);
  const presetAccentColor = getUiPresetDefinition(state.uiPreset).accentColor;

  useEffect(() => {
    let cancelled = false;
    void loadDiscountPolicy(state.user?.companyId).then((policy) => {
      if (!cancelled) {
        setDiscountPolicy(policy);
      }
    });
    const unsubscribe = subscribeDiscountPolicy((policy) => {
      setDiscountPolicy(policy);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [state.user?.companyId]);

  const categoryOptions = useMemo(
    () => [{ id: 'all', name: 'Tümü' }, ...state.categories.map((category) => ({
      id: category.id,
      name: category.name,
    }))],
    [state.categories],
  );

  const normalizedProductSearch = productSearch.trim().toLowerCase();

  const visibleProducts = useMemo(
    () => {
      const filteredByCategory = state.products.filter((product) =>
        activeCategory === 'all' ? true : product.categoryId === activeCategory,
      );

      const filteredBySearch =
        normalizedProductSearch.length === 0
          ? filteredByCategory
          : filteredByCategory.filter((product) =>
              product.name.toLowerCase().includes(normalizedProductSearch) ||
              product.barcode.toLowerCase().includes(normalizedProductSearch),
            );

      return sortProductsByPreset(filteredBySearch, state.uiPreset, state.categories);
    },
    [activeCategory, normalizedProductSearch, state.categories, state.products, state.uiPreset],
  );

  const totalProductPages = Math.max(1, Math.ceil(visibleProducts.length / PRODUCTS_PER_PAGE));
  const safeProductPage = Math.min(productPage, totalProductPages - 1);

  const currentPageProducts = useMemo(
    () =>
      visibleProducts.slice(
        safeProductPage * PRODUCTS_PER_PAGE,
        (safeProductPage + 1) * PRODUCTS_PER_PAGE,
      ),
    [safeProductPage, visibleProducts],
  );

  useEffect(() => {
    setProductPage(0);
  }, [activeCategory, normalizedProductSearch]);

  useEffect(() => {
    if (productPage > totalProductPages - 1) {
      setProductPage(Math.max(0, totalProductPages - 1));
    }
  }, [productPage, totalProductPages]);

  useEffect(() => {
    const focusBarcodeInput = (): void => {
      if (!barcodeInputRef.current || !document.hasFocus() || document.hidden) {
        return;
      }
      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        return;
      }
      if (document.querySelector('.modal-overlay')) {
        return;
      }
      barcodeInputRef.current.focus();
    };

    const timer = setTimeout(focusBarcodeInput, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isCustomerModalOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadCustomers(customerSearch.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [activeSession?.accessToken, activeSession?.sessionId, customerSearch, isCustomerModalOpen]);

  const addProductToCart = (productId: string): void => {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product) {
      toast.error('Ürün cache içinde bulunamadı.');
      return;
    }
    dispatch({
      payload: {
        barcode: product.barcode,
        name: product.name,
        productId: product.id,
        unitPrice: product.salePrice,
        vatRate: product.vatRate,
        campaign: product.campaign,
      },
      type: 'ADD_TO_CART',
    });
  };

  const loadCustomers = async (searchValue: string): Promise<void> => {
    if (!activeSession) {
      setCustomerResults([]);
      return;
    }

    setCustomerLoading(true);
    try {
      const customers = await fetchCustomers(activeSession, {
        activeOnly: true,
        limit: 100,
        search: searchValue,
      });
      setCustomerResults(customers);
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setCustomerLoading(false);
    }
  };

  const openCustomerModal = (): void => {
    if (!activeSession) {
      toast.error('Müşteri seçimi için aktif oturum bulunamadı.');
      return;
    }
    setCustomerModalOpen(true);
    setCustomerSearch('');
    setCustomerResults([]);
    setCustomerNameInput('');
    setCustomerPhoneInput('');
  };

  const clearSelectedCustomer = (): void => {
    dispatch({
      type: 'SET_CUSTOMER',
      payload: {
        customerId: null,
        customerName: null,
        priceTier: 'RETAIL',
      },
    });
    toast.info('Müşteri seçimi kaldırıldı.');
  };

  const assignCustomer = (customer: CustomerRecord): void => {
    const customerName = customer.fullName ?? customer.name ?? 'Musteri';
    dispatch({
      type: 'SET_CUSTOMER',
      payload: {
        customerId: customer.id,
        customerName,
        priceTier: (customer as any).priceTier || 'RETAIL',
      },
    });
    setCustomerModalOpen(false);
    toast.success(`${customerName} seçildi.`);
  };
  const submitCustomerCreate = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Müşteri kaydı için aktif oturum bulunamadı.');
      return;
    }
    const name = customerNameInput.trim();
    const phone = customerPhoneInput.trim();
    if (name.length < 2) {
      toast.error('Müşteri adı en az 2 karakter olmalı.');
      return;
    }

    setCustomerCreating(true);
    try {
      const createdCustomer = await createCustomer(activeSession, {
        name,
        phone: phone.length > 0 ? phone : undefined,
      });
      assignCustomer(createdCustomer);
      setCustomerNameInput('');
      setCustomerPhoneInput('');
      setCustomerSearch('');
      await loadCustomers('');
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setCustomerCreating(false);
    }
  };

  const tryScanBarcode = (): void => {
    const barcode = barcodeInput.trim();
    if (barcode.length === 0) {
      return;
    }

    const scaleData = parseScaleBarcode(barcode);
    if (scaleData) {
      const matchedScale = state.products.find((p) => p.barcode.startsWith(scaleData.pluCode) || p.barcode.includes(scaleData.pluCode));
      if (!matchedScale) {
        toast.error(`Terazi (PLU: ${scaleData.pluCode}) ile eşleşen ürün bulunamadı.`);
        return;
      }
      const qty = scaleData.value / 1000;
      dispatch({
        payload: {
          barcode: matchedScale.barcode,
          name: matchedScale.name,
          productId: matchedScale.id,
          unitPrice: matchedScale.salePrice,
          vatRate: matchedScale.vatRate,
          campaign: matchedScale.campaign,
          quantity: qty,
        },
        type: 'ADD_TO_CART',
      });
      setBarcodeInput('');
      toast.success(`${matchedScale.name} eklendi (${qty}kg/Adet)`);
      return;
    }

    const matched = state.products.find((product) => product.barcode === barcode);
    if (!matched) {
      toast.error('Barkod bulunamadı. Hızlı ürün ekranından ürün seçmeyi deneyin.');
      return;
    }
    addProductToCart(matched.id);
    setBarcodeInput('');
    toast.success(`${matched.name} sepete eklendi.`);
  };

  const handleBarcodeKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      tryScanBarcode();
    }
  };

  const clearCart = (): void => {
    if (state.cart.length === 0) {
      return;
    }
    setClearApprovalOpen(true);
  };

  const startQuickPayment = (mode: 'CARD' | 'CASH'): void => {
    if (state.cart.length === 0) {
      return;
    }
    try {
      window.localStorage.setItem(
        PAYMENT_QUICK_ACTION_STORAGE_KEY,
        JSON.stringify({
          autoComplete: true,
          fillFullAmount: mode === 'CASH',
          mode,
        }),
      );
    } catch {
      // Ignore storage write failures and continue with standard payment page.
    }
    onOpenPayment();
  };

  const approveClearCart = async (approval: ManagerApprovalPayload): Promise<void> => {
    dispatch({ type: 'CLEAR_CART' });
    setClearApprovalOpen(false);
    toast.success(`Sepet temizlendi. Onaylayan: ${approval.managerFullName}`);
    try {
      await logSecurityEvent({
        eventType: 'CART_CLEAR_APPROVED',
        managerUserId: approval.managerUserId,
        message: 'Sepet temizleme işlemi yönetici onayı ile tamamlandı.',
        metadataJson: JSON.stringify({
          method: approval.method,
          operatorUserId: state.user?.id ?? null,
        }),
        operatorUserId: state.user?.id ?? null,
        reason: approval.reason,
        severity: 'WARN',
      });
    } catch {
      // Audit log write failure must not block cashier flow.
    }
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Satış</span>
        <div className="header-info sale-header-info">
          <span>{state.user?.fullName}</span>
          <span>|</span>
          <span>
            <span className={`status-dot ${state.isOnline ? 'online pulse-status' : 'offline pulse-status-offline'}`} />{' '}
            {state.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
          </span>
          <span>|</span>
          <span>Kuyruk Satış: {state.queueSales}</span>
          <span>|</span>
          <span>Kuyruk İade: {state.queueRefunds}</span>
          <span>|</span>
          <button
            className="btn btn-sm btn-ghost sale-header-action"
            disabled={state.suspendedCarts.length === 0}
            onClick={() => {
              if (state.suspendedCarts.length > 0) {
                dispatch({ type: 'RESTORE_SUSPENDED_CART', payload: { id: state.suspendedCarts[0].id } });
                toast.success('Bekleyen sepet geri çağırıldı.');
              }
            }}
          >
            <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Parktaki Sepetler ({state.suspendedCarts.length})
          </button>
        </div>
      </div>

      <div className="sale-layout">
        <div className="sale-categories">
          <div className="section-header">
            <span>Kategoriler</span>
          </div>
          <div className="category-tabs" ref={categoryTabsRef}>
            {categoryOptions.map((category) => (
              <button
                key={category.id}
                className={`category-tab ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sale-products">
          <div className="barcode-area barcode-row">
            <input
              ref={barcodeInputRef}
              className="input input-barcode"
              id="barcode-input"
              onChange={(event) => setBarcodeInput(event.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Barkod okutun veya arayın..."
              type="text"
              value={barcodeInput}
            />
            <button className="btn btn-primary barcode-add-btn" onClick={tryScanBarcode} type="button">
              <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              Ekle
            </button>
          </div>

          <div className="sale-product-toolbar">
            <div className="sale-product-search-row">
              <input
                className="input sale-product-search"
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Ürün adı veya barkod ara..."
                type="text"
                value={productSearch}
              />
              <button
                className="btn btn-ghost sale-product-search-clear"
                disabled={productSearch.length === 0}
                onClick={() => setProductSearch('')}
                type="button"
              >
                <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                Temizle
              </button>
            </div>
            <div className="sale-product-toolbar-row">
              <span className="sale-product-count">
                {visibleProducts.length} ürün | Sayfa {safeProductPage + 1}/{totalProductPages}
              </span>
              <div className="sale-product-pagination">
                <button
                  className="btn btn-ghost sale-product-page-btn"
                  disabled={safeProductPage === 0}
                  onClick={() => setProductPage((current) => Math.max(0, current - 1))}
                  type="button"
                >
                  <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  Önceki
                </button>
                <button
                  className="btn btn-ghost sale-product-page-btn"
                  disabled={safeProductPage >= totalProductPages - 1}
                  onClick={() =>
                    setProductPage((current) => Math.min(totalProductPages - 1, current + 1))
                  }
                  type="button"
                >
                  Sonraki
                  <svg style={{ width: '18px', height: '18px', marginLeft: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>

          <div className="quick-products">
            {currentPageProducts.length === 0 ? (
              <div className="sale-product-empty">Filtreye uygun ürün bulunamadı.</div>
            ) : (
              <div className="quick-grid">
                {currentPageProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    accentColor={presetAccentColor}
                    product={product}
                    onSelect={() => addProductToCart(product.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sale-cart">
          <div className="section-header sale-cart-header">
            <span>{state.activeCustomerName ?? 'Yeni Sipariş'}</span>
            <div className="sale-customer-actions">
              <button
                className="btn btn-sm btn-ghost sale-customer-btn"
                onClick={openCustomerModal}
                type="button"
              >
                <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                Müşteri Seç
              </button>
              {state.activeCustomerId && (
                <button
                  className="btn btn-sm btn-ghost sale-customer-btn"
                  onClick={clearSelectedCustomer}
                  type="button"
                >
                  <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  İptal
                </button>
              )}
            </div>
          </div>
          <div className="cart-actions-hint">
            Aksiyonlar: İKR = İkram, İND = İndirim, SİL = Sepetten Kaldır
          </div>
          <div className="cart-area">
            {state.cart.length === 0 ? (
              <div className="cart-empty">
                <div className="cart-empty-icon" style={{ opacity: 0.2 }}>
                  <svg style={{ width: '64px', height: '64px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <div>Sepet boş</div>
                <div className="cart-empty-hint">Barkod okutun veya hızlı ürün seçin</div>
              </div>
            ) : (
              state.cart.map((item) => (
                <CartItem
                  key={item.productId}
                  item={item}
                  onDecrease={() =>
                    dispatch({
                      payload: { productId: item.productId, quantity: item.quantity - 1 },
                      type: 'UPDATE_QTY',
                    })
                  }
                  onIncrease={() =>
                    dispatch({
                      payload: { productId: item.productId, quantity: item.quantity + 1 },
                      type: 'UPDATE_QTY',
                    })
                  }
                  onRemove={() =>
                    dispatch({
                      payload: { productId: item.productId },
                      type: 'REMOVE_FROM_CART',
                    })
                  }
                  onCompliment={() =>
                    dispatch({
                      payload: { productId: item.productId },
                      type: 'TOGGLE_ITEM_COMPLIMENT',
                    })
                  }
                  onDiscount={() => {
                    const policy = discountPolicy;
                    const gross = item.quantity * item.unitPrice;
                    const raw = window.prompt(
                      `Ürün indirimi girin (TL veya %). Maks ${policy.maxItemDiscountPercent}%`,
                      (item.discountAmount || 0).toString(),
                    );
                    if (raw === null) {
                      return;
                    }
                    const parsedDiscount = parseDiscountInput(raw, gross);
                    if (parsedDiscount === null) {
                      toast.error('Geçersiz indirim değeri. Örnek: 10 veya 10%');
                      return;
                    }
                    const policyLimitedDiscount = capDiscountByPolicy(
                      parsedDiscount,
                      gross,
                      policy,
                      'ITEM',
                    );
                    dispatch({
                      payload: { productId: item.productId, discountAmount: policyLimitedDiscount },
                      type: 'APPLY_ITEM_DISCOUNT',
                    });
                    if (policyLimitedDiscount < parsedDiscount) {
                      toast.info(
                        `İndirim politika gereği ürün için %${policy.maxItemDiscountPercent} ve ${policy.maxItemDiscountAmount.toFixed(2)} TL limiti ile sınırlandı.`,
                      );
                    }
                  }}
                />
              ))
            )}
          </div>

          <div className="sale-summary">
            <div className="summary-row sale-discount-row">
              <button
                className="btn btn-sm btn-ghost sale-discount-btn"
                onClick={() => {
                  const policy = discountPolicy;
                  const raw = window.prompt(
                    `Genel sepet indirimi girin (TL veya %). Maks ${policy.maxCartDiscountPercent}%`,
                    state.cartDiscountAmount.toString(),
                  );
                  if (raw === null) {
                    return;
                  }
                  const parsedDiscount = parseDiscountInput(raw, totals.subtotal);
                  if (parsedDiscount === null) {
                    toast.error('Geçersiz indirim değeri. Örnek: 25 veya 10%');
                    return;
                  }
                  const policyLimitedDiscount = capDiscountByPolicy(
                    parsedDiscount,
                    totals.subtotal,
                    policy,
                    'CART',
                  );
                  dispatch({ type: 'SET_CART_DISCOUNT', payload: policyLimitedDiscount });
                  if (policyLimitedDiscount < parsedDiscount) {
                    toast.info(
                      `Genel indirim politika gereği sepet için %${policy.maxCartDiscountPercent} ve ${policy.maxCartDiscountAmount.toFixed(2)} TL limiti ile sınırlandı.`,
                    );
                  }
                }}
              >
                <svg style={{ width: '16px', height: '16px', marginRight: '6px', color: '#f2a614' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                Genel İndirim Uygula
              </button>
            </div>
            <div className="summary-row sale-policy-row">
              <span>İndirim Politikası</span>
              <span>
                {`Ürün %${discountPolicy.maxItemDiscountPercent} (${discountPolicy.maxItemDiscountAmount.toFixed(0)} TL) / Sepet %${discountPolicy.maxCartDiscountPercent} (${discountPolicy.maxCartDiscountAmount.toFixed(0)} TL)`}
              </span>
            </div>
            {state.cartDiscountAmount > 0 && (
              <div className="summary-row" style={{ color: 'var(--danger)' }}>
                <span>Sepet İndirimi</span>
                <span>-{state.cartDiscountAmount.toFixed(2)} TL</span>
              </div>
            )}
            {totals.bundleDiscountTotal > 0 && (
              <div className="summary-row" style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                <span>Kombo İndirimi</span>
                <span>-{totals.bundleDiscountTotal.toFixed(2)} TL</span>
              </div>
            )}
            {totals.appliedBundles && totals.appliedBundles.length > 0 && (
              <div className="applied-bundles-list">
                {totals.appliedBundles.map((b: any) => (
                  <div key={b.bundleId} className="applied-bundle-item">
                     ✨ {b.name} ({b.count}x)
                  </div>
                ))}
              </div>
            )}
            <div className="summary-row">
              <span>Ürün Sayısı</span>
              <span>{totals.itemCount} adet</span>
            </div>
            <div className="summary-row">
              <span>KDV</span>
              <span>{totals.totalVat.toFixed(2)} TL</span>
            </div>
            <div className="summary-row total accent-gradient-banner" style={{ backdropFilter: 'blur(16px)', background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(99, 102, 241, 0.2) 100%)', border: '1.5px solid rgba(79, 70, 229, 0.35)', borderRadius: '14px', padding: '14px 18px', boxShadow: '0 8px 24px rgba(79, 70, 229, 0.12)' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>TOPLAM</span>
              <span style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--accent)' }}>{totals.formatGrandTotal}</span>
            </div>
          </div>

          <div className="sale-actions">
            <button
              className="btn btn-success btn-block sale-pay-btn"
              disabled={state.cart.length === 0}
              onClick={onOpenPayment}
              type="button"
            >
              <svg style={{ width: '24px', height: '24px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Ödeme Al
            </button>
            <div className="sale-quick-pay-actions">
              <button
                className="btn btn-success btn-block sale-quick-pay-btn"
                disabled={state.cart.length === 0}
                onClick={() => startQuickPayment('CASH')}
                type="button"
              >
                <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Tek Dokun Nakit
              </button>
              <button
                className="btn btn-info btn-block sale-quick-pay-btn"
                disabled={state.cart.length === 0}
                onClick={() => startQuickPayment('CARD')}
                type="button"
              >
                <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                Tek Dokun Kart
              </button>
            </div>
            <div className="sale-secondary-actions">
              <button
                className="btn btn-info btn-block sale-secondary-btn"
                disabled={state.cart.length === 0}
                onClick={() => {
                  dispatch({ type: 'SUSPEND_CURRENT_CART' });
                  toast.success('Sepet beklemeye alındı.');
                }}
                type="button"
              >
                <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Park Et
              </button>
              <button
                className="btn btn-warning btn-block sale-clear-btn sale-secondary-btn"
                disabled={state.cart.length === 0}
                onClick={clearCart}
                type="button"
              >
                <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                İptal
              </button>
            </div>
          </div>
        </div>
      </div>

      {isCustomerModalOpen && (
        <div className="modal-overlay" role="presentation">
          <div className="modal-card sale-customer-modal">
            <div className="modal-header">
              <h3>Müşteri Seçimi</h3>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setCustomerModalOpen(false)}
                type="button"
              >
                Kapat
              </button>
            </div>
            <p className="modal-caption">
              Cari ödeme için buradan mevcut müşteri seçebilir veya hızlıca yeni müşteri
              oluşturabilirsiniz.
            </p>

            <div className="sale-customer-search-row">
              <input
                className="input"
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Müşteri adı, telefon veya vergi no ara..."
                type="text"
                value={customerSearch}
              />
              <button
                className="btn btn-ghost"
                disabled={customerSearch.length === 0}
                onClick={() => setCustomerSearch('')}
                type="button"
              >
                Temizle
              </button>
            </div>

            <div className="sale-customer-list">
              {isCustomerLoading ? (
                <div className="sale-customer-empty">Müşteriler yükleniyor...</div>
              ) : customerResults.length === 0 ? (
                <div className="sale-customer-empty">Kayıtlı müşteri bulunamadı.</div>
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
                    <span className="sale-customer-list-name">{customer.fullName || customer.name}</span>
                    <span className="sale-customer-list-meta">
                      {customer.phone || '-'} | Bakiye: {customer.balance.toFixed(2)} TL
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="sale-customer-create">
              <h4>Yeni Müşteri</h4>
              <div className="modal-grid-two">
                <div className="login-field">
                  <label htmlFor="customer-name-input">Müşteri Adı</label>
                  <input
                    id="customer-name-input"
                    className="input"
                    onChange={(event) => setCustomerNameInput(event.target.value)}
                    placeholder="Örnek: Mehmet Demir"
                    type="text"
                    value={customerNameInput}
                  />
                </div>
                <div className="login-field">
                  <label htmlFor="customer-phone-input">Telefon (Opsiyonel)</label>
                  <input
                    id="customer-phone-input"
                    className="input"
                    onChange={(event) => setCustomerPhoneInput(event.target.value)}
                    placeholder="05xx xxx xx xx"
                    type="text"
                    value={customerPhoneInput}
                  />
                </div>
              </div>
              <div className="sale-customer-create-actions">
                <button
                  className="btn btn-success"
                  disabled={isCustomerCreating}
                  onClick={() => void submitCustomerCreate()}
                  type="button"
                >
                  {isCustomerCreating ? 'Kaydediliyor...' : 'Kaydet ve Seç'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isClearApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Sepeti Temizle"
          companyId={state.user?.companyId}
          description="Sepeti silme işlemi için yönetici onayı gereklidir."
          onCancel={() => setClearApprovalOpen(false)}
          onApproved={approveClearCart}
          reasonLabel="Temizleme Nedeni"
          reasonPlaceholder="Örnek: Yanlış ürün girişi"
          requireReason
        />
      )}
    </>
  );
}

