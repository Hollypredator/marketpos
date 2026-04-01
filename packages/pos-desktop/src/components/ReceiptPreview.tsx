import React from 'react';

interface ReceiptPreviewProps {
  lines: string[];
  title?: string;
}

export default function ReceiptPreview({ lines, title = 'Fis Onizleme' }: ReceiptPreviewProps) {
  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
        {title}
      </h3>
      <pre
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          lineHeight: '1.3',
          overflowX: 'auto',
          padding: '0.75rem',
        }}
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
}
