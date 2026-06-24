import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '@marketpos/shared';
import { 
  listShiftHandovers, 
  recordShiftHandover, 
  listCashMovements, 
  recordCashMovement,
  explainRuntimeError,
  fetchDailyReport,
  closeSession,
  getLocalSetting,
  setLocalSetting,
  saveDailyAutomationSettings,
} from '../services/pos-runtime';
import type { ShiftHandoverRecord, CashMovementRecord, DailyReport, RecordCashMovementPayload } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';
import ManagerApprovalModal from '../components/ManagerApprovalModal';

const SHIFT_OPENING_CASH_KEY = 'marketpos_shift_opening_cash';
const SHIFT_START_TIME_KEY = 'marketpos_shift_start_time';
const SHIFT_OPENING_NOTE_KEY = 'marketpos_shift_opening_note';

export default function ShiftPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = selectAuthSession(state);

  // States
  const [openingCash, setOpeningCash] = useState<string>('');
  const [openingNote, setOpeningNote] = useState<string>('');
  const [isShiftActive, setIsShiftActive] = useState<boolean>(false);
  const [declaredCash, setDeclaredCash] = useState('');
  const [note, setNote] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [handovers, setHandovers] = useState<ShiftHandoverRecord[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovementRecord[]>([]);
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  
  // Automation states
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoCloseTime, setAutoCloseTime] = useState('02:00');
  const [openTicketControl, setOpenTicketControl] = useState(true);
  const [isSavingAutomation, setIsSavingAutomation] = useState(false);

  const loadData = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const [
        handoverData, 
        movementData, 
        reportData, 
        opCash, 
        startTime,
        opNote,
        autoClEn,
        autoClTime,
      ] = await Promise.all([
        listShiftHandovers(activeSession.registerId, 10),
        listCashMovements(activeSession.registerId, 50),
        fetchDailyReport(activeSession, today),
        getLocalSetting(SHIFT_OPENING_CASH_KEY),
        getLocalSetting(SHIFT_START_TIME_KEY),
        getLocalSetting(SHIFT_OPENING_NOTE_KEY),
        getLocalSetting('marketpos_auto_close_enabled'),
        getLocalSetting('marketpos_auto_close_time'),
      ]);

      setHandovers(handoverData || []);
      setCashMovements(movementData || []);
      setDailyReport(reportData);
      setOpeningCash(opCash || '0');
      setOpeningNote(opNote || '');
      setIsShiftActive(!!startTime);
      setAutoCloseEnabled(autoClEn === 'true');
      setAutoCloseTime(autoClTime || '02:00');
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeSession?.registerId]);

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (isNaN(amount) || amount < 0) {
      toast.error('Geçerli bir açılış tutarı girin.');
      return;
    }
    await setLocalSetting(SHIFT_OPENING_CASH_KEY, amount.toString());
    await setLocalSetting(SHIFT_START_TIME_KEY, new Date().toISOString());
    await setLocalSetting(SHIFT_OPENING_NOTE_KEY, openingNote);
    setIsShiftActive(true);
    toast.success('Gün başı yapıldı. Hayırlı işler!');
  };

  const handleAddExpense = async () => {
    if (!activeSession) return;
    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Geçerli bir gider tutarı girin.');
      return;
    }
    if (!expenseNote.trim()) {
      toast.error('Gider açıklaması zorunludur.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordCashMovement({
        amount,
        movementType: 'PETTY_CASH',
        note: `Gider: ${expenseNote}`,
        operatorUserId: activeSession.user.id,
        registerId: activeSession.registerId,
      });
      setExpenseAmount('');
      setExpenseNote('');
      toast.success('Gider kaydedildi.');
      await loadData();
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAutomation = async () => {
    setIsSavingAutomation(true);
    try {
      await saveDailyAutomationSettings({
        autoCloseEnabled,
        autoCloseTime,
        autoOpenCash: 0,
        autoOpenEnabled: false,
        autoOpenTime: '08:00',
      });
      await setLocalSetting('marketpos_auto_close_enabled', autoCloseEnabled.toString());
      await setLocalSetting('marketpos_auto_close_time', autoCloseTime);
      toast.success('Ayarlar kaydedildi.');
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsSavingAutomation(false);
    }
  };

  const shiftMetrics = useMemo(() => {
    if (!isShiftActive || !dailyReport) return { nakit: 0, kart: 0, iade: 0, gider: 0, net: 0 };
    const nakit = dailyReport.paymentBreakdown?.find(p => p.method === 'CASH')?.total || 0;
    const kart = dailyReport.paymentBreakdown?.filter(p => p.method !== 'CASH').reduce((sum, p) => sum + p.total, 0) || 0;
    const iade = dailyReport.totalRefunds || 0;
    const gider = cashMovements.reduce((sum, m) => sum + m.amount, 0);
    const net = (nakit + kart) - iade - gider;
    return { nakit, kart, iade, gider, net };
  }, [dailyReport, isShiftActive, cashMovements]);

  const handleCloseShiftClick = () => {
    setIsApprovalOpen(true);
  };

  const executeCloseShift = async (approval: any) => {
    if (!activeSession) return;
    setIsSubmitting(true);
    setIsApprovalOpen(false);
    try {
      const declared = parseFloat(declaredCash) || 0;
      await recordShiftHandover({
        blindClose: false,
        declaredCash: declared,
        expectedCash: shiftMetrics.net,
        note: `Kapanış Notu: ${note} | Onay: ${approval.managerFullName}`,
        operatorUserId: activeSession.user.id,
        registerId: activeSession.registerId,
      });
      await closeSession(activeSession, declared, note);
      
      await setLocalSetting(SHIFT_OPENING_CASH_KEY, '');
      await setLocalSetting(SHIFT_START_TIME_KEY, '');
      await setLocalSetting(SHIFT_OPENING_NOTE_KEY, '');
      
      setIsShiftActive(false);
      setDeclaredCash('');
      setNote('');
      await loadData();
      toast.success('Gün sonu işlemi tamamlandı.');
    } catch (err) {
      toast.error(explainRuntimeError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="page-shell"><div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor...</div></div>;

  return (
    <div className="page-shell" style={{ background: 'var(--bg-main)' }}>
      <div className="shift-layout">
        {/* SIDEBAR */}
        <div className="shift-sidebar">
          <div>
            <h3 className="shift-section-title">Manuel Gün İşlemi</h3>
            {!isShiftActive && (
               <div className="shift-alert">
                 <div className="shift-alert-title">Gün Başı Yapılmamış</div>
                 <div className="shift-alert-text">İşlemlere başlamak için gün başı yapın.</div>
               </div>
            )}
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="input-group">
                <input 
                  type="number" 
                  className="input" 
                  placeholder="0" 
                  value={openingCash} 
                  onChange={e => setOpeningCash(e.target.value)}
                  disabled={isShiftActive}
                />
              </div>
              <div className="input-group">
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Açılış notu" 
                  value={openingNote} 
                  onChange={e => setOpeningNote(e.target.value)}
                  disabled={isShiftActive}
                />
              </div>
              {!isShiftActive ? (
                <button className="btn btn-danger btn-block" style={{ background: '#f55d4d', minHeight: '52px' }} onClick={handleOpenShift}>
                  Gün Başı Yap
                </button>
              ) : (
                <button className="btn btn-success btn-block" style={{ minHeight: '52px' }} disabled>
                  Vardiya Aktif
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h3 className="shift-section-title">Ekstra Gider Kaydı</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
               <div className="input-group">
                 <input 
                   type="number" 
                   className="input" 
                   placeholder="Tutar (₺)" 
                   value={expenseAmount}
                   onChange={e => setExpenseAmount(e.target.value)}
                   disabled={!isShiftActive || isSubmitting}
                 />
               </div>
               <div className="input-group">
                 <input 
                   type="text" 
                   className="input" 
                   placeholder="Gider Sebebi (Ekmek, Su...)" 
                   value={expenseNote}
                   onChange={e => setExpenseNote(e.target.value)}
                   disabled={!isShiftActive || isSubmitting}
                 />
               </div>
               <button 
                 className="btn btn-ghost btn-block" 
                 style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                 onClick={handleAddExpense}
                 disabled={!isShiftActive || isSubmitting}
               >
                 {isSubmitting ? 'Kaydediliyor...' : 'Gider Olarak İşle'}
               </button>
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <h3 className="shift-section-title">Gün İşlemleri Ayarları</h3>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div className="card" style={{ padding: '1rem', border: '1px solid #edf0f7', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>Otomatik Gün Sonu</div>
                  <input 
                    type="checkbox" 
                    className="toggle" 
                    checked={autoCloseEnabled} 
                    onChange={e => setAutoCloseEnabled(e.target.checked)} 
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Belirtilen saatte gün sonunu otomatik tetikle</div>
              </div>

              <div className="card" style={{ padding: '1rem', border: '1px solid #edf0f7', borderRadius: '16px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Gün Sonu Saati</div>
                <input 
                  type="time" 
                  className="input" 
                  style={{ minHeight: '44px', fontSize: '0.9rem' }} 
                  value={autoCloseTime} 
                  onChange={e => setAutoCloseTime(e.target.value)}
                />
              </div>

              <div className="card" style={{ padding: '1rem', border: '1px solid #edf0f7', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>Açık Adisyon Kontrolu</div>
                  <input 
                    type="checkbox" 
                    className="toggle" 
                    checked={openTicketControl} 
                    onChange={e => setOpenTicketControl(e.target.checked)} 
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gün sonu öncesi açık hesapları zorunlu kapat</div>
              </div>

              <button className="btn btn-ghost btn-block" onClick={handleSaveAutomation} disabled={isSavingAutomation}>
                {isSavingAutomation ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
              </button>
            </div>
          </div>
        </div>

        {/* MAIN AREA */}
        <div className="shift-main">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Kasa açılış / kapanış ve günlük operasyon takibi</div>
              <h1 style={{ fontSize: '2rem', fontWeight: '900' }}>Gün İşlemleri</h1>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: '700', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.75rem' }}>Realtime Bağlanıyor</div>
              <div className="card" style={{ padding: '0.75rem 1.25rem', textAlign: 'center', borderRadius: '12px', border: '1px solid #eee' }}>
                <div style={{ fontSize: '1rem', fontWeight: '800' }}>{new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{isShiftActive ? 'Oturum Açık' : 'Oturum Kapalı'}</div>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="metric-cards-row">
            <div className="metric-card-premium">
              <span className="label">NAKİT SATIŞ</span>
              <div className="value">{formatCurrency(shiftMetrics.nakit)}</div>
              <span className="subtext">Kasa girişi</span>
              <div className="icon-badge" style={{ background: '#fff4e6', color: '#f59e0b' }}>NA</div>
            </div>
            <div className="metric-card-premium">
              <span className="label">KART SATIŞ</span>
              <div className="value">{formatCurrency(shiftMetrics.kart)}</div>
              <span className="subtext">POS tahsilatı</span>
              <div className="icon-badge" style={{ background: '#f0f9ff', color: '#0ea5e9' }}>KA</div>
            </div>
            <div className="metric-card-premium">
              <span className="label">İADE / GİDER</span>
              <div className="value">{formatCurrency(shiftMetrics.iade + shiftMetrics.gider)}</div>
              <span className="subtext">Kasa çıkışı</span>
              <div className="icon-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>ÇI</div>
            </div>
            <div className="metric-card-premium">
              <span className="label">NET</span>
              <div className="value">{formatCurrency(shiftMetrics.net)}</div>
              <span className="subtext">Gün sonu beklentisi</span>
              <div className="icon-badge" style={{ background: '#f0fdf4', color: '#22c55e' }}>NE</div>
            </div>
          </div>

          {/* 3 Step Guide */}
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.5rem' }}>Gün İşlemleri 3 Adım</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Kasayı yeni kullanan personel gün başı ve gün sonunu karıştırmadan tamamlayabilsin.</p>
            
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="step-card">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h4>Vardiya açarken gün başı yap</h4>
                  <p>Kasaya koyulan ilk nakit tutarını gir ve açılış notunu yaz; sonra Gün Başı Yap butonuna bas.</p>
                </div>
              </div>
              <div className="step-card">
                <div className="step-number" style={{ background: '#fff' , color: '#ff7e4d', border: '1px solid #ff7e4d' }}>2</div>
                <div className="step-content">
                  <h4>Gün boyu tahsilatı takip et</h4>
                  <p>Üstteki nakit, kart, iade ve net kartları vardiya boyunca kasa durumunu gösterir.</p>
                </div>
              </div>
              <div className="step-card">
                <div className="step-number" style={{ background: '#fff' , color: '#ff7e4d', border: '1px solid #ff7e4d' }}>3</div>
                <div className="step-content">
                  <h4>Kapanışta sayılan nakdi gir</h4>
                  <p>Gün sonunda kasadaki sayılan tutarı yaz, gerekiyorsa not düş ve Gün Sonu Yap ile vardiyayı kapat.</p>
                </div>
              </div>
            </div>
          </div>

          {/* History Table */}
          <div className="history-card">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem' }}>Gün İşlemleri Geçmişi</h3>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Durum</th>
                      <th>Başlangıç</th>
                      <th>İşlem Tarihi</th>
                      <th>Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {handovers.map(row => (
                      <tr key={row.id}>
                        <td><span className="badge badge-success">Tamamlandı</span></td>
                        <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                        <td>{new Date(row.createdAt).toLocaleTimeString()}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.note}</td>
                      </tr>
                    ))}
                    {handovers.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Henüz geçmiş işlem bulunmuyor.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginTop: '2rem', marginBottom: '1rem' }}>Günlük Para Hareketleri (Giderler)</h3>
              <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tür</th>
                      <th>Saat</th>
                      <th>Meblağ</th>
                      <th>Açıklama</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashMovements.map(m => (
                      <tr key={m.id}>
                        <td><span className="badge badge-warning">Harcama</span></td>
                        <td>{new Date(m.createdAt).toLocaleTimeString()}</td>
                        <td style={{ fontWeight: 800 }}>-{formatCurrency(m.amount)}</td>
                        <td>{m.note}</td>
                      </tr>
                    ))}
                    {cashMovements.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Bugün henüz nakit hareketi kaydedilmedi.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

             {isShiftActive && (
               <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '800' }}>Kapanış İşlemi</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vardiyayı kapatmak ve Z-raporu almak için tutarı girin.</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <input 
                        type="number" 
                        className="input" 
                        placeholder="Sayılan Nakit" 
                        style={{ width: '160px' }} 
                        value={declaredCash} 
                        onChange={e => setDeclaredCash(e.target.value)} 
                      />
                      <button className="btn btn-danger" onClick={handleCloseShiftClick} disabled={isSubmitting}>
                        {isSubmitting ? 'Kapatılıyor...' : 'Gün Sonu Yap'}
                      </button>
                    </div>
                  </div>
               </div>
             )}
          </div>
        </div>
      </div>

      {isApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Gün Sonu Onayı"
          companyId={state.user?.companyId}
          description="Kasa kapatma işlemi yönetici onayı gerektirir."
          onCancel={() => setIsApprovalOpen(false)}
          onApproved={executeCloseShift}
          reasonLabel="Onay Nedeni"
          requireReason
        />
      )}
    </div>
  );
}
