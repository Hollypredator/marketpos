import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Product } from '../domain/catalog/types';
import { money } from '../lib/format';

export interface PosCustomerRecord {
  id: string;
  name: string;
  phone?: string | null;
}

interface CartItem {
  id: string;
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  vatRate: number;
}

interface PosRegisterViewProps {
  products: Product[];
  categories: Array<{ id: string; name: string }>;
  customers?: PosCustomerRecord[];
  onCompleteSale?: (saleData: {
    items: CartItem[];
    paymentType: 'CASH' | 'CARD' | 'VERESIYE';
    totalAmount: number;
    customerId?: string;
  }) => Promise<void>;
}

export function PosRegisterView({
  products,
  categories,
  customers = [],
  onCompleteSale,
}: PosRegisterViewProps): React.ReactElement {
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CARD' | 'VERESIYE'>('CASH');
  const [receivedCash, setReceivedCash] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    items: CartItem[];
    paymentType: string;
    total: number;
    changeDue: number;
    date: string;
  } | null>(null);

  // Focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Filter products by category and search query
  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategoryId !== 'ALL') {
      result = result.filter((p) => p.categoryId === selectedCategoryId);
    }
    if (barcodeQuery.trim().length > 0) {
      const q = barcodeQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, selectedCategoryId, barcodeQuery]);

  // Handle add product to cart
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: product.id,
          barcode: product.barcode,
          name: product.name,
          price: Number(product.salePrice) || 0,
          quantity: 1,
          vatRate: Number(product.vatRate) || 18,
        },
      ];
    });
    setBarcodeQuery('');
    barcodeInputRef.current?.focus();
  };

  // Handle barcode submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;

    const matched = products.find(
      (p) => p.barcode.trim().toLowerCase() === barcodeQuery.trim().toLowerCase()
    );

    if (matched) {
      addToCart(matched);
    } else if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
    }
  };

  // Update item quantity
  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  // Remove item
  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // Calculate cart totals
  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const totalQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  // Open Payment Modal
  const openPayment = (type: 'CASH' | 'CARD' | 'VERESIYE') => {
    if (cart.length === 0) return;
    setPaymentType(type);
    setReceivedCash(type === 'CASH' ? String(totalAmount) : '');
    setIsPaymentModalOpen(true);
  };

  // Complete Payment
  const handleCompletePayment = async () => {
    setIsProcessing(true);
    try {
      if (onCompleteSale) {
        await onCompleteSale({
          customerId: selectedCustomerId || undefined,
          items: cart,
          paymentType,
          totalAmount,
        });
      }

      const cashVal = Number(receivedCash) || totalAmount;
      const changeDue = Math.max(0, cashVal - totalAmount);

      setLastReceipt({
        changeDue,
        date: new Date().toLocaleTimeString('tr-TR'),
        items: [...cart],
        paymentType:
          paymentType === 'CASH'
            ? 'Nakit'
            : paymentType === 'CARD'
            ? 'Kredi Kartı'
            : 'Veresiye',
        total: totalAmount,
      });

      // Clear cart
      setCart([]);
      setIsPaymentModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
      barcodeInputRef.current?.focus();
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '16px', height: 'calc(100vh - 120px)' }}>
      {/* ── LEFT PANEL: SEPET & ÖDEME ────────────────────────────── */}
      <div
        style={{
          background: 'var(--bg-card, #1e1e2e)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header & Barcode Search */}
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)' }}>
          <form onSubmit={handleBarcodeSubmit}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="🔍 Barkod okutun veya ürün adı arayın..."
                value={barcodeQuery}
                onChange={(e) => setBarcodeQuery(e.target.value)}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1.5px solid var(--primary, #4f46e5)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '1rem',
                  color: '#fff',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ borderRadius: '10px', padding: '0 16px', fontWeight: 700 }}
              >
                Ekle
              </button>
            </div>
          </form>

          {/* Müşteri Seçimi */}
          {customers.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  padding: '8px',
                  color: '#fff',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">👤 Perakende Müşteri (Varsayılan)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    👤 {c.name} ({c.phone || 'Telefon yok'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Sepet Listesi */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🛒</div>
              <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>Sepetiniz Boş</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                Barkod okutun veya sağdaki hızlı ürünlerden dokunarak sepete ekleyin.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {cart.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {money(item.price)} x {item.quantity} Adet
                    </div>
                  </div>

                  {/* Quantity Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => updateQuantity(item.id, -1)}
                      style={{ padding: '4px 10px', fontSize: '0.9rem', borderRadius: '6px' }}
                    >
                      -
                    </button>
                    <span style={{ fontWeight: 800, width: '24px', textAlign: 'center', color: '#fff' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => updateQuantity(item.id, 1)}
                      style={{ padding: '4px 10px', fontSize: '0.9rem', borderRadius: '6px' }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '70px', marginLeft: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#818cf8' }}>
                      {money(item.price * item.quantity)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
                    >
                      Kaldır
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sepet Alt Toplam & Ödeme Butonları */}
        <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <span>Toplam Ürün: {totalQuantity} Kalem</span>
            <button
              type="button"
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
            >
              Sepeti Temizle
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>GENEL TOPLAM:</span>
            <span style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', letterSpacing: '-0.02em' }}>
              {money(totalAmount)}
            </span>
          </div>

          {/* Big Payment Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              className="btn"
              disabled={cart.length === 0}
              onClick={() => openPayment('CASH')}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
              }}
            >
              💵 NAKİT ({money(totalAmount)})
            </button>
            <button
              type="button"
              className="btn"
              disabled={cart.length === 0}
              onClick={() => openPayment('CARD')}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '1rem',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
              }}
            >
              💳 KREDİ KARTI
            </button>
          </div>

          <button
            type="button"
            className="btn btn-block"
            disabled={cart.length === 0}
            onClick={() => openPayment('VERESIYE')}
            style={{
              marginTop: '10px',
              background: 'rgba(255, 159, 28, 0.15)',
              border: '1.5px solid rgba(255, 159, 28, 0.5)',
              color: '#ff9f1c',
              fontWeight: 700,
              padding: '10px',
              borderRadius: '10px',
            }}
          >
            🤝 VERESİYE / MÜŞTERİ CARİ KARTINA İŞLE
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL: DOKUNMATİK HIZLI ÜRÜN KARTLARI ─────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Category Pills */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px' }}>
          <button
            type="button"
            className={`btn ${selectedCategoryId === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedCategoryId('ALL')}
            style={{ borderRadius: '20px', whiteSpace: 'nowrap', padding: '8px 18px', fontWeight: 700 }}
          >
            Tüm Ürünler ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`btn ${selectedCategoryId === cat.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedCategoryId(cat.id)}
              style={{ borderRadius: '20px', whiteSpace: 'nowrap', padding: '8px 18px', fontWeight: 600 }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Cards Grid */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', paddingRight: '4px' }}>
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              onClick={() => addToCart(p)}
              style={{
                background: 'var(--bg-card, #1e1e2e)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.borderColor = 'var(--primary, #4f46e5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {p.barcode}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                  {p.name}
                </div>
              </div>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                  Min Stok: {p.minStock ?? 0}
                </span>
                <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#818cf8' }}>
                  {money(Number(p.salePrice) || 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAYMENT MODAL / DRAWER ─────────────────────────────────── */}
      {isPaymentModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div style={{
            background: 'var(--bg-card, #1e1e2e)', border: '1.5px solid rgba(255,255,255,0.15)',
            borderRadius: '20px', width: '480px', padding: '24px', display: 'grid', gap: '16px'
          }}>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
              {paymentType === 'CASH' ? '💵 Nakit Ödeme Al' : paymentType === 'CARD' ? '💳 Kredi Kartı Ödeme' : '🤝 Veresiye Satış'}
            </h2>

            <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ÖDENMESİ GEREKEN TOPLAM</div>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#10b981' }}>
                {money(totalAmount)}
              </div>
            </div>

            {paymentType === 'CASH' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '6px' }}>Müşteriden Alınan Nakit (₺)</label>
                <input
                  type="number"
                  value={receivedCash}
                  onChange={(e) => setReceivedCash(e.target.value)}
                  style={{
                    width: '100%', padding: '12px', fontSize: '1.2rem', fontWeight: 800,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '10px', color: '#fff'
                  }}
                  autoFocus
                />
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Para Üstü:</span>
                  <span style={{ color: Number(receivedCash) >= totalAmount ? '#10b981' : '#ef4444' }}>
                    {money(Math.max(0, (Number(receivedCash) || 0) - totalAmount))}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setIsPaymentModalOpen(false)}
              >
                İptal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 2, fontWeight: 800, padding: '14px', fontSize: '1.1rem' }}
                disabled={isProcessing}
                onClick={handleCompletePayment}
              >
                {isProcessing ? 'İşleniyor...' : '✓ Ödemeyi Onayla ve Fiş Kes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LAST RECEIPT SUCCESS NOTIFICATION ────────────────────────── */}
      {lastReceipt && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', background: '#10b981', color: '#fff',
          padding: '16px 24px', borderRadius: '14px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', gap: '14px'
        }}>
          <div style={{ fontSize: '2rem' }}>🎉</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Satış Başarıyla Tamamlandı!</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
              {lastReceipt.paymentType} • Toplam: {money(lastReceipt.total)} {lastReceipt.changeDue > 0 ? `• Para Üstü: ${money(lastReceipt.changeDue)}` : ''}
            </div>
          </div>
          <button
            onClick={() => setLastReceipt(null)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', marginLeft: '12px' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
