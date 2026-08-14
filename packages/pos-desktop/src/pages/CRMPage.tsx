import React, { useState } from 'react';

interface CustomerCRM {
  address: string;
  clvTotalAmount: number;
  email: string;
  id: string;
  lastPurchaseDate: string;
  loyaltyPoints: number;
  name: string;
  notes: string[];
  phone: string;
  tier: 'GOLD' | 'SILVER' | 'STANDARD' | 'VIP';
  totalOrdersCount: number;
  creditBalance: number;
}

const INITIAL_CUSTOMERS: CustomerCRM[] = [
  {
    address: 'Atatürk Mah. Karanfil Sok. No:12',
    clvTotalAmount: 14850,
    creditBalance: 1250,
    email: 'ahmet.y@gmail.com',
    id: 'cust-1',
    lastPurchaseDate: '2026-08-14T10:15:00Z',
    loyaltyPoints: 450,
    name: 'Ahmet Yılmaz (VIP Müşteri)',
    notes: ['Haftalık düzenli taze şarküteri ve bakliyat alımı yapıyor.'],
    phone: '0532 111 2233',
    tier: 'VIP',
    totalOrdersCount: 42,
  },
  {
    address: 'Cumhuriyet Cadds. Lale Apt. 4/2',
    clvTotalAmount: 6420,
    creditBalance: 450,
    email: 'elif.d@hotmail.com',
    id: 'cust-2',
    lastPurchaseDate: '2026-08-13T16:40:00Z',
    loyaltyPoints: 180,
    name: 'Elif Demir',
    notes: ['Manav ve organik ürün tercihi var.'],
    phone: '0555 333 4455',
    tier: 'GOLD',
    totalOrdersCount: 18,
  },
  {
    address: 'Gül Sokak No:8',
    clvTotalAmount: 2150,
    creditBalance: 0,
    email: 'mehmet.k@gmail.com',
    id: 'cust-3',
    lastPurchaseDate: '2026-08-11T12:00:00Z',
    loyaltyPoints: 65,
    name: 'Mehmet Kaya',
    notes: ['Akşam üzeri alışveriş yapıyor.'],
    phone: '0542 999 8877',
    tier: 'SILVER',
    totalOrdersCount: 7,
  },
];

