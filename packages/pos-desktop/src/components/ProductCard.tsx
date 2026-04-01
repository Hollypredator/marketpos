import React from 'react';

import { formatCurrency } from '@marketpos/shared';

import type { CachedProductRecord } from '../electron-api';

interface ProductCardProps {
  accentColor?: string;
  onSelect: (product: CachedProductRecord) => void;
  product: CachedProductRecord;
}

export default function ProductCard({ accentColor, onSelect, product }: ProductCardProps) {
  const fallbackColor = accentColor ?? 'var(--accent)';
  return (
    <button
      type="button"
      className="quick-btn"
      style={{ background: product.quickAccessColor ?? fallbackColor }}
      onClick={() => onSelect(product)}
      title={product.name}
    >
      <span>{product.name}</span>
      <span className="quick-price">{formatCurrency(product.salePrice)}</span>
    </button>
  );
}
