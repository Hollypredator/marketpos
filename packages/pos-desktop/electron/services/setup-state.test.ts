import { describe, expect, it } from 'vitest';

import { buildDefaultSetupState, parseSetupState } from './database';

const STEP_IDS = [
  'INSTALL_PREFS',
  'LICENSE',
  'ACCOUNT',
  'MODE_SELECT',
  'FINALIZE',
] as const;

describe('setup-state', () => {
  it('creates default pending setup state', () => {
    const state = buildDefaultSetupState();

    expect(state.setupVersion).toBe(2);
    expect(state.completedAt).toBeNull();
    expect(state.lastResult).toBeNull();
    expect(state.offlineReadinessPassed).toBe(false);
    expect(typeof state.setupMetrics.setupStartAt).toBe('string');
    expect(state.setupMetrics.firstSaleAt).toBeNull();
    expect(state.setupMetrics.durationMin).toBeNull();
    expect(state.setupMetrics.operatorInterventionCount).toBe(0);
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
      offlineReadinessPassed: true,
      setupMetrics: {
        durationMin: 12.5,
        firstSaleAt: now,
        operatorInterventionCount: 1,
        setupStartAt: '2026-04-01T11:30:00.000Z',
      },
      setupVersion: 2,
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
    expect(parsed.offlineReadinessPassed).toBe(true);
    expect(parsed.setupMetrics.durationMin).toBe(12.5);
    expect(parsed.steps.every((step) => step.status === 'COMPLETED')).toBe(true);
  });

  it('resets to default when setup version is incompatible', () => {
    const incompatible = JSON.stringify({
      completedAt: '2026-04-01T12:00:00.000Z',
      setupVersion: 999,
      steps: [],
    });

    const parsed = parseSetupState(incompatible);
    expect(parsed.setupVersion).toBe(2);
    expect(parsed.completedAt).toBeNull();
    expect(parsed.steps.every((step) => step.status === 'PENDING')).toBe(true);
  });

  it('migrates legacy v1 setup state to v2 step model', () => {
    const now = '2026-04-01T12:00:00.000Z';
    const rawLegacy = JSON.stringify({
      completedAt: null,
      lastResult: null,
      setupVersion: 1,
      steps: [
        {
          completedAt: now,
          detail: 'api=http://localhost:3001',
          status: 'COMPLETED',
          stepId: 'RUNTIME_CHECK',
        },
        {
          completedAt: now,
          detail: 'user=admin',
          status: 'COMPLETED',
          stepId: 'ONLINE_ACTIVATION',
        },
        {
          completedAt: null,
          detail: null,
          status: 'PENDING',
          stepId: 'GO_LIVE',
        },
      ],
    });

    const parsed = parseSetupState(rawLegacy);
    expect(parsed.setupVersion).toBe(2);
    expect(parsed.completedAt).toBeNull();
    expect(parsed.steps.find((step) => step.stepId === 'INSTALL_PREFS')?.status).toBe(
      'COMPLETED',
    );
    expect(parsed.steps.find((step) => step.stepId === 'LICENSE')?.status).toBe(
      'COMPLETED',
    );
    expect(parsed.steps.find((step) => step.stepId === 'ACCOUNT')?.status).toBe(
      'COMPLETED',
    );
    expect(parsed.steps.find((step) => step.stepId === 'MODE_SELECT')?.status).toBe(
      'PENDING',
    );
    expect(parsed.steps.find((step) => step.stepId === 'FINALIZE')?.status).toBe(
      'PENDING',
    );
  });
});
