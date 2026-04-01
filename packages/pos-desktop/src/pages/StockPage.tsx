import React, { useEffect, useMemo, useState } from 'react';

import { VAT_RATES, formatCurrency } from '@marketpos/shared';

import {
  createStockMovement,
  createProduct,
  explainRuntimeError,
  fetchStockLevels,
  loadCatalog,
  logSecurityEvent,
  updateProduct,
} from '../services/pos-runtime';
import type { StockLevelRow } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

interface ProductCreateFormState {
  barcode: string;
  categoryId: string;
  isQuickAccess: boolean;
  minStock: string;
  name: string;
  purchasePrice: string;
  quickAccessOrder: string;
  salePrice: string;
  vatRate: string;
}

interface ProductEditFormState {
  barcode: string;
  categoryId: string;
  isQuickAccess: boolean;
  minStock: string;
  name: string;
  quickAccessOrder: string;
  salePrice: string;
  vatRate: string;
}

const DEFAULT_VAT_RATE = VAT_RATES[0] ?? 1;

const initialCreateForm: ProductCreateFormState = {
  barcode: '',
  categoryId: '',
  isQuickAccess: false,
  minStock: '0',
  name: '',
  purchasePrice: '0',
  quickAccessOrder: '',
  salePrice: '0',
  vatRate: String(DEFAULT_VAT_RATE),
};

const initialEditForm: ProductEditFormState = {
  barcode: '',
  categoryId: '',
  isQuickAccess: false,
  minStock: '0',
  name: '',
  quickAccessOrder: '',
  salePrice: '0',
  vatRate: String(DEFAULT_VAT_RATE),
};

