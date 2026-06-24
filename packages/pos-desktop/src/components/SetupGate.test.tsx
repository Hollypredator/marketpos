// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SetupGate from './SetupGate';
import type {
  ElectronApi,
  SetupState,
  SetupStepId,
  SetupStepUpdatePayload,
} from '../electron-api';

const toastSpies = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}));

vi.mock('../store', () => ({
  useToast: () => toastSpies,
}));

const STEP_ORDER: SetupStepId[] = [
  'INSTALL_PREFS',
  'LICENSE',
  'ACCOUNT',
  'MODE_SELECT',
  'FINALIZE',
];

function installLocalStorageMock() {
  const store = new Map<string, string>();
  const localStorageMock: Storage = {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => {
      if (!store.has(key)) {
        return null;
      }
      return store.get(key) ?? null;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });
}

function createSetupState(
  completedStepIds: SetupStepId[],
  details: Partial<Record<SetupStepId, string | null>> = {},
): SetupState {
  const now = '2026-04-03T09:00:00.000Z';
  const completed = new Set(completedStepIds);

  return {
    completedAt: null,
    lastResult: null,
    offlineReadinessPassed: false,
    setupMetrics: {
      durationMin: null,
      firstSaleAt: null,
      operatorInterventionCount: 0,
      setupStartAt: now,
    },
    setupVersion: 2,
    steps: STEP_ORDER.map((stepId) => ({
      completedAt: completed.has(stepId) ? now : null,
      detail: details[stepId] ?? null,
      status: completed.has(stepId) ? 'COMPLETED' : 'PENDING',
      stepId,
    })),
  };
}

function installElectronApi(initialState: SetupState): Pick<
  ElectronApi,
  | 'completeSetup'
  | 'getHardwareConfig'
  | 'getRuntimeInfo'
  | 'getSetupState'
  | 'resetSetup'
  | 'testHardwareDrawer'
  | 'testHardwarePrint'
  | 'updateSetupStep'
> {
  let state = structuredClone(initialState);

  const api = {
    completeSetup: vi.fn(async () => state),
    getHardwareConfig: vi.fn(async () => ({
      connectionMode: 'LAN' as const,
      copyCount: 1,
      drawerPulse: { off: 120, on: 50 },
      port: 9100,
      target: '127.0.0.1',
      timeout: 3000,
    })),
    getRuntimeInfo: vi.fn(async () => ({
      apiBaseUrl: 'http://localhost:3001',
      databasePath: 'C:/tmp/marketpos.db.sqlite',
      isPackaged: false,
      lastSyncedAt: null,
      lastSyncStatus: 'IDLE' as const,
      offlineReadinessPassed: false,
      pendingCount: 0,
      platform: 'win32',
      setupMetrics: {
        durationMin: null,
        firstSaleAt: null,
        operatorInterventionCount: 0,
        setupStartAt: '2026-04-03T09:00:00.000Z',
      },
      userDataPath: 'C:/Users/test/AppData/Roaming/MarketPOS',
      version: '1.0.0-test',
    })),
    getSetupState: vi.fn(async () => state),
    resetSetup: vi.fn(async () => state),
    testHardwareDrawer: vi.fn(async () => ({
      message: 'Cekmece testi basarili.',
      openedAt: '2026-04-03T10:01:00.000Z',
      operatorAction: 'NONE' as const,
      success: true,
    })),
    testHardwarePrint: vi.fn(async () => ({
      message: 'Yazici testi basarili.',
      operatorAction: 'NONE' as const,
      printedAt: '2026-04-03T10:00:00.000Z',
      success: true,
    })),
    updateSetupStep: vi.fn(async (payload: SetupStepUpdatePayload) => {
      const now = '2026-04-03T10:00:00.000Z';
      state = {
        ...state,
        steps: state.steps.map((step) =>
          step.stepId === payload.stepId
            ? {
                ...step,
                completedAt: payload.status === 'COMPLETED' ? now : null,
                detail:
                  typeof payload.detail === 'string'
                    ? payload.detail
                    : payload.detail === null
                      ? null
                      : step.detail,
                status: payload.status,
              }
            : step,
        ),
      };
      return state;
    }),
  };

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: api,
    writable: true,
  });

  return api;
}

function getFieldElement<TElement extends HTMLElement>(
  labelText: string,
  selector: string,
): TElement {
  const label = screen.getByText(labelText);
  const container = label.closest('.login-field');
  if (!container) {
    throw new Error(`Field container not found for ${labelText}`);
  }
  const element = container.querySelector(selector);
  if (!element) {
    throw new Error(`Field element not found for ${labelText}`);
  }
  return element as TElement;
}

