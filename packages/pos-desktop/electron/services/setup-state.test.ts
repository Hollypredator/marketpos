import { describe, expect, it } from 'vitest';

import { buildDefaultSetupState, parseSetupState } from './database';

const STEP_IDS = [
  'RUNTIME_CHECK',
  'HARDWARE_PROFILE',
  'HARDWARE_TEST',
  'ONLINE_ACTIVATION',
  'GO_LIVE',
] as const;

describe('setup-state', () => {
  it('creates default pending setup state', () => {
    const state = buildDefaultSetupState();

    expect(state.setupVersion).toBe(1);
    expect(state.completedAt).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(state.steps.map((step) => step.stepId)).toEqual([...STEP_IDS]);
    expect(state.steps.every((step) => step.status === 'PENDING')).toBe(true);
  });

  it('parses and preserves completed setup state', () => {
    const now = '2026-04-01T12:00:00.000Z';
    const raw = JSON.stringify({
      completedAt: now,
      lastResult: {
        at: now,
        message: 'Kurulum tamamlandi.',
        status: 'SUCCESS',
      },
      setupVersion: 1,
      steps: STEP_IDS.map((stepId) => ({
        completedAt: now,
        detail: `${stepId} tamamlandi`,
        status: 'COMPLETED',
        stepId,
      })),
    });

    const parsed = parseSetupState(raw);
    expect(parsed.completedAt).toBe(now);
    expect(parsed.lastResult?.status).toBe('SUCCESS');
    expect(parsed.steps.every((step) => step.status === 'COMPLETED')).toBe(true);
  });

  it('resets to default when setup version is incompatible', () => {
    const incompatible = JSON.stringify({
      completedAt: '2026-04-01T12:00:00.000Z',
      setupVersion: 999,
      steps: [],
    });

    const parsed = parseSetupState(incompatible);
    expect(parsed.setupVersion).toBe(1);
    expect(parsed.completedAt).toBeNull();
    expect(parsed.steps.every((step) => step.status === 'PENDING')).toBe(true);
  });
});

