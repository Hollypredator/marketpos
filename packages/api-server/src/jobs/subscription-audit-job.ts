import type { FastifyInstance } from 'fastify';

import { writeSystemSubscriptionTransitionAudit } from '../routes/subscription';

const DEFAULT_INTERVAL_MINUTES = 60;
const MAX_INTERVAL_MINUTES = 24 * 60;
const MIN_INTERVAL_MINUTES = 5;

function readIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.MARKETPOS_SUBSCRIPTION_AUDIT_INTERVAL_MINUTES ??
      `${DEFAULT_INTERVAL_MINUTES}`,
    10,
  );
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_MINUTES * 60 * 1000;
  }
  const normalizedMinutes = Math.min(
    Math.max(parsed, MIN_INTERVAL_MINUTES),
    MAX_INTERVAL_MINUTES,
  );
  return normalizedMinutes * 60 * 1000;
}

export function startSubscriptionAuditJob(server: FastifyInstance): () => void {
  let running = false;
  const run = async (): Promise<void> => {
    if (running) {
      return;
    }
    running = true;
    try {
      await writeSystemSubscriptionTransitionAudit();
    } catch (error: unknown) {
      server.log.error(error, 'Subscription audit job failed');
    } finally {
      running = false;
    }
  };

  void run();
  const intervalId = setInterval(() => {
    void run();
  }, readIntervalMs());
  intervalId.unref?.();

  return () => clearInterval(intervalId);
}
