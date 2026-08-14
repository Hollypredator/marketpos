import React, { useState } from 'react';

interface StaffMember {
  advancePaymentsTotal: number;
  baseSalary: number;
  branchName: string;
  commissionRatePercent: number;
  commissionTotalEarned: number;
  email: string;
  fullName: string;
  id: string;
  phone: string;
  registerName: string;
  role: string;
  salesCount: number;
  salesVolume: number;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
}

const INITIAL_STAFF: StaffMember[] = [
  {
    advancePaymentsTotal: 1500,
    baseSalary: 28000,
    branchName: 'Merkez Şube',
    commissionRatePercent: 1.5,
    commissionTotalEarned: 2450,
    email: 'can.oz@marketpos.com',
    fullName: 'Can Özkan (Kasiyer)',
    id: 'staff-1',
    phone: '0535 444 5566',
    registerName: 'Kasa 01',
    role: 'Kasiyer',
    salesCount: 1420,
    salesVolume: 163333,
    status: 'ACTIVE',
  },
  {
    advancePaymentsTotal: 0,
    baseSalary: 35000,
    branchName: 'Merkez Şube',
    commissionRatePercent: 2.0,
    commissionTotalEarned: 4120,
    email: 'zeynep.a@marketpos.com',
    fullName: 'Zeynep Aksoy (Kasa Sorumlusu)',
    id: 'staff-2',
    phone: '0544 222 3344',
    registerName: 'Kasa 02',
    role: 'Kasa Sorumlusu',
    salesCount: 1850,
    salesVolume: 206000,
    status: 'ACTIVE',
  },
  {
    advancePaymentsTotal: 2000,
    baseSalary: 26000,
    branchName: 'Merkez Şube',
    commissionRatePercent: 1.0,
    commissionTotalEarned: 890,
    email: 'murat.t@marketpos.com',
    fullName: 'Murat Tekin (Reyon Sorumlusu)',
    id: 'staff-3',
    phone: '0505 111 9988',
    registerName: 'Giriş Kasa',
    role: 'Reyon Görevlisi',
    salesCount: 410,
    salesVolume: 89000,
    status: 'ACTIVE',
  },
];

