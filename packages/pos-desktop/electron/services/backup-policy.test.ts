import { describe, expect, it } from 'vitest';

import { parseBackupPolicy } from './database';

describe('backup-policy', () => {
  it('uses safe defaults when no policy exists', () => {
    const policy = parseBackupPolicy(null);

    expect(policy).toEqual({
      enabled: true,
      intervalHours: 8,
      lastRunAt: null,
      maxBackups: 60,
      retentionDays: 21,
    });
  });

  it('falls back to defaults on malformed json', () => {
    const policy = parseBackupPolicy('{broken-json');

    expect(policy.intervalHours).toBe(8);
    expect(policy.enabled).toBe(true);
  });

  it('normalizes out-of-range numeric values', () => {
    const policy = parseBackupPolicy(
      JSON.stringify({
        enabled: true,
        intervalHours: 300,
        lastRunAt: 'not-a-date',
        maxBackups: 2,
        retentionDays: -5,
      }),
    );

    expect(policy.intervalHours).toBe(72);
    expect(policy.retentionDays).toBe(1);
    expect(policy.maxBackups).toBe(5);
    expect(policy.lastRunAt).toBeNull();
  });
});
