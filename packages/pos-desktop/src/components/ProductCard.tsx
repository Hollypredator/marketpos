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
      className="quick-btn glass-card"
      style={{ borderTop: `4px solid ${product.quickAccessColor ?? fallbackColor}` }}
      onClick={() => onSelect(product)}
      title={product.name}
    >
      <span className="quick-name">{product.name}</span>
      <div className="quick-meta">
        <span className="quick-barcode">{product.barcode}</span>
        <span className={`quick-stock ${product.estimatedStock <= 5 ? 'low-stock' : ''}`}>
          Stok: {product.estimatedStock}
        </span>
      </div>
      <span className="quick-price">{formatCurrency(product.salePrice)}</span>
    </button>
  );
}
