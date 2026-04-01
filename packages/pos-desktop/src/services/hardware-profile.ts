import type { HardwareConfig } from './types';

export type HardwareProfileId = 'LAN_FAST' | 'LAN_STABLE' | 'USB_WINDOWS';

export interface HardwareProfile {
  connectionMode: HardwareConfig['connectionMode'];
  description: string;
  id: HardwareProfileId;
  label: string;
  patch: {
    copyCount?: number;
    drawerPulse?: { off: number; on: number };
    port?: number;
    target?: string;
    timeout?: number;
  };
}

const HARDWARE_PROFILES: HardwareProfile[] = [
  {
    connectionMode: 'LAN',
    description: 'Ayni agdaki hizli LAN yazicilar icin dusuk timeout profili.',
    id: 'LAN_FAST',
    label: 'LAN - Hizli',
    patch: {
      copyCount: 1,
      drawerPulse: { off: 120, on: 50 },
      port: 9100,
      target: '192.168.1.100',
      timeout: 3000,
    },
  },
  {
    connectionMode: 'LAN',
    description: 'Yavas/ag gecikmeli saha noktalarinda daha yuksek timeout.',
    id: 'LAN_STABLE',
    label: 'LAN - Stabil',
    patch: {
      copyCount: 1,
      drawerPulse: { off: 140, on: 70 },
      port: 9100,
      target: '192.168.1.100',
      timeout: 6000,
    },
  },
  {
    connectionMode: 'USB',
    description: 'Windows uzerinden paylasilan USB yazici profili.',
    id: 'USB_WINDOWS',
    label: 'USB - Windows Yazici',
    patch: {
      copyCount: 1,
      drawerPulse: { off: 120, on: 50 },
      target: 'EPSON TM-T20',
      timeout: 5000,
    },
  },
];

export function listHardwareProfiles(): HardwareProfile[] {
  return HARDWARE_PROFILES;
}

export function applyHardwareProfile(
  current: HardwareConfig,
  profileId: HardwareProfileId,
): HardwareConfig {
  const profile = HARDWARE_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return current;
  }

  return {
    ...current,
    ...profile.patch,
    connectionMode: profile.connectionMode,
    drawerPulse: profile.patch.drawerPulse
      ? {
          off: profile.patch.drawerPulse.off,
          on: profile.patch.drawerPulse.on,
        }
      : current.drawerPulse,
    port:
      typeof profile.patch.port === 'number' ? profile.patch.port : current.port,
    target:
      typeof profile.patch.target === 'string' ? profile.patch.target : current.target,
    timeout:
      typeof profile.patch.timeout === 'number'
        ? profile.patch.timeout
        : current.timeout,
  };
}

