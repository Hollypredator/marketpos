import React, { useMemo, useState } from 'react';

import { explainHardwareRecoveryPlan } from '../services/pos-runtime';
import {
  loadDiscountPolicy,
  readDiscountPolicy,
  saveDiscountPolicyForCompany,
  type DiscountPolicy,
} from '../services/discount-policy';
import {
  applyHardwareProfile,
  listHardwareProfiles,
  type HardwareProfileId,
} from '../services/hardware-profile';
import type { HardwareConfig, TouchDensity, UiPreset } from '../services/types';
import {
  getUiPresetDefinition,
  listUiPresetDefinitions,
  resolveTouchDensityByViewport,
} from '../services/ui-preset';
import {
  readIntegrationSettings,
  saveIntegrationSettings,
  type IntegrationSettings,
} from '../services/integration-settings';
import { useToast } from '../store';

interface PresetSettingsModalProps {
  companyId?: string | null;
  currentPreset: UiPreset;
  onClose: () => void;
  onSaved: (payload: { touchDensity: TouchDensity; uiPreset: UiPreset }) => void;
}

type UnlockStep = 'SETTINGS' | 'VERIFY';
type SettingsTab = 'HARDWARE' | 'PRESET' | 'SALES' | 'INTEGRATIONS';

export default function PresetSettingsModal({
  companyId,
  currentPreset,
  onClose,
  onSaved,
}: PresetSettingsModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('PRESET');
  const [error, setError] = useState('');
  const [hardwareConfig, setHardwareConfig] = useState<HardwareConfig | null>(null);
  const [hardwareMessage, setHardwareMessage] = useState('');
  const [hardwareTask, setHardwareTask] = useState<null | 'DRAWER' | 'LOAD' | 'REPRINT' | 'SAVE' | 'TEST_PRINT'>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [salesPolicy, setSalesPolicy] = useState<DiscountPolicy>(() => readDiscountPolicy(companyId));
  const [salesPolicyDraft, setSalesPolicyDraft] = useState<{
    maxCart: string;
    maxCartAmount: string;
    maxItem: string;
    maxItemAmount: string;
  }>(() => {
    const policy = readDiscountPolicy(companyId);
    return {
      maxCartAmount: String(policy.maxCartDiscountAmount),
      maxCart: String(policy.maxCartDiscountPercent),
      maxItemAmount: String(policy.maxItemDiscountAmount),
      maxItem: String(policy.maxItemDiscountPercent),
    };
  });
  const [selectedPreset, setSelectedPreset] = useState<UiPreset>(currentPreset);
  const [selectedHardwareProfile, setSelectedHardwareProfile] =
    useState<HardwareProfileId>('LAN_FAST');
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(() => readIntegrationSettings());
  const [step, setStep] = useState<UnlockStep>('VERIFY');
  const [username, setUsername] = useState('admin');

  const selectedDefinition = useMemo(
    () => getUiPresetDefinition(selectedPreset),
    [selectedPreset],
  );
  const hardwareProfiles = useMemo(() => listHardwareProfiles(), []);

  const isBusy = isSubmitting || hardwareTask !== null;
  const isHardwareBusy = hardwareTask !== null;

  const updateHardwareConfig = (
    mutator: (current: HardwareConfig) => HardwareConfig,
  ): void => {
    setHardwareConfig((current) => (current ? mutator(current) : current));
  };

  const openSettingsStep = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }

    setStep('SETTINGS');
    setActiveTab('PRESET');
    setHardwareTask('LOAD');
    setHardwareMessage('');
    try {
      const config = await window.electronAPI.getHardwareConfig();
      const discountPolicy = await loadDiscountPolicy(companyId);
      setHardwareConfig(config);
      setSalesPolicy(discountPolicy);
      const integrations = readIntegrationSettings();
      setIntegrationSettings(integrations);
      setSalesPolicyDraft({
        maxCartAmount: String(discountPolicy.maxCartDiscountAmount),
        maxCart: String(discountPolicy.maxCartDiscountPercent),
        maxItemAmount: String(discountPolicy.maxItemDiscountAmount),
        maxItem: String(discountPolicy.maxItemDiscountPercent),
      });
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Donanim ayarlari yuklenemedi.',
      );
    } finally {
      setHardwareTask(null);
    }
  };

  const verifyWithPassword = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }
    if (password.trim().length < 4) {
      setError('Yonetici sifresi girilmelidir.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const result = await window.electronAPI.verifyManagerUnlock({
        companyId: companyId ?? undefined,
        password: password.trim(),
        username: username.trim() || undefined,
      });
      await openSettingsStep();
      toast.success(`Yonetici dogrulandi: ${result.user.fullName}`);
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Yonetici sifre dogrulamasi basarisiz.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const savePreset = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const touchDensity = resolveTouchDensityByViewport(
        window.innerWidth,
        window.innerHeight,
      );
      await window.electronAPI.setUiPreset({
        touchDensity,
        uiPreset: selectedPreset,
      });
      onSaved({ touchDensity, uiPreset: selectedPreset });
      toast.success(`Arayuz preset guncellendi: ${selectedDefinition.label}`);
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Preset kayit hatasi.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const readHardwareMessage = (
    result: {
      errorCode?: string;
      message: string;
      operatorAction: string;
      success: boolean;
    },
  ): string => {
    if (result.success) {
      return result.message;
    }
    const hint = explainHardwareRecoveryPlan({
      errorCode: result.errorCode as 'NO_LAST_RECEIPT' | 'NO_RECEIPT_CONTENT' | 'PRINTER_NOT_CONNECTED' | 'PRINT_FAILED' | 'UNKNOWN' | undefined,
      message: result.message,
      operatorAction: result.operatorAction as 'CHECK_HARDWARE_SETTINGS' | 'CHECK_PRINTER_CONNECTION' | 'NONE' | 'RETRY_PRINT',
    });
    return hint.length > 0 ? `${result.message} ${hint}` : result.message;
  };

  const saveHardwareConfig = async (): Promise<void> => {
    if (!window.electronAPI || !hardwareConfig) {
      return;
    }
    setHardwareTask('SAVE');
    setError('');
    try {
      await window.electronAPI.setHardwareConfig(hardwareConfig);
      setHardwareMessage('Donanim ayarlari kaydedildi.');
      toast.success('Donanim ayarlari kaydedildi.');
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Donanim kayit hatasi.';
      setError(message);
    } finally {
      setHardwareTask(null);
    }
  };

  const runTestPrint = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setHardwareTask('TEST_PRINT');
    setError('');
    try {
      const result = await window.electronAPI.testHardwarePrint();
      const message = readHardwareMessage(result);
      setHardwareMessage(message);
      if (result.success) {
        toast.success('Yazici test fisini gonderdi.');
      } else {
        toast.error(message);
      }
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Yazici testi basarisiz.',
      );
    } finally {
      setHardwareTask(null);
    }
  };

  const runTestDrawer = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setHardwareTask('DRAWER');
    setError('');
    try {
      const result = await window.electronAPI.testHardwareDrawer();
      const message = readHardwareMessage(result);
      setHardwareMessage(message);
      if (result.success) {
        toast.success('Cekmece test komutu gonderildi.');
      } else {
        toast.error(message);
      }
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Cekmece testi basarisiz.',
      );
    } finally {
      setHardwareTask(null);
    }
  };

  const runReprintLastReceipt = async (): Promise<void> => {
    if (!window.electronAPI) {
      return;
    }
    setHardwareTask('REPRINT');
    setError('');
    try {
      const result = await window.electronAPI.reprintLastReceipt();
      const message = readHardwareMessage(result);
      setHardwareMessage(message);
      if (result.success) {
        toast.success('Son fis tekrar yazdirildi.');
      } else {
        toast.error(message);
      }
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Son fis yeniden yazdirilamadi.',
      );
    } finally {
      setHardwareTask(null);
    }
  };

  const saveSalesPolicyRules = async (): Promise<void> => {
    const maxItem = Number.parseFloat(salesPolicyDraft.maxItem);
    const maxCart = Number.parseFloat(salesPolicyDraft.maxCart);
    const maxItemAmount = Number.parseFloat(salesPolicyDraft.maxItemAmount);
    const maxCartAmount = Number.parseFloat(salesPolicyDraft.maxCartAmount);
    if (!Number.isFinite(maxItem) || maxItem < 0 || maxItem > 100) {
      setError('Urun indirim limiti 0 ile 100 arasinda olmalidir.');
      return;
    }
    if (!Number.isFinite(maxCart) || maxCart < 0 || maxCart > 100) {
      setError('Sepet indirim limiti 0 ile 100 arasinda olmalidir.');
      return;
    }
    if (!Number.isFinite(maxItemAmount) || maxItemAmount < 0) {
      setError('Urun sabit indirim limiti sifir veya daha buyuk olmalidir.');
      return;
    }
    if (!Number.isFinite(maxCartAmount) || maxCartAmount < 0) {
      setError('Sepet sabit indirim limiti sifir veya daha buyuk olmalidir.');
      return;
    }
    setError('');
    const saved = await saveDiscountPolicyForCompany({
      maxCartDiscountAmount: maxCartAmount,
      maxCartDiscountPercent: maxCart,
      maxItemDiscountAmount: maxItemAmount,
      maxItemDiscountPercent: maxItem,
    }, companyId);
    setSalesPolicy(saved);
    setSalesPolicyDraft({
      maxCartAmount: String(saved.maxCartDiscountAmount),
      maxCart: String(saved.maxCartDiscountPercent),
      maxItemAmount: String(saved.maxItemDiscountAmount),
      maxItem: String(saved.maxItemDiscountPercent),
    });
    toast.success('Satis indirim kurallari kaydedildi.');
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Yonetici Ayarlari</h2>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            type="button"
            disabled={isBusy}
          >
            Kapat
          </button>
        </div>

        {error.length > 0 && <div className="login-error">{error}</div>}

        {step === 'VERIFY' && (
          <>
            <p className="modal-caption">
              Ayarlara erisim icin yonetici dogrulamasi gerekir.
            </p>
            <div className="login-field">
              <label htmlFor="unlock-username">Yonetici Kullanici Adi</label>
              <input
                id="unlock-username"
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                type="text"
                autoComplete="off"
              />
            </div>
            <div className="login-field">
              <label htmlFor="unlock-password">Yonetici Sifre</label>
              <input
                id="unlock-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="off"
              />
              <button
                className="btn btn-primary btn-block"
                onClick={() => void verifyWithPassword()}
                type="button"
                disabled={isBusy}
              >
                Sifre ile Onayla
              </button>
            </div>
          </>
        )}

        {step === 'SETTINGS' && (
          <>
            <div className="modal-tabs">
              <button
                className={`modal-tab ${activeTab === 'PRESET' ? 'active' : ''}`}
                onClick={() => setActiveTab('PRESET')}
                type="button"
                disabled={isBusy}
              >
                Arayuz Preseti
              </button>
              <button
                className={`modal-tab ${activeTab === 'HARDWARE' ? 'active' : ''}`}
                onClick={() => setActiveTab('HARDWARE')}
                type="button"
                disabled={isBusy}
              >
                Donanim
              </button>
              <button
                className={`modal-tab ${activeTab === 'SALES' ? 'active' : ''}`}
                onClick={() => setActiveTab('SALES')}
                type="button"
                disabled={isBusy}
              >
                Satis Kurallari
              </button>
              <button
                className={`modal-tab ${activeTab === 'INTEGRATIONS' ? 'active' : ''}`}
                onClick={() => setActiveTab('INTEGRATIONS')}
                type="button"
                disabled={isBusy}
              >
                Entegrasyonlar
              </button>
            </div>

            {activeTab === 'PRESET' && (
              <>
                <p className="modal-caption">
                  Tek arayuz korunur; bu ayar sadece hizli erisim duzenini ve vurgu stilini degistirir.
                </p>
                <div className="preset-grid">
                  {listUiPresetDefinitions().map((preset) => (
                    <button
                      key={preset.id}
                      className={`preset-card ${selectedPreset === preset.id ? 'active' : ''}`}
                      style={{ borderColor: selectedPreset === preset.id ? preset.accentColor : undefined }}
                      onClick={() => setSelectedPreset(preset.id)}
                      type="button"
                      disabled={isBusy}
                    >
                      <div className="preset-card-title">{preset.label}</div>
                      <div className="preset-card-desc">{preset.description}</div>
                    </button>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost btn-lg" onClick={onClose} type="button" disabled={isBusy}>
                    Iptal
                  </button>
                  <button className="btn btn-success btn-lg" onClick={() => void savePreset()} type="button" disabled={isBusy}>
                    Preseti Kaydet
                  </button>
                </div>
              </>
            )}

            {activeTab === 'SALES' && (
              <>
                <p className="modal-caption">
                  Urun ve sepet indirimi bu yuzde limitlerine gore sinirlanir. Kasa ekraninda TL veya %
                  girisi desteklenir (ornek: 25 veya 10%).
                </p>
                <div className="modal-grid-two">
                  <div className="login-field">
                    <label>Urun Indirim Limiti (%)</label>
                    <input
                      className="input"
                      max={100}
                      min={0}
                      onChange={(event) =>
                        setSalesPolicyDraft((current) => ({ ...current, maxItem: event.target.value }))
                      }
                      step={1}
                      type="number"
                      value={salesPolicyDraft.maxItem}
                    />
                  </div>
                  <div className="login-field">
                    <label>Urun Sabit Indirim Limiti (TL)</label>
                    <input
                      className="input"
                      min={0}
                      onChange={(event) =>
                        setSalesPolicyDraft((current) => ({ ...current, maxItemAmount: event.target.value }))
                      }
                      step={1}
                      type="number"
                      value={salesPolicyDraft.maxItemAmount}
                    />
                  </div>
                  <div className="login-field">
                    <label>Sepet Indirim Limiti (%)</label>
                    <input
                      className="input"
                      max={100}
                      min={0}
                      onChange={(event) =>
                        setSalesPolicyDraft((current) => ({ ...current, maxCart: event.target.value }))
                      }
                      step={1}
                      type="number"
                      value={salesPolicyDraft.maxCart}
                    />
                  </div>
                  <div className="login-field">
                    <label>Sepet Sabit Indirim Limiti (TL)</label>
                    <input
                      className="input"
                      min={0}
                      onChange={(event) =>
                        setSalesPolicyDraft((current) => ({ ...current, maxCartAmount: event.target.value }))
                      }
                      step={1}
                      type="number"
                      value={salesPolicyDraft.maxCartAmount}
                    />
                  </div>
                </div>
                <p className="modal-caption">
                  Aktif politika: Urun %{salesPolicy.maxItemDiscountPercent} ({salesPolicy.maxItemDiscountAmount.toFixed(0)} TL) / Sepet %{salesPolicy.maxCartDiscountPercent} ({salesPolicy.maxCartDiscountAmount.toFixed(0)} TL)
                </p>
                <div className="modal-actions">
                  <button className="btn btn-ghost btn-lg" onClick={onClose} type="button" disabled={isBusy}>
                    Kapat
                  </button>
                  <button
                    className="btn btn-success btn-lg"
                    onClick={() => void saveSalesPolicyRules()}
                    type="button"
                    disabled={isBusy}
                  >
                    Satis Kurallarini Kaydet
                  </button>
                </div>
              </>
            )}

            {activeTab === 'HARDWARE' && hardwareConfig && (
              <div className="hardware-panel">
                <p className="modal-caption">
                  Baglanti modu, hedef, timeout ve cekmece pulse degerlerini buradan yonetin.
                </p>
                <div className="modal-grid-two">
                  <div className="login-field">
                    <label htmlFor="hardware-profile">Saha Donanim Profili</label>
                    <select
                      id="hardware-profile"
                      className="input"
                      value={selectedHardwareProfile}
                      onChange={(event) =>
                        setSelectedHardwareProfile(event.target.value as HardwareProfileId)
                      }
                      disabled={isBusy}
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
                      onClick={() =>
                        updateHardwareConfig((current) =>
                          applyHardwareProfile(current, selectedHardwareProfile),
                        )
                      }
                      type="button"
                      disabled={isBusy}
                    >
                      Profili Uygula
                    </button>
                  </div>
                </div>
                <p className="modal-caption">
                  {hardwareProfiles.find((profile) => profile.id === selectedHardwareProfile)
                    ?.description ?? ''}
                </p>

                <div className="modal-grid-two">
                  <div className="login-field">
                    <label htmlFor="hardware-mode">Baglanti Modu</label>
                    <select
                      id="hardware-mode"
                      className="input"
                      value={hardwareConfig.connectionMode}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          connectionMode: event.target.value === 'USB' ? 'USB' : 'LAN',
                        }))
                      }
                      disabled={isBusy}
                    >
                      <option value="LAN">LAN (TCP)</option>
                      <option value="USB">USB (Windows Yazici)</option>
                    </select>
                  </div>
                  <div className="login-field">
                    <label htmlFor="hardware-target">
                      {hardwareConfig.connectionMode === 'LAN'
                        ? 'Yazici Host / IP'
                        : 'Windows Yazici Adi'}
                    </label>
                    <input
                      id="hardware-target"
                      className="input"
                      type="text"
                      value={hardwareConfig.target}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          target: event.target.value,
                        }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="modal-grid-two">
                  <div className="login-field">
                    <label htmlFor="hardware-port">Port</label>
                    <input
                      id="hardware-port"
                      className="input"
                      type="number"
                      min={1}
                      max={65535}
                      value={hardwareConfig.port}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          port: Number.parseInt(event.target.value, 10) || current.port,
                        }))
                      }
                      disabled={isBusy || hardwareConfig.connectionMode === 'USB'}
                    />
                  </div>
                  <div className="login-field">
                    <label htmlFor="hardware-timeout">Timeout (ms)</label>
                    <input
                      id="hardware-timeout"
                      className="input"
                      type="number"
                      min={500}
                      max={20000}
                      value={hardwareConfig.timeout}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          timeout: Number.parseInt(event.target.value, 10) || current.timeout,
                        }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="modal-grid-two">
                  <div className="login-field">
                    <label htmlFor="hardware-copy-count">Varsayilan Kopya</label>
                    <input
                      id="hardware-copy-count"
                      className="input"
                      type="number"
                      min={1}
                      max={5}
                      value={hardwareConfig.copyCount}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          copyCount:
                            Number.parseInt(event.target.value, 10) || current.copyCount,
                        }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                  <div className="login-field">
                    <label htmlFor="hardware-pulse-on">Drawer Pulse On</label>
                    <input
                      id="hardware-pulse-on"
                      className="input"
                      type="number"
                      min={0}
                      max={255}
                      value={hardwareConfig.drawerPulse.on}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          drawerPulse: {
                            ...current.drawerPulse,
                            on: Number.parseInt(event.target.value, 10) || current.drawerPulse.on,
                          },
                        }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="modal-grid-two">
                  <div className="login-field">
                    <label htmlFor="hardware-pulse-off">Drawer Pulse Off</label>
                    <input
                      id="hardware-pulse-off"
                      className="input"
                      type="number"
                      min={0}
                      max={255}
                      value={hardwareConfig.drawerPulse.off}
                      onChange={(event) =>
                        updateHardwareConfig((current) => ({
                          ...current,
                          drawerPulse: {
                            ...current.drawerPulse,
                            off:
                              Number.parseInt(event.target.value, 10) || current.drawerPulse.off,
                          },
                        }))
                      }
                      disabled={isBusy}
                    />
                  </div>
                  <div className="login-field">
                    <label>&nbsp;</label>
                    <button
                      className="btn btn-success btn-block"
                      onClick={() => void saveHardwareConfig()}
                      type="button"
                      disabled={isHardwareBusy}
                    >
                      {hardwareTask === 'SAVE' ? 'Kaydediliyor...' : 'Donanimi Kaydet'}
                    </button>
                  </div>
                </div>

                <div className="modal-grid-two">
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={() => void runTestPrint()}
                    type="button"
                    disabled={isHardwareBusy}
                  >
                    {hardwareTask === 'TEST_PRINT' ? 'Calisiyor...' : 'Test Fisi Yazdir'}
                  </button>
                  <button
                    className="btn btn-ghost btn-block"
                    onClick={() => void runTestDrawer()}
                    type="button"
                    disabled={isHardwareBusy}
                  >
                    {hardwareTask === 'DRAWER' ? 'Calisiyor...' : 'Cekmece Testi'}
                  </button>
                </div>

                <button
                  className="btn btn-ghost btn-block"
                  onClick={() => void runReprintLastReceipt()}
                  type="button"
                  disabled={isHardwareBusy}
                >
                  {hardwareTask === 'REPRINT'
                    ? 'Yazdiriliyor...'
                    : 'Son Fisi Yeniden Yazdir'}
                </button>

                {hardwareMessage.length > 0 && (
                  <div className="hardware-status">{hardwareMessage}</div>
                )}
              </div>
            )}

            {activeTab === 'INTEGRATIONS' && (
              <div className="hardware-panel">
                <p className="modal-caption">
                  Zamani geldiginde SMS onayi, e-Fatura veya YN OKC baglantilarini burayi kullanarak aktif edebilirsiniz.
                </p>
                
                <div className="modal-grid-two">
                  <div className="login-field">
                    <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={integrationSettings.isEInvoiceEnabled}
                        onChange={(e) => setIntegrationSettings(prev => ({ ...prev, isEInvoiceEnabled: e.target.checked }))}
                        style={{ width: '20px', height: '20px' }}
                      />
                      <span>e-Fatura / e-Arşiv Entegrasyonu</span>
                    </label>
                  </div>
                  
                  <div className="login-field">
                    <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={integrationSettings.isYNOKCEnabled}
                        onChange={(e) => setIntegrationSettings(prev => ({ ...prev, isYNOKCEnabled: e.target.checked }))}
                        style={{ width: '20px', height: '20px' }}
                      />
                      <span>YN ÖKC (Yazarkasa POS) Donanımı</span>
                    </label>
                  </div>

                  <div className="login-field">
                    <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={integrationSettings.isManagerSMSEnabled}
                        onChange={(e) => setIntegrationSettings(prev => ({ ...prev, isManagerSMSEnabled: e.target.checked }))}
                        style={{ width: '20px', height: '20px' }}
                      />
                      <span>Yönetici SMS Doğrulaması</span>
                    </label>
                  </div>
                </div>

                <div className="modal-actions" style={{ marginTop: '2rem' }}>
                   <button 
                     className="btn btn-success btn-lg btn-block" 
                     onClick={() => {
                        saveIntegrationSettings(integrationSettings);
                        toast.success('Entegrasyon ayarlari kaydedildi.');
                     }} 
                     type="button" 
                     disabled={isBusy}
                   >
                    Entegrasyon Ayarlarini Kaydet
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
