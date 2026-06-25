import React, { useEffect, useMemo, useState } from 'react';

import { formatCurrency } from '@marketpos/shared';

import ManagerApprovalModal from '../components/ManagerApprovalModal';
import type { ManagerApprovalPayload } from '../components/ManagerApprovalModal';
import {
  closeSession,
  explainRuntimeError,
  fetchDailyReport,
  fetchSessions,
  fetchTopProducts,
  logSecurityEvent,
} from '../services/pos-runtime';
import type { DailyReport, TopProductReportRow } from '../services/types';
import { selectAuthSession, useApp, useToast } from '../store';

function byPayment(report: DailyReport | null, method: string): number {
  if (!report) {
    return 0;
  }
  return (report.paymentBreakdown || [])
    .filter((item) => item.method === method)
    .reduce((sum, item) => sum + item.total, 0);
}

type Tab = 'daily' | 'sessions';

function toLocalDateInputValue(date: Date): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 10);
}

function getDatesInRange(startDateStr: string, endDateStr: string): string[] {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates.slice(0, 31); // Limit to max 31 days to avoid performance issues
}

export default function DayReportPage() {
  const toast = useToast();
  const { state } = useApp();
  const activeSession = useMemo(() => selectAuthSession(state), [state]);

  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const [startDate, setStartDate] = useState(toLocalDateInputValue(new Date()));
  const [endDate, setEndDate] = useState(toLocalDateInputValue(new Date()));
  
  const [error, setError] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [blindCloseMode, setBlindCloseMode] = useState(true);
  const [isCloseApprovalOpen, setCloseApprovalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastClosedAt, setLastClosedAt] = useState<string | null>(null);
  
  const [report, setReport] = useState<DailyReport | null>(null);
  const [topProducts, setTopProducts] = useState<TopProductReportRow[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<Array<{ date: string; netSales: number }>>([]);
  const [isLoadingTrend, setIsLoadingTrend] = useState(false);
  const [hoveredDot, setHoveredDot] = useState<{ x: number; y: number; date: string; value: number } | null>(null);

  const isCashier = activeSession?.user.role === 'CASHIER';

  const printZReportReceipt = async (
    daily: DailyReport | null,
    top: TopProductReportRow[],
    isBlind: boolean,
  ) => {
    if (!window.electronAPI || !daily) return;
    try {
      const lines: string[] = [];
      lines.push('       Z-RAPORU DETAYI       ');
      lines.push('=============================');
      lines.push(`Tarih: ${startDate}${startDate !== endDate ? ` / ${endDate}` : ''}`);
      lines.push(`Kasa No: ${activeSession?.registerId?.slice(0, 8) ?? '-'}`);
      lines.push(`Kullanici: ${activeSession?.user?.fullName ?? '-'}`);
      lines.push(`Yazdirilma: ${new Date().toLocaleString('tr-TR')}`);
      lines.push('-----------------------------');

      if (isBlind) {
        lines.push('*** BLIND CLOSE AKTIF ***');
        lines.push('Detaylar guvenlik nedeniyle');
        lines.push('gizlenmistir.');
        lines.push('-----------------------------');
        lines.push(`Beyan: ${formatCurrency(Number.parseFloat(closingBalance || '0'))}`);
        if (closingNote.trim().length > 0) {
          lines.push(`Not: ${closingNote.trim()}`);
        }
      } else {
        lines.push(`Islem Adedi: ${daily.salesCount}`);
        lines.push(`Iade Adedi: ${daily.refundsCount ?? 0}`);
        lines.push(`Net Ciro: ${formatCurrency(daily.netSales)}`);
        lines.push(`Toplam KDV: ${formatCurrency(daily.totalVat)}`);
        lines.push('-----------------------------');
        lines.push('ODEME DETAYLARI:');
        const breakdown = daily.paymentBreakdown || [];
        const cash = breakdown.filter(i => i.method === 'CASH').reduce((s, i) => s + i.total, 0);
        const card = breakdown.filter(i => i.method === 'CREDIT_CARD' || i.method === 'DEBIT_CARD').reduce((s, i) => s + i.total, 0);
        const onAccount = breakdown.filter(i => i.method === 'ON_ACCOUNT').reduce((s, i) => s + i.total, 0);
        lines.push(`Nakit: ${formatCurrency(cash)}`);
        lines.push(`Kart: ${formatCurrency(card)}`);
        lines.push(`Cari (Acik): ${formatCurrency(onAccount)}`);
        lines.push('-----------------------------');
        lines.push(`Beyan Edilen: ${formatCurrency(Number.parseFloat(closingBalance || '0'))}`);
        lines.push(`Beklenen: ${formatCurrency(cash)}`);
        const diff = Number.parseFloat(closingBalance || '0') - cash;
        lines.push(`Fark: ${formatCurrency(diff)}`);
        if (closingNote.trim().length > 0) {
          lines.push(`Not: ${closingNote.trim()}`);
        }
        if (top && top.length > 0) {
          lines.push('-----------------------------');
          lines.push('EN COK SATAN URUNLER:');
          top.slice(0, 5).forEach((item) => {
            lines.push(`${item.productName.slice(0, 18)} x${item.totalQuantity}`);
            lines.push(`  Tutar: ${formatCurrency(item.totalRevenue)}`);
          });
        }
      }
      lines.push('=============================');
      lines.push('Rapor sonudur.');

      await window.electronAPI.printReceipt({ lines });
      toast.success('Z-Raporu yazdirildi.');
    } catch (caughtError: unknown) {
      toast.error('Z-Raporu yazdirilamadi: ' + explainRuntimeError(caughtError));
    }
  };

  const printPastSessionZReport = async (s: any) => {
    if (!window.electronAPI) return;
    try {
      const lines: string[] = [];
      lines.push('     GECMIS Z-RAPORU OZETI    ');
      lines.push('=============================');
      lines.push(`Acilis: ${new Date(s.createdAt).toLocaleString('tr-TR')}`);
      lines.push(`Kapanis: ${s.closedAt ? new Date(s.closedAt).toLocaleString('tr-TR') : '-'}`);
      lines.push(`Kasa: ${s.register?.name ?? '-'}`);
      lines.push(`Kullanici: ${s.user?.fullName ?? '-'}`);
      lines.push('-----------------------------');
      
      const isBlind = isCashier || s.blindClose;
      if (isBlind) {
        lines.push('*** BLIND CLOSE AKTIF ***');
        lines.push('Detaylar guvenlik nedeniyle');
        lines.push('gizlenmistir.');
        lines.push('-----------------------------');
        lines.push(`Beyan: ${formatCurrency(s.closingBalance || 0)}`);
      } else {
        lines.push(`Beyan Edilen: ${formatCurrency(s.closingBalance || 0)}`);
        lines.push(`Beklenen: ${formatCurrency(s.expectedCash || 0)}`);
        const diff = (s.closingBalance || 0) - (s.expectedCash || 0);
        lines.push(`Fark: ${formatCurrency(diff)}`);
      }
      if (s.note) {
        lines.push(`Not: ${s.note}`);
      }
      lines.push('=============================');
      await window.electronAPI.printReceipt({ lines });
      toast.success('Gecmis Z-Raporu yazdirildi.');
    } catch (caughtError: unknown) {
      toast.error('Z-Raporu yazdirilamadi: ' + explainRuntimeError(caughtError));
    }
  };

  const cashTotal = byPayment(report, 'CASH');
  const cardTotal = byPayment(report, 'CREDIT_CARD') + byPayment(report, 'DEBIT_CARD');
  const onAccountTotal = byPayment(report, 'ON_ACCOUNT');
  const parsedClosingBalance = Number.parseFloat(closingBalance || '0');
  const expectedCash = cashTotal;

  const totalPayment = cashTotal + cardTotal + onAccountTotal;
  const cashPercent = totalPayment > 0 ? (cashTotal / totalPayment) * 100 : 0;
  const cardPercent = totalPayment > 0 ? (cardTotal / totalPayment) * 100 : 0;
  const onAccountPercent = totalPayment > 0 ? (onAccountTotal / totalPayment) * 100 : 0;

  const closeRegisterSession = async (): Promise<void> => {
    if (!activeSession) {
      toast.error('Aktif oturum bulunamadi.');
      return;
    }
    if (!activeSession.accessToken) {
      toast.error('Kasa kapama icin online baglanti gereklidir.');
      return;
    }
    if (!Number.isFinite(parsedClosingBalance) || parsedClosingBalance < 0) {
      toast.error('Gecerli bir kapanis bakiyesi girin.');
      return;
    }
    if (closingNote.trim().length < 3) {
      toast.error('Kasa kapama notu en az 3 karakter olmalidir.');
      return;
    }
    setCloseApprovalOpen(true);
  };

  const executeCloseRegisterSession = async (
    approval: ManagerApprovalPayload,
  ): Promise<void> => {
    if (!activeSession) {
      return;
    }
    setIsClosing(true);
    try {
      await closeSession(
        activeSession,
        parsedClosingBalance,
        `${closingNote.trim()} | Onay: ${approval.reason}`,
      );
      setLastClosedAt(new Date().toISOString());
      setCloseApprovalOpen(false);
      void printZReportReceipt(report, topProducts, isCashier);
      try {
        await logSecurityEvent({
          eventType: 'SESSION_CLOSE_APPROVED',
          managerUserId: approval.managerUserId,
          message: 'Kasa kapama islemi yonetici onayi ile tamamlandi.',
          metadataJson: JSON.stringify({
            blindCloseMode,
            declaredClosingBalance: parsedClosingBalance,
            expectedCash,
            managerMethod: approval.method,
            operatorUserId: activeSession.user.id,
          }),
          operatorUserId: activeSession.user.id,
          reason: approval.reason,
          severity: 'WARN',
        });
      } catch {
        // Operational flow should continue even when local audit write fails.
      }
      toast.success(
        'Kasa oturumu kapatildi. Yeni gun icin cikis-giris yaptiginizda oturum yeniden acilir.',
      );
      setClosingNote('');
      await loadReport();
    } catch (caughtError: unknown) {
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setIsClosing(false);
    }
  };

  const loadReport = async (): Promise<void> => {
    if (!activeSession) {
      setError('Aktif oturum bulunamadi.');
      setIsLoading(false);
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const isRange = startDate !== endDate;
      const [daily, top] = await Promise.all([
        fetchDailyReport(activeSession, startDate, isRange ? endDate : undefined),
        fetchTopProducts(activeSession, 8, startDate, isRange ? endDate : undefined),
      ]);
      setReport(daily);
      setTopProducts(top);

      // Load trend data if range has multiple days
      if (isRange) {
        setIsLoadingTrend(true);
        const dates = getDatesInRange(startDate, endDate);
        const dailyReports = await Promise.all(
          dates.map(async (d) => {
            try {
              const res = await fetchDailyReport(activeSession, d);
              return { date: d.slice(5), netSales: res.netSales };
            } catch {
              return { date: d.slice(5), netSales: 0 };
            }
          })
        );
        setTrendData(dailyReports);
        setIsLoadingTrend(false);
      } else {
        setTrendData([]);
      }
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessions = async (): Promise<void> => {
    if (!activeSession || !activeSession.accessToken) return;
    try {
      const result = await fetchSessions(activeSession);
      setSessions(result.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'daily') {
      void loadReport();
    } else {
      void loadSessions();
    }
  }, [activeSession?.accessToken, activeSession?.sessionId, activeSession?.user.id, startDate, endDate, activeTab]);

  useEffect(() => {
    if (isCashier) {
      setBlindCloseMode(true);
    }
  }, [isCashier]);

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const today = new Date();
    if (preset === 'today') {
      const dStr = toLocalDateInputValue(today);
      setStartDate(dStr);
      setEndDate(dStr);
    } else if (preset === 'week') {
      const past = new Date();
      past.setDate(today.getDate() - 6);
      setStartDate(toLocalDateInputValue(past));
      setEndDate(toLocalDateInputValue(today));
    } else if (preset === 'month') {
      const past = new Date();
      past.setDate(1); // First day of current month
      setStartDate(toLocalDateInputValue(past));
      setEndDate(toLocalDateInputValue(today));
    }
  };

  const isTodayOnly = startDate === endDate && startDate === toLocalDateInputValue(new Date());

  // Render SVG Trend Line Chart
  const renderTrendChart = () => {
    if (isLoadingTrend) {
      return <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Trend yükleniyor...</div>;
    }
    if (trendData.length <= 1) {
      return null;
    }

    const width = 500;
    const height = 180;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 15;
    const paddingBottom = 25;

    const maxSales = Math.max(...trendData.map(d => d.netSales), 100);
    const minSales = 0;

    const getX = (index: number) => {
      const step = (width - paddingLeft - paddingRight) / (trendData.length - 1);
      return paddingLeft + index * step;
    };

    const getY = (val: number) => {
      const ratio = (val - minSales) / (maxSales - minSales);
      return height - paddingBottom - ratio * (height - paddingTop - paddingBottom);
    };

    // Construct path coordinates
    const points = trendData.map((d, i) => ({
      x: getX(i),
      y: getY(d.netSales),
      date: d.date,
      value: d.netSales
    }));

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

    return (
      <div style={{ position: 'relative', marginTop: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', padding: '8px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="salesTrendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={paddingLeft} y1={getY(maxSales)} x2={width - paddingRight} y2={getY(maxSales)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
          <line x1={paddingLeft} y1={getY(maxSales / 2)} x2={width - paddingRight} y2={getY(maxSales / 2)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
          <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="rgba(255,255,255,0.15)" />

          {/* Fill Area */}
          <path d={areaD} fill="url(#salesTrendGrad)" />

          {/* Stroke Line */}
          <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />

          {/* Y Axis Labels */}
          <text x={paddingLeft - 8} y={getY(maxSales) + 4} fill="var(--text-secondary)" fontSize="9" textAnchor="end">{formatCurrency(maxSales).replace(' ₺', '')}</text>
          <text x={paddingLeft - 8} y={getY(maxSales / 2) + 4} fill="var(--text-secondary)" fontSize="9" textAnchor="end">{formatCurrency(maxSales / 2).replace(' ₺', '')}</text>
          <text x={paddingLeft - 8} y={height - paddingBottom + 4} fill="var(--text-secondary)" fontSize="9" textAnchor="end">0</text>

          {/* Dot Markers and X Axis Labels */}
          {points.map((p, i) => {
            const showLabel = trendData.length <= 10 || i % Math.ceil(trendData.length / 8) === 0 || i === trendData.length - 1;
            return (
              <g key={i}>
                {showLabel && (
                  <text x={p.x} y={height - 8} fill="var(--text-secondary)" fontSize="9" textAnchor="middle">{p.date}</text>
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoveredDot?.date === p.date ? "6" : "4"}
                  fill="var(--accent)"
                  stroke="#1a1c23"
                  strokeWidth="2"
                  style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredDot({
                      x: p.x,
                      y: p.y,
                      date: p.date,
                      value: p.value
                    });
                  }}
                  onMouseLeave={() => setHoveredDot(null)}
                />
              </g>
            );
          })}
        </svg>

        {hoveredDot && (
          <div
            style={{
              position: 'absolute',
              left: `${(hoveredDot.x / width) * 100}%`,
              top: `${(hoveredDot.y / height) * 100 - 30}%`,
              transform: 'translateX(-50%)',
              background: '#252836',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              color: 'var(--text-primary)',
              pointerEvents: 'none',
              boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
              zIndex: 10,
              whiteSpace: 'nowrap'
            }}
          >
            <strong>{hoveredDot.date}: </strong> {formatCurrency(hoveredDot.value)}
          </div>
        )}
      </div>
    );
  };

  // Render SVG Doughnut Chart
  const renderDoughnutChart = () => {
    if (totalPayment <= 0) {
      return (
        <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Ödeme verisi bulunmuyor
        </div>
      );
    }

    // Pie chart slices calculations
    const segments = [
      { name: 'Nakit', value: cashTotal, color: 'var(--success)', percent: cashPercent },
      { name: 'Kart', value: cardTotal, color: 'var(--accent)', percent: cardPercent },
      { name: 'Cari', value: onAccountTotal, color: 'var(--warning)', percent: onAccountPercent }
    ].filter(s => s.value > 0);

    const radius = 50;
    const circ = 2 * Math.PI * radius; // ~314.159
    let cumulativePercent = 0;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginTop: '1rem' }}>
        <div style={{ width: '130px', height: '130px', position: 'relative' }}>
          <svg viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%' }}>
            {segments.map((seg, i) => {
              const strokeOffset = circ - (seg.percent * circ) / 100;
              const rotation = (cumulativePercent * 360) / 100;
              cumulativePercent += seg.percent;

              return (
                <circle
                  key={i}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={circ}
                  strokeDashoffset={strokeOffset}
                  style={{
                    transformOrigin: '60px 60px',
                    transform: `rotate(${rotation}deg)`,
                    transition: 'all 0.3s ease'
                  }}
                />
              );
            })}
            <circle cx="60" cy="60" r="38" fill="#1a1c23" />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none'
            }}
          >
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ciro</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{formatCurrency(totalPayment).split(',')[0]}</div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {segments.map((seg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
              <span style={{ fontSize: '0.85rem', flex: 1 }}>{seg.name}</span>
              <strong style={{ fontSize: '0.85rem' }}>%{seg.percent.toFixed(0)}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span className="header-title">Raporlar & Analiz</span>
            <div className="tabs" style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
              <button 
                className={`btn btn-sm tactile-press ${activeTab === 'daily' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('daily')}
              >
                Satış Analizi
              </button>
              <button 
                className={`btn btn-sm tactile-press ${activeTab === 'sessions' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('sessions')}
              >
                Z-Raporu Geçmişi
              </button>
            </div>
          </div>
          
          {activeTab === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              {/* Presets */}
              <div className="btn-group" style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '6px' }}>
                <button className="btn btn-xs btn-ghost tactile-press" style={{ height: '26px' }} onClick={() => applyPreset('today')}>Bugün</button>
                <button className="btn btn-xs btn-ghost tactile-press" style={{ height: '26px' }} onClick={() => applyPreset('week')}>7 Gün</button>
                <button className="btn btn-xs btn-ghost tactile-press" style={{ height: '26px' }} onClick={() => applyPreset('month')}>Bu Ay</button>
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>|</span>
              {/* Date pickers */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input 
                  type="date" 
                  className="input" 
                  style={{ width: '135px', height: '32px', padding: '0 8px', fontSize: '0.85rem' }}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>-</span>
                <input 
                  type="date" 
                  className="input" 
                  style={{ width: '135px', height: '32px', padding: '0 8px', fontSize: '0.85rem' }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <button className="btn btn-primary btn-sm tactile-press" onClick={() => void loadReport()} type="button">
                Yenile
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 'calc(100vh - 98px)', overflow: 'auto', padding: '1.5rem' }}>
        {activeTab === 'sessions' ? (
          <div className="card glass-card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>Kapatılmış Oturumlar</h3>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Açılış</th>
                    <th>Kapanış</th>
                    <th>Kasa</th>
                    <th>Kullanıcı</th>
                    <th style={{ textAlign: 'right' }}>Son Bakiye</th>
                    <th style={{ textAlign: 'right' }}>Z-Raporu</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{new Date(s.createdAt).toLocaleString('tr-TR')}</td>
                      <td>{s.closedAt ? new Date(s.closedAt).toLocaleString('tr-TR') : '-'}</td>
                      <td>{s.register?.name}</td>
                      <td>{s.user?.fullName}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(s.closingBalance || 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn btn-ghost btn-sm tactile-press" 
                          style={{ minHeight: '32px', height: '32px', padding: '0 8px' }} 
                          onClick={() => void printPastSessionZReport(s)}
                          disabled={!s.closedAt}
                        >
                          Yazdır
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Kayıt seçili kriterlere göre bulunamadı.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {isLoading && <div className="card glass-card">Rapor verileri hesaplanıyor...</div>}
            {!isLoading && error.length > 0 && <div className="card glass-card" style={{ color: 'var(--danger)' }}>{error}</div>}

            {!isLoading && report && (
              <>
                {/* KPI Summary Row */}
                <div
                  style={{
                    display: 'grid',
                    gap: '1rem',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    marginBottom: '1.5rem',
                  }}
                >
                  <div className="card glass-card cursor-pointer" style={{ borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>İşlem Adedi</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>{report.salesCount} Satış</div>
                  </div>
                  <div className="card glass-card cursor-pointer" style={{ borderLeft: '4px solid var(--success)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ciro (Brüt)</div>
                    <div style={{ color: 'var(--success)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.totalSales)}
                    </div>
                  </div>
                  <div className="card glass-card cursor-pointer" style={{ borderLeft: '4px solid var(--danger)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>İade Tutarı</div>
                    <div style={{ color: 'var(--danger)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.totalRefunds)}
                    </div>
                  </div>
                  <div className="card glass-card cursor-pointer" style={{ borderLeft: '4px solid var(--warning)', background: 'rgba(245,158,11,0.05)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Net Ciro</div>
                    <div style={{ color: 'var(--warning)', fontSize: '1.75rem', fontWeight: 700, marginTop: '0.5rem' }}>
                      {formatCurrency(report.netSales)}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: isTodayOnly ? '1.5fr 1fr' : '1fr 1fr', marginBottom: '1.5rem' }}>
                  
                  {/* Left Column: Visual Charts */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Sales Trend (Only if range has multiple days) */}
                    {trendData.length > 1 && (
                      <div className="card glass-card">
                        <h3 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Ciro Değişim Grafiği
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>Net Kazanç Trendi</span>
                        </h3>
                        {renderTrendChart()}
                      </div>
                    )}

                    {/* Payment Breakdown Doughnut */}
                    <div className="card glass-card">
                      <h3 className="card-title">Ödeme Yöntemleri Dağılımı</h3>
                      {renderDoughnutChart()}
                    </div>
                  </div>

                  {/* Right Column: Z-Report or Financial Details */}
                  {isTodayOnly ? (
                    <div className="card glass-card" style={{ border: '1px solid var(--border)' }}>
                      <h3 className="card-title" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Kasa Kapama (Z-Raporu)
                        <span className="state-pill ok" style={{ fontSize: '0.75rem' }}>Bugün Aktif</span>
                      </h3>
                      {isCashier && (
                        <div className="accent-gradient-banner" style={{ fontSize: '0.85rem', marginBottom: '1rem', padding: '0.75rem', borderRadius: '8px', fontWeight: '600' }}>
                          🔒 Blind close modu kasiyer rolü için zorunludur. Ciro değerleri gizlenmiştir.
                        </div>
                      )}
                      <div className="card glass-card" style={{ marginBottom: '1rem', background: 'var(--bg-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Beklenen Nakit</span>
                          <strong>{blindCloseMode ? 'Gizlenmiş' : formatCurrency(expectedCash)}</strong>
                        </div>
                        {!isCashier && (
                          <label className="checkbox-row" style={{ marginTop: '0.75rem' }}>
                            <input
                              type="checkbox"
                              checked={blindCloseMode}
                              onChange={(event) => setBlindCloseMode(event.target.checked)}
                            />
                            Rakamı benden sakla (Blind Close)
                          </label>
                        )}
                      </div>
                      <div className="modal-grid-two">
                        <div className="login-field">
                          <label>Fiziksel Kasa Bakiyesi</label>
                          <input
                            className="input"
                            min={0}
                            step="0.01"
                            type="number"
                            value={closingBalance}
                            onChange={(event) => setClosingBalance(event.target.value)}
                          />
                        </div>
                        <div className="login-field">
                          <label>Vardiya Notu</label>
                          <input
                            className="input"
                            type="text"
                            placeholder="Açıklama girin..."
                            value={closingNote}
                            onChange={(event) => setClosingNote(event.target.value)}
                          />
                        </div>
                      </div>
                      <button
                        className="btn btn-danger tactile-press btn-block"
                        style={{ marginTop: '1rem' }}
                        type="button"
                        disabled={isClosing || closingBalance.trim().length === 0}
                        onClick={() => void closeRegisterSession()}
                      >
                        {isClosing ? 'İşleniyor...' : 'Kasayı Kapat ve Raporu Onayla'}
                      </button>
                      <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '0.85rem', textAlign: 'center' }}>
                        Son Kapanış: {lastClosedAt ? new Date(lastClosedAt).toLocaleString('tr-TR') : '-'}
                      </p>
                    </div>
                  ) : (
                    <div className="card glass-card">
                      <h3 className="card-title" style={{ marginBottom: '1rem' }}>Finansal Özet</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Toplam KDV Dağılımı</span>
                          <strong style={{ fontSize: '1.05rem' }}>{formatCurrency(report.totalVat)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>İade Oranı</span>
                          <strong style={{ fontSize: '1.05rem', color: 'var(--danger)' }}>
                            {report.totalSales > 0 ? `%${((report.totalRefunds / report.totalSales) * 100).toFixed(1)}` : '%0'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Ortalama Sepet Tutarı</span>
                          <strong style={{ fontSize: '1.05rem', color: 'var(--accent)' }}>
                            {report.salesCount > 0 ? formatCurrency(report.totalSales / report.salesCount) : '0 ₺'}
                          </strong>
                        </div>
                        
                        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                          💡 <strong>Tarih Aralığı Analizi:</strong> Bu rapordaki veriler {startDate} ile {endDate} tarihleri arasındaki tüm tamamlanmış satış ve iade hareketlerini kapsar. Bu sürece ait kasa kapama veya vardiya devir işlemleri için <strong>Z-Raporu Geçmişi</strong> sekmesini kullanabilirsiniz.
                        </div>

                        {/* Quick Action */}
                        <button 
                          className="btn btn-primary tactile-press"
                          style={{ marginTop: '0.5rem' }}
                          onClick={() => void printZReportReceipt(report, topProducts, false)}
                        >
                          Seçili Dönem Raporunu Yazdır
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Top Products Performance Table */}
                <div className="card glass-card">
                  <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
                    Ürün Bazlı Performans (En Çok Satanlar)
                  </h3>
                  {topProducts.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Bu tarihte henüz satış kaydı bulunmuyor.
                    </div>
                  ) : (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Ürün Adı</th>
                            <th style={{ textAlign: 'center' }}>Satış Adedi</th>
                            <th style={{ textAlign: 'right', width: '200px' }}>Toplam Ciro</th>
                            <th style={{ width: '250px' }}>Gelir Payı</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topProducts.map((item) => {
                            const share = report.totalSales > 0 ? (item.totalRevenue / report.totalSales) * 100 : 0;
                            return (
                              <tr key={item.productId}>
                                <td style={{ fontWeight: 600 }}>{item.productName}</td>
                                <td style={{ textAlign: 'center' }}>{item.totalQuantity} adet</td>
                                <td style={{ textAlign: 'right' }}>{formatCurrency(item.totalRevenue)}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${share}%`, background: 'var(--success)' }} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', width: '35px' }}>%{share.toFixed(0)}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {isCloseApprovalOpen && (
        <ManagerApprovalModal
          actionLabel="Kasa Kapatma Onayı"
          companyId={state.user?.companyId}
          description="Kasa kapama islemi yonetici onayi gerektirir."
          onCancel={() => setCloseApprovalOpen(false)}
          onApproved={executeCloseRegisterSession}
          reasonLabel="Onay Nedeni"
          reasonPlaceholder="Ornek: Vardiya sonu kontrolu tamamlandi"
          requireReason
        />
      )}
    </>
  );
}
