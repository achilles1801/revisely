/**
 * Thin logger wrapper.
 *
 *   logger.log / logger.warn  → no-op in production (saves bytes + cycles).
 *   logger.error              → still logs in dev; in production, captures to
 *                               Sentry so we get a real signal from real users.
 *
 * Usage: replace direct console.* calls so we have one place to swap behavior.
 */
import { reportError } from './sentry';

type LogArgs = unknown[];

export const logger = {
  // E2E builds (EXPO_PUBLIC_E2E=1, a release build) keep these too: they go to
  // the build's own log (lib/e2e/log), which a failed flow keeps. The bundler
  // inlines the variable, so other release builds still drop them.
  log: (...args: LogArgs): void => {
    if (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },

  warn: (...args: LogArgs): void => {
    if (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') {
      // eslint-disable-next-line no-console
      console.warn(...args);
    }
  },

  error: (message: string, err?: unknown, context?: Record<string, unknown>): void => {
    if (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1') {
      // eslint-disable-next-line no-console
      console.error(message, err);
    }
    if (err instanceof Error) {
      reportError(err, { message, ...context });
    } else if (err !== undefined) {
      reportError(new Error(message), { cause: String(err), ...context });
    } else {
      reportError(new Error(message), context);
    }
  },
};
