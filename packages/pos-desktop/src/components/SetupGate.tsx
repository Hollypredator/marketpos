import React, { useEffect, useMemo, useState } from 'react';

import type {
  CashDrawerActionResult,
  HardwareConfig,
  PrinterActionResult,
  RuntimeInfo,
  SetupState,
  SetupStepId,
} from '../electron-api';
import {
  explainHardwareRecoveryPlan,
  explainRuntimeError,
} from '../services/pos-runtime';
import type { AuthSession } from '../services/types';
import { useToast } from '../store';

interface SetupGateProps {
  onCompleted: (args: { session: AuthSession | null; setupState: SetupState }) => Promise<void>;
}

type SetupMode = 'DEMO' | 'LIVE';

interface InstallPreferencesForm {
  architecture: 'x64' | 'x86';
  installDirectory: string;
  language: 'Turkce' | 'English';
}

interface AccountForm {
  activationCode: string;
  registerName: string;
  branchName: string;
  adminUsername: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}

interface OfflineReadinessChecks {
  autoSyncRecovered: boolean;
  offlineQueueVisible: boolean;
  offlineSaleTested: boolean;
}

const STEP_ORDER: SetupStepId[] = [
  'INSTALL_PREFS',
  'LICENSE',
  'ACCOUNT',
  'MODE_SELECT',
  'FINALIZE',
];

const STEP_SHORT_TITLES: Record<SetupStepId, string> = {
  ACCOUNT: 'Hesap',
  FINALIZE: 'Tamamla',
  INSTALL_PREFS: 'Kurulum Ayarlari',
  LICENSE: 'Lisans',
  MODE_SELECT: 'Demo / Canli',
};

const STEP_TITLES: Record<SetupStepId, string> = {
  ACCOUNT: 'Adim 3/5 - Hesap Olusturma',
  FINALIZE: 'Adim 5/5 - Kurulum Tamamlandi',
  INSTALL_PREFS: 'Adim 1/5 - Kurulum Ayarlari',
  LICENSE: 'Adim 2/5 - Lisans Sozlesmesi',
  MODE_SELECT: 'Adim 4/5 - Demo / Canli Baslangic',
};

const DEFAULT_INSTALL_PREFS: InstallPreferencesForm = {
  architecture: 'x64',
  installDirectory: 'C:/Program Files/Bilge/BakkalDefteri/ERP2.0/',
  language: 'Turkce',
};

const DEFAULT_ACCOUNT_FORM: AccountForm = {
  activationCode: '',
  registerName: 'Kasa 1',
  branchName: 'Merkez Sube',
  adminUsername: 'admin',
  adminFullName: 'Yonetici',
  adminEmail: '',
  adminPassword: '',
};

const SETUP_MODE_LOCAL_STORAGE_KEY = 'marketpos.setup.mode';

const SECTOR_OPTIONS = [
  'Market/Bufe/Bakkal/Tekel',
  'Kuruyemis',
  'Kasap',
  'Aktar',
  'Manav',
  'Kirtasiye',
  'Elektronik',
  'Petshop',
  'Restoran',
  'Kuafor',
  'Cafe',
  'Pide/Firin',
] as const;

