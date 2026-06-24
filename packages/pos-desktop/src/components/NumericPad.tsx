import React from 'react';

interface NumericPadProps {
  onInput: (val: string) => void;
  onClear: () => void;
  onBackspace: () => void;
}

export function NumericPad({ onInput, onClear, onBackspace }: NumericPadProps): React.ReactElement {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.'];

  return (
    <div className="numeric-pad" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '8px',
      marginTop: '10px'
    }}>
      {keys.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => onInput(k)}
          style={{
            padding: '12px',
            fontSize: '18px',
            fontWeight: 'bold',
            backgroundColor: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius)',
            cursor: 'pointer'
          }}
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        onClick={onBackspace}
        style={{
          padding: '12px', fontSize: '18px', fontWeight: 'bold',
          backgroundColor: '#eab308', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer'
        }}
      >
        <svg style={{ width: '20px', height: '20px', margin: '0 auto' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" /></svg>
      </button>

      <button
        type="button"
        onClick={onClear}
        style={{
          gridColumn: '1 / -1',
          padding: '12px', fontSize: '18px', fontWeight: 'bold',
          backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer'
        }}
      >
        TEMİZLE
      </button>
    </div>
  );
}
