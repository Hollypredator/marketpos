import React, { useEffect, useRef, useState } from 'react';
import type { StorageAdapterProduct } from '@marketpos/shared';

interface FastStockEntryModalProps {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
  onProductUpdated?: () => void;
  storageAdapter: {
    getCachedProducts: (opts: { companyId: string; search?: string }) => Promise<StorageAdapterProduct[]>;
    queueProductOp: (opts: { localId?: string; opType: string; payload: unknown }) => Promise<any>;
  };
}

export const FastStockEntryModal: React.FC<FastStockEntryModalProps> = ({
  companyId,
  isOpen,
  onClose,
  onProductUpdated,
  storageAdapter,
}) => {
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [activeProduct, setActiveProduct] = useState<StorageAdapterProduct | null>(null);
  const [quantityToAdd, setQuantityToAdd] = useState<number>(1);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  
  // New Product Form state if barcode not found
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 100);
    } else {
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setScannedBarcode('');
    setActiveProduct(null);
    setQuantityToAdd(1);
    setCostPrice(0);
    setSalePrice(0);
    setIsNewProduct(false);
    setNewProductName('');
    setStatusMessage(null);
  };

  const handleBarcodeSearch = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const products = await storageAdapter.getCachedProducts({ companyId, search: code });
      const exactMatch = products.find((p) => p.barcode === code) || products[0];

      if (exactMatch) {
        setActiveProduct(exactMatch);
        setIsNewProduct(false);
        setCostPrice(exactMatch.costPrice || 0);
        setSalePrice(exactMatch.priceTierRetail || 0);
        setStatusMessage({ text: `Ürün bulundu: ${exactMatch.name} (Mevcut Stok: ${exactMatch.stockCount})`, type: 'info' });
        setTimeout(() => quantityInputRef.current?.focus(), 100);
      } else {
        setActiveProduct(null);
        setIsNewProduct(true);
        setStatusMessage({ text: 'Ürün bulunamadı! Yeni ürün olarak tanımlayabilirsiniz.', type: 'info' });
        setTimeout(() => newNameInputRef.current?.focus(), 100);
      }
    } catch (err: any) {
      setStatusMessage({ text: `Arama hatası: ${err.message || 'Bilinmeyen hata'}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSearch(scannedBarcode);
    }
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedBarcode.trim()) return;

    setIsLoading(true);
    try {
      if (isNewProduct) {
        if (!newProductName.trim()) {
          setStatusMessage({ text: 'Lütfen ürün adını giriniz.', type: 'error' });
          setIsLoading(false);
          return;
        }
        await storageAdapter.queueProductOp({
          opType: 'CREATE',
          payload: {
            barcode: scannedBarcode.trim(),
            companyId,
            costPrice,
            name: newProductName.trim(),
            priceTierRetail: salePrice,
            stockCount: Math.max(1, quantityToAdd),
            unit: 'PIECE',
            vatRate: 20,
          },
        });
        setStatusMessage({ text: `✅ "${newProductName}" yeni ürün olarak stoğa eklendi!`, type: 'success' });
      } else if (activeProduct) {
        const updatedStock = activeProduct.stockCount + Number(quantityToAdd);
        await storageAdapter.queueProductOp({
          localId: activeProduct.id,
          opType: 'UPDATE',
          payload: {
            ...activeProduct,
            costPrice: costPrice || activeProduct.costPrice,
            priceTierRetail: salePrice || activeProduct.priceTierRetail,
            stockCount: updatedStock,
          },
        });
        setStatusMessage({ text: `✅ "${activeProduct.name}" stoğu güncellendi! (Yeni Stok: ${updatedStock})`, type: 'success' });
      }

      onProductUpdated?.();
      // Prepare for next barcode scan
      setTimeout(() => {
        resetForm();
        barcodeInputRef.current?.focus();
      }, 800);
    } catch (err: any) {
      setStatusMessage({ text: `Kaydetme hatası: ${err.message || 'Bilinmeyen hata'}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '640px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📦</span> Barkod ile Hızlı Stok Girişi (F3)
            </h2>
            <p className="modal-subtitle">Barkod okuyucunuzu okutun, stoğu 1 saniyede güncelleyin.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Kapat">✕</button>
        </div>

        <form onSubmit={handleSaveStock} className="modal-body" style={{ display: 'grid', gap: '16px' }}>
          {statusMessage && (
            <div className={`status-banner ${statusMessage.type}`} style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
              {statusMessage.text}
            </div>
          )}

          {/* Barcode Field */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Barkod No (Okutun veya Yazın)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                ref={barcodeInputRef}
                type="text"
                className="input input-barcode"
                placeholder="Barkod okutunuz..."
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleBarcodeSearch(scannedBarcode)}
                disabled={isLoading}
              >
                Ara
              </button>
            </div>
          </div>

          {/* Existing Product Info / Form */}
          {activeProduct && (
            <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent)' }}>{activeProduct.name}</div>
              <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                <span>Mevcut Stok: <strong>{activeProduct.stockCount} {activeProduct.unit}</strong></span>
                <span>Mevcut Satış Fiyatı: <strong>{activeProduct.priceTierRetail} ₺</strong></span>
              </div>
            </div>
          )}

          {/* New Product Inputs */}
          {isNewProduct && (
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Ürün Adı</label>
              <input
                ref={newNameInputRef}
                type="text"
                className="input"
                placeholder="Örn: Ülker Çikolatalı Gofret 36gr"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                required
              />
            </div>
          )}

          {/* Quantity & Price Row */}
          {(activeProduct || isNewProduct) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>Eklenecek Stok Miktarı</label>
                <input
                  ref={quantityInputRef}
                  type="number"
                  min="1"
                  className="input"
                  value={quantityToAdd}
                  onChange={(e) => setQuantityToAdd(Number(e.target.value))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Alış Fiyatı (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={costPrice}
                  onChange={(e) => setCostPrice(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Satış Fiyatı (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  value={salePrice}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="modal-footer" style={{ marginTop: '12px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              İptal (Esc)
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={isLoading || (!activeProduct && !isNewProduct)}
            >
              {isLoading ? 'Kaydediliyor...' : 'Stoğa Ekle (Enter)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
