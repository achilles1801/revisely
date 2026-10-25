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

/**
 * Settings → Report a problem: Sentry's report form (App.tsx configures it). The
 * report carries this launch's release and tags (lib/releaseInfo), the recent
 * breadcrumbs, and a screenshot if the user takes one.
 */
export function reportProblem() {
  Sentry.showFeedbackWidget();
}

/**
 * Checks that crashes reach Sentry readable, for preview and development builds
 * only (Settings → App info shows them there): a handled JavaScript error, and a
 * native crash, whose stack only reads properly if the build's dSYMs were uploaded.
 */
export function sendTestError() {
  Sentry.captureException(new Error('Test error from Settings → App info'));
}
export function triggerTestNativeCrash() {
  Sentry.nativeCrash();
}
