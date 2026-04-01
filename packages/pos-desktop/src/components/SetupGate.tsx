import React, { useEffect, useMemo, useState } from 'react';

import type {
  HardwareConfig,
  SetupHealthCheckResult,
  SetupState,
  SetupStepId,
} from '../electron-api';
import {
  explainHardwareRecoveryPlan,
  explainRuntimeError,
  loginOnline,
} from '../services/pos-runtime';
import {
  applyHardwareProfile,
  listHardwareProfiles,
  type HardwareProfileId,
} from '../services/hardware-profile';
import type { AuthSession } from '../services/types';
import { useToast } from '../store';

interface SetupGateProps {
  onCompleted: (args: { session: AuthSession | null; setupState: SetupState }) => Promise<void>;
}

const STEP_ORDER: SetupStepId[] = [
  'RUNTIME_CHECK',
  'HARDWARE_PROFILE',
  'HARDWARE_TEST',
  'ONLINE_ACTIVATION',
  'GO_LIVE',
];

const STEP_SHORT_TITLES: Record<SetupStepId, string> = {
  GO_LIVE: 'Go Live',
  HARDWARE_PROFILE: 'Donanim Profili',
  HARDWARE_TEST: 'Donanim Testi',
  ONLINE_ACTIVATION: 'Online Aktivasyon',
  RUNTIME_CHECK: 'Runtime Kontrolu',
};

const DEFAULT_SETUP_HARDWARE_CONFIG: HardwareConfig = {
  connectionMode: 'LAN',
  copyCount: 1,
  drawerPulse: { off: 120, on: 50 },
  port: 9100,
  target: '127.0.0.1',
  timeout: 3000,
};

const STEP_TITLES: Record<SetupStepId, string> = {
  GO_LIVE: 'Adim 5/5 - Operasyona Gecis Onayi',
  HARDWARE_PROFILE: 'Adim 2/5 - Donanim Profili',
  HARDWARE_TEST: 'Adim 3/5 - Donanim Testi',
  ONLINE_ACTIVATION: 'Adim 4/5 - Online Aktivasyon',
  RUNTIME_CHECK: 'Adim 1/5 - Runtime Kontrolu',
};

function getFirstPendingStepId(setupState: SetupState): SetupStepId {
  const found = setupState.steps.find((step) => step.status !== 'COMPLETED');
  return found?.stepId ?? 'GO_LIVE';
}

function toDateText(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('tr-TR');
}