export const CRMPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerCRM[]>(INITIAL_CUSTOMERS);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCRM | null>(customers[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('');

  // Add Points Modal
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [pointsAmount, setPointsAmount] = useState('50');
  const [pointsAction, setPointsAction] = useState<'ADD' | 'REDEEM'>('ADD');

  // Add Note Modal
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [newNote, setNewNote] = useState('');

  // Veresiye Collection Modal
  const [isCollectModalOpen, setIsCollectModalOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectPaymentMode, setCollectPaymentMode] = useState<'CASH' | 'CARD'>('CASH');

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery);
    const matchesTier = !tierFilter || c.tier === tierFilter;
    return matchesSearch && matchesTier;
  });

  const handleUpdatePoints = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const pts = parseInt(pointsAmount, 10) || 0;
    const delta = pointsAction === 'ADD' ? pts : -pts;

    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === selectedCustomer.id) {
          const updatedPoints = Math.max(0, c.loyaltyPoints + delta);
          const updated = { ...c, loyaltyPoints: updatedPoints };
          setSelectedCustomer(updated);
          return updated;
        }
        return c;
      }),
    );
    setIsPointsModalOpen(false);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !newNote.trim()) return;

    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === selectedCustomer.id) {
          const updatedNotes = [newNote.trim(), ...c.notes];
          const updated = { ...c, notes: updatedNotes };
          setSelectedCustomer(updated);
          return updated;
        }
        return c;
      }),
    );
    setNewNote('');
    setIsNoteModalOpen(false);
  };

  const handleCollectDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const amount = parseFloat(collectAmount) || 0;
    if (amount <= 0) return;

    setCustomers((prev) =>
      prev.map((c) => {
        if (c.id === selectedCustomer.id) {
          const newBalance = Math.max(0, c.creditBalance - amount);
          const updated = {
            ...c,
            creditBalance: newBalance,
            notes: [`${new Date().toLocaleDateString('tr-TR')} - ${amount.toFixed(2)} TL veresiye tahsilatı alındı (${collectPaymentMode === 'CASH' ? 'Nakit' : 'Kredi Kartı'})`, ...c.notes],
          };
          setSelectedCustomer(updated);
          return updated;
        }
        return c;
      }),
    );
    setIsCollectModalOpen(false);
    setCollectAmount('');
  };

  const getTierBadge = (tier: CustomerCRM['tier']) => {
    switch (tier) {
      case 'VIP':
        return <span style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '4px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '0.8rem' }}>👑 VIP MÜŞTERİ</span>;
      case 'GOLD':
        return <span style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#78350f', padding: '4px 10px', borderRadius: '20px', fontWeight: 800, fontSize: '0.8rem' }}>⭐ ALTIN ÜYE</span>;
      case 'SILVER':
        return <span style={{ background: 'rgba(148, 163, 184, 0.2)', color: '#475569', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '0.8rem' }}>🥈 GÜMÜŞ ÜYE</span>;
      default:
        return <span style={{ background: 'rgba(226, 232, 240, 0.5)', color: '#64748b', padding: '4px 10px', borderRadius: '20px', fontWeight: 600, fontSize: '0.8rem' }}>STANDART</span>;
    }
  };

  return (
    <div className="page-shell" style={{ padding: '24px', overflowY: 'auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            👥 CRM & Sadakat Müşteri Yönetim Katmanı
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Müşteri seviyelerini (VIP/Gold), sadakat puanlarını ve veresiye borç takibini yönetin.
          </p>
        </div>
      </div>

      {/* Main Glass Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px' }}>
        {/* Left Column: Customers List */}
        <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            <input
              type="text"
              className="input"
              placeholder="Müşteri adı veya telefon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="input"
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="">Tüm Seviyeler</option>
              <option value="VIP">👑 VIP Müşteriler</option>
              <option value="GOLD">⭐ Altın Üyeler</option>
              <option value="SILVER">🥈 Gümüş Üyeler</option>
            </select>
          </div>

          <div style={{ display: 'grid', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: selectedCustomer?.id === c.id ? 'var(--accent-glow)' : 'var(--bg-card)',
                  border: selectedCustomer?.id === c.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{c.name}</span>
                  {getTierBadge(c.tier)}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📞 {c.phone}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                  <span style={{ color: 'var(--danger)' }}>Borç: {c.creditBalance.toLocaleString('tr-TR')} ₺</span>
                  <span>{c.clvTotalAmount.toLocaleString('tr-TR')} ₺ Harcama</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Customer Details & Actions */}
        {selectedCustomer ? (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Header Card */}
            <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedCustomer.name}</h2>
                    {getTierBadge(selectedCustomer.tier)}
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    📞 {selectedCustomer.phone} | ✉️ {selectedCustomer.email} | 📍 {selectedCustomer.address}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-danger" onClick={() => {
                    setCollectAmount(selectedCustomer.creditBalance.toString());
                    setIsCollectModalOpen(true);
                  }}>
                    💳 Veresiye Tahsilat Al
                  </button>
                  <button className="btn btn-ghost" onClick={() => setIsNoteModalOpen(true)}>
                    + Not Ekle
                  </button>
                  <button className="btn btn-primary" onClick={() => setIsPointsModalOpen(true)}>
                    🎁 Puan İşlemi
                  </button>
                </div>
              </div>

              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginTop: '20px' }}>
                <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--danger)', fontWeight: 800 }}>GÜNCEL VERESİYE BORCU</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--danger)', marginTop: '4px' }}>
                    {selectedCustomer.creditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Kasa Veresiye Defteri
                  </span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>SADAKAT PUANI</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)', marginTop: '4px' }}>
                    🎁 {selectedCustomer.loyaltyPoints}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    = {(selectedCustomer.loyaltyPoints * 0.1).toFixed(2)} ₺ İndirim
                  </span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>YAŞAM BOYU DEĞER (CLV)</span>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--success)', marginTop: '4px' }}>
                    {selectedCustomer.clvTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Toplam {selectedCustomer.totalOrdersCount} Sipariş
                  </span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700 }}>SON İŞLEM TARİHİ</span>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)' }}>
                    {new Date(selectedCustomer.lastPurchaseDate).toLocaleDateString('tr-TR')}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Saat: {new Date(selectedCustomer.lastPurchaseDate).toLocaleTimeString('tr-TR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Notes Card */}
            <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
              <h3>📝 Müşteri İletişim & Tercih Notları</h3>
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                {selectedCustomer.notes.map((note, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.9rem' }}>
                    • {note}
                  </div>
                ))}
                {selectedCustomer.notes.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Henüz kayıtlı not eklenmemiş.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Detaylarını görmek için soldaki listeden bir müşteri seçin.
          </div>
        )}
      </div>

      {/* Points Modal */}
      {isPointsModalOpen && selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setIsPointsModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🎁 Sadakat Puanı İşlemi</h2>
              <button className="modal-close" onClick={() => setIsPointsModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleUpdatePoints} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">İşlem Türü</label>
                <select
                  className="input"
                  value={pointsAction}
                  onChange={(e) => setPointsAction(e.target.value as any)}
                >
                  <option value="ADD">➕ Puan Ekle (Kazanım)</option>
                  <option value="REDEEM">➖ Puan Harca (Kasada İndirim)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Puan Miktarı</label>
                <input
                  type="number"
                  className="input"
                  value={pointsAmount}
                  onChange={(e) => setPointsAmount(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsPointsModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Puanı Güncelle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Collect Debt Modal */}
      {isCollectModalOpen && selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setIsCollectModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '420px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">💳 Veresiye Tahsilat Al</h2>
              <button className="modal-close" onClick={() => setIsCollectModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCollectDebt} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div style={{ background: 'var(--danger-bg)', padding: '12px', borderRadius: '8px', color: 'var(--danger)', fontWeight: 700, textAlign: 'center' }}>
                Müşteri Borcu: {selectedCustomer.creditBalance.toFixed(2)} TL
              </div>

              <div className="form-group">
                <label className="form-label">Ödeme Yöntemi</label>
                <select
                  className="input"
                  value={collectPaymentMode}
                  onChange={(e) => setCollectPaymentMode(e.target.value as any)}
                >
                  <option value="CASH">💵 Nakit Tahsilat</option>
                  <option value="CARD">💳 Kredi Kartı Tahsilat</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Tahsilat Tutarı (TL)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="0.00"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsCollectModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-success">Tahsilatı Al ve Fiş Yazdır</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Note Modal */}
      {isNoteModalOpen && selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setIsNoteModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '440px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">📝 Müşteri Notu Ekle</h2>
              <button className="modal-close" onClick={() => setIsNoteModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleAddNote} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Not İçeriği</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Örn: Özel iskonto talebi var veya sabah saatlerinde uğruyor..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsNoteModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Notu Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
