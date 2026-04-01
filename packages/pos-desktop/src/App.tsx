import React, { useEffect, useMemo, useState } from 'react';

import type { SetupState } from './electron-api';
import AccessLockScreen from './components/AccessLockScreen';
import PresetSettingsModal from './components/PresetSettingsModal';
import SetupGate from './components/SetupGate';
import ToastContainer from './components/ToastContainer';
import DayReportPage from './pages/DayReportPage';
import LoginPage from './pages/LoginPage';
import PaymentPage from './pages/PaymentPage';
import OperationsPage from './pages/OperationsPage';
import QuickProductsPage from './pages/QuickProductsPage';
import RefundPage from './pages/RefundPage';
import SalePage from './pages/SalePage';
import StockPage from './pages/StockPage';
import {
  explainRuntimeError,
  getQueueStatus,
  isCompanyAccessBlockError,
  loadCatalog,
  readCompanyAccessBlockDetails,
  restoreCachedSession,
  runSync,
  type CompanyAccessBlockDetails,
} from './services/pos-runtime';
import type { AuthSession } from './services/types';
import { resolveTouchDensityByViewport } from './services/ui-preset';
import { AppProvider, selectAuthSession, useApp, useToast } from './store';

type Page = 'operations' | 'payment' | 'quick' | 'refund' | 'report' | 'sale' | 'stock';
type SyncIndicator = 'ERROR' | 'IDLE' | 'RUNNING';

function AppContent() {
  const toast = useToast();
  const { dispatch, state } = useApp();
  const [booting, setBooting] = useState(true);
  const [accessLock, setAccessLock] = useState<CompanyAccessBlockDetails | null>(null);
  const [loginRenderKey, setLoginRenderKey] = useState(0);
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [page, setPage] = useState<Page>('sale');
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [syncIndicator, setSyncIndicator] = useState<SyncIndicator>('IDLE');

  const activeSession = useMemo(() => selectAuthSession(state), [state]);

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
    const catalog = await loadCatalog(session);
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
      const queue = await getQueueStatus();
      dispatch({ payload: queue, type: 'SET_QUEUE_STATUS' });
      if (result && !options?.silent) {
        if (result.errors.length > 0) {
          toast.info(
            `Sync tamamlandi. Kuyrukta ${queue.sales} satis / ${queue.refunds} iade bekliyor.`,
          );
        } else {
          toast.success('Sync tamamlandi.');
        }
      }
      setSyncIndicator('IDLE');
    } catch (caughtError: unknown) {
      dispatch({ payload: false, type: 'SET_ONLINE' });
      setSyncIndicator('ERROR');
      if (!options?.silent) {
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
    return () => {
      cancelled = true;
    };
  }, []);

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
        setPage('sale');
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        setPage('quick');
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        if (state.cart.length === 0) {
          toast.info('Odeme ekrani icin once sepete urun ekleyin.');
          return;
        }
        setPage('payment');
        return;
      }
      if (event.key === 'F4') {
        event.preventDefault();
        setPage('refund');
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        setPage('operations');
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
  }, [isPresetModalOpen, page, state.cart.length, state.user, toast]);

  useEffect(() => {
    if (!activeSession || !activeSession.accessToken || !activeSession.isOnline) {
      return;
    }
    const timer = setInterval(() => {
      void synchronizeRuntime(activeSession, { silent: true });
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [activeSession?.accessToken, activeSession?.isOnline, activeSession?.sessionId]);

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
          }}
        />
        <ToastContainer />
      </>
    );
  }

  return (
    <div className={`app-layout touch-${state.touchDensity}`} data-ui-preset={state.uiPreset}>
      <nav className="sidebar">
        <div className="sidebar-logo">M</div>

        <button className={`sidebar-btn ${page === 'sale' ? 'active' : ''}`} onClick={() => setPage('sale')} title="Satis">
          S<span className="label">Satis</span>
        </button>
        <button className={`sidebar-btn ${page === 'quick' ? 'active' : ''}`} onClick={() => setPage('quick')} title="Hizli">
          H<span className="label">Hizli</span>
        </button>
        <button className={`sidebar-btn ${page === 'payment' ? 'active' : ''}`} onClick={() => setPage('payment')} title="Odeme">
          O<span className="label">Odeme</span>
        </button>
        <button className={`sidebar-btn ${page === 'refund' ? 'active' : ''}`} onClick={() => setPage('refund')} title="Iade">
          I<span className="label">Iade</span>
        </button>
        <button className={`sidebar-btn ${page === 'stock' ? 'active' : ''}`} onClick={() => setPage('stock')} title="Stok">
          T<span className="label">Stok</span>
        </button>
        <button className={`sidebar-btn ${page === 'report' ? 'active' : ''}`} onClick={() => setPage('report')} title="Rapor">
          R<span className="label">Rapor</span>
        </button>
        <button className={`sidebar-btn ${page === 'operations' ? 'active' : ''}`} onClick={() => setPage('operations')} title="Operasyon">
          P<span className="label">Operasyon</span>
        </button>
        <button className="sidebar-btn" onClick={() => setPresetModalOpen(true)} title="Yonetici Ayarlari">
          A<span className="label">Ayar</span>
        </button>

        <div style={{ flex: 1 }} />

        <button className="sidebar-btn" onClick={() => void handleLogout()} title="Cikis" id="logout-btn">
          X<span className="label">Cikis</span>
        </button>
      </nav>

      <div className="main-content">
        {page === 'sale' && <SalePage onOpenPayment={() => setPage('payment')} />}
        {page === 'quick' && <QuickProductsPage />}
        {page === 'payment' && <PaymentPage onClose={() => setPage('sale')} />}
        {page === 'refund' && <RefundPage />}
        {page === 'stock' && <StockPage />}
        {page === 'report' && <DayReportPage />}
        {page === 'operations' && <OperationsPage />}

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