describe('SetupGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installLocalStorageMock();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('requires license acceptance before moving past LICENSE step', async () => {
    const api = installElectronApi(createSetupState(['INSTALL_PREFS']));
    const user = userEvent.setup();

    render(
      <SetupGate
        onCompleted={async () => {
          return;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Adim 2/5 - Lisans Sozlesmesi' });
    const nextButton = screen.getByRole('button', { name: 'Ileri' }) as HTMLButtonElement;
    expect(nextButton.disabled).toBe(true);

    await user.click(screen.getByRole('radio', { name: /Kabul Ediyorum/i }));
    expect((screen.getByRole('button', { name: 'Ileri' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    await user.click(screen.getByRole('button', { name: 'Ileri' }));

    await waitFor(() => {
      expect(api.updateSetupStep).toHaveBeenCalledWith({
        detail: 'accepted=true',
        status: 'COMPLETED',
        stepId: 'LICENSE',
      });
    });
  });

  it('blocks ACCOUNT step when activation code is empty', async () => {
    const api = installElectronApi(
      createSetupState(['INSTALL_PREFS', 'LICENSE'], {
        LICENSE: 'accepted=true',
      }),
    );
    const user = userEvent.setup();

    render(
      <SetupGate
        onCompleted={async () => {
          return;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Adim 3/5 - Hesap Olusturma' });

    await user.type(getFieldElement<HTMLInputElement>('Sube Adi', 'input'), 'Merkez Sube');
    await user.type(getFieldElement<HTMLInputElement>('Kasa Adi', 'input'), 'Kasa 1');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Kullanici Adi', 'input'), 'admin');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Sifresi', 'input'), 'admin123');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Ad Soyad', 'input'), 'Yonetici');
    await user.type(
      getFieldElement<HTMLInputElement>('Yönetici E-posta', 'input'),
      'admin@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Aktive Et' }));

    expect(screen.getByText('Lisans Anahtarı bos bırakılamaz.')).toBeTruthy();
    expect(api.updateSetupStep).toHaveBeenCalledTimes(0);
  });

  it('blocks ACCOUNT step when email format is invalid', async () => {
    const api = installElectronApi(
      createSetupState(['INSTALL_PREFS', 'LICENSE'], {
        LICENSE: 'accepted=true',
      }),
    );
    const user = userEvent.setup();

    render(
      <SetupGate
        onCompleted={async () => {
          return;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Adim 3/5 - Hesap Olusturma' });

    await user.type(getFieldElement<HTMLInputElement>('Lisans Anahtari', 'input'), 'TEST-DEMO-001');
    await user.type(getFieldElement<HTMLInputElement>('Sube Adi', 'input'), 'Merkez Sube');
    await user.type(getFieldElement<HTMLInputElement>('Kasa Adi', 'input'), 'Kasa 1');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Kullanici Adi', 'input'), 'admin');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Sifresi', 'input'), 'admin123');
    await user.type(getFieldElement<HTMLInputElement>('Yönetici Ad Soyad', 'input'), 'Yonetici');
    await user.type(
      getFieldElement<HTMLInputElement>('Yönetici E-posta', 'input'),
      'invalid-email',
    );
    await user.click(screen.getByRole('button', { name: 'Aktive Et' }));

    expect(screen.getByText('Gecerli bir yönetici mail adresi girin.')).toBeTruthy();
    expect(api.updateSetupStep).toHaveBeenCalledTimes(0);
  });

  it('loads MODE_SELECT default from local settings and persists selected mode', async () => {
    window.localStorage.setItem('marketpos.setup.mode', 'DEMO');
    const api = installElectronApi(
      createSetupState(['INSTALL_PREFS', 'LICENSE', 'ACCOUNT'], {
        ACCOUNT: JSON.stringify({
          activationCode: '',
          businessName: 'Ornek Market',
          email: 'admin@example.com',
          sector: 'Market/Bufe/Bakkal/Tekel',
        }),
        LICENSE: 'accepted=true',
      }),
    );
    const user = userEvent.setup();

    render(
      <SetupGate
        onCompleted={async () => {
          return;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Adim 4/5 - Demo / Canli Baslangic' });
    const demoRadio = screen.getByRole('radio', {
      name: /Deneme Veri Yukle \(Demo\)/i,
    }) as HTMLInputElement;
    expect(demoRadio.checked).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Ileri' }));

    await waitFor(() => {
      expect(api.updateSetupStep).toHaveBeenCalledWith({
        detail: 'mode=DEMO;label=Demo Veri',
        status: 'COMPLETED',
        stepId: 'MODE_SELECT',
      });
    });
    expect(window.localStorage.getItem('marketpos.setup.mode')).toBe('DEMO');
  });

  it('loads advanced runtime/hardware panel on FINALIZE step', async () => {
    const api = installElectronApi(
      createSetupState(['INSTALL_PREFS', 'LICENSE', 'ACCOUNT', 'MODE_SELECT'], {
        MODE_SELECT: 'mode=LIVE;label=Gercek Veri',
      }),
    );
    const user = userEvent.setup();

    render(
      <SetupGate
        onCompleted={async () => {
          return;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Adim 5/5 - Kurulum Tamamlandi' });

    await user.click(screen.getByText('Gelismis Kurulum (Runtime + Donanim)'));

    await waitFor(() => {
      expect(api.getRuntimeInfo).toHaveBeenCalledTimes(2);
      expect(api.getHardwareConfig).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Runtime')).toBeTruthy();
    expect(screen.getByText('Donanim Profili')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Test Fisi Yazdir' }));
    await waitFor(() => {
      expect(api.testHardwarePrint).toHaveBeenCalledTimes(1);
    });
  });
});
