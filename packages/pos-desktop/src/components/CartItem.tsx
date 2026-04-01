import React from 'react';

import { formatCurrency } from '@marketpos/shared';

import type { CartItem as CartItemType } from '../store';

interface CartItemProps {
  item: CartItemType;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}

export default function CartItem({ item, onDecrease, onIncrease, onRemove }: CartItemProps) {
  return (
    <div className="cart-item">
      <div>
        <div className="cart-item-name">{item.name}</div>
        <div className="cart-item-barcode">
          {item.barcode} | {formatCurrency(item.unitPrice)}/ad
        </div>
      </div>
      <div className="cart-item-qty">
        <button className="qty-btn" onClick={onDecrease} type="button" aria-label="Azalt">
          -
        </button>
        <span className="qty-value">{item.quantity}</span>
        <button className="qty-btn" onClick={onIncrease} type="button" aria-label="Arttir">
          +
        </button>
      </div>
      <div className="cart-item-price">{formatCurrency(item.lineTotal)}</div>
      <button className="cart-item-remove" onClick={onRemove} type="button" aria-label="Urunu kaldir">
        x
      </button>
    </div>
  );
}