/**
 * Sentry helpers used throughout the app.
 *
 * Sentry.init() lives in App.tsx (set up by the Sentry wizard). This file
 * just exposes thin wrappers so other modules don't import Sentry directly.
 */
import * as Sentry from '@sentry/react-native';
import { NATIVE } from '@sentry/react-native/dist/js/wrapper';

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
 * Settings → Report a problem (SET-2): sends the user's words to Sentry's User Feedback, as Sentry's own
 * form did until Nov 2026 (the app now draws the form itself, components/report). The report carries this
 * launch's release and tags (lib/releaseInfo), the recent breadcrumbs, and the screenshot if the user took
 * one; the native SDK keeps it until it can be sent when offline. No name or email is asked for.
 */
export function sendProblemReport(message: string, shot?: { filename: string; data: Uint8Array; contentType?: string } | null) {
  Sentry.captureFeedback(
    { message, associatedEventId: Sentry.lastEventId() },
    shot ? { attachments: [{ filename: shot.filename, data: shot.data, contentType: shot.contentType }] } : undefined,
  );
}

/**
 * A picture of the screen as it is now, for a problem report. It is the Sentry SDK's own native capture (the
 * one its form used), so it needs no new native code; null where it isn't available or fails.
 */
export async function captureScreen(): Promise<{ filename: string; data: Uint8Array; contentType?: string } | null> {
  try {
    const shots = await NATIVE.captureScreenshot();
    const first = shots?.[0];
    return first ? { filename: first.filename, data: first.data, contentType: first.contentType } : null;
  } catch {
    return null;
  }
}

/**
 * Checks that crashes reach Sentry readable, for TestFlight (preview) builds only
 * (Settings → App info shows them there): a handled JavaScript error, and a
 * native crash, whose stack only reads properly if the build's dSYMs were uploaded.
 */
export function sendTestError() {
  Sentry.captureException(new Error('Test error from Settings → App info'));
}
export function triggerTestNativeCrash() {
  Sentry.nativeCrash();
}
