import React, { useEffect, useMemo, useState } from 'react';

import type { SetupState } from './electron-api';
import AccessLockScreen from './components/AccessLockScreen';
import PresetSettingsModal from './components/PresetSettingsModal';
import SetupGate from './components/SetupGate';
import ToastContainer from './components/ToastContainer';
import DayReportPage from './pages/DayReportPage';
import DiagnosticsPage from './pages/DiagnosticsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import PaymentPage from './pages/PaymentPage';
import OperationsPage from './pages/OperationsPage';
import QuickProductsPage from './pages/QuickProductsPage';
import RefundPage from './pages/RefundPage';
import SalePage from './pages/SalePage';
import StockPage from './pages/StockPage';
import CampaignsPage from './pages/CampaignsPage';
import CustomersPage from './pages/CustomersPage';
import ExpensesPage from './pages/ExpensesPage';
import ShiftPage from './pages/ShiftPage';
import SuppliersPage from './pages/SuppliersPage';
import {
  canAccessDesktopPage,
  explainRuntimeError,
  getQueueStatus,
  isCompanyAccessBlockError,
  loadCatalog,
  readCompanyAccessBlockDetails,
  restoreCachedSession,
  runSync,
  recordShiftHandover,
  closeSession,
  fetchDailyReport,
  listCashMovements,
  logSecurityEvent,
  type CompanyAccessBlockDetails,
} from './services/pos-runtime';
import type { AuthSession } from './services/types';
import { resolveTouchDensityByViewport } from './services/ui-preset';
import { AppProvider, selectAuthSession, useApp, useToast } from './store';

type Page = 'campaigns' | 'customers' | 'dashboard' | 'diagnostics' | 'expenses' | 'operations' | 'payment' | 'quick' | 'refund' | 'report' | 'sale' | 'shift' | 'stock' | 'suppliers';
type SyncIndicator = 'ERROR' | 'IDLE' | 'RUNNING';

function resolveFallbackPage(role: string | undefined): Page {
  const ordered: Page[] = ['sale', 'dashboard', 'report', 'campaigns', 'quick', 'customers', 'suppliers', 'expenses', 'shift', 'payment', 'refund', 'stock', 'operations'];
  for (const page of ordered) {
    if (canAccessDesktopPage(role, page)) {
      return page;
    }
  }
  return 'sale';
}

