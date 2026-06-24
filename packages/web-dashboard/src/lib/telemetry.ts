type TelemetryResult = 'failure' | 'success';

interface TelemetryPayload {
  durationMs: number;
  endedAt: string;
  flow: string;
  result: TelemetryResult;
  startedAt: string;
}

export function createFlowTimer(flow: string): {
  fail: () => void;
  success: () => void;
} {
  const startedAt = new Date();
  const startedMs = performance.now();

  const emit = (result: TelemetryResult): void => {
    const endedAt = new Date();
    const payload: TelemetryPayload = {
      durationMs: Math.max(0, Math.round(performance.now() - startedMs)),
      endedAt: endedAt.toISOString(),
      flow,
      result,
      startedAt: startedAt.toISOString(),
    };
    window.dispatchEvent(new CustomEvent('backoffice-flow-timing', { detail: payload }));
    console.info('[telemetry]', payload);
  };

  return {
    fail: () => emit('failure'),
    success: () => emit('success'),
  };
}
