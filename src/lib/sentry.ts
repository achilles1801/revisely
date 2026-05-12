/**
 * Sentry helpers used throughout the app.
 *
 * Sentry.init() lives in App.tsx (set up by the Sentry wizard). This file
 * just exposes thin wrappers so other modules don't import Sentry directly.
 */
import * as Sentry from '@sentry/react-native';

/**
 * Manually report an error from a try/catch with optional context.
 * Use this for caught exceptions that you still want visibility into.
 */
export function reportError(err: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * Tag the current Sentry session with the signed-in user, so errors are
 * grouped by user in the dashboard. Call after sign-in / clear on sign-out.
 */
export function identifyUser(uid: string | null) {
  if (uid) {
    Sentry.setUser({ id: uid });
  } else {
    Sentry.setUser(null);
  }
}