export default function SetupGate({ onCompleted }: SetupGateProps) {
  const toast = useToast();
  const [activationSession, setActivationSession] = useState<AuthSession | null>(null);
  const [busyAction, setBusyAction] = useState<
    | null
    | 'ACTIVATE'
    | 'COMPLETE'
    | 'LOAD'
    | 'RESET'
    | 'RUNTIME'
    | 'SAVE_HW'
    | 'TEST_DRAWER'
    | 'TEST_PRINT'
  >(null);
  const [drawerResult, setDrawerResult] = useState<{
    message: string;
    success: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig | null>(null);
  const [hardwareLoadError, setHardwareLoadError] = useState('');
  const [runtimeResult, setRuntimeResult] = useState<SetupHealthCheckResult | null>(null);
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [activationInput, setActivationInput] = useState({
    companyId: '',
    password: '',
    username: 'admin',
  });
  const [selectedHardwareProfile, setSelectedHardwareProfile] =
    useState<HardwareProfileId>('LAN_FAST');
  const [printResult, setPrintResult] = useState<{
    message: string;
    success: boolean;
  } | null>(null);

  const activeStepId = useMemo(() => {
    if (!setupState) {
      return 'RUNTIME_CHECK';
    }
    return getFirstPendingStepId(setupState);
  }, [setupState]);

  const canFinalize = useMemo(() => {
    if (!setupState) {
      return false;
    }
    return setupState.steps
      .filter((step) => step.stepId !== 'GO_LIVE')
      .every((step) => step.status === 'COMPLETED');
  }, [setupState]);

  const isBusy = busyAction !== null;
  const hardwareProfiles = useMemo(() => listHardwareProfiles(), []);

  const lastResultTone = useMemo(() => {
    if (!setupState?.lastResult) {
      return 'ok';
    }
    const message = setupState.lastResult.message.toLocaleLowerCase('tr-TR');
    if (message.includes('sifir')) {
      return 'warn';
    }
    return setupState.lastResult.status === 'SUCCESS' ? 'ok' : 'fail';
  }, [setupState]);

  const loadSetupState = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }

    setBusyAction('LOAD');
    setError('');
    try {
      const nextSetupState = await window.electronAPI.getSetupState();
      let nextHardwareConfig: HardwareConfig = { ...DEFAULT_SETUP_HARDWARE_CONFIG };
      try {
        nextHardwareConfig = await window.electronAPI.getHardwareConfig();
        setHardwareLoadError('');
      } catch (caughtError: unknown) {
        const message = explainRuntimeError(caughtError);
        setHardwareLoadError(
          `Donanim ayari okunamadi, varsayilan profil yuklendi. (${message})`,
        );
      }
      setSetupState(nextSetupState);
      setHardwareConfig(nextHardwareConfig);
    } catch (caughtError: unknown) {
      setError(explainRuntimeError(caughtError));
    } finally {
      setBusyAction(null);
    }
  };

  const reloadHardwareConfig = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setBusyAction('LOAD');
    setError('');
    try {
      const config = await window.electronAPI.getHardwareConfig();
      setHardwareConfig(config);
      setHardwareLoadError('');
      toast.success('Donanim ayarlari tekrar yuklendi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setHardwareConfig({ ...DEFAULT_SETUP_HARDWARE_CONFIG });
      setHardwareLoadError(
        `Donanim ayari tekrar okunamadi, varsayilan profil kullaniliyor. (${message})`,
      );
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    void loadSetupState();
  }, []);

  const markStep = async (
    stepId: SetupStepId,
    detail?: string | null,
  ): Promise<SetupState | null> => {
    if (!window.electronAPI) {
      return null;
    }
    const nextState = await window.electronAPI.updateSetupStep({
      detail,
      status: 'COMPLETED',
      stepId,
    });
    setSetupState(nextState);
    return nextState;
  };

  const runRuntimeChecks = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }

    setBusyAction('RUNTIME');
    setError('');
    try {
      const runtimeInfo = await window.electronAPI.getRuntimeInfo();
      const checks: SetupHealthCheckResult['checks'] = [
        {
          key: 'ELECTRON_BRIDGE',
          ok: Boolean(window.electronAPI),
          value: 'bridge-ready',
        },
        {
          key: 'API_BASE_URL',
          ok: /^https?:\/\//u.test(runtimeInfo.apiBaseUrl),
          value: runtimeInfo.apiBaseUrl,
        },
        {
          key: 'DATABASE_PATH',
          ok: runtimeInfo.databasePath.trim().length > 0,
          value: runtimeInfo.databasePath,
        },
      ];
      const passed = checks.every((check) => check.ok);
      const report: SetupHealthCheckResult = {
        apiBaseUrl: runtimeInfo.apiBaseUrl,
        checks,
        databasePath: runtimeInfo.databasePath,
        passed,
        userDataPath: runtimeInfo.userDataPath,
        version: runtimeInfo.version,
      };
      setRuntimeResult(report);
      if (!passed) {
        throw new Error('Runtime kontrollerinde eksik adim var.');
      }

      await markStep(
        'RUNTIME_CHECK',
        `api=${runtimeInfo.apiBaseUrl};db=${runtimeInfo.databasePath}`,
      );
      toast.success('Runtime kontrolleri tamamlandi.');
    } catch (caughtError: unknown) {
      setError(explainRuntimeError(caughtError));
      toast.error(explainRuntimeError(caughtError));
    } finally {
      setBusyAction(null);
    }
  };

  const saveHardwareProfile = async (): Promise<void> => {
    if (!window.electronAPI || !hardwareConfig) {
      setError('Donanim konfigrasyonu yuklenemedi.');
      return;
    }

    setBusyAction('SAVE_HW');
    setError('');
    try {
      await window.electronAPI.setHardwareConfig(hardwareConfig);
      await markStep(
        'HARDWARE_PROFILE',
        `${hardwareConfig.connectionMode}:${hardwareConfig.target}`,
      );
      toast.success('Donanim profili kaydedildi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const applySelectedProfile = (): void => {
    if (!hardwareConfig) {
      return;
    }
    setHardwareConfig(applyHardwareProfile(hardwareConfig, selectedHardwareProfile));
  };

  const runPrintTest = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setBusyAction('TEST_PRINT');
    setError('');
    try {
      const result = await window.electronAPI.testHardwarePrint();
      const hint = explainHardwareRecoveryPlan({
        errorCode: result.errorCode,
        message: result.message,
        operatorAction: result.operatorAction,
      });
      setPrintResult({
        message: hint.length > 0 ? `${result.message} ${hint}` : result.message,
        success: result.success,
      });
      if (result.success) {
        toast.success('Test fisi basarili.');
      } else {
        toast.error(result.message);
      }
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const runDrawerTest = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setBusyAction('TEST_DRAWER');
    setError('');
    try {
      const result = await window.electronAPI.testHardwareDrawer();
      const hint = explainHardwareRecoveryPlan({
        errorCode: result.errorCode,
        message: result.message,
        operatorAction: result.operatorAction,
      });
      setDrawerResult({
        message: hint.length > 0 ? `${result.message} ${hint}` : result.message,
        success: result.success,
      });
      if (result.success) {
        toast.success('Cekmece testi basarili.');
      } else {
        toast.error(result.message);
      }
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const completeHardwareTestStep = async (): Promise<void> => {
    if (!printResult?.success || !drawerResult?.success) {
      setError('Adim 3 icin hem test fis hem cekmece testi basarili olmalidir.');
      return;
    }

    try {
      await markStep('HARDWARE_TEST', 'print=ok;drawer=ok');
      toast.success('Donanim test adimi tamamlandi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    }
  };

  const runOnlineActivation = async (): Promise<void> => {
    setBusyAction('ACTIVATE');
    setError('');
    try {
      const session = await loginOnline({
        companyId: activationInput.companyId.trim() || undefined,
        password: activationInput.password,
        username: activationInput.username.trim(),
      });
      setActivationSession(session);
      await markStep(
        'ONLINE_ACTIVATION',
        `user=${session.user.username};company=${session.user.companyId}`,
      );
      toast.success(`Online aktivasyon tamamlandi: ${session.user.fullName}`);
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const finalizeSetup = async (): Promise<void> => {
    if (!window.electronAPI || !setupState) {
      return;
    }
    if (!canFinalize) {
      setError('Tum adimlar tamamlanmadan operasyona gecilemez.');
      return;
    }
    setBusyAction('COMPLETE');
    setError('');
    try {
      await markStep('GO_LIVE', 'Saha kurulumu onaylandi');
      const nextSetupState = await window.electronAPI.completeSetup(
        'Ilk kurulum tamamlandi ve operasyona gecildi.',
      );
      setSetupState(nextSetupState);
      await onCompleted({ session: activationSession, setupState: nextSetupState });
      toast.success('Kurulum tamamlandi. Operasyona geciliyor.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const resetSetup = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    if (!window.confirm('Kurulum adimlari sifirlansin mi?')) {
      return;
    }
    setBusyAction('RESET');
    setError('');
    try {
      const nextState = await window.electronAPI.resetSetup(
        'Kurulum saha ekibi tarafindan sifirlandi.',
      );
      setSetupState(nextState);
      setRuntimeResult(null);
      setPrintResult(null);
      setDrawerResult(null);
      setActivationSession(null);
      setHardwareConfig({ ...DEFAULT_SETUP_HARDWARE_CONFIG });
      setHardwareLoadError('');
      setActivationInput((current) => ({ ...current, password: '' }));
      toast.info('Kurulum adimlari sifirlandi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const renderStepBody = (): React.ReactNode => {
    if (activeStepId === 'RUNTIME_CHECK') {
      return (
        <>
          <p className="setup-caption">
            API adresi, veritabani yolu ve Electron bridge dogrulanmadan devam edilmez.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => void runRuntimeChecks()}
            type="button"
            disabled={isBusy}
          >
            {busyAction === 'RUNTIME' ? 'Kontrol ediliyor...' : 'Runtime Kontrolunu Calistir'}
          </button>
          {runtimeResult && (
            <div className="setup-checklist">
              {runtimeResult.checks.map((check) => (
                <div key={check.key} className={`setup-check ${check.ok ? 'ok' : 'fail'}`}>
                  <strong>{check.key}</strong>
                  <span>{check.value}</span>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    if (activeStepId === 'HARDWARE_PROFILE') {
      return (
        <>
          <p className="setup-caption">
            Cihaz tipi icin yazici ve cekmece baglanti profilini kaydedin.
          </p>
          {hardwareLoadError.length > 0 && (
            <div className="setup-note warn">
              {hardwareLoadError}
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={isBusy}
                  onClick={() => void reloadHardwareConfig()}
                  type="button"
                >
                  Donanim Ayarini Yeniden Oku
                </button>
              </div>
            </div>
          )}
          {hardwareConfig && (
            <>
              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Saha Donanim Profili</label>
                  <select
                    className="input"
                    disabled={isBusy}
                    value={selectedHardwareProfile}
                    onChange={(event) =>
                      setSelectedHardwareProfile(event.target.value as HardwareProfileId)
                    }
                  >
                    {hardwareProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="login-field">
                  <label>&nbsp;</label>
                  <button
                    className="btn btn-ghost btn-block"
                    disabled={isBusy}
                    onClick={applySelectedProfile}
                    type="button"
                  >
                    Profili Uygula
                  </button>
                </div>
              </div>
              <p className="setup-caption" style={{ marginTop: '-0.4rem' }}>
                {hardwareProfiles.find((profile) => profile.id === selectedHardwareProfile)
                  ?.description ?? ''}
              </p>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Baglanti Modu</label>
                  <select
                    className="input"
                    disabled={isBusy}
                    value={hardwareConfig.connectionMode}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current
                          ? {
                              ...current,
                              connectionMode:
                                event.target.value === 'USB' ? 'USB' : 'LAN',
                            }
                          : current,
                      )
                    }
                  >
                    <option value="LAN">LAN (TCP)</option>
                    <option value="USB">USB (Windows Yazici)</option>
                  </select>
                </div>
                <div className="login-field">
                  <label>Hedef</label>
                  <input
                    className="input"
                    disabled={isBusy}
                    type="text"
                    value={hardwareConfig.target}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current ? { ...current, target: event.target.value } : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Port</label>
                  <input
                    className="input"
                    disabled={isBusy || hardwareConfig.connectionMode === 'USB'}
                    min={1}
                    max={65535}
                    type="number"
                    value={hardwareConfig.port}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current
                          ? {
                              ...current,
                              port: Number.parseInt(event.target.value, 10) || current.port,
                            }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="login-field">
                  <label>Timeout (ms)</label>
                  <input
                    className="input"
                    disabled={isBusy}
                    min={500}
                    max={20000}
                    type="number"
                    value={hardwareConfig.timeout}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current
                          ? {
                              ...current,
                              timeout:
                                Number.parseInt(event.target.value, 10) || current.timeout,
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>

              <div className="modal-grid-two">
                <div className="login-field">
                  <label>Drawer Pulse On</label>
                  <input
                    className="input"
                    disabled={isBusy}
                    min={0}
                    max={255}
                    type="number"
                    value={hardwareConfig.drawerPulse.on}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current
                          ? {
                              ...current,
                              drawerPulse: {
                                ...current.drawerPulse,
                                on:
                                  Number.parseInt(event.target.value, 10) ||
                                  current.drawerPulse.on,
                              },
                            }
                          : current,
                      )
                    }
                  />
                </div>
                <div className="login-field">
                  <label>Drawer Pulse Off</label>
                  <input
                    className="input"
                    disabled={isBusy}
                    min={0}
                    max={255}
                    type="number"
                    value={hardwareConfig.drawerPulse.off}
                    onChange={(event) =>
                      setHardwareConfig((current) =>
                        current
                          ? {
                              ...current,
                              drawerPulse: {
                                ...current.drawerPulse,
                                off:
                                  Number.parseInt(event.target.value, 10) ||
                                  current.drawerPulse.off,
                              },
                            }
                          : current,
                      )
                    }
                  />
                </div>
              </div>

              <button
                className="btn btn-success btn-lg"
                onClick={() => void saveHardwareProfile()}
                type="button"
                disabled={isBusy}
              >
                {busyAction === 'SAVE_HW' ? 'Kaydediliyor...' : 'Donanim Profilini Kaydet'}
              </button>
            </>
          )}
        </>
      );
    }

    if (activeStepId === 'HARDWARE_TEST') {
      return (
        <>
          <p className="setup-caption">
            Test fis ve cekmece testi basarili olmadan aktivasyona gecilemez.
          </p>
          <div className="setup-action-row">
            <button
              className="btn btn-ghost"
              disabled={isBusy}
              onClick={() => void runPrintTest()}
              type="button"
            >
              {busyAction === 'TEST_PRINT' ? 'Calisiyor...' : 'Test Fisi Yazdir'}
            </button>
            <button
              className="btn btn-ghost"
              disabled={isBusy}
              onClick={() => void runDrawerTest()}
              type="button"
            >
              {busyAction === 'TEST_DRAWER' ? 'Calisiyor...' : 'Cekmece Testi'}
            </button>
          </div>
          <div className="setup-checklist">
            <div className={`setup-check ${printResult?.success ? 'ok' : 'fail'}`}>
              <strong>Yazici</strong>
              <span>{printResult?.message ?? '-'}</span>
            </div>
            <div className={`setup-check ${drawerResult?.success ? 'ok' : 'fail'}`}>
              <strong>Cekmece</strong>
              <span>{drawerResult?.message ?? '-'}</span>
            </div>
          </div>
          <button
            className="btn btn-success btn-lg"
            disabled={isBusy || !printResult?.success || !drawerResult?.success}
            onClick={() => void completeHardwareTestStep()}
            type="button"
          >
            Donanim Test Adimini Tamamla
          </button>
        </>
      );
    }

    if (activeStepId === 'ONLINE_ACTIVATION') {
      return (
        <>
          <p className="setup-caption">
            Bu adimda sadece online aktivasyon kabul edilir, offline giris kapali.
          </p>
          <div className="login-field">
            <label>Firma ID (opsiyonel)</label>
            <input
              className="input"
              disabled={isBusy}
              type="text"
              value={activationInput.companyId}
              onChange={(event) =>
                setActivationInput((current) => ({
                  ...current,
                  companyId: event.target.value,
                }))
              }
            />
          </div>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Kullanici Adi</label>
              <input
                className="input"
                disabled={isBusy}
                type="text"
                value={activationInput.username}
                onChange={(event) =>
                  setActivationInput((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
              />
            </div>
            <div className="login-field">
              <label>Sifre</label>
              <input
                className="input"
                disabled={isBusy}
                type="password"
                value={activationInput.password}
                onChange={(event) =>
                  setActivationInput((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <button
            className="btn btn-primary btn-lg"
            disabled={
              isBusy ||
              activationInput.username.trim().length < 3 ||
              activationInput.password.length < 4
            }
            onClick={() => void runOnlineActivation()}
            type="button"
          >
            {busyAction === 'ACTIVATE' ? 'Aktivasyon Calisiyor...' : 'Online Aktivasyonu Tamamla'}
          </button>
          {activationSession && (
            <div className="setup-note ok">
              Aktivasyon tamamlandi: {activationSession.user.fullName} ({activationSession.user.username})
            </div>
          )}
        </>
      );
    }

    return (
      <>
        <p className="setup-caption">
          Kurulum ozetini kontrol edin ve operasyona gecisi onaylayin.
        </p>
        <div className="setup-checklist">
          {setupState?.steps.map((step) => (
            <div key={step.stepId} className={`setup-check ${step.status === 'COMPLETED' ? 'ok' : 'fail'}`}>
              <strong>{step.stepId}</strong>
              <span>
                {step.status} | {toDateText(step.completedAt)}
              </span>
            </div>
          ))}
        </div>
        <button
          className="btn btn-success btn-lg"
          disabled={isBusy || !canFinalize}
          onClick={() => void finalizeSetup()}
          type="button"
        >
          {busyAction === 'COMPLETE'
            ? 'Operasyona gecis hazirlaniyor...'
            : 'Kurulumu Tamamla ve Operasyona Gec'}
        </button>
      </>
    );
  };

  return (
    <div className="setup-gate">
      <div className="setup-card">
        <div className="setup-header">
          <div>
            <h1>MarketPOS Ilk Kurulum</h1>
            <p>Kurulum bitmeden login ve satis ekranlarina gecis kapatilir.</p>
          </div>
          <button className="btn btn-ghost" type="button" disabled={isBusy} onClick={() => void resetSetup()}>
            Kurulumu Sifirla
          </button>
        </div>

        {setupState && (
          <div className="setup-progress">
            {STEP_ORDER.map((stepId) => {
              const step = setupState.steps.find((row) => row.stepId === stepId);
              return (
                <div
                  key={stepId}
                  className={`setup-pill ${step?.status === 'COMPLETED' ? 'ok' : 'pending'} ${stepId === activeStepId ? 'active' : ''}`}
                >
                  {STEP_SHORT_TITLES[stepId]}
                </div>
              );
            })}
          </div>
        )}

        <h2>{STEP_TITLES[activeStepId]}</h2>
        {error.length > 0 && <div className="setup-note fail">{error}</div>}
        {setupState?.lastResult && (
          <div className={`setup-note ${lastResultTone}`}>
            Son sonuc: {setupState.lastResult.message} ({toDateText(setupState.lastResult.at)})
          </div>
        )}

        {renderStepBody()}
      </div>
    </div>
  );
}
