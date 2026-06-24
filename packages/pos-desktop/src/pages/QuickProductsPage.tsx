import React, { useMemo, useState } from 'react';

import ProductCard from '../components/ProductCard';
import { getUiPresetDefinition, sortProductsByPreset } from '../services/ui-preset';
import { useApp, useToast } from '../store';

export default function QuickProductsPage() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [quickSearch, setQuickSearch] = useState('');
  const presetAccentColor = getUiPresetDefinition(state.uiPreset).accentColor;

  const quickProducts = useMemo(
    () => {
      const source = state.products.filter((product) => product.isQuickAccess);
      return sortProductsByPreset(source, state.uiPreset, state.categories);
    },
    [state.categories, state.products, state.uiPreset],
  );

  const normalizedQuickSearch = quickSearch.trim().toLowerCase();
  const visibleQuickProducts = useMemo(
    () =>
      normalizedQuickSearch.length === 0
        ? quickProducts
        : quickProducts.filter((product) =>
            product.name.toLowerCase().includes(normalizedQuickSearch) ||
            product.barcode.toLowerCase().includes(normalizedQuickSearch),
          ),
    [normalizedQuickSearch, quickProducts],
  );

  const addQuickProduct = (productId: string): void => {
    const product = state.products.find((candidate) => candidate.id === productId);
    if (!product) {
      toast.error('Hizli urun bulunamadi.');
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
    toast.success(`${product.name} sepete eklendi.`);
  };

  return (
    <>
      <div className="header">
        <span className="header-title">Hizli Urunler</span>
        <div className="header-info">
          <span>Toplam {quickProducts.length} | Gorunen {visibleQuickProducts.length}</span>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1rem' }}>
        <div className="quick-search-bar">
          <div className="quick-search-row">
            <input
              className="input quick-search-input"
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder="Hizli urun ara (ad / barkod)..."
              type="text"
              value={quickSearch}
            />
            <button
              className="btn btn-ghost quick-search-clear"
              disabled={quickSearch.length === 0}
              onClick={() => setQuickSearch('')}
              type="button"
            >
              Temizle
            </button>
          </div>
        </div>

        {quickProducts.length === 0 ? (
          <div className="card">
            <p>Hizli urun tanimi bulunmuyor. Urunleri dashboard uzerinden quick-access yapabilirsiniz.</p>
          </div>
        ) : visibleQuickProducts.length === 0 ? (
          <div className="card">
            <p>Arama kriterine uygun hizli urun bulunamadi.</p>
          </div>
        ) : (
          <div className="quick-grid">
            {visibleQuickProducts.map((product) => (
              <ProductCard
                key={product.id}
                accentColor={presetAccentColor}
                product={product}
                onSelect={() => addQuickProduct(product.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