function parseDecimal(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

export default function StockPage() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isApplyingCount, setIsApplyingCount] = useState(false);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [countScanInput, setCountScanInput] = useState('');
  const [countMap, setCountMap] = useState<Record<string, number>>({});
  const [productCreateForm, setProductCreateForm] =
    useState<ProductCreateFormState>(initialCreateForm);
  const [productEditForm, setProductEditForm] =
    useState<ProductEditFormState>(initialEditForm);
  const [productQuery, setProductQuery] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<StockLevelRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const refreshCatalog = async (): Promise<void> => {
    if (!activeSession) {
      return;
    }
    const catalog = await loadCatalog(activeSession);
    dispatch({ payload: catalog, type: 'SET_CATALOG' });
  };

  const loadStock = async (): Promise<void> => {
    if (!activeSession) {
      setError('Aktif oturum bulunamadi.');
      setIsLoading(false);
      return;
    }
    if (!activeSession.accessToken) {
      setError('Stok ve urun yonetimi su anda sadece online modda kullanilabilir.');
      setIsLoading(false);
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const data = await fetchStockLevels(activeSession);
      setRows(data);
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStock();
  }, [activeSession?.accessToken, activeSession?.user.id]);

  const filteredStockRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword.length === 0) {
      return rows;
    }
    return rows.filter((row) =>
      row.product.name.toLowerCase().includes(keyword) ||
      row.product.barcode.toLowerCase().includes(keyword),
    );
  }, [query, rows]);

  const filteredProducts = useMemo(() => {
    const keyword = productQuery.trim().toLowerCase();
    const source = [...state.products].sort((left, right) =>
      left.name.localeCompare(right.name, 'tr'),
    );

    if (keyword.length === 0) {
      return source;
    }
    return source.filter((product) =>
      product.name.toLowerCase().includes(keyword) ||
      product.barcode.toLowerCase().includes(keyword),
    );
  }, [productQuery, state.products]);

  const selectedProduct = useMemo(
    () => state.products.find((product) => product.id === selectedProductId) ?? null,
    [selectedProductId, state.products],
  );

  const countRows = useMemo(
    () =>
      Object.entries(countMap)
        .map(([productId, counted]) => {
          const stockRow = rows.find((row) => row.product.id === productId);
          return stockRow
            ? {
                counted,
                delta: counted - stockRow.quantity,
                stock: stockRow,
              }
            : null;
        })
        .filter((row): row is { counted: number; delta: number; stock: StockLevelRow } => row !== null)
        .sort((left, right) => left.stock.product.name.localeCompare(right.stock.product.name, 'tr')),
    [countMap, rows],
  );

  const startEditProduct = (productId: string): void => {
    const target = state.products.find((product) => product.id === productId);
    if (!target) {
      return;
    }
    setSelectedProductId(productId);
    const stockRow = rows.find((row) => row.product.id === target.id);
    setProductEditForm({
      barcode: target.barcode,
      categoryId: target.categoryId ?? '',
      isQuickAccess: target.isQuickAccess,
      minStock: String(stockRow?.product.minStock ?? 0),
      name: target.name,
      quickAccessOrder:
        typeof target.quickAccessOrder === 'number'
          ? String(target.quickAccessOrder)
          : '',
      salePrice: String(target.salePrice),
      vatRate: String(target.vatRate),
    });
  };

  const submitProductCreate = async (): Promise<void> => {
    if (!activeSession || !activeSession.accessToken) {
      setError('Urun ekleme icin online oturum gereklidir.');
      return;
    }

    const name = productCreateForm.name.trim();
    const barcode = productCreateForm.barcode.trim();
    if (name.length === 0 || barcode.length === 0) {
      toast.error('Urun adi ve barkod zorunludur.');
      return;
    }

    setIsSavingProduct(true);
    try {
      await createProduct(activeSession, {
        barcode,
        categoryId: productCreateForm.categoryId || undefined,
        isQuickAccess: productCreateForm.isQuickAccess,
        minStock: Math.max(0, parseInteger(productCreateForm.minStock, 0)),
        name,
        purchasePrice: Math.max(0, parseDecimal(productCreateForm.purchasePrice, 0)),
        quickAccessOrder:
          productCreateForm.quickAccessOrder.trim().length > 0
            ? Math.max(0, parseInteger(productCreateForm.quickAccessOrder, 0))
            : undefined,
        salePrice: Math.max(0, parseDecimal(productCreateForm.salePrice, 0)),
        vatRate: parseDecimal(productCreateForm.vatRate, DEFAULT_VAT_RATE),
      });

      await refreshCatalog();
      await loadStock();
      setProductCreateForm(initialCreateForm);
      toast.success('Urun eklendi.');
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSavingProduct(false);
    }
  };

  const submitProductUpdate = async (): Promise<void> => {
    if (!activeSession || !activeSession.accessToken) {
      setError('Urun duzenleme icin online oturum gereklidir.');
      return;
    }
    if (!selectedProductId) {
      toast.error('Duzenlenecek urunu secin.');
      return;
    }

    const name = productEditForm.name.trim();
    const barcode = productEditForm.barcode.trim();
    if (name.length === 0 || barcode.length === 0) {
      toast.error('Urun adi ve barkod zorunludur.');
      return;
    }

    setIsSavingProduct(true);
    try {
      await updateProduct(activeSession, selectedProductId, {
        barcode,
        categoryId: productEditForm.categoryId || undefined,
        isQuickAccess: productEditForm.isQuickAccess,
        minStock: Math.max(0, parseInteger(productEditForm.minStock, 0)),
        name,
        quickAccessOrder:
          productEditForm.quickAccessOrder.trim().length > 0
            ? Math.max(0, parseInteger(productEditForm.quickAccessOrder, 0))
            : undefined,
        salePrice: Math.max(0, parseDecimal(productEditForm.salePrice, 0)),
        vatRate: parseDecimal(productEditForm.vatRate, DEFAULT_VAT_RATE),
      });

      await refreshCatalog();
      await loadStock();
      toast.success('Urun guncellendi.');
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSavingProduct(false);
    }
  };

  const addCountByBarcode = (): void => {
    const barcode = countScanInput.trim();
    if (barcode.length === 0) {
      return;
    }
    const target = rows.find((row) => row.product.barcode === barcode);
    if (!target) {
      toast.error('Sayim icin barkod bulunamadi.');
      return;
    }
    setCountMap((current) => ({
      ...current,
      [target.product.id]: (current[target.product.id] ?? 0) + 1,
    }));
    setCountScanInput('');
  };

  const applyCountAdjustments = async (): Promise<void> => {
    if (!activeSession || !activeSession.accessToken) {
      toast.error('Sayim duzeltmesi icin online oturum gereklidir.');
      return;
    }
    const actionable = countRows.filter((row) => Math.abs(row.delta) > 0.0001);
    if (actionable.length === 0) {
      toast.info('Uygulanacak sayim farki bulunamadi.');
      return;
    }

    setIsApplyingCount(true);
    try {
      for (const row of actionable) {
        await createStockMovement(activeSession, {
          note: `Sayim duzeltmesi | once=${row.stock.quantity.toFixed(3)} | sayim=${row.counted.toFixed(3)}`,
          productId: row.stock.product.id,
          quantity: row.delta,
          reference: `COUNT-${new Date().toISOString().slice(0, 10)}`,
        });
      }
      await logSecurityEvent({
        eventType: 'STOCK_COUNT_APPLIED',
        message: `Sayim duzeltmesi uygulandi (${actionable.length} urun)`,
        metadataJson: JSON.stringify({
          operatorUserId: activeSession.user.id,
          rows: actionable.map((row) => ({
            delta: row.delta,
            productId: row.stock.product.id,
            quantity: row.stock.quantity,
          })),
        }),
        operatorUserId: activeSession.user.id,
        severity: 'INFO',
      });
      setCountMap({});
      await loadStock();
      toast.success('Sayim farklari stok hareketi olarak uygulandi.');
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsApplyingCount(false);
    }
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Stok ve Urun Yonetimi</span>
        <div className="header-info">
          <span>Stok Kaydi: {rows.length}</span>
          <span>|</span>
          <span>Urun: {state.products.length}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void loadStock()} type="button">
            Yenile
          </button>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1rem' }}>
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Hizli Urun Girisi
          </h3>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Urun Adi</label>
              <input
                className="input"
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                type="text"
                value={productCreateForm.name}
              />
            </div>
            <div className="login-field">
              <label>Barkod</label>
              <input
                className="input"
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    barcode: event.target.value,
                  }))
                }
                type="text"
                value={productCreateForm.barcode}
              />
            </div>
          </div>

          <div className="modal-grid-two">
            <div className="login-field">
              <label>Kategori</label>
              <select
                className="input"
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    categoryId: event.target.value,
                  }))
                }
                value={productCreateForm.categoryId}
              >
                <option value="">Kategori yok</option>
                {state.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="login-field">
              <label>KDV</label>
              <select
                className="input"
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    vatRate: event.target.value,
                  }))
                }
                value={productCreateForm.vatRate}
              >
                {VAT_RATES.map((vatRate) => (
                  <option key={vatRate} value={String(vatRate)}>
                    %{vatRate}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-grid-two">
            <div className="login-field">
              <label>Alis Fiyati</label>
              <input
                className="input"
                min={0}
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    purchasePrice: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={productCreateForm.purchasePrice}
              />
            </div>
            <div className="login-field">
              <label>Satis Fiyati</label>
              <input
                className="input"
                min={0}
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    salePrice: event.target.value,
                  }))
                }
                step="0.01"
                type="number"
                value={productCreateForm.salePrice}
              />
            </div>
          </div>

          <div className="modal-grid-two">
            <div className="login-field">
              <label>Min Stok</label>
              <input
                className="input"
                min={0}
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    minStock: event.target.value,
                  }))
                }
                step="1"
                type="number"
                value={productCreateForm.minStock}
              />
            </div>
            <div className="login-field">
              <label>Hizli Erisim Sirasi (opsiyonel)</label>
              <input
                className="input"
                min={0}
                onChange={(event) =>
                  setProductCreateForm((current) => ({
                    ...current,
                    quickAccessOrder: event.target.value,
                  }))
                }
                step="1"
                type="number"
                value={productCreateForm.quickAccessOrder}
              />
            </div>
          </div>

          <label
            style={{
              alignItems: 'center',
              display: 'inline-flex',
              gap: '0.5rem',
              marginBottom: '0.8rem',
            }}
          >
            <input
              checked={productCreateForm.isQuickAccess}
              onChange={(event) =>
                setProductCreateForm((current) => ({
                  ...current,
                  isQuickAccess: event.target.checked,
                }))
              }
              type="checkbox"
            />
            Hizli erisim urunu
          </label>

          <div>
            <button
              className="btn btn-success btn-lg"
              disabled={isSavingProduct || !activeSession?.accessToken}
              onClick={() => void submitProductCreate()}
              type="button"
            >
              {isSavingProduct ? 'Kaydediliyor...' : 'Urunu Ekle'}
            </button>
          </div>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Urun Duzenleme
          </h3>
          <input
            className="input"
            onChange={(event) => setProductQuery(event.target.value)}
            placeholder="Duzenlemek icin urun veya barkod ara"
            type="text"
            value={productQuery}
          />
          <div className="table-wrapper" style={{ marginTop: '0.75rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Urun</th>
                  <th>Barkod</th>
                  <th style={{ textAlign: 'right' }}>Satis</th>
                  <th style={{ textAlign: 'right' }}>KDV</th>
                  <th style={{ textAlign: 'right' }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.slice(0, 20).map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.barcode}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(product.salePrice)}</td>
                    <td style={{ textAlign: 'right' }}>%{product.vatRate}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => startEditProduct(product.id)}
                        type="button"
                      >
                        Duzenle
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Urun bulunamadi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selectedProduct && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Secili Urun: {selectedProduct.name}</h4>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Urun Adi</label>
                  <input
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    type="text"
                    value={productEditForm.name}
                  />
                </div>
                <div className="login-field">
                  <label>Barkod</label>
                  <input
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        barcode: event.target.value,
                      }))
                    }
                    type="text"
                    value={productEditForm.barcode}
                  />
                </div>
              </div>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Kategori</label>
                  <select
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        categoryId: event.target.value,
                      }))
                    }
                    value={productEditForm.categoryId}
                  >
                    <option value="">Kategori yok</option>
                    {state.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="login-field">
                  <label>KDV</label>
                  <select
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        vatRate: event.target.value,
                      }))
                    }
                    value={productEditForm.vatRate}
                  >
                    {VAT_RATES.map((vatRate) => (
                      <option key={vatRate} value={String(vatRate)}>
                        %{vatRate}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Satis Fiyati</label>
                  <input
                    className="input"
                    min={0}
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        salePrice: event.target.value,
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={productEditForm.salePrice}
                  />
                </div>
                <div className="login-field">
                  <label>Min Stok</label>
                  <input
                    className="input"
                    min={0}
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        minStock: event.target.value,
                      }))
                    }
                    step="1"
                    type="number"
                    value={productEditForm.minStock}
                  />
                </div>
              </div>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Hizli Erisim Sirasi (opsiyonel)</label>
                  <input
                    className="input"
                    min={0}
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        quickAccessOrder: event.target.value,
                      }))
                    }
                    step="1"
                    type="number"
                    value={productEditForm.quickAccessOrder}
                  />
                </div>
              </div>

              <label
                style={{
                  alignItems: 'center',
                  display: 'inline-flex',
                  gap: '0.5rem',
                  marginBottom: '0.8rem',
                }}
              >
                <input
                  checked={productEditForm.isQuickAccess}
                  onChange={(event) =>
                    setProductEditForm((current) => ({
                      ...current,
                      isQuickAccess: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Hizli erisim urunu
              </label>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  className="btn btn-success btn-lg"
                  disabled={isSavingProduct || !activeSession?.accessToken}
                  onClick={() => void submitProductUpdate()}
                  type="button"
                >
                  {isSavingProduct ? 'Guncelleniyor...' : 'Urunu Guncelle'}
                </button>
                <button
                  className="btn btn-ghost btn-lg"
                  disabled={isSavingProduct}
                  onClick={() => {
                    setSelectedProductId(null);
                    setProductEditForm(initialEditForm);
                  }}
                  type="button"
                >
                  Vazgec
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Stok Durumu
          </h3>
          <input
            className="input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Urun adi veya barkod ara"
            type="text"
            value={query}
          />
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.65rem' }}>
            Hizli Sayim Modu
          </h3>
          <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '0.75rem' }}>
            <input
              className="input"
              placeholder="Barkod okutun"
              value={countScanInput}
              onChange={(event) => setCountScanInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addCountByBarcode();
                }
              }}
            />
            <button className="btn btn-primary" type="button" onClick={addCountByBarcode}>
              Sayima Ekle
            </button>
          </div>

          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Urun</th>
                  <th style={{ textAlign: 'right' }}>Mevcut</th>
                  <th style={{ textAlign: 'right' }}>Sayilan</th>
                  <th style={{ textAlign: 'right' }}>Fark</th>
                </tr>
              </thead>
              <tbody>
                {countRows.map((row) => (
                  <tr key={row.stock.product.id}>
                    <td>{row.stock.product.name}</td>
                    <td style={{ textAlign: 'right' }}>{row.stock.quantity.toFixed(3)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="input"
                        style={{ maxWidth: '120px', textAlign: 'right' }}
                        type="number"
                        step="0.001"
                        min={0}
                        value={row.counted}
                        onChange={(event) =>
                          setCountMap((current) => ({
                            ...current,
                            [row.stock.product.id]: (() => {
                              const next = Number.parseFloat(event.target.value || '0');
                              return Number.isFinite(next) ? Math.max(0, next) : 0;
                            })(),
                          }))
                        }
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.delta.toFixed(3)}</td>
                  </tr>
                ))}
                {countRows.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Sayim icin barkod okutarak urun ekleyin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.75rem' }}>
            <button
              className="btn btn-success"
              type="button"
              disabled={isApplyingCount || countRows.length === 0}
              onClick={() => void applyCountAdjustments()}
            >
              {isApplyingCount ? 'Uygulaniyor...' : 'Sayim Farkini Uygula'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={isApplyingCount || countRows.length === 0}
              onClick={() => setCountMap({})}
            >
              Sayimi Temizle
            </button>
          </div>
        </div>

        {isLoading && <div className="card">Stok verisi yukleniyor...</div>}
        {!isLoading && error.length > 0 && <div className="card">{error}</div>}

        {!isLoading && error.length === 0 && (
          <div className="card">
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Urun</th>
                    <th>Barkod</th>
                    <th style={{ textAlign: 'right' }}>Miktar</th>
                    <th style={{ textAlign: 'right' }}>Min Stok</th>
                    <th style={{ textAlign: 'right' }}>Satis Fiyati</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStockRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.product.name}</td>
                      <td>{row.product.barcode}</td>
                      <td style={{ textAlign: 'right' }}>{row.quantity.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.product.minStock}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(row.product.salePrice)}</td>
                    </tr>
                  ))}
                  {filteredStockRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                        Sonuc bulunamadi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