function AppContent() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [booting, setBooting] = useState(true);
  const [accessLock, setAccessLock] = useState<CompanyAccessBlockDetails | null>(null);
  const [loginRenderKey, setLoginRenderKey] = useState(0);
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [page, setPage] = useState<Page>('dashboard');
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [syncIndicator, setSyncIndicator] = useState<SyncIndicator>('IDLE');

  const activeSession = useMemo(() => selectAuthSession(state), [state]);
  const canVisitPage = (nextPage: Page): boolean => canAccessDesktopPage(state.user?.role, nextPage);

  const hydrateUiConfig = async (): Promise<void> => {
    if (window.electronAPI) {
      const presetState = await window.electronAPI.getUiPreset();
      dispatch({ payload: presetState, type: 'SET_UI_CONFIG' });
      return;
    }
    dispatch({
      payload: {
        touchDensity: resolveTouchDensityByViewport(window.innerWidth, window.innerHeight),
        uiPreset: state.uiPreset,
      },
      type: 'SET_UI_CONFIG',
    });
  };

  const hydrateSession = async (session: AuthSession): Promise<void> => {
    dispatch({ payload: session, type: 'SET_SESSION' });
    const catalog = await loadCatalog(session, { skipRemoteSyncPull: true });
    dispatch({ payload: catalog, type: 'SET_CATALOG' });
    const queue = await getQueueStatus();
    dispatch({ payload: queue, type: 'SET_QUEUE_STATUS' });
  };

  const synchronizeRuntime = async (
    session: AuthSession,
    options?: { silent?: boolean },
  ): Promise<void> => {
    if (!session.accessToken) {
      return;
    }

    setIsSyncing(true);
    setSyncIndicator('RUNNING');
    try {
      const result = await runSync(session);
      if (result) {
        dispatch({ payload: result.syncedAt, type: 'SET_LAST_SYNC_AT' });
        dispatch({ payload: true, type: 'SET_ONLINE' });
      }
      const catalog = await loadCatalog(session);
      dispatch({ payload: catalog, type: 'SET_CATALOG' });
      if (result && !options?.silent) {
        const currentQueue = await getQueueStatus();
        if (result.errors.length > 0) {
          toast.info(
            `Sync tamamlandi. Kuyrukta ${currentQueue.sales} satis / ${currentQueue.refunds} iade bekliyor.`,
          );
        } else {
          toast.success('Sync tamamlandi.');
        }
      }
      setSyncIndicator('IDLE');
    } catch (caughtError: unknown) {
      dispatch({ payload: false, type: 'SET_ONLINE' });
      setSyncIndicator('ERROR');
      if (isCompanyAccessBlockError(caughtError)) {
        setAccessLock(readCompanyAccessBlockDetails(caughtError));
      } else if (!options?.silent) {
        toast.error(explainRuntimeError(caughtError));
      }
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await hydrateUiConfig();
        if (window.electronAPI) {
          const nextSetupState = await window.electronAPI.getSetupState();
          if (!cancelled) {
            setSetupState(nextSetupState);
          }
          if (!nextSetupState.completedAt) {
            return;
          }
        }
        const cached = await restoreCachedSession();
        if (!cached || cancelled) {
          return;
        }
        await hydrateSession(cached);
        setAccessLock(null);
      } catch (caughtError: unknown) {
        if (isCompanyAccessBlockError(caughtError)) {
          setAccessLock(readCompanyAccessBlockDetails(caughtError));
        } else {
          toast.error(explainRuntimeError(caughtError));
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();
    const interval = setInterval(() => {
      if (activeSession) {
        void getQueueStatus().then((q) => dispatch({ payload: q, type: 'SET_QUEUE_STATUS' }));

        if (window.electronAPI) {
          window.electronAPI.getCompanyAccessSnapshot(activeSession.user.companyId).then((snapshot) => {
            if (snapshot) {
              const nowMs = Date.now();
              const offlineValidUntilMs = Date.parse(snapshot.offlineAccessValidUntil);
              const checkedAtMs = Date.parse(snapshot.checkedAt);
              const localLastSeenMs = snapshot.localLastSeenAt ? Date.parse(snapshot.localLastSeenAt) : null;
              const CLOCK_ROLLBACK_TOLERANCE_MS = 30 * 60 * 1000;

              if (
                (Number.isFinite(checkedAtMs) && nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < checkedAtMs) ||
                (localLastSeenMs !== null && Number.isFinite(localLastSeenMs) && nowMs + CLOCK_ROLLBACK_TOLERANCE_MS < localLastSeenMs)
              ) {
                setAccessLock({
                  blockType: 'CLOCK_ROLLBACK',
                  message: 'Cihaz saati geri alindigi tespit edildi. Guvenlik nedeniyle offline erisim durduruldu. Lutfen internete baglanip tekrar giris yapin.',
                  snapshot,
                });
              } else if (
                snapshot.status === 'EXPIRED' ||
                snapshot.status === 'SUSPENDED' ||
                !snapshot.isAccessAllowed
              ) {
                setAccessLock({
                  blockType: 'SUBSCRIPTION_BLOCKED',
                  message: snapshot.summary,
                  snapshot,
                });
              } else if (!Number.isFinite(offlineValidUntilMs) || nowMs > offlineValidUntilMs) {
                setAccessLock({
                  blockType: 'OFFLINE_EXPIRED',
                  message: 'Paket dogrulama suresi doldu. Lutfen internet ile tekrar online giris yapin.',
                  snapshot,
                });
              }
            }
          }).catch(() => {});
        }
      }
      
      // Otomatik Gün Sonu Kontrolü
      const autoCloseEnabled = localStorage.getItem('marketpos_auto_close_enabled') === 'true';
      const autoCloseTime = localStorage.getItem('marketpos_auto_close_time') || '02:00';
      const autoOpenEnabled = localStorage.getItem('marketpos_auto_open_enabled') === 'true';
      const autoOpenTime = localStorage.getItem('marketpos_auto_open_time') || '08:00';

      const now = new Date();
      const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:mm" formatı

      if (autoCloseEnabled && currentTimeStr === autoCloseTime) {
        const isShiftActive = !!localStorage.getItem('marketpos_shift_start_time');
        if (isShiftActive) {
          console.log('Otomasyon: Otomatik gün sonu tetikleniyor...');
          void (async () => {
            try {
              if (!activeSession) return;
              const today = now.toISOString().split('T')[0];
              const [report, movements] = await Promise.all([
                fetchDailyReport(activeSession, today),
                listCashMovements(activeSession.registerId, 100)
              ]);
              
              const start = localStorage.getItem('marketpos_shift_start_time');
              const startTime = new Date(start!).getTime();
              const opening = parseFloat(localStorage.getItem('marketpos_shift_opening_cash') || '0');
              const saleCash = report.paymentBreakdown?.find(p => p.method === 'CASH')?.total || 0;
              const refundCash = report.totalRefunds || 0;
              const currentMovements = movements.filter(m => new Date(m.createdAt).getTime() >= startTime);
              const cashIn = currentMovements.filter(m => m.movementType === 'SAFE_IN').reduce((sum, m) => sum + m.amount, 0);
              const cashOut = currentMovements.filter(m => m.movementType !== 'SAFE_IN').reduce((sum, m) => sum + m.amount, 0);
              const expected = opening + saleCash - refundCash + cashIn - cashOut;

              await recordShiftHandover({
                blindClose: true,
                declaredCash: expected,
                expectedCash: expected,
                note: 'Sistem tarafından otomatik gün sonu (Z-Otomasyon)',
                operatorUserId: activeSession.user.id,
                registerId: activeSession.registerId,
              });
              await closeSession(activeSession, expected, 'Otomatik Kapanış');
              
              localStorage.removeItem('marketpos_shift_start_time');
              localStorage.removeItem('marketpos_shift_opening_cash');
              toast.info('Vardiya otomatik olarak kapatıldı.');
            } catch (err) {
              console.error('Auto-close error:', err);
            }
          })();
        }
      }

      if (autoOpenEnabled && currentTimeStr === autoOpenTime) {
        const isShiftActive = !!localStorage.getItem('marketpos_shift_start_time');
        if (!isShiftActive) {
          const autoOpenCash = localStorage.getItem('marketpos_auto_open_cash') || '0';
          localStorage.setItem('marketpos_shift_start_time', now.toISOString());
          localStorage.setItem('marketpos_shift_opening_cash', autoOpenCash);
          toast.success(`Yeni gün otomatik olarak başlatıldı (Kasa: ${autoOpenCash} ₺)`);
        }
      }
    }, 60000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSession?.sessionId]);

  useEffect(() => {
    const handleResize = (): void => {
      const autoDensity = resolveTouchDensityByViewport(window.innerWidth, window.innerHeight);
      if (autoDensity !== state.touchDensity) {
        dispatch({
          payload: { touchDensity: autoDensity, uiPreset: state.uiPreset },
          type: 'SET_UI_CONFIG',
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch, state.touchDensity, state.uiPreset]);

  useEffect(() => {
    if (state.user) {
      return;
    }
    setPresetModalOpen(false);
    setPage('sale');
    setSyncIndicator('IDLE');
    setIsSyncing(false);
  }, [state.user]);

  useEffect(() => {
    if (!state.user) {
      return;
    }
    if (!canVisitPage(page)) {
      setPage(resolveFallbackPage(state.user.role));
    }
  }, [canVisitPage, page, state.user]);

  useEffect(() => {
    const handleGlobalShortcut = (event: KeyboardEvent): void => {
      if (!state.user) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName;
      const isEditableTarget =
        targetTag === 'INPUT' || targetTag === 'TEXTAREA' || target?.isContentEditable === true;

      if (event.key === 'F1') {
        event.preventDefault();
        if (canVisitPage('sale')) {
          setPage('sale');
        }
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        if (canVisitPage('quick')) {
          setPage('quick');
        }
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        if (!canVisitPage('payment')) {
          return;
        }
        if (state.cart.length === 0) {
          toast.info('Odeme ekrani icin once sepete urun ekleyin.');
          return;
        }
        setPage('payment');
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        if (canVisitPage('refund')) {
          setPage('refund');
        }
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        if (canVisitPage('operations')) {
          setPage('operations');
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isPresetModalOpen) {
          setPresetModalOpen(false);
          return;
        }
        if (page === 'payment') {
          setPage('sale');
        }
        return;
      }
      if (event.key === 'Enter' && !isEditableTarget) {
        if (page === 'sale' && state.cart.length > 0) {
          setPage('payment');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [canVisitPage, isPresetModalOpen, page, state.cart.length, state.user, toast]);

  useEffect(() => {
    if (!activeSession || !activeSession.accessToken) {
      return;
    }
    const timer = setInterval(() => {
      void synchronizeRuntime(activeSession, { silent: true });
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [activeSession?.accessToken, activeSession?.sessionId]);

  const handleLogout = async (): Promise<void> => {
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur();
    setPresetModalOpen(false);
    let canReload = true;
    try {
      if (window.electronAPI) {
        await window.electronAPI.clearSession();
      }
    } catch (caughtError: unknown) {
      canReload = false;
      toast.error(explainRuntimeError(caughtError));
    } finally {
      dispatch({ type: 'CLEAR_SESSION' });
      setAccessLock(null);
      setPage('sale');
      setSyncIndicator('IDLE');
      setIsSyncing(false);
      setLoginRenderKey((current) => current + 1);
      if (canReload) {
        window.setTimeout(() => {
          window.location.reload();
        }, 0);
      }
    }
  };

  const handleSetupCompleted = async (params: {
    session: AuthSession | null;
    setupState: SetupState;
  }): Promise<void> => {
    setSetupState(params.setupState);
    setAccessLock(null);
    if (params.session) {
      await hydrateSession(params.session);
    } else {
      setLoginRenderKey((current) => current + 1);
    }
  };

  if (booting) {
    return <div className="login-page">Yukleniyor...</div>;
  }

  if (setupState && !setupState.completedAt) {
    return (
      <>
        <SetupGate onCompleted={handleSetupCompleted} />
        <ToastContainer />
      </>
    );
  }

  if (!state.user) {
    if (accessLock) {
      return (
        <>
          <AccessLockScreen
            details={accessLock}
            onSwitchToOnlineLogin={() => {
              setAccessLock(null);
              setLoginRenderKey((current) => current + 1);
            }}
          />
          <ToastContainer />
        </>
      );
    }

    return (
      <>
        <LoginPage
          key={loginRenderKey}
          onAccessBlocked={(details) => setAccessLock(details)}
          onLoginSuccess={async (session) => {
            setAccessLock(null);
            await hydrateSession(session);
            try {
              await synchronizeRuntime(session, { silent: true });
            } catch {
              // API ulaşılamıyor (uyuyor/kapalı) — offline modda devam et, session'ı BOZMA
              toast.error('Sunucuya ulaşılamıyor — offline modda çalışıyorsunuz');
            }
          }}
        />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className={`app-layout touch-${state.touchDensity}`} data-ui-preset={state.uiPreset}>
      <nav className="sidebar sidebar-scrollable">
        <div className="sidebar-logo">M</div>

        {/* Ana İşlemler */}
        <div className="sidebar-group-label">Ana İşlem</div>
        {canVisitPage('dashboard') && (
          <button className={`sidebar-btn ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')} title="Panel">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span className="label">Panel</span>
          </button>
        )}
        {canVisitPage('sale') && (
          <button className={`sidebar-btn ${page === 'sale' ? 'active' : ''}`} onClick={() => setPage('sale')} title="Satış">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <span className="label">Satış</span>
          </button>
        )}
        {canVisitPage('quick') && (
          <button className={`sidebar-btn ${page === 'quick' ? 'active' : ''}`} onClick={() => setPage('quick')} title="Hızlı Menü">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <span className="label">Hızlı Menü</span>
          </button>
        )}

        <div className="sidebar-divider" />

        {/* Finans & Cari */}
        <div className="sidebar-group-label">Finans</div>
        {canVisitPage('customers') && (
          <button className={`sidebar-btn ${page === 'customers' ? 'active' : ''}`} onClick={() => setPage('customers')} title="Müşteriler (Cari)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <span className="label">Müşteriler</span>
          </button>
        )}
        {canVisitPage('suppliers') && (
          <button className={`sidebar-btn ${page === 'suppliers' ? 'active' : ''}`} onClick={() => setPage('suppliers')} title="Tedarikciler">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M6 7v10m12-10v10M8 21h8a2 2 0 002-2V7H6v12a2 2 0 002 2z" /></svg>
            <span className="label">Tedarikciler</span>
          </button>
        )}
        {canVisitPage('expenses') && (
          <button className={`sidebar-btn ${page === 'expenses' ? 'active' : ''}`} onClick={() => setPage('expenses')} title="Gider Girişi">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            <span className="label">Giderler</span>
          </button>
        )}
        {canVisitPage('refund') && (
          <button className={`sidebar-btn ${page === 'refund' ? 'active' : ''}`} onClick={() => setPage('refund')} title="İade">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            <span className="label">İade</span>
          </button>
        )}

        <div className="sidebar-divider" />

        {/* Stok & Ürün */}
        <div className="sidebar-group-label">Ürün & Stok</div>
        {canVisitPage('stock') && (
          <button className={`sidebar-btn ${page === 'stock' ? 'active' : ''}`} onClick={() => setPage('stock')} title="Stok İşlemleri">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            <span className="label">Stok</span>
          </button>
        )}
        {canVisitPage('campaigns') && (
          <button className={`sidebar-btn ${page === 'campaigns' ? 'active' : ''}`} onClick={() => setPage('campaigns')} title="Kampanyalar">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            <span className="label">Kampanyalar</span>
          </button>
        )}

        <div className="sidebar-divider" />

        {/* Rapor & Kasa */}
        <div className="sidebar-group-label">Kasa</div>
        {canVisitPage('report') && (
          <button className={`sidebar-btn ${page === 'report' ? 'active' : ''}`} onClick={() => setPage('report')} title="Raporlar">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="label">Raporlar</span>
          </button>
        )}
        {canVisitPage('operations') && (
          <button className={`sidebar-btn ${page === 'shift' ? 'active' : ''}`} onClick={() => setPage('shift')} title="Gün Başı & Gün Sonu İşlemleri">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="label">Gün Sonu</span>
          </button>
        )}

        {canVisitPage('operations') && (
          <button className={`sidebar-btn ${page === 'operations' ? 'active' : ''}`} onClick={() => setPage('operations')} title="Sistem Operasyonları">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <span className="label">Sistem</span>
          </button>
        )}

        {canVisitPage('operations') && (
          <button className={`sidebar-btn ${page === 'diagnostics' ? 'active' : ''}`} onClick={() => setPage('diagnostics')} title="Senkronizasyon Teşhis">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <span className="label">Teşhis</span>
          </button>
        )}

        <div className="sidebar-divider" />
        
        <button className="sidebar-btn" onClick={() => setPresetModalOpen(true)} title="Ayar">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="label">Ayarlar</span>
        </button>

        <div className="sidebar-spacer" style={{ minHeight: '40px' }} />

        <button className="sidebar-btn" style={{ color: 'var(--danger)' }} onClick={() => void handleLogout()} title="Çıkış" id="logout-btn">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          <span className="label">Çıkış</span>
        </button>
      </nav>

      <div className="main-content">
        {page === 'dashboard' && <DashboardPage />}
        {page === 'sale' && <SalePage onOpenPayment={() => setPage('payment')} />}
        {page === 'quick' && <QuickProductsPage />}
        {page === 'customers' && <CustomersPage />}
        {page === 'suppliers' && <SuppliersPage />}
        {page === 'expenses' && <ExpensesPage />}
        {page === 'payment' && <PaymentPage onClose={() => setPage('sale')} />}
        {page === 'refund' && <RefundPage />}
        {page === 'stock' && <StockPage />}
        {page === 'report' && <DayReportPage />}
        {page === 'shift' && <ShiftPage />}
        {page === 'operations' && <OperationsPage />}
        {page === 'diagnostics' && <DiagnosticsPage />}
        {page === 'campaigns' && <CampaignsPage />}

        <footer className="status-bar">
          <span>
            <span className={`status-dot ${state.isOnline ? 'online' : 'offline'}`} />{' '}
            {state.isOnline ? 'Cevrimici' : 'Cevrimdisi'}
          </span>
          <span className={`sync-pill ${syncIndicator.toLowerCase()}`}>
            {syncIndicator === 'RUNNING'
              ? 'Sync: Calisiyor'
              : syncIndicator === 'ERROR'
                ? 'Sync: Hata'
                : 'Sync: Hazir'}
          </span>
          <span>Kuyruk Satis: {state.queueSales}</span>
          <span>Kuyruk Iade: {state.queueRefunds}</span>
          <span>Toplam Kuyruk: {state.pendingCount}</span>
          <span>Sync Durum: {state.lastSyncStatus}</span>
          <span>Preset: {state.uiPreset.toUpperCase()}</span>
          <span>
            Son Sync:{' '}
            {state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleTimeString('tr-TR') : '-'}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!activeSession?.accessToken || isSyncing}
            onClick={() => activeSession && void synchronizeRuntime(activeSession)}
            type="button"
          >
            {isSyncing ? 'Sync...' : 'Manuel Sync'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPresetModalOpen(true)} type="button">
            Yonetici Ayarlari
          </button>
        </footer>
      </div>

      {isPresetModalOpen && (
        <PresetSettingsModal
          companyId={state.user?.companyId}
          currentPreset={state.uiPreset}
          onClose={() => setPresetModalOpen(false)}
          onSaved={(payload) => dispatch({ payload, type: 'SET_UI_CONFIG' })}
        />
      )}

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
