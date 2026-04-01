import React, { useMemo } from 'react';

import ProductCard from '../components/ProductCard';
import { getUiPresetDefinition, sortProductsByPreset } from '../services/ui-preset';
import { useApp, useToast } from '../store';

export default function QuickProductsPage() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const presetAccentColor = getUiPresetDefinition(state.uiPreset).accentColor;

  const quickProducts = useMemo(
    () => {
      const source = state.products.filter((product) => product.isQuickAccess);
      return sortProductsByPreset(source, state.uiPreset, state.categories);
    },
    [state.categories, state.products, state.uiPreset],
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
          <span>Toplam {quickProducts.length} urun</span>
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1rem' }}>
        {quickProducts.length === 0 ? (
          <div className="card">
            <p>Hizli urun tanimi bulunmuyor. Urunleri dashboard uzerinden quick-access yapabilirsiniz.</p>
          </div>
        ) : (
          <div className="quick-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {quickProducts.map((product) => (
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
