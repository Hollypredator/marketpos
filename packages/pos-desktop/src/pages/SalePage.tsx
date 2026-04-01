import React, { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import CartItem from '../components/CartItem';
import ManagerApprovalModal from '../components/ManagerApprovalModal';
import ProductCard from '../components/ProductCard';
import { logSecurityEvent } from '../services/pos-runtime';
import { getUiPresetDefinition, sortProductsByPreset } from '../services/ui-preset';
import { getCartTotals, useApp, useToast } from '../store';

interface SalePageProps {
  onOpenPayment: () => void;
}

export default function SalePage({ onOpenPayment }: SalePageProps) {
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isClearApprovalOpen, setClearApprovalOpen] = useState(false);

  const totals = getCartTotals(state.cart);
  const presetAccentColor = getUiPresetDefinition(state.uiPreset).accentColor;

  const categoryOptions = useMemo(
    () => [{ id: 'all', name: 'Tumu' }, ...state.categories.map((category) => ({
      id: category.id,
      name: category.name,
    }))],
    [state.categories],
  );

  const visibleProducts = useMemo(
    () => {
      const filtered = state.products.filter((product) =>
        activeCategory === 'all' ? true : product.categoryId === activeCategory,
      );
      return sortProductsByPreset(filtered, state.uiPreset, state.categories);
    },
    [activeCategory, state.categories, state.products, state.uiPreset],
  );

  useEffect(() => {
    const focusBarcodeInput = (): void => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!barcodeInputRef.current || !document.hasFocus() || document.hidden) {
        return;
      }
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

    focusBarcodeInput();
    window.addEventListener('focus', focusBarcodeInput);
    const handleVisibility = (): void => {
      if (!document.hidden) {
        focusBarcodeInput();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', focusBarcodeInput);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const addProductToCart = (productId: string): void => {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product) {
      toast.error('Urun cache icinde bulunamadi.');
      return;
    }
    dispatch({
      payload: {
        barcode: product.barcode,
        name: product.name,
        productId: product.id,
        unitPrice: product.salePrice,
        vatRate: product.vatRate,
      },
      type: 'ADD_TO_CART',
    });
  };

  const tryScanBarcode = (): void => {
    const barcode = barcodeInput.trim();
    if (barcode.length === 0) {
      return;
    }
    const matched = state.products.find((product) => product.barcode === barcode);
    if (!matched) {
      toast.error('Barkod bulunamadi. Hizli urun ekranindan urun secmeyi deneyin.');
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

  const approveClearCart = async (approval: {
    managerFullName: string;
    managerUserId: string;
    method: 'PASSWORD' | 'PIN';
    reason: string;
  }): Promise<void> => {
    dispatch({ type: 'CLEAR_CART' });
    setClearApprovalOpen(false);
    toast.success(`Sepet temizlendi. Onaylayan: ${approval.managerFullName}`);
    try {
      await logSecurityEvent({
        eventType: 'CART_CLEAR_APPROVED',
        managerUserId: approval.managerUserId,
        message: 'Sepet temizleme islemi yonetici onayi ile tamamlandi.',
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

  const scrollCategoryTabs = (direction: 'left' | 'right'): void => {
    if (!categoryTabsRef.current) {
      return;
    }
    const distance = direction === 'left' ? -220 : 220;
    categoryTabsRef.current.scrollBy({ behavior: 'smooth', left: distance });
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Satis</span>
        <div className="header-info">
          <span>{state.user?.fullName}</span>
          <span>|</span>
          <span>
            <span className={`status-dot ${state.isOnline ? 'online' : 'offline'}`} />{' '}
            {state.isOnline ? 'Cevrimici' : 'Cevrimdisi'}
          </span>
          <span>|</span>
          <span>Kuyruk Satis: {state.queueSales}</span>
          <span>|</span>
          <span>Kuyruk Iade: {state.queueRefunds}</span>
        </div>
      </div>

      <div className="sale-layout">
        <div className="sale-left">
          <div className="barcode-area" style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              ref={barcodeInputRef}
              className="input input-barcode"
              id="barcode-input"
              onChange={(event) => setBarcodeInput(event.target.value)}
              onKeyDown={handleBarcodeKeyDown}
              placeholder="Barkod okutun..."
              type="text"
              value={barcodeInput}
            />
            <button className="btn btn-primary" onClick={tryScanBarcode} type="button">
              Ekle
            </button>
          </div>

          <div className="cart-area">
            {state.cart.length === 0 ? (
              <div className="cart-empty">
                <div className="cart-empty-icon">S</div>
                <div>Sepet bos</div>
                <div style={{ fontSize: '0.9rem' }}>Barkod okutun veya hizli urun secin</div>
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
                />
              ))
            )}
          </div>
        </div>

        <div className="sale-right">
          <div className="category-toolbar">
            <div className="category-toolbar-row">
              <span className="category-toolbar-title">Kategoriler</span>
              <div className="category-nav">
                <button
                  className="category-nav-btn"
                  onClick={() => scrollCategoryTabs('left')}
                  type="button"
                  aria-label="Kategorileri sola kaydir"
                >
                  ←
                </button>
                <button
                  className="category-nav-btn"
                  onClick={() => scrollCategoryTabs('right')}
                  type="button"
                  aria-label="Kategorileri saga kaydir"
                >
                  →
                </button>
              </div>
            </div>
            <div className="category-tabs" ref={categoryTabsRef}>
              {categoryOptions.map((category) => (
                <button
                  key={category.id}
                  className={`category-tab ${activeCategory === category.id ? 'active' : ''}`}
                  onClick={(event) => {
                    setActiveCategory(category.id);
                    event.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                      inline: 'center',
                    });
                  }}
                  type="button"
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="quick-products">
            <div className="quick-grid">
              {visibleProducts.slice(0, 36).map((product) => (
                <ProductCard
                  key={product.id}
                  accentColor={presetAccentColor}
                  product={product}
                  onSelect={() => addProductToCart(product.id)}
                />
              ))}
            </div>
          </div>

          <div className="sale-summary">
            <div className="summary-row">
              <span>Urun Sayisi</span>
              <span>{totals.itemCount} adet</span>
            </div>
            <div className="summary-row">
              <span>KDV</span>
              <span>{totals.totalVat.toFixed(2)} TL</span>
            </div>
            <div className="summary-row total">
              <span>TOPLAM</span>
              <span>{totals.formatGrandTotal}</span>
            </div>
          </div>

          <div className="sale-actions">
            <button
              className="btn btn-success btn-block sale-pay-btn"
              disabled={state.cart.length === 0}
              onClick={onOpenPayment}
              type="button"
            >
              Odeme Al
            </button>
            <button
              className="btn btn-ghost btn-block sale-clear-btn"
              disabled={state.cart.length === 0}
              onClick={clearCart}
              type="button"
            >
              Sepeti Temizle
            </button>
          </div>
        </div>
      </div>

      {isClearApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Sepeti Temizle"
          companyId={state.user?.companyId}
          description="Sepeti silme islemi icin yonetici onayi gereklidir."
          onCancel={() => setClearApprovalOpen(false)}
          onApproved={approveClearCart}
          reasonLabel="Temizleme Nedeni"
          reasonPlaceholder="Ornek: Yanlis urun girisi"
          requireReason
        />
      )}
    </>
  );
}
