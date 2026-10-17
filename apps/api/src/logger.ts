import { pino } from "pino";
import { env } from "./env.js";

export const logger = pino({ level: env.LOG_LEVEL });

/**
 * Run work after the response has been sent (budget alerts, file cleanup).
 * Failures are logged, never thrown into the request.
 */
export function defer(task: () => Promise<unknown>) {
  setImmediate(() => {
    task().catch((error) => logger.error({ err: error }, "deferred task failed"));
  });
}
