// A tap on a prayer's athan notification (ATHAN-4): which voice's whole athan to play, if any.
// Pure. The notification carries the voice whose clip it played (lib/prayer/sync); a tap long after
// the prayer's time opens the app and plays nothing.

import { isAthanVoiceId } from './catalog';

/** A tap this long after the notification arrived still plays the athan. */
export const ATHAN_TAP_WINDOW_MS = 15 * 60 * 1000;

/** expo-notifications gives a notification's date in seconds on iOS and milliseconds on Android. */
export function notificationTime(date: unknown): number | null {
  if (typeof date !== 'number' || !Number.isFinite(date) || date <= 0) return null;
  return date < 1e11 ? date * 1000 : date;
}

/**
 * The voice to play for a tapped notification: its data must be a prayer's with an athan voice, and
 * the tap must come within the window of when it arrived. Null: play nothing.
 */
export function tappedAthanVoiceId(data: unknown, arrivedAt: unknown, now: number): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.kind !== 'prayer' || !isAthanVoiceId(d.athan)) return null;
  const at = notificationTime(arrivedAt);
  if (at == null || now - at > ATHAN_TAP_WINDOW_MS || at - now > 60 * 1000) return null;
  return d.athan;
}
