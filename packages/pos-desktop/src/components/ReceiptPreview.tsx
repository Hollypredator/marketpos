import React from 'react';

interface ReceiptPreviewProps {
  lines: string[];
  title?: string;
}

export default function ReceiptPreview({ lines, title = 'Fis Onizleme' }: ReceiptPreviewProps) {
  return (
    <div className="card receipt-card">
      <h3 className="card-title receipt-title">
        {title}
      </h3>
      <pre className="receipt-pre">
        {lines.join('\n')}
      </pre>
    </div>
  );
}
