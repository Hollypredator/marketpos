import React, { useEffect, useMemo, useState } from 'react';

import { VAT_RATES, formatCurrency } from '@marketpos/shared';

import {
  createStockMovement,
  createProduct,
  explainRuntimeError,
  fetchSuppliers,
  fetchStockLevels,
  loadCatalog,
  logSecurityEvent,
  updateProduct,
} from '../services/pos-runtime';
import type { StockLevelRow, SupplierRecord } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

interface ProductCreateFormState {
  barcode: string;
  brand: string;
  categoryId: string;
  isQuickAccess: boolean;
  minStock: string;
  name: string;
  purchasePrice: string;
  quickAccessOrder: string;
  salePrice: string;
  supplierId: string;
  vatRate: string;
}

interface ProductEditFormState {
  barcode: string;
  brand: string;
  categoryId: string;
  isQuickAccess: boolean;
  minStock: string;
  name: string;
  purchasePrice: string;
  quickAccessOrder: string;
  salePrice: string;
  supplierId: string;
  vatRate: string;
}

const DEFAULT_VAT_RATE = VAT_RATES[0] ?? 1;
const STOCK_UI_VARIANT_KEY = 'stock_ui_variant';
const PAGE_SIZE = 20;

type StockUiVariant = 'classic' | 'neo';

function resolveStockUiVariant(): StockUiVariant {
  if (typeof window === 'undefined') {
    return 'neo';
  }
  return window.localStorage.getItem(STOCK_UI_VARIANT_KEY) === 'classic'
    ? 'classic'
    : 'neo';
}

function getStockHealthStatus(quantity: number, minStock: number): 'LOW' | 'OK' | 'OUT' {
  if (quantity <= 0) return 'OUT';
  if (quantity <= minStock) return 'LOW';
  return 'OK';
}

const initialCreateForm: ProductCreateFormState = {
  barcode: '',
  brand: '',
  categoryId: '',
  isQuickAccess: false,
  minStock: '0',
  name: '',
  purchasePrice: '0',
  quickAccessOrder: '',
  salePrice: '0',
  supplierId: '',
  vatRate: String(DEFAULT_VAT_RATE),
};

