import React, { useState, useEffect } from 'react';
import { formatCurrency } from '@marketpos/shared';

interface Denomination {
  label: string;
  value: number;
}

const DENOMINATIONS: Denomination[] = [
  { label: '200 TL', value: 200 },
  { label: '100 TL', value: 100 },
  { label: '50 TL', value: 50 },
  { label: '20 TL', value: 20 },
  { label: '10 TL', value: 10 },
  { label: '5 TL', value: 5 },
  { label: '1 TL', value: 1 },
  { label: '0.50 TL', value: 0.5 },
  { label: '0.25 TL', value: 0.25 },
  { label: '0.10 TL', value: 0.1 },
  { label: '0.05 TL', value: 0.05 },
];

interface Props {
  onTotalChange: (total: number) => void;
}

export function CashDenominationCounter({ onTotalChange }: Props) {
  const [counts, setCounts] = useState<Record<number, string>>({});

  const total = DENOMINATIONS.reduce((sum, d) => {
    const count = parseInt(counts[d.value] || '0', 10);
    return sum + (isNaN(count) ? 0 : count * d.value);
  }, 0);

  useEffect(() => {
    onTotalChange(total);
  }, [total, onTotalChange]);

  const updateCount = (value: number, input: string) => {
    const sanitized = input.replace(/[^0-9]/g, '');
    setCounts(prev => ({ ...prev, [value]: sanitized }));
  };

  return (
    <div className="denomination-counter">
      <div className="denomination-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        {DENOMINATIONS.map((d) => (
          <div key={d.value} className="denomination-row" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            background: 'var(--bg-secondary)',
            padding: '0.5rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)'
          }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', minWidth: '60px' }}>{d.label}</span>
            <input 
              type="text" 
              className="input" 
              style={{ flex: 1, padding: '4px 8px', height: '36px', textAlign: 'right' }}
              value={counts[d.value] || ''}
              onChange={(e) => updateCount(d.value, e.target.value)}
              placeholder="0"
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '80px', textAlign: 'right' }}>
              {formatCurrency(parseInt(counts[d.value] || '0', 10) * d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="denomination-total" style={{ 
        marginTop: '1rem', 
        padding: '1rem', 
        background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-card))',
        borderRadius: 'var(--radius)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: '1px dashed var(--accent)'
      }}>
        <span style={{ fontWeight: '700' }}>Küpür Toplamı:</span>
        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--accent)' }}>{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
