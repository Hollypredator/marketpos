export interface IntegrationSettings {
  isEInvoiceEnabled: boolean;
  isYNOKCEnabled: boolean;
  isManagerSMSEnabled: boolean;
}

const STORAGE_KEY = 'marketpos:integration:settings';

const DEFAULT_SETTINGS: IntegrationSettings = {
  isEInvoiceEnabled: false,
  isYNOKCEnabled: false,
  isManagerSMSEnabled: false,
};

export function readIntegrationSettings(): IntegrationSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw);
    return {
      isEInvoiceEnabled: parsed.isEInvoiceEnabled === true,
      isYNOKCEnabled: parsed.isYNOKCEnabled === true,
      isManagerSMSEnabled: parsed.isManagerSMSEnabled === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveIntegrationSettings(settings: IntegrationSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage failures.
  }
}
