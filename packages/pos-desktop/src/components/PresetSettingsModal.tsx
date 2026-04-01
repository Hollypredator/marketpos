import React, { useMemo, useState } from 'react';

import { explainHardwareRecoveryPlan } from '../services/pos-runtime';
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
import { useToast } from '../store';

interface PresetSettingsModalProps {
  companyId?: string | null;
  currentPreset: UiPreset;
  onClose: () => void;
  onSaved: (payload: { touchDensity: TouchDensity; uiPreset: UiPreset }) => void;
}

type UnlockStep = 'PIN_SETUP' | 'SETTINGS' | 'VERIFY';
type SettingsTab = 'HARDWARE' | 'PRESET';

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
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<UiPreset>(currentPreset);
  const [selectedHardwareProfile, setSelectedHardwareProfile] =
    useState<HardwareProfileId>('LAN_FAST');
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
      setHardwareConfig(config);
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

  const verifyWithPin = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }
    if (!/^\d{4}$/u.test(pin.trim())) {
      setError('Yonetici PIN 4 haneli olmalidir.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      const result = await window.electronAPI.verifyManagerUnlock({
        companyId: companyId ?? undefined,
        pin: pin.trim(),
        username: username.trim() || undefined,
      });
      if (result.requiresPinSetup) {
        setStep('PIN_SETUP');
      } else {
        await openSettingsStep();
        toast.success(`Yonetici dogrulandi: ${result.user.fullName}`);
      }
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Yonetici PIN dogrulamasi basarisiz.',
      );
    } finally {
      setIsSubmitting(false);
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
      if (result.requiresPinSetup) {
        setStep('PIN_SETUP');
        toast.info('Yonetici PIN henuz tanimli degil. Lutfen yeni PIN belirleyin.');
      } else {
        await openSettingsStep();
        toast.success(`Yonetici dogrulandi: ${result.user.fullName}`);
      }
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

  const submitPinSetup = async (): Promise<void> => {
    if (!window.electronAPI) {
      setError('Electron API bulunamadi.');
      return;
    }
    if (!/^\d{4}$/u.test(pin.trim())) {
      setError('PIN 4 haneli olmalidir.');
      return;
    }
    if (pin.trim() !== pinConfirm.trim()) {
      setError('PIN tekrar alani esit degil.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await window.electronAPI.setManagerPin({ pin: pin.trim() });
      toast.success('Yonetici PIN kaydedildi.');
      await openSettingsStep();
    } catch (caughtError: unknown) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'PIN kayit hatasi.',
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
            <div className="modal-grid-two">
              <div className="login-field">
                <label htmlFor="unlock-pin">PIN (4 hane)</label>
                <input
                  id="unlock-pin"
                  className="input"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  maxLength={4}
                  autoComplete="off"
                />
                <button
                  className="btn btn-primary btn-block"
                  onClick={() => void verifyWithPin()}
                  type="button"
                  disabled={isBusy}
                >
                  PIN ile Onayla
                </button>
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
                  className="btn btn-ghost btn-block"
                  onClick={() => void verifyWithPassword()}
                  type="button"
                  disabled={isBusy}
                >
                  Sifre ile Onayla
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'PIN_SETUP' && (
          <>
            <p className="modal-caption">
              Yonetici PIN tanimsiz. Kurulum guvenligi icin yeni PIN belirleyin.
            </p>
            <div className="modal-grid-two">
              <div className="login-field">
                <label htmlFor="new-pin">Yeni PIN</label>
                <input
                  id="new-pin"
                  className="input"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  maxLength={4}
                  autoComplete="off"
                />
              </div>
              <div className="login-field">
                <label htmlFor="new-pin-repeat">PIN Tekrar</label>
                <input
                  id="new-pin-repeat"
                  className="input"
                  value={pinConfirm}
                  onChange={(event) => setPinConfirm(event.target.value)}
                  type="password"
                  maxLength={4}
                  autoComplete="off"
                />
              </div>
            </div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void submitPinSetup()}
              type="button"
              disabled={isBusy}
            >
              PIN Kaydet ve Devam Et
            </button>
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
          </>
        )}
      </div>
    </div>
  );
}
