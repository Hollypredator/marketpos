import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HARDWARE_CONFIG,
  normalizeHardwareConfig,
  parseHardwareConfigJson,
  toThermalInterface,
} from './hardware-config';

describe('hardware-config', () => {
  it('falls back to defaults for invalid json', () => {
    expect(parseHardwareConfigJson('{invalid-json')).toEqual(DEFAULT_HARDWARE_CONFIG);
  });

  it('normalizes and clamps numeric fields', () => {
    const normalized = normalizeHardwareConfig({
      connectionMode: 'LAN',
      copyCount: 99,
      drawerPulse: {
        off: -5,
        on: 999,
      },
      port: 70000,
      target: '  10.0.0.25  ',
      timeout: 100,
    });

    expect(normalized.copyCount).toBe(5);
    expect(normalized.drawerPulse.off).toBe(0);
    expect(normalized.drawerPulse.on).toBe(255);
    expect(normalized.port).toBe(65535);
    expect(normalized.target).toBe('10.0.0.25');
    expect(normalized.timeout).toBe(500);
  });

  it('builds the expected thermal interface values', () => {
    expect(
      toThermalInterface({
        ...DEFAULT_HARDWARE_CONFIG,
        connectionMode: 'LAN',
        port: 9100,
        target: '192.168.1.50',
      }),
    ).toBe('tcp://192.168.1.50:9100');

    expect(
      toThermalInterface({
        ...DEFAULT_HARDWARE_CONFIG,
        connectionMode: 'USB',
        target: 'EPSON TM-T20',
      }),
    ).toBe('printer:EPSON TM-T20');
  });
});

