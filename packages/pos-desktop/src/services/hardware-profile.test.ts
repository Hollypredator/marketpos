import { describe, expect, it } from 'vitest';

import { applyHardwareProfile, listHardwareProfiles } from './hardware-profile';
import type { HardwareConfig } from './types';

const BASE_CONFIG: HardwareConfig = {
  connectionMode: 'LAN',
  copyCount: 1,
  drawerPulse: { off: 120, on: 50 },
  port: 9100,
  target: '127.0.0.1',
  timeout: 3000,
};

describe('hardware-profile', () => {
  it('lists predefined field profiles', () => {
    const profiles = listHardwareProfiles();
    expect(profiles.map((profile) => profile.id)).toEqual([
      'LAN_FAST',
      'LAN_STABLE',
      'USB_WINDOWS',
    ]);
  });

  it('applies USB profile defaults', () => {
    const applied = applyHardwareProfile(BASE_CONFIG, 'USB_WINDOWS');
    expect(applied.connectionMode).toBe('USB');
    expect(applied.target).toBe('EPSON TM-T20');
    expect(applied.timeout).toBe(5000);
  });

  it('returns current config on unknown profile', () => {
    const applied = applyHardwareProfile(
      BASE_CONFIG,
      'UNKNOWN' as unknown as 'LAN_FAST' | 'LAN_STABLE' | 'USB_WINDOWS',
    );
    expect(applied).toEqual(BASE_CONFIG);
  });
});