export const StaffPage: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>(INITIAL_STAFF);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(staffList[0]);
  const [searchQuery, setSearchQuery] = useState('');

  // Advance Payment Modal
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState('500');

  // New Staff Modal
  const [isNewStaffModalOpen, setIsNewStaffModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('Kasiyer');
  const [newPhone, setNewPhone] = useState('');
  const [newBaseSalary, setNewBaseSalary] = useState('28000');
  const [newCommissionRate, setNewCommissionRate] = useState('1.5');

  const filteredStaff = staffList.filter((s) =>
    s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || s.phone.includes(searchQuery),
  );

  const handleAddAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    const amount = parseFloat(advanceAmount) || 0;

    setStaffList((prev) =>
      prev.map((s) => {
        if (s.id === selectedStaff.id) {
          const updated = { ...s, advancePaymentsTotal: s.advancePaymentsTotal + amount };
          setSelectedStaff(updated);
          return updated;
        }
        return s;
      }),
    );
    setIsAdvanceModalOpen(false);
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newPhone.trim()) return;

    const newStaff: StaffMember = {
      advancePaymentsTotal: 0,
      baseSalary: parseFloat(newBaseSalary) || 25000,
      branchName: 'Merkez Şube',
      commissionRatePercent: parseFloat(newCommissionRate) || 1.0,
      commissionTotalEarned: 0,
      email: `${newFullName.toLowerCase().replace(/\s+/g, '.')}@marketpos.com`,
      fullName: newFullName.trim(),
      id: `staff-${Date.now()}`,
      phone: newPhone.trim(),
      registerName: 'Kasa 01',
      role: newRole,
      salesCount: 0,
      salesVolume: 0,
      status: 'ACTIVE',
    };

    setStaffList((prev) => [newStaff, ...prev]);
    setSelectedStaff(newStaff);
    setIsNewStaffModalOpen(false);
    setNewFullName('');
    setNewPhone('');
  };

  return (
    <div className="page-shell" style={{ padding: '24px', overflowY: 'auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            👔 Personel, Vardiya & Prim Yönetim Katmanı
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
            Personel satış performansını, prim hakedişlerini ve avans/maaş dökümlerini takip edin.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setIsNewStaffModalOpen(true)}>
          + Yeni Personel Ekle
        </button>
      </div>

      {/* Main Glass Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '20px' }}>
        {/* Left Column: Staff List */}
        <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
          <input
            type="text"
            className="input"
            placeholder="Personel adı veya telefon ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ marginBottom: '16px' }}
          />

          <div style={{ display: 'grid', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
            {filteredStaff.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelectedStaff(s)}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: selectedStaff?.id === s.id ? 'var(--accent-glow)' : 'var(--bg-card)',
                  border: selectedStaff?.id === s.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{s.fullName}</span>
                  <span style={{ fontSize: '0.78rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                    {s.role}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📍 {s.branchName} | 📞 {s.phone}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.82rem', fontWeight: 700 }}>
                  <span style={{ color: 'var(--success)' }}>{s.salesVolume.toLocaleString('tr-TR')} ₺ Satış</span>
                  <span style={{ color: 'var(--accent)' }}>%{s.commissionRatePercent} Prim</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Staff Performance & Payroll Details */}
        {selectedStaff ? (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* Header Info */}
            <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedStaff.fullName}</h2>
                  <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    🏢 {selectedStaff.branchName} | 🖥️ {selectedStaff.registerName} | ✉️ {selectedStaff.email}
                  </p>
                </div>

                <button className="btn btn-primary" onClick={() => setIsAdvanceModalOpen(true)}>
                  💳 Avans Ödemesi Yap
                </button>
              </div>

              {/* KPI Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '20px' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>TOPLAM SATIŞ HACMİ</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)', marginTop: '4px' }}>
                    {selectedStaff.salesVolume.toLocaleString('tr-TR')} ₺
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedStaff.salesCount} İşlem Yapıldı</span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>KAZANILAN PRİM (%{selectedStaff.commissionRatePercent})</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--success)', marginTop: '4px' }}>
                    +{selectedStaff.commissionTotalEarned.toLocaleString('tr-TR')} ₺
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Satış Komisyonu</span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>ÇEKİLEN AVANS</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--danger)', marginTop: '4px' }}>
                    -{selectedStaff.advancePaymentsTotal.toLocaleString('tr-TR')} ₺
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bu Ay Çekilen</span>
                </div>

                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>NET HAKEDİŞ MAAŞ</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-strong)', marginTop: '4px' }}>
                    {(selectedStaff.baseSalary + selectedStaff.commissionTotalEarned - selectedStaff.advancePaymentsTotal).toLocaleString('tr-TR')} ₺
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Maaş + Prim - Avans</span>
                </div>
              </div>
            </div>

            {/* Payroll Breakdown Card */}
            <div className="card" style={{ backdropFilter: 'var(--glass-blur)', background: 'var(--bg-glass)', border: 'var(--glass-border)' }}>
              <h3>📊 Bu Ayki Maaş & Hakediş Bordro Detayı</h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '14px', fontSize: '0.92rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                  <span>Taban Net Maaş</span>
                  <span style={{ fontWeight: 800 }}>{selectedStaff.baseSalary.toLocaleString('tr-TR')} ₺</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', color: 'var(--success)' }}>
                  <span> Satış Primi (%{selectedStaff.commissionRatePercent} Komisyon)</span>
                  <span style={{ fontWeight: 800 }}>+{selectedStaff.commissionTotalEarned.toLocaleString('tr-TR')} ₺</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: 'var(--danger)' }}>
                  <span> Kesilen Avans Tutarı</span>
                  <span style={{ fontWeight: 800 }}>-{selectedStaff.advancePaymentsTotal.toLocaleString('tr-TR')} ₺</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--accent-glow)', borderRadius: '8px', fontWeight: 900, fontSize: '1.05rem', color: 'var(--accent)' }}>
                  <span>ÖDENECEN TOPLAM NET TUTAR</span>
                  <span>{(selectedStaff.baseSalary + selectedStaff.commissionTotalEarned - selectedStaff.advancePaymentsTotal).toLocaleString('tr-TR')} ₺</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Performans detaylarını görmek için soldan bir personel seçin.
          </div>
        )}
      </div>

      {/* Advance Modal */}
      {isAdvanceModalOpen && selectedStaff && (
        <div className="modal-backdrop" onClick={() => setIsAdvanceModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">💳 Avans Ödemesi Kaydet</h2>
              <button className="modal-close" onClick={() => setIsAdvanceModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleAddAdvance} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                <strong>{selectedStaff.fullName}</strong> için avans ödemesi girin.
              </p>
              <div className="form-group">
                <label className="form-label">Avans Tutarı (₺)</label>
                <input
                  type="number"
                  className="input"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  required
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsAdvanceModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Avansı Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Staff Modal */}
      {isNewStaffModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsNewStaffModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">👔 Yeni Personel Ekle</h2>
              <button className="modal-close" onClick={() => setIsNewStaffModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateStaff} className="modal-body" style={{ display: 'grid', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Ad Soyad *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Örn: Burak Şahin"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Görev / Rol</label>
                  <select
                    className="input"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="Kasiyer">Kasiyer</option>
                    <option value="Kasa Sorumlusu">Kasa Sorumlusu</option>
                    <option value="Mağaza Müdürü">Mağaza Müdürü</option>
                    <option value="Reyon Görevlisi">Reyon Görevlisi</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Telefon *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="0532 000 0000"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">Taban Maaş (₺)</label>
                  <input
                    type="number"
                    className="input"
                    value={newBaseSalary}
                    onChange={(e) => setNewBaseSalary(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Satış Prim Oranı (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="input"
                    value={newCommissionRate}
                    onChange={(e) => setNewCommissionRate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setIsNewStaffModalOpen(false)}>İptal</button>
                <button type="submit" className="btn btn-primary">Personeli Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
