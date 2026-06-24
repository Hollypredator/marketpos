import React, { useState } from 'react';
import { recordCashMovement, explainRuntimeError } from '../services/pos-runtime';
import { selectAuthSession, useApp, useToast } from '../store';

const EXPENSE_CATEGORIES = [
  { id: 'bread', label: 'Ekmek Ödemesi', icon: '🍞' },
  { id: 'milk', label: 'Süt/Şarküteri', icon: '🥛' },
  { id: 'cleaning', label: 'Temizlik Gidery', icon: '🧹' },
  { id: 'staff', label: 'Personel Harçlığı', icon: '👤' },
  { id: 'other', label: 'Diğer', icon: '📝' },
];

export default function ExpensesPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = selectAuthSession(state);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('bread');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!activeSession) return;
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast.error('Geçerli bir tutar girin.');
      return;
    }

    setIsSaving(true);
    try {
      const selectedCat = EXPENSE_CATEGORIES.find(c => c.id === category);
      await recordCashMovement({
        amount: val,
        movementType: 'PETTY_CASH',
        note: `${selectedCat?.label}: ${description.trim()}`.trim(),
        operatorUserId: activeSession.user.id,
        registerId: activeSession.registerId,
      });
      toast.success('Gider kaydedildi.');
      setAmount('');
      setDescription('');
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="header" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>
        <h2 className="header-title" style={{ color: 'var(--text-primary)' }}>Harcama & Gider Girişi</h2>
      </div>

      <div className="stock-page stock-page-neo">
        <div className="stock-main-grid" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card stock-section">
            <h3 className="card-title stock-section-title">Hızlı Gider Girişi</h3>
            
            <div className="login-field">
              <label>Kategori</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '10px' }}>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    className={`btn ${category === cat.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setCategory(cat.id)}
                    type="button"
                    style={{ height: 'auto', padding: '15px' }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>{cat.icon}</div>
                    <div style={{ fontSize: '0.75rem' }}>{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="login-field" style={{ marginTop: '20px' }}>
              <label>Tutar (₺)</label>
              <input
                className="input"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ fontSize: '1.5rem', height: '60px', textAlign: 'center' }}
              />
            </div>

            <div className="login-field" style={{ marginTop: '20px' }}>
              <label>Açıklama (Opsiyonel)</label>
              <input
                className="input"
                type="text"
                placeholder="Not yazın..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="stock-inline-actions" style={{ marginTop: '30px' }}>
              <button
                className="btn btn-success btn-lg btn-block"
                disabled={isSaving}
                onClick={handleSave}
                type="button"
              >
                {isSaving ? 'Kaydediliyor...' : 'Gideri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