function getFirstPendingStepId(setupState: SetupState): SetupStepId {
  const found = setupState.steps.find((step) => step.status !== 'COMPLETED');
  return found?.stepId ?? 'FINALIZE';
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function parseInstallPrefsDetail(detail: string | null | undefined): InstallPreferencesForm {
  if (!detail) {
    return { ...DEFAULT_INSTALL_PREFS };
  }

  try {
    const parsed = JSON.parse(detail) as Partial<InstallPreferencesForm>;
    return {
      architecture: parsed.architecture === 'x86' ? 'x86' : 'x64',
      installDirectory:
        typeof parsed.installDirectory === 'string' && parsed.installDirectory.trim().length > 0
          ? parsed.installDirectory.trim()
          : DEFAULT_INSTALL_PREFS.installDirectory,
      language: parsed.language === 'English' ? 'English' : 'Turkce',
    };
  } catch {
    return { ...DEFAULT_INSTALL_PREFS };
  }
}

function parseAccountDetail(detail: string | null | undefined): AccountForm {
  if (!detail) {
    return { ...DEFAULT_ACCOUNT_FORM };
  }

  try {
    const parsed = JSON.parse(detail) as Partial<AccountForm>;
    return {
      activationCode: typeof parsed.activationCode === 'string' ? parsed.activationCode : '',
      registerName: typeof parsed.registerName === 'string' ? parsed.registerName : 'Kasa 1',
      branchName: typeof parsed.branchName === 'string' ? parsed.branchName : 'Merkez Sube',
      adminUsername: typeof parsed.adminUsername === 'string' ? parsed.adminUsername : 'admin',
      adminFullName: typeof parsed.adminFullName === 'string' ? parsed.adminFullName : 'Yonetici',
      adminEmail: typeof parsed.adminEmail === 'string' ? parsed.adminEmail : '',
      adminPassword: typeof parsed.adminPassword === 'string' ? parsed.adminPassword : '',
    };
  } catch {
    return { ...DEFAULT_ACCOUNT_FORM };
  }
}

function parseModeDetail(detail: string | null | undefined): SetupMode {
  if (!detail) {
    return 'LIVE';
  }
  if (detail.includes('mode=DEMO')) {
    return 'DEMO';
  }
  return 'LIVE';
}

function readSetupModeFromLocalSettings(): SetupMode | null {
  try {
    const stored = window.localStorage.getItem(SETUP_MODE_LOCAL_STORAGE_KEY);
    if (stored === 'DEMO' || stored === 'LIVE') {
      return stored;
    }
  } catch {
    return null;
  }
  return null;
}

function writeSetupModeToLocalSettings(mode: SetupMode): void {
  try {
    window.localStorage.setItem(SETUP_MODE_LOCAL_STORAGE_KEY, mode);
  } catch {
    // Local storage write failures should not block setup progress.
  }
}

export default function SetupGate({ onCompleted }: SetupGateProps) {
  const toast = useToast();
  const [busyAction, setBusyAction] = useState<
    | null
    | 'COMPLETE'
    | 'LOAD'
    | 'LOAD_ADVANCED'
    | 'RESET'
    | 'SAVE'
    | 'TEST_DRAWER'
    | 'TEST_PRINT'
  >(null);
  const [error, setError] = useState('');
  const [setupState, setSetupState] = useState<SetupState | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedError, setAdvancedError] = useState('');
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeInfo | null>(null);
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig | null>(null);
  const [printResult, setPrintResult] = useState<PrinterActionResult | null>(null);
  const [drawerResult, setDrawerResult] = useState<CashDrawerActionResult | null>(null);

  const [installPrefs, setInstallPrefs] = useState<InstallPreferencesForm>({
    ...DEFAULT_INSTALL_PREFS,
  });
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>({ ...DEFAULT_ACCOUNT_FORM });
  const [setupMode, setSetupMode] = useState<SetupMode>('LIVE');
  const [offlineReadinessChecks, setOfflineReadinessChecks] = useState<OfflineReadinessChecks>({
    autoSyncRecovered: false,
    offlineQueueVisible: false,
    offlineSaleTested: false,
  });

  const activeStepId = useMemo(() => {
    if (!setupState) {
      return 'INSTALL_PREFS';
    }
    return getFirstPendingStepId(setupState);
  }, [setupState]);

  const completedStepCount = useMemo(() => {
    if (!setupState) {
      return 0;
    }
    return setupState.steps.filter((step) => step.status === 'COMPLETED').length;
  }, [setupState]);

  const canFinalize = useMemo(() => {
    if (!setupState) {
      return false;
    }
    return setupState.steps
      .filter((step) => step.stepId !== 'FINALIZE')
      .every((step) => step.status === 'COMPLETED');
  }, [setupState]);

  const isBusy = busyAction !== null;

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

  const hydrateWizardInputs = (state: SetupState): void => {
    const installDetail = state.steps.find((step) => step.stepId === 'INSTALL_PREFS')?.detail;
    const licenseDetail = state.steps.find((step) => step.stepId === 'LICENSE')?.detail;
    const accountDetail = state.steps.find((step) => step.stepId === 'ACCOUNT')?.detail;
    const modeDetail = state.steps.find((step) => step.stepId === 'MODE_SELECT')?.detail;

    setInstallPrefs(parseInstallPrefsDetail(installDetail));
    setLicenseAccepted(Boolean(licenseDetail?.includes('accepted=true')));
    setAccountForm(parseAccountDetail(accountDetail));
    if (typeof modeDetail === 'string') {
      setSetupMode(parseModeDetail(modeDetail));
    } else {
      setSetupMode(readSetupModeFromLocalSettings() ?? 'LIVE');
    }
    if (!state.offlineReadinessPassed) {
      setOfflineReadinessChecks({
        autoSyncRecovered: false,
        offlineQueueVisible: false,
        offlineSaleTested: false,
      });
    }
  };

  const registerOperatorIntervention = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    try {
      await window.electronAPI.incrementSetupOperatorIntervention();
    } catch {
      // Intervention telemetry should not block setup flow.
    }
  };

  const setSetupError = (message: string): void => {
    setError(message);
    void registerOperatorIntervention();
  };

  const loadSetupState = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }

    setBusyAction('LOAD');
    setError('');
    try {
      const [nextSetupState, nextRuntimeInfo] = await Promise.all([
        window.electronAPI.getSetupState(),
        window.electronAPI.getRuntimeInfo(),
      ]);
      hydrateWizardInputs(nextSetupState);
      setSetupState(nextSetupState);
      setRuntimeInfo(nextRuntimeInfo);
    } catch (caughtError: unknown) {
      setError(explainRuntimeError(caughtError));
    } finally {
      setBusyAction(null);
    }
  };

  useEffect(() => {
    void loadSetupState();
  }, []);

  const loadAdvancedSetup = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }

    setBusyAction('LOAD_ADVANCED');
    setAdvancedError('');
    try {
      const [nextRuntimeInfo, nextHardwareConfig] = await Promise.all([
        window.electronAPI.getRuntimeInfo(),
        window.electronAPI.getHardwareConfig(),
      ]);
      setRuntimeInfo(nextRuntimeInfo);
      setHardwareConfig(nextHardwareConfig);
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setAdvancedError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const runPrintTest = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setBusyAction('TEST_PRINT');
    setAdvancedError('');
    try {
      const result = await window.electronAPI.testHardwarePrint();
      setPrintResult(result);
      if (!result.success) {
        const detail = explainHardwareRecoveryPlan(result);
        if (detail.length > 0) {
          setAdvancedError(detail);
        }
        toast.error(result.message);
      } else {
        toast.success(result.message);
      }
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setAdvancedError(message);
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
    setAdvancedError('');
    try {
      const result = await window.electronAPI.testHardwareDrawer();
      setDrawerResult(result);
      if (!result.success) {
        toast.error(result.message);
      } else {
        toast.success(result.message);
      }
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setAdvancedError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

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

  const saveInstallPrefs = async (): Promise<void> => {
    if (installPrefs.installDirectory.trim().length < 3) {
      setSetupError('Yuklenecek klasor alani bos birakilamaz.');
      return;
    }
    setBusyAction('SAVE');
    setError('');
    try {
      await markStep('INSTALL_PREFS', JSON.stringify(installPrefs));
      toast.success('Kurulum ayarlari kaydedildi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const saveLicense = async (): Promise<void> => {
    if (!licenseAccepted) {
      setSetupError('Lisans onayi olmadan kuruluma devam edilemez.');
      return;
    }
    setBusyAction('SAVE');
    setError('');
    try {
      await markStep('LICENSE', 'accepted=true');
      toast.success('Lisans onayi kaydedildi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const saveAccount = async (): Promise<void> => {
    if (accountForm.activationCode.trim().length === 0) {
      setSetupError('Lisans Anahtarı bos bırakılamaz.');
      return;
    }
    if (accountForm.registerName.trim().length === 0) {
      setSetupError('Kasa adı en az 1 karakter olmalıdır.');
      return;
    }
    if (accountForm.branchName.trim().length === 0) {
      setSetupError('Sube adı en az 2 karakter olmalıdır.');
      return;
    }
    if (accountForm.adminUsername.trim().length < 3) {
      setSetupError('Yönetici kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (accountForm.adminFullName.trim().length < 3) {
      setSetupError('Yönetici ad soyad en az 3 karakter olmalıdır.');
      return;
    }
    if (!isValidEmail(accountForm.adminEmail)) {
      setSetupError('Gecerli bir yönetici mail adresi girin.');
      return;
    }
    if (accountForm.adminPassword.trim().length < 6) {
      setSetupError('Yönetici şifresi en az 6 karakter olmalıdır.');
      return;
    }

    setBusyAction('SAVE');
    setError('');
    try {
      const apiBaseUrl = runtimeInfo?.apiBaseUrl ?? 'http://localhost:3001';
      const response = await fetch(`${apiBaseUrl}/api/license/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licenseKey: accountForm.activationCode.trim(),
          registerName: accountForm.registerName.trim(),
          branchName: accountForm.branchName.trim(),
          adminUsername: accountForm.adminUsername.trim(),
          adminFullName: accountForm.adminFullName.trim(),
          adminEmail: accountForm.adminEmail.trim(),
          adminPassword: accountForm.adminPassword.trim(),
        }),
      });

      const raw = await response.text();
      if (!response.ok) {
        let errorMsg = 'Aktivasyon basarisiz.';
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.error === 'string') {
            errorMsg = parsed.error;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const envelope = JSON.parse(raw);
      if (!envelope.success || !envelope.data) {
        throw new Error(envelope.error ?? 'Aktivasyon basarisiz.');
      }

      const { accessToken, companyAccess, refreshToken, seedData, user, registerId, sessionId } = envelope.data;

      if (!window.electronAPI) {
        throw new Error('Electron API bulunamadi.');
      }

      // 1. Kriptografik imzalı CompanyAccessSnapshot'ı lokal SQLite veritabanına kaydet
      await window.electronAPI.setCompanyAccessSnapshot(companyAccess);

      // 2. İlk kurulum çevrimdışı seed verilerini lokal SQLite veritabanına kaydet (kategoriler, ürünler, stoklar vb.)
      await window.electronAPI.cacheSyncData(seedData);

      // 3. Oturum ve login bilgilerini lokal cache'e yaz (Böylece anında internet olmadan da login olunabilir!)
      await window.electronAPI.cacheOnlineLogin({
        accessToken,
        companyAccess,
        password: accountForm.adminPassword.trim(),
        refreshToken,
        registerId,
        sessionId,
        user: {
          ...user,
          isActive: true,
        },
      });

      // 4. Setup state'ini ACCOUNT için "COMPLETED" olarak işaretle
      await markStep(
        'ACCOUNT',
        JSON.stringify({
          activationCode: accountForm.activationCode.trim(),
          registerName: accountForm.registerName.trim(),
          branchName: accountForm.branchName.trim(),
          adminUsername: accountForm.adminUsername.trim(),
          adminFullName: accountForm.adminFullName.trim(),
          adminEmail: accountForm.adminEmail.trim(),
        }),
      );

      toast.success('Lisans aktivasyonu basarili ve veriler kuruldu.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const saveMode = async (): Promise<void> => {
    setBusyAction('SAVE');
    setError('');
    try {
      await markStep(
        'MODE_SELECT',
        `mode=${setupMode};label=${setupMode === 'LIVE' ? 'Gercek Veri' : 'Demo Veri'}`,
      );
      writeSetupModeToLocalSettings(setupMode);
      toast.success('Baslangic modu kaydedildi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const saveOfflineReadiness = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    const passed =
      offlineReadinessChecks.offlineSaleTested &&
      offlineReadinessChecks.offlineQueueVisible &&
      offlineReadinessChecks.autoSyncRecovered;
    if (!passed) {
      setSetupError('Offline hazirlik adimlari tamamlanmadan kurulumu bitiremezsiniz.');
      return;
    }
    setBusyAction('SAVE');
    setError('');
    try {
      const nextState = await window.electronAPI.setOfflineReadinessPassed(true);
      setSetupState(nextState);
      toast.success('Offline hazirlik testi kaydedildi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
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
      setSetupError('Tum adimlar tamamlanmadan operasyona gecilemez.');
      return;
    }
    if (!setupState.offlineReadinessPassed) {
      setSetupError('Offline hazirlik testi tamamlanmadan operasyona gecilemez.');
      return;
    }

    setBusyAction('COMPLETE');
    setError('');
    try {
      await markStep('FINALIZE', `mode=${setupMode};ready=true`);
      const nextSetupState = await window.electronAPI.completeSetup(
        setupMode === 'DEMO'
          ? 'Ilk kurulum tamamlandi. Demo modunda baslamaya hazir.'
          : 'Ilk kurulum tamamlandi. Canli operasyona gecise hazir.',
      );
      setSetupState(nextSetupState);
      await onCompleted({ session: null, setupState: nextSetupState });
      toast.success('Kurulum tamamlandi. Giris ekranina geciliyor.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
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
      setInstallPrefs({ ...DEFAULT_INSTALL_PREFS });
      setLicenseAccepted(false);
      setAccountForm({ ...DEFAULT_ACCOUNT_FORM });
      setSetupMode('LIVE');
      writeSetupModeToLocalSettings('LIVE');
      setOfflineReadinessChecks({
        autoSyncRecovered: false,
        offlineQueueVisible: false,
        offlineSaleTested: false,
      });
      setAdvancedOpen(false);
      setAdvancedError('');
      setRuntimeInfo(null);
      setHardwareConfig(null);
      setPrintResult(null);
      setDrawerResult(null);
      toast.info('Kurulum adimlari sifirlandi.');
    } catch (caughtError: unknown) {
      const message = explainRuntimeError(caughtError);
      setSetupError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const renderStepBody = (): React.ReactNode => {
    if (activeStepId === 'INSTALL_PREFS') {
      return (
        <>
          <p className="setup-caption">Programin kurulacagi klasoru, mimariyi ve dili secin.</p>
          <div className="login-field">
            <label>Yuklenecek Klasor</label>
            <input
              className="input"
              disabled={isBusy}
              type="text"
              value={installPrefs.installDirectory}
              onChange={(event) =>
                setInstallPrefs((current) => ({
                  ...current,
                  installDirectory: event.target.value,
                }))
              }
            />
          </div>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Islemci Paketi</label>
              <select
                className="input"
                disabled={isBusy}
                value={installPrefs.architecture}
                onChange={(event) =>
                  setInstallPrefs((current) => ({
                    ...current,
                    architecture: event.target.value === 'x86' ? 'x86' : 'x64',
                  }))
                }
              >
                <option value="x64">x64</option>
                <option value="x86">x86</option>
              </select>
            </div>
            <div className="login-field">
              <label>Dil</label>
              <select
                className="input"
                disabled={isBusy}
                value={installPrefs.language}
                onChange={(event) =>
                  setInstallPrefs((current) => ({
                    ...current,
                    language: event.target.value === 'English' ? 'English' : 'Turkce',
                  }))
                }
              >
                <option value="Turkce">Turkce</option>
                <option value="English">English</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" disabled={isBusy} onClick={() => void saveInstallPrefs()} type="button">
            {busyAction === 'SAVE' ? 'Kaydediliyor...' : 'Ileri'}
          </button>
        </>
      );
    }

    if (activeStepId === 'LICENSE') {
      return (
        <>
          <p className="setup-caption">Lisans kosullarini kabul etmeden devam edemezsiniz.</p>
          <div className="setup-checklist">
            <div className="setup-check">
              <strong>Kabul secimi zorunludur</strong>
              <span>Kabul etmiyorsaniz kurulumu iptal edin.</span>
            </div>
          </div>
          <div className="setup-action-row" style={{ marginBottom: '1rem' }}>
            <label>
              <input checked={licenseAccepted} disabled={isBusy} name="license" onChange={() => setLicenseAccepted(true)} type="radio" />{' '}
              Kabul Ediyorum
            </label>
            <label>
              <input checked={!licenseAccepted} disabled={isBusy} name="license" onChange={() => setLicenseAccepted(false)} type="radio" />{' '}
              Kabul Etmiyorum
            </label>
          </div>
          <button className="btn btn-primary btn-lg" disabled={isBusy || !licenseAccepted} onClick={() => void saveLicense()} type="button">
            {busyAction === 'SAVE' ? 'Kaydediliyor...' : 'Ileri'}
          </button>
        </>
      );
    }

    if (activeStepId === 'ACCOUNT') {
      return (
        <>
          <p className="setup-caption">Lisans anahtarinizi ve yönetici bilgilerinizi girin.</p>
          <div className="login-field">
            <label>Lisans Anahtari</label>
            <input
              className="input"
              disabled={isBusy}
              type="text"
              placeholder="Örn: MP-XXXX-XXXX"
              value={accountForm.activationCode}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, activationCode: event.target.value }))
              }
            />
          </div>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Sube Adi</label>
              <input
                className="input"
                disabled={isBusy}
                type="text"
                placeholder="Örn: Merkez Sube"
                value={accountForm.branchName}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, branchName: event.target.value }))
                }
              />
            </div>
            <div className="login-field">
              <label>Kasa Adi</label>
              <input
                className="input"
                disabled={isBusy}
                type="text"
                placeholder="Örn: Kasa 1"
                value={accountForm.registerName}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, registerName: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Yönetici Kullanici Adi</label>
              <input
                className="input"
                disabled={isBusy}
                type="text"
                placeholder="Örn: admin"
                value={accountForm.adminUsername}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, adminUsername: event.target.value }))
                }
              />
            </div>
            <div className="login-field">
              <label>Yönetici Sifresi</label>
              <input
                className="input"
                disabled={isBusy}
                type="password"
                placeholder="En az 6 karakter"
                value={accountForm.adminPassword}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, adminPassword: event.target.value }))
                }
              />
            </div>
          </div>
          <div className="modal-grid-two">
            <div className="login-field">
              <label>Yönetici Ad Soyad</label>
              <input
                className="input"
                disabled={isBusy}
                type="text"
                placeholder="Örn: Ahmet Yilmaz"
                value={accountForm.adminFullName}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, adminFullName: event.target.value }))
                }
              />
            </div>
            <div className="login-field">
              <label>Yönetici E-posta</label>
              <input
                className="input"
                disabled={isBusy}
                type="email"
                placeholder="Örn: admin@isyeri.com"
                value={accountForm.adminEmail}
                onChange={(event) =>
                  setAccountForm((current) => ({ ...current, adminEmail: event.target.value }))
                }
              />
            </div>
          </div>
          <button className="btn btn-primary btn-lg" disabled={isBusy} onClick={() => void saveAccount()} type="button">
            {busyAction === 'SAVE' ? 'Aktive ediliyor...' : 'Aktive Et'}
          </button>
        </>
      );
    }

    if (activeStepId === 'MODE_SELECT') {
      return (
        <>
          <p className="setup-caption">Demo veya canli baslangic modunu secin.</p>
          <div className="setup-checklist">
            <label className="setup-check">
              <strong>Hemen Basla (Gercek Veri Yukle)</strong>
              <input checked={setupMode === 'LIVE'} disabled={isBusy} name="mode" onChange={() => setSetupMode('LIVE')} type="radio" />
            </label>
            <label className="setup-check">
              <strong>Deneme Veri Yukle (Demo)</strong>
              <input checked={setupMode === 'DEMO'} disabled={isBusy} name="mode" onChange={() => setSetupMode('DEMO')} type="radio" />
            </label>
          </div>
          <button className="btn btn-primary btn-lg" disabled={isBusy} onClick={() => void saveMode()} type="button">
            {busyAction === 'SAVE' ? 'Kaydediliyor...' : 'Ileri'}
          </button>
        </>
      );
    }

    return (
      <>
        <p className="setup-caption">Kurulum ozetini kontrol edin ve Baslat ile tamamlayin.</p>
        <div className="setup-checklist">
          {setupState?.steps.map((step) => (
            <div key={step.stepId} className={`setup-check ${step.status === 'COMPLETED' ? 'ok' : 'fail'}`}>
              <strong>{STEP_SHORT_TITLES[step.stepId]}</strong>
              <span>{step.status} | {toDateText(step.completedAt)}</span>
            </div>
          ))}
        </div>
        <div className="setup-checklist">
          <div className="setup-check">
            <strong>Offline Hazirlik Smoke</strong>
            <label>
              <input
                checked={offlineReadinessChecks.offlineSaleTested}
                disabled={isBusy || setupState?.offlineReadinessPassed === true}
                onChange={(event) =>
                  setOfflineReadinessChecks((current) => ({
                    ...current,
                    offlineSaleTested: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              Internet kesik test satisi denendi
            </label>
            <label>
              <input
                checked={offlineReadinessChecks.offlineQueueVisible}
                disabled={isBusy || setupState?.offlineReadinessPassed === true}
                onChange={(event) =>
                  setOfflineReadinessChecks((current) => ({
                    ...current,
                    offlineQueueVisible: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              Kuyruk gorunurlugu kontrol edildi
            </label>
            <label>
              <input
                checked={offlineReadinessChecks.autoSyncRecovered}
                disabled={isBusy || setupState?.offlineReadinessPassed === true}
                onChange={(event) =>
                  setOfflineReadinessChecks((current) => ({
                    ...current,
                    autoSyncRecovered: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              Internet geri gelince otomatik sync dogrulandi
            </label>
            <span>
              Durum:{' '}
              {setupState?.offlineReadinessPassed
                ? 'GECTI'
                : 'BEKLIYOR'}
            </span>
            <button
              className="btn btn-ghost"
              disabled={isBusy || setupState?.offlineReadinessPassed === true}
              onClick={() => void saveOfflineReadiness()}
              type="button"
            >
              Offline Hazirlik Testini Kaydet
            </button>
          </div>
        </div>
        <div className="setup-note ok">
          Kurulum suresi: {setupState?.setupMetrics.durationMin ?? '-'} dk | Ilk satis:{' '}
          {toDateText(setupState?.setupMetrics.firstSaleAt)} | Operator mudahalesi:{' '}
          {setupState?.setupMetrics.operatorInterventionCount ?? 0}
        </div>
        <details
          className="setup-advanced"
          open={advancedOpen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setAdvancedOpen(open);
            if (open && (!runtimeInfo || !hardwareConfig)) {
              void loadAdvancedSetup();
            }
          }}
        >
          <summary>Gelismis Kurulum (Runtime + Donanim)</summary>
          <p className="setup-caption">
            Bu panel opsiyoneldir. Final adimini bloke etmeden runtime bilgilerini ve
            donanim testlerini tek yerde toplar.
          </p>
          <div className="setup-action-row">
            <button
              className="btn btn-ghost"
              disabled={isBusy}
              onClick={() => void loadAdvancedSetup()}
              type="button"
            >
              {busyAction === 'LOAD_ADVANCED' ? 'Yukleniyor...' : 'Runtime ve Donanimi Yenile'}
            </button>
            <button
              className="btn btn-ghost"
              disabled={isBusy}
              onClick={() => void runPrintTest()}
              type="button"
            >
              {busyAction === 'TEST_PRINT' ? 'Yazdiriliyor...' : 'Test Fisi Yazdir'}
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
          {advancedError.length > 0 && <div className="setup-note warn">{advancedError}</div>}
          {runtimeInfo && (
            <div className="setup-checklist">
              <div className="setup-check">
                <strong>Runtime</strong>
                <span>Surum: {runtimeInfo.version}</span>
                <span>Platform: {runtimeInfo.platform}</span>
                <span>Paket: {runtimeInfo.isPackaged ? 'Evet' : 'Hayir'}</span>
                <span>API: {runtimeInfo.apiBaseUrl}</span>
                <span>DB: {runtimeInfo.databasePath}</span>
              </div>
            </div>
          )}
          {hardwareConfig && (
            <div className="setup-checklist">
              <div className="setup-check">
                <strong>Donanim Profili</strong>
                <span>Baglanti: {hardwareConfig.connectionMode}</span>
                <span>Hedef: {hardwareConfig.target}</span>
                <span>Port: {hardwareConfig.port}</span>
                <span>Timeout: {hardwareConfig.timeout}ms</span>
                <span>Kopya: {hardwareConfig.copyCount}</span>
                <span>Pulse: on={hardwareConfig.drawerPulse.on} off={hardwareConfig.drawerPulse.off}</span>
              </div>
            </div>
          )}
          {(printResult || drawerResult) && (
            <div className="setup-checklist">
              {printResult && (
                <div className={`setup-check ${printResult.success ? 'ok' : 'fail'}`}>
                  <strong>Yazici Testi</strong>
                  <span>{printResult.message}</span>
                </div>
              )}
              {drawerResult && (
                <div className={`setup-check ${drawerResult.success ? 'ok' : 'fail'}`}>
                  <strong>Cekmece Testi</strong>
                  <span>{drawerResult.message}</span>
                </div>
              )}
            </div>
          )}
        </details>
        <div className="setup-note ok">Toplam ilerleme: {completedStepCount}/{STEP_ORDER.length}</div>
        <button className="btn btn-success btn-lg" disabled={isBusy || !canFinalize} onClick={() => void finalizeSetup()} type="button">
          {busyAction === 'COMPLETE' ? 'Hazirlaniyor...' : 'Baslat'}
        </button>
      </>
    );
  };

  return (
    <div className="setup-gate">
      <div className="setup-card">
        <div className="setup-header">
          <div>
            <h1>Bakkal Defteri Kurulum</h1>
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
                <div key={stepId} className={`setup-pill ${step?.status === 'COMPLETED' ? 'ok' : 'pending'} ${stepId === activeStepId ? 'active' : ''}`}>
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