const initialEditForm: ProductEditFormState = {
  barcode: '',
  brand: '',
  categoryId: '',
  isQuickAccess: false,
  minStock: '0',
  name: '',
  purchasePrice: '0',
  quickAccessOrder: '',
  salePrice: '0',
  supplierId: '',
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

function playBeep(frequency: number, duration: number): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.error('Audio feedback failed:', e);
  }
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
  const [stockUiVariant, setStockUiVariant] = useState<StockUiVariant>(() =>
    resolveStockUiVariant(),
  );
  const [productCreateForm, setProductCreateForm] =
    useState<ProductCreateFormState>(initialCreateForm);
  const [productEditForm, setProductEditForm] =
    useState<ProductEditFormState>(initialEditForm);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productBrand, setProductBrand] = useState('');
  const [productSupplierId, setProductSupplierId] = useState('');
  const [query, setQuery] = useState('');
  const [productCriticalOnly, setProductCriticalOnly] = useState(false);
  const [productCategoryId, setProductCategoryId] = useState('');
  const [stockScope, setStockScope] = useState<'ALL' | 'CRITICAL' | 'OUT'>('ALL');
  const [productPage, setProductPage] = useState(1);
  const [stockPage, setStockPage] = useState(1);
  const [rows, setRows] = useState<StockLevelRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isApplyingBulkUpdate, setIsApplyingBulkUpdate] = useState(false);
  const [bulkTarget, setBulkTarget] = useState<'FILTERED' | 'SELECTED'>('FILTERED');
  const [bulkSaleMode, setBulkSaleMode] = useState<'PERCENT' | 'SET'>('PERCENT');
  const [bulkSaleValue, setBulkSaleValue] = useState('');
  const [bulkPurchaseMode, setBulkPurchaseMode] = useState<'PERCENT' | 'SET'>('PERCENT');
  const [bulkPurchaseValue, setBulkPurchaseValue] = useState('');
  const [bulkBrandValue, setBulkBrandValue] = useState('');
  const [bulkSupplierId, setBulkSupplierId] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeSession) {
        if (!cancelled) {
          setSuppliers([]);
        }
        return;
      }
      try {
        const result = await fetchSuppliers(activeSession, {
          activeOnly: true,
          limit: 100,
          page: 1,
        });
        if (!cancelled) {
          setSuppliers(result.data);
        }
      } catch (caughtError: unknown) {
        if (!cancelled) {
          toast.error(explainRuntimeError(caughtError));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSession?.sessionId]);

  useEffect(() => {
    window.localStorage.setItem(STOCK_UI_VARIANT_KEY, stockUiVariant);
  }, [stockUiVariant]);

  const filteredStockRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        keyword.length > 0 &&
        !row.product.name.toLowerCase().includes(keyword) &&
        !row.product.barcode.toLowerCase().includes(keyword)
      ) {
        return false;
      }
      const status = getStockHealthStatus(row.quantity, row.product.minStock);
      if (stockScope === 'OUT') {
        return status === 'OUT';
      }
      if (stockScope === 'CRITICAL') {
        return status === 'LOW' || status === 'OUT';
      }
      return true;
    });
  }, [query, rows, stockScope]);

  const filteredProducts = useMemo(() => {
    const keyword = productQuery.trim().toLowerCase();
    const source = [...state.products].sort((left, right) =>
      left.name.localeCompare(right.name, 'tr'),
    );
    return source.filter((product) => {
      const productBrandText = (product.brand ?? '').toLowerCase();
      const productSupplierName = (product.supplierName ?? '').toLowerCase();
      if (
        keyword.length > 0 &&
        !product.name.toLowerCase().includes(keyword) &&
        !product.barcode.toLowerCase().includes(keyword) &&
        !productBrandText.includes(keyword) &&
        !productSupplierName.includes(keyword)
      ) {
        return false;
      }
      if (productCategoryId.length > 0 && product.categoryId !== productCategoryId) {
        return false;
      }
      if (productBrand.length > 0 && (product.brand ?? '') !== productBrand) {
        return false;
      }
      if (productSupplierId.length > 0 && (product.supplierId ?? '') !== productSupplierId) {
        return false;
      }
      if (productCriticalOnly) {
        const row = rows.find((entry) => entry.product.id === product.id);
        if (!row) return false;
        const status = getStockHealthStatus(row.quantity, row.product.minStock);
        return status === 'LOW' || status === 'OUT';
      }
      return true;
    });
  }, [
    productBrand,
    productCategoryId,
    productCriticalOnly,
    productQuery,
    productSupplierId,
    rows,
    state.products,
  ]);

  const availableBrands = useMemo(
    () =>
      [...new Set(state.products.map((product) => (product.brand ?? '').trim()).filter((brand) => brand.length > 0))]
        .sort((left, right) => left.localeCompare(right, 'tr')),
    [state.products],
  );

  const selectedProduct = useMemo(
    () => state.products.find((product) => product.id === selectedProductId) ?? null,
    [selectedProductId, state.products],
  );

  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = useMemo(() => {
    const start = (productPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, productPage]);

  const stockTotalPages = Math.max(1, Math.ceil(filteredStockRows.length / PAGE_SIZE));
  const pagedStockRows = useMemo(() => {
    const start = (stockPage - 1) * PAGE_SIZE;
    return filteredStockRows.slice(start, start + PAGE_SIZE);
  }, [filteredStockRows, stockPage]);

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

  const activeFilterChips = useMemo(() => {
    const chips: string[] = [];
    if (productQuery.trim().length > 0) {
      chips.push(`Urun arama: ${productQuery.trim()}`);
    }
    if (productCategoryId.length > 0) {
      const categoryName =
        state.categories.find((category) => category.id === productCategoryId)?.name ??
        'Kategori';
      chips.push(`Kategori: ${categoryName}`);
    }
    if (productBrand.length > 0) {
      chips.push(`Marka: ${productBrand}`);
    }
    if (productSupplierId.length > 0) {
      const supplierName =
        suppliers.find((supplier) => supplier.id === productSupplierId)?.name ??
        'Tedarikci';
      chips.push(`Tedarikci: ${supplierName}`);
    }
    if (productCriticalOnly) {
      chips.push('Sadece kritik urunler');
    }
    if (query.trim().length > 0) {
      chips.push(`Stok arama: ${query.trim()}`);
    }
    if (stockScope === 'CRITICAL') {
      chips.push('Kapsam: Kritik + Stok Yok');
    } else if (stockScope === 'OUT') {
      chips.push('Kapsam: Sadece Stok Yok');
    }
    return chips;
  }, [
    productBrand,
    productCategoryId,
    productCriticalOnly,
    productQuery,
    productSupplierId,
    query,
    state.categories,
    stockScope,
    suppliers,
  ]);

  const clearAllFilters = (): void => {
    setProductQuery('');
    setProductCategoryId('');
    setProductBrand('');
    setProductSupplierId('');
    setProductCriticalOnly(false);
    setQuery('');
    setStockScope('ALL');
    setProductPage(1);
    setStockPage(1);
  };

  useEffect(() => {
    setProductPage(1);
  }, [productBrand, productCategoryId, productCriticalOnly, productQuery, productSupplierId]);

  useEffect(() => {
    setStockPage(1);
  }, [query, stockScope]);

  useEffect(() => {
    if (productPage > productTotalPages) {
      setProductPage(productTotalPages);
    }
  }, [productPage, productTotalPages]);

  useEffect(() => {
    if (stockPage > stockTotalPages) {
      setStockPage(stockTotalPages);
    }
  }, [stockPage, stockTotalPages]);

  useEffect(() => {
    const visibleIds = new Set(filteredProducts.map((product) => product.id));
    setSelectedProductIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [filteredProducts]);

  const startEditProduct = (productId: string): void => {
    const target = state.products.find((product) => product.id === productId);
    if (!target) {
      return;
    }
    setSelectedProductId(productId);
    const stockRow = rows.find((row) => row.product.id === target.id);
    setProductEditForm({
      barcode: target.barcode,
      brand: target.brand ?? '',
      categoryId: target.categoryId ?? '',
      isQuickAccess: target.isQuickAccess,
      minStock: String(stockRow?.product.minStock ?? 0),
      name: target.name,
      purchasePrice: String(target.purchasePrice ?? 0),
      quickAccessOrder:
        typeof target.quickAccessOrder === 'number'
          ? String(target.quickAccessOrder)
          : '',
      salePrice: String(target.salePrice),
      supplierId: target.supplierId ?? '',
      vatRate: String(target.vatRate),
    });
  };

  const toggleStockUiVariant = (): void => {
    setStockUiVariant((current) => (current === 'neo' ? 'classic' : 'neo'));
  };

  const submitProductCreate = async (): Promise<void> => {
    if (!activeSession) {
      setError('Urun ekleme icin aktif oturum gereklidir.');
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
        brand: productCreateForm.brand.trim() || null,
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
        supplierId: productCreateForm.supplierId || null,
        vatRate: parseDecimal(productCreateForm.vatRate, DEFAULT_VAT_RATE),
      });

      await refreshCatalog();
      await loadStock();
      setProductCreateForm(initialCreateForm);
      toast.success(
        activeSession.accessToken && activeSession.isOnline
          ? 'Urun eklendi.'
          : 'Urun offline kuyruga alindi.',
      );
      setIsCreateDrawerOpen(false);
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsSavingProduct(false);
    }
  };

  const submitProductUpdate = async (): Promise<void> => {
    if (!activeSession) {
      setError('Urun duzenleme icin aktif oturum gereklidir.');
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
        brand: productEditForm.brand.trim() || null,
        categoryId: productEditForm.categoryId || undefined,
        isQuickAccess: productEditForm.isQuickAccess,
        minStock: Math.max(0, parseInteger(productEditForm.minStock, 0)),
        name,
        purchasePrice: Math.max(0, parseDecimal(productEditForm.purchasePrice, 0)),
        quickAccessOrder:
          productEditForm.quickAccessOrder.trim().length > 0
            ? Math.max(0, parseInteger(productEditForm.quickAccessOrder, 0))
            : undefined,
        salePrice: Math.max(0, parseDecimal(productEditForm.salePrice, 0)),
        supplierId: productEditForm.supplierId || null,
        vatRate: parseDecimal(productEditForm.vatRate, DEFAULT_VAT_RATE),
      });

      await refreshCatalog();
      await loadStock();
      toast.success(
        activeSession.accessToken && activeSession.isOnline
          ? 'Urun guncellendi.'
          : 'Urun guncellemesi offline kuyruga alindi.',
      );
      setSelectedProductId(null);
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
      playBeep(150, 0.35);
      toast.error('Sayim icin barkod bulunamadi.');
      return;
    }
    playBeep(440, 0.1);
    setCountMap((current) => ({
      ...current,
      [target.product.id]: (current[target.product.id] ?? 0) + 1,
    }));
    setCountScanInput('');
  };

  const applyCountAdjustments = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Sayim duzeltmesi icin aktif oturum gereklidir.');
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
      toast.success(
        activeSession.accessToken && activeSession.isOnline
          ? 'Sayim farklari stok hareketi olarak uygulandi.'
          : 'Sayim farklari offline stok kuyruguna alindi.',
      );
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsApplyingCount(false);
    }
  };

  const toggleProductSelection = (productId: string): void => {
    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  const togglePageSelection = (): void => {
    const pageIds = pagedProducts.map((product) => product.id);
    const allSelectedOnPage = pageIds.every((id) => selectedProductIds.includes(id));
    if (allSelectedOnPage) {
      setSelectedProductIds((current) => current.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedProductIds((current) => [...new Set([...current, ...pageIds])]);
  };

  const applyBulkPriceUpdate = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Toplu duzenleme icin aktif oturum gereklidir.');
      return;
    }

    const targets =
      bulkTarget === 'SELECTED'
        ? filteredProducts.filter((product) => selectedProductIds.includes(product.id))
        : filteredProducts;
    if (targets.length === 0) {
      toast.info('Toplu duzenleme icin urun secilmedi.');
      return;
    }

    const saleRaw = bulkSaleValue.trim();
    const purchaseRaw = bulkPurchaseValue.trim();
    const shouldUpdateSale = saleRaw.length > 0;
    const shouldUpdatePurchase = purchaseRaw.length > 0;
    const shouldUpdateBrand = bulkBrandValue.trim().length > 0;
    const shouldUpdateSupplier = bulkSupplierId.length > 0;
    if (!shouldUpdateSale && !shouldUpdatePurchase && !shouldUpdateBrand && !shouldUpdateSupplier) {
      toast.error('En az bir toplu degisiklik alani doldurun.');
      return;
    }

    const saleInput = shouldUpdateSale ? Number.parseFloat(saleRaw) : null;
    const purchaseInput = shouldUpdatePurchase ? Number.parseFloat(purchaseRaw) : null;
    if ((shouldUpdateSale && !Number.isFinite(saleInput)) || (shouldUpdatePurchase && !Number.isFinite(purchaseInput))) {
      toast.error('Toplu duzenleme degeri gecerli degil.');
      return;
    }

    setIsApplyingBulkUpdate(true);
    try {
      let updatedCount = 0;
      for (const product of targets) {
        const payload: Record<string, unknown> = {};
        if (shouldUpdateSale && saleInput !== null) {
          payload.salePrice =
            bulkSaleMode === 'SET'
              ? Math.max(0, saleInput)
              : Math.max(0, Number((product.salePrice * (1 + saleInput / 100)).toFixed(2)));
        }
        if (shouldUpdatePurchase && purchaseInput !== null) {
          payload.purchasePrice =
            bulkPurchaseMode === 'SET'
              ? Math.max(0, purchaseInput)
              : Math.max(0, Number((product.purchasePrice * (1 + purchaseInput / 100)).toFixed(2)));
        }
        if (shouldUpdateBrand) {
          payload.brand = bulkBrandValue.trim();
        }
        if (shouldUpdateSupplier) {
          payload.supplierId = bulkSupplierId;
        }
        await updateProduct(activeSession, product.id, payload);
        updatedCount += 1;
      }

      await Promise.all([refreshCatalog(), loadStock()]);
      setSelectedProductIds([]);
      toast.success(
        activeSession.accessToken && activeSession.isOnline
          ? `${updatedCount} urun toplu guncellendi.`
          : `${updatedCount} urun toplu guncellemesi offline kuyruga alindi.`,
      );
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsApplyingBulkUpdate(false);
    }
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Stok ve Urun Yonetimi</span>
        <div className="header-info stock-header-info">
          <span>Stok Kaydi: {rows.length}</span>
          <span>Urun: {state.products.length}</span>
        </div>
      </div>

      <div className={`stock-page stock-page-${stockUiVariant}`}>
        <div className="stock-ops-bar">
          <div className="stock-ops-left">
            <div className="stock-metric-grid">
              <div className="stock-metric-card">
                <span>Toplam Kayit</span>
                <strong>{rows.length}</strong>
              </div>
              <div className="stock-metric-card stock-metric-warning">
                <span>Kritik</span>
                <strong>
                  {
                    rows.filter((row) => getStockHealthStatus(row.quantity, row.product.minStock) === 'LOW')
                      .length
                  }
                </strong>
              </div>
              <div className="stock-metric-card stock-metric-danger">
                <span>Stok Yok</span>
                <strong>
                  {
                    rows.filter((row) => getStockHealthStatus(row.quantity, row.product.minStock) === 'OUT')
                      .length
                  }
                </strong>
              </div>
            </div>
            <div className="stock-filter-chip-row">
              {activeFilterChips.length === 0 && (
                <span className="stock-chip stock-chip-muted">Aktif filtre yok</span>
              )}
              {activeFilterChips.map((chip) => (
                <span className="stock-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="stock-ops-actions">
            <button className="btn btn-ghost btn-sm tactile-press" onClick={() => void loadStock()} type="button">
              <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Yenile
            </button>
            <button className="btn btn-ghost btn-sm tactile-press" onClick={clearAllFilters} type="button">
              <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              Filtreleri Temizle
            </button>
            <button
              className="btn btn-success btn-sm tactile-press"
              onClick={() => setIsCreateDrawerOpen(true)}
              type="button"
            >
              <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
              Yeni Ürün Ekle
            </button>
            <button
              className="btn btn-primary btn-sm tactile-press"
              data-testid="stock-ui-variant-toggle"
              onClick={toggleStockUiVariant}
              type="button"
            >
              <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              {stockUiVariant === 'neo' ? 'Klasik Görünüm' : 'Yeni Görünüm'}
            </button>
          </div>
        </div>

        <div className="stock-main-grid">
          <div className="card glass-card stock-section">
            <h3 className="card-title stock-section-title">Ürün Listesi</h3>
            <div className="stock-filter-grid">
              <div className="login-field">
                <label>Arama</label>
                <input
                  className="input"
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="Duzenlemek icin urun veya barkod ara"
                  type="text"
                  value={productQuery}
                />
              </div>
              <div className="login-field">
                <label>Kategori</label>
                <select
                  className="input"
                  onChange={(event) => setProductCategoryId(event.target.value)}
                  value={productCategoryId}
                >
                  <option value="">Tum kategoriler</option>
                  {state.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="login-field">
                <label>Marka</label>
                <select
                  className="input"
                  onChange={(event) => setProductBrand(event.target.value)}
                  value={productBrand}
                >
                  <option value="">Tum markalar</option>
                  {availableBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
              <div className="login-field">
                <label>Tedarikci</label>
                <select
                  className="input"
                  onChange={(event) => setProductSupplierId(event.target.value)}
                  value={productSupplierId}
                >
                  <option value="">Tum tedarikciler</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="stock-inline-actions">
              <label className="checkbox-row">
                <input
                  checked={productCriticalOnly}
                  onChange={(event) => setProductCriticalOnly(event.target.checked)}
                  type="checkbox"
                />
                Sadece kritik stok
              </label>
              <span className="stock-list-meta">
                Toplam {filteredProducts.length} urun | Sayfa {productPage}/{productTotalPages}
              </span>
            </div>
            <div className="stock-inline-actions" style={{ alignItems: 'end', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div className="login-field" style={{ minWidth: '170px' }}>
                <label>Toplu Hedef</label>
                <select className="input" onChange={(event) => setBulkTarget(event.target.value as 'FILTERED' | 'SELECTED')} value={bulkTarget}>
                  <option value="FILTERED">Filtre Sonucu</option>
                  <option value="SELECTED">Secili Urunler</option>
                </select>
              </div>
              <div className="login-field" style={{ minWidth: '150px' }}>
                <label>Satis Modu</label>
                <select className="input" onChange={(event) => setBulkSaleMode(event.target.value as 'PERCENT' | 'SET')} value={bulkSaleMode}>
                  <option value="PERCENT">Yuzde</option>
                  <option value="SET">Sabit Fiyat</option>
                </select>
              </div>
              <div className="login-field" style={{ minWidth: '150px' }}>
                <label>{bulkSaleMode === 'PERCENT' ? 'Satis %' : 'Satis Fiyat'}</label>
                <input
                  className="input"
                  onChange={(event) => setBulkSaleValue(event.target.value)}
                  placeholder={bulkSaleMode === 'PERCENT' ? 'Orn: 5 veya -3' : 'Orn: 149.90'}
                  type="number"
                  value={bulkSaleValue}
                />
              </div>
              <div className="login-field" style={{ minWidth: '150px' }}>
                <label>Alis Modu</label>
                <select className="input" onChange={(event) => setBulkPurchaseMode(event.target.value as 'PERCENT' | 'SET')} value={bulkPurchaseMode}>
                  <option value="PERCENT">Yuzde</option>
                  <option value="SET">Sabit Fiyat</option>
                </select>
              </div>
              <div className="login-field" style={{ minWidth: '150px' }}>
                <label>{bulkPurchaseMode === 'PERCENT' ? 'Alis %' : 'Alis Fiyat'}</label>
                <input
                  className="input"
                  onChange={(event) => setBulkPurchaseValue(event.target.value)}
                  placeholder={bulkPurchaseMode === 'PERCENT' ? 'Orn: 2 veya -1' : 'Orn: 80.00'}
                  type="number"
                  value={bulkPurchaseValue}
                />
              </div>
              <div className="login-field" style={{ minWidth: '170px' }}>
                <label>Toplu Marka (ops.)</label>
                <input
                  className="input"
                  onChange={(event) => setBulkBrandValue(event.target.value)}
                  placeholder="Marka adi"
                  type="text"
                  value={bulkBrandValue}
                />
              </div>
              <div className="login-field" style={{ minWidth: '180px' }}>
                <label>Toplu Tedarikci (ops.)</label>
                <select className="input" onChange={(event) => setBulkSupplierId(event.target.value)} value={bulkSupplierId}>
                  <option value="">Degistirme</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primary tactile-press"
                disabled={isApplyingBulkUpdate || (bulkTarget === 'SELECTED' && selectedProductIds.length === 0)}
                onClick={() => void applyBulkPriceUpdate()}
                type="button"
              >
                {isApplyingBulkUpdate ? 'Toplu Islem...' : 'Toplu Guncelle'}
              </button>
            </div>
            <div className="table-wrapper stock-table-wrapper">
              <table className="table stock-table">
                <thead>
                  <tr>
                    <th style={{ width: '42px', textAlign: 'center' }}>
                      <input
                        checked={pagedProducts.length > 0 && pagedProducts.every((product) => selectedProductIds.includes(product.id))}
                        onChange={togglePageSelection}
                        type="checkbox"
                      />
                    </th>
                    <th>Urun</th>
                    <th>Marka</th>
                    <th>Tedarikci</th>
                    <th>Barkod</th>
                    <th style={{ textAlign: 'right' }}>Alis</th>
                    <th style={{ textAlign: 'right' }}>Satis</th>
                    <th style={{ textAlign: 'right' }}>Kar</th>
                    <th style={{ textAlign: 'right' }}>Kar %</th>
                    <th style={{ textAlign: 'right' }}>KDV</th>
                    <th style={{ textAlign: 'right' }}>Durum</th>
                    <th style={{ textAlign: 'right' }}>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((product) => {
                    const stockRow = rows.find((row) => row.product.id === product.id);
                    const status = stockRow
                      ? getStockHealthStatus(stockRow.quantity, stockRow.product.minStock)
                      : 'OK';
                    const purchasePrice = product.purchasePrice ?? 0;
                    const profit = product.salePrice - purchasePrice;
                    const margin = product.salePrice > 0 ? (profit / product.salePrice) * 100 : 0;
                    return (
                      <tr className={`stock-table-row stock-status-${status.toLowerCase()}`} key={product.id}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            checked={selectedProductIds.includes(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            type="checkbox"
                          />
                        </td>
                        <td>{product.name}</td>
                        <td>{product.brand || '-'}</td>
                        <td>{product.supplierName || '-'}</td>
                        <td>{product.barcode}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(purchasePrice)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(product.salePrice)}</td>
                        <td style={{ color: profit < 0 ? 'var(--danger)' : '#059669', textAlign: 'right' }}>
                          {formatCurrency(profit)}
                        </td>
                        <td style={{ color: margin < 0 ? 'var(--danger)' : '#059669', textAlign: 'right' }}>
                          %{margin.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>%{product.vatRate}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`stock-status-pill stock-status-${status.toLowerCase()}`}>
                            {status === 'OUT' ? 'Stok Yok' : status === 'LOW' ? 'Kritik' : 'Normal'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            className="btn btn-secondary btn-sm tactile-press"
                            onClick={() => {
                              if (window.electronAPI) {
                                void window.electronAPI.printBarcode({
                                  name: product.name,
                                  barcode: product.barcode || '',
                                  price: product.salePrice
                                });
                              } else {
                                toast.info('Yazıcı modülü sadece masaüstü uygulamasında çalışır.');
                              }
                            }}
                            type="button"
                            title="Barkod Etiketi Çıkar"
                          >
                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm tactile-press"
                            data-testid={`edit-product-${product.id}`}
                            onClick={() => startEditProduct(product.id)}
                            type="button"
                          >
                            <svg style={{ width: '16px', height: '16px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            Duzenle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={12} className="stock-empty-cell">
                        Urun bulunamadi.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="stock-inline-actions">
              <button
                className="btn btn-ghost btn-sm tactile-press"
                disabled={productPage <= 1}
                onClick={() => setProductPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Onceki
              </button>
              <button
                className="btn btn-ghost btn-sm tactile-press"
                disabled={productPage >= productTotalPages}
                onClick={() =>
                  setProductPage((current) => Math.min(productTotalPages, current + 1))
                }
                type="button"
              >
                Sonraki
              </button>
            </div>
          </div>

          <div className="card glass-card stock-section">
            <h3 className="card-title stock-section-title">Stok Durumu</h3>
            <div className="stock-filter-grid">
              <div className="login-field">
                <label>Arama</label>
                <input
                  className="input"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ürün adı veya barkod ara"
                  type="text"
                  value={query}
                />
              </div>
              <div className="login-field">
                <label>Kapsam</label>
                <select
                  className="input"
                  onChange={(event) => setStockScope(event.target.value as 'ALL' | 'CRITICAL' | 'OUT')}
                  value={stockScope}
                >
                  <option value="ALL">Tüm kayıtlar</option>
                  <option value="CRITICAL">Kritik + Stok Yok</option>
                  <option value="OUT">Sadece Stok Yok</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card glass-card stock-section">
            <h3 className="card-title stock-section-title">
              Hızlı Sayım Modu
            </h3>
            <div className="stock-inline-actions">
              <input
                className="input input-barcode-scanner"
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
              <button className="btn btn-primary tactile-press" type="button" onClick={addCountByBarcode}>
                <svg style={{ width: '18px', height: '18px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                Sayıma Ekle
              </button>
            </div>

            <div className="table-wrapper stock-table-wrapper">
              <table className="table stock-table">
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
                          className="input stock-inline-number"
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
                      <td colSpan={4} className="stock-empty-cell">
                        Sayim icin barkod okutarak urun ekleyin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="stock-inline-actions">
              <button
                className="btn btn-success tactile-press"
                type="button"
                disabled={isApplyingCount || countRows.length === 0}
                onClick={() => void applyCountAdjustments()}
              >
                <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                {isApplyingCount ? 'Uygulanıyor...' : 'Sayım Farkını Uygula'}
              </button>
              <button
                className="btn btn-ghost tactile-press"
                type="button"
                disabled={isApplyingCount || countRows.length === 0}
                onClick={() => setCountMap({})}
              >
                <svg style={{ width: '18px', height: '18px', margin: '0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Sayımı Temizle
              </button>
            </div>
          </div>

          {isLoading && <div className="card glass-card stock-section stock-banner">Stok verisi yükleniyor...</div>}
          {!isLoading && error.length > 0 && <div className="card glass-card stock-section stock-banner stock-banner-error">{error}</div>}

          {!isLoading && error.length === 0 && (
            <div className="card glass-card stock-section">
              <div className="table-wrapper stock-table-wrapper">
                <table className="table stock-table">
                  <thead>
                    <tr>
                      <th>Urun</th>
                      <th>Barkod</th>
                      <th style={{ textAlign: 'right' }}>Miktar</th>
                      <th style={{ textAlign: 'right' }}>Min Stok</th>
                      <th style={{ textAlign: 'right' }}>Satis Fiyati</th>
                      <th style={{ textAlign: 'right' }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStockRows.map((row) => {
                      const status = getStockHealthStatus(row.quantity, row.product.minStock);
                      return (
                        <tr className={`stock-table-row stock-status-${status.toLowerCase()}`} key={row.id}>
                          <td>{row.product.name}</td>
                          <td>{row.product.barcode}</td>
                          <td style={{ textAlign: 'right' }}>{row.quantity.toFixed(2)}</td>
                          <td style={{ textAlign: 'right' }}>{row.product.minStock}</td>
                          <td style={{ textAlign: 'right' }}>{formatCurrency(row.product.salePrice)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={`stock-status-pill stock-status-${status.toLowerCase()}`}>
                              {status === 'OUT' ? 'Stok Yok' : status === 'LOW' ? 'Kritik' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredStockRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="stock-empty-cell">
                          Sonuc bulunamadi.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="stock-inline-actions">
                <span className="stock-list-meta">
                  Toplam {filteredStockRows.length} kayit | Sayfa {stockPage}/{stockTotalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm tactile-press"
                  disabled={stockPage <= 1}
                  onClick={() => setStockPage((current) => Math.max(1, current - 1))}
                  type="button"
                >
                  Onceki
                </button>
                <button
                  className="btn btn-ghost btn-sm tactile-press"
                  disabled={stockPage >= stockTotalPages}
                  onClick={() => setStockPage((current) => Math.min(stockTotalPages, current + 1))}
                  type="button"
                >
                  Sonraki
                </button>
              </div>
            </div>
          )}
        </div>

        {selectedProduct && (
          <div className="stock-drawer-overlay" role="dialog" aria-modal="true" aria-label="Urun Duzenleme">
            <aside className="stock-drawer glass-panel" data-testid="stock-product-drawer">
              <div className="stock-drawer-head">
                <h3>Urun Duzenleme</h3>
                <button
                  className="btn btn-ghost btn-sm tactile-press"
                  disabled={isSavingProduct}
                  onClick={() => {
                    setSelectedProductId(null);
                    setProductEditForm(initialEditForm);
                  }}
                  type="button"
                >
                  Kapat
                </button>
              </div>

              <div className="stock-drawer-caption">Secili urun: {selectedProduct.name}</div>

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
                  <label>Marka</label>
                  <input
                    className="input"
                    onChange={(event) =>
                      setProductCreateForm((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                    type="text"
                    value={productCreateForm.brand}
                  />
                </div>
                <div className="login-field">
                  <label>Tedarikci</label>
                  <select
                    className="input"
                    onChange={(event) =>
                      setProductCreateForm((current) => ({
                        ...current,
                        supplierId: event.target.value,
                      }))
                    }
                    value={productCreateForm.supplierId}
                  >
                    <option value="">Tedarikci yok</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
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
                  <label>Marka</label>
                  <input
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                    type="text"
                    value={productEditForm.brand}
                  />
                </div>
                <div className="login-field">
                  <label>Tedarikci</label>
                  <select
                    className="input"
                    onChange={(event) =>
                      setProductEditForm((current) => ({
                        ...current,
                        supplierId: event.target.value,
                      }))
                    }
                    value={productEditForm.supplierId}
                  >
                    <option value="">Tedarikci yok</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
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
                      setProductEditForm((current) => ({
                        ...current,
                        purchasePrice: event.target.value,
                      }))
                    }
                    step="0.01"
                    type="number"
                    value={productEditForm.purchasePrice}
                  />
                </div>
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
              </div>

              <div className="modal-grid-two">
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

              <div className="stock-inline-actions stock-drawer-footer">
                <label className="checkbox-row">
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

                <div className="stock-inline-actions">
                  <button
                    className="btn btn-success tactile-press"
                    disabled={isSavingProduct || !activeSession}
                    onClick={() => void submitProductUpdate()}
                    type="button"
                  >
                    {isSavingProduct ? 'Guncelleniyor...' : 'Urunu Guncelle'}
                  </button>
                  <button
                    className="btn btn-ghost tactile-press"
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
            </aside>
          </div>
        )}

        {isCreateDrawerOpen && (
          <div className="stock-drawer-overlay" role="dialog" aria-modal="true" aria-label="Yeni Urun Ekle">
            <aside className="stock-drawer glass-panel" data-testid="stock-create-drawer">
              <div className="stock-drawer-head">
                <h3>Yeni Urun Ekle</h3>
                <button
                  className="btn btn-ghost btn-sm tactile-press"
                  disabled={isSavingProduct}
                  onClick={() => {
                    setIsCreateDrawerOpen(false);
                    setProductCreateForm(initialCreateForm);
                  }}
                  type="button"
                >
                  Kapat
                </button>
              </div>

              <div className="stock-drawer-caption">Yeni urun tanımlayarak stok takibi başlatın.</div>

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

              <label className="checkbox-row">
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

              <div className="stock-drawer-footer">
                <button
                  className="btn btn-success btn-block tactile-press"
                  disabled={isSavingProduct || !activeSession}
                  onClick={async () => {
                    await submitProductCreate();
                    if (!error) setIsCreateDrawerOpen(false);
                  }}
                  type="button"
                >
                  <svg style={{ width: '20px', height: '20px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  {isSavingProduct ? 'Kaydediliyor...' : 'Urunu Kaydet'}
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
