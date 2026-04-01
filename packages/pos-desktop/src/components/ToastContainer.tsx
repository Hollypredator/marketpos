import React from 'react';
import { useApp } from '../store';

export default function ToastContainer() {
  const { state } = useApp();
  if (state.toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {state.toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}
