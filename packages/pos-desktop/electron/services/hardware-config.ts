export type HardwareConnectionMode = 'LAN' | 'USB';

export interface DrawerPulseConfig {
  off: number;
  on: number;
}

export interface HardwareConfig {
  connectionMode: HardwareConnectionMode;
  copyCount: number;
  drawerPulse: DrawerPulseConfig;
  port: number;
  target: string;
  timeout: number;
  printer?: {
    enabled?: boolean;
    target?: string;
    type?: string;
  };
  cashDrawer?: {
    enabled?: boolean;
    pulseOff?: number;
    pulseOn?: number;
  };
}


const DEFAULT_COPY_COUNT = 1;
const DEFAULT_LAN_PORT = 9100;
const DEFAULT_TARGET = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 3000;

const MIN_COPY_COUNT = 1;
const MAX_COPY_COUNT = 5;

const MIN_PORT = 1;
const MAX_PORT = 65535;

const MIN_TIMEOUT_MS = 500;
const MAX_TIMEOUT_MS = 20000;

const MIN_PULSE = 0;
const MAX_PULSE = 255;

export const DEFAULT_HARDWARE_CONFIG: HardwareConfig = {
  connectionMode: 'LAN',
  copyCount: DEFAULT_COPY_COUNT,
  drawerPulse: {
    off: 120,
    on: 50,
  },
  port: DEFAULT_LAN_PORT,
  target: DEFAULT_TARGET,
  timeout: DEFAULT_TIMEOUT_MS,
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function parseConnectionMode(value: unknown): HardwareConnectionMode {
  if (value === 'LAN' || value === 'USB') {
    return value;
  }
  return DEFAULT_HARDWARE_CONFIG.connectionMode;
}

export function normalizeHardwareConfig(input: unknown): HardwareConfig {
  const source =
    typeof input === 'object' && input !== null
      ? (input as Partial<HardwareConfig>)
      : {};

  const drawerPulseSource =
    typeof source.drawerPulse === 'object' && source.drawerPulse !== null
      ? (source.drawerPulse as Partial<DrawerPulseConfig>)
      : {};

  const targetRaw =
    typeof source.target === 'string' ? source.target.trim() : '';

  return {
    connectionMode: parseConnectionMode(source.connectionMode),
    copyCount: Math.round(
      clamp(
        parseNumber(source.copyCount, DEFAULT_HARDWARE_CONFIG.copyCount),
        MIN_COPY_COUNT,
        MAX_COPY_COUNT,
      ),
    ),
    drawerPulse: {
      off: Math.round(
        clamp(
          parseNumber(drawerPulseSource.off, DEFAULT_HARDWARE_CONFIG.drawerPulse.off),
          MIN_PULSE,
          MAX_PULSE,
        ),
      ),
      on: Math.round(
        clamp(
          parseNumber(drawerPulseSource.on, DEFAULT_HARDWARE_CONFIG.drawerPulse.on),
          MIN_PULSE,
          MAX_PULSE,
        ),
      ),
    },
    port: Math.round(
      clamp(parseNumber(source.port, DEFAULT_HARDWARE_CONFIG.port), MIN_PORT, MAX_PORT),
    ),
    target: targetRaw.length > 0 ? targetRaw : DEFAULT_HARDWARE_CONFIG.target,
    timeout: Math.round(
      clamp(
        parseNumber(source.timeout, DEFAULT_HARDWARE_CONFIG.timeout),
        MIN_TIMEOUT_MS,
        MAX_TIMEOUT_MS,
      ),
    ),
  };
}

export function parseHardwareConfigJson(raw: string | null): HardwareConfig {
  if (!raw) {
    return { ...DEFAULT_HARDWARE_CONFIG };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeHardwareConfig(parsed);
  } catch {
    return { ...DEFAULT_HARDWARE_CONFIG };
  }
}

export function serializeHardwareConfig(config: HardwareConfig): string {
  return JSON.stringify(normalizeHardwareConfig(config));
}

export function toThermalInterface(config: HardwareConfig): string {
  if (config.connectionMode === 'USB') {
    return `printer:${config.target}`;
  }
  return `tcp://${config.target}:${config.port}`;
}

