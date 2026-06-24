import React from 'react';

import { formatCurrency } from '@marketpos/shared';

import type { CartItem as CartItemType } from '../store';
import { getCampaignLabel } from '../services/campaign-logic';

interface CartItemProps {
  item: CartItemType;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  onCompliment?: () => void;
  onDiscount?: () => void;
}

export default function CartItem({ item, onDecrease, onIncrease, onRemove, onCompliment, onDiscount }: CartItemProps) {
  return (
    <div className="cart-item">
      <div>
        <div className="cart-item-name">
          {item.name}
          {item.isCompliment && (
            <span style={{ marginLeft: 4, fontSize: '0.65rem', backgroundColor: 'var(--warning)', color: '#000', padding: '2px 4px', borderRadius: '4px' }}>
              İKRAM
            </span>
          )}
          {item.discountAmount && item.discountAmount > 0 && (
            <span style={{ marginLeft: 4, fontSize: '0.65rem', backgroundColor: 'var(--danger)', color: '#fff', padding: '2px 4px', borderRadius: '4px' }}>
              -%{((item.discountAmount / (item.quantity * item.unitPrice)) * 100).toFixed(0)}
            </span>
          )}
          {item.campaign && (
            <span style={{ marginLeft: 4, fontSize: '0.65rem', backgroundColor: 'var(--info)', color: '#fff', padding: '2px 4px', borderRadius: '4px' }}>
              {getCampaignLabel(item.campaign)}
            </span>
          )}
          {item.campaignDiscount && item.campaignDiscount > 0 && (
            <span style={{ marginLeft: 4, fontSize: '0.65rem', backgroundColor: 'var(--success)', color: '#fff', padding: '2px 4px', borderRadius: '4px' }}>
              -{item.campaignDiscount.toFixed(2)} TL
            </span>
          )}
        </div>
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
      <div className="cart-item-price">
        {item.isCompliment ? (
          <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{formatCurrency(item.quantity * item.unitPrice)}</span>
        ) : (
          formatCurrency(item.lineTotal)
        )}
      </div>
      <div className="cart-item-actions cart-item-badge-actions">
        {onCompliment && (
          <button
            className={`cart-item-action-badge compliment ${item.isCompliment ? 'active' : ''}`}
            onClick={onCompliment}
            type="button"
            aria-label="Ikram yap"
            title="Ikram yap"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </button>
        )}
        {onDiscount && (
          <button
            className={`cart-item-action-badge discount ${item.discountAmount && item.discountAmount > 0 ? 'active' : ''}`}
            onClick={onDiscount}
            type="button"
            aria-label="Indirim uygula"
            title="Indirim uygula"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
          </button>
        )}
        <button
          className="cart-item-action-badge remove"
          onClick={onRemove}
          type="button"
          aria-label="Urunu kaldir"
          title="Urunu kaldir"
        >
          <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
