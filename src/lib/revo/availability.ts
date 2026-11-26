// Who sees Revo: what the release switch opens it to (config/app.revo, lib/revo/release, REVO-37):
// previewTester accounts until the release, then everyone; nobody while it is off. The server checks
// the same. E2E flows mark their account a tester through the emulator, as the owner's script does
// (.maestro/scripts/server-revo.js).

import type { User } from '../../types';
import { getNextRevisionDayStart } from '../fajrBoundary';
import { type RevoRelease, useRevoRelease } from './release';
import { t, formatTime } from '../../i18n';

export function revoAvailable(user: Pick<User, 'previewTester'> | null | undefined, release: RevoRelease): boolean {
  if (!user || release === 'off') return false;
  return release === 'everyone' || user.previewTester === true;
}

/** revoAvailable under the release as last read (it re-renders when that changes). */
export function useRevoAvailable(user: Pick<User, 'previewTester'> | null | undefined): boolean {
  return revoAvailable(user, useRevoRelease());
}

/**
 * The screens the button shows on (REVO-25): Home and Activity's (a section's own page too, ACT-35). Never the Read tab, its list or the
 * reader (Majd, Nov 8 2026: "no revo in the mushaf tab at all"), a session, an editor or Settings.
 */
export const REVO_BUTTON_ROUTES = new Set(['Dashboard', 'Activity', 'ActivityDay', 'ActivityAll', 'PagesByStrength', 'ActivitySection']); // i18n-ignore (route names)

/**
 * When Revo is back after the day's questions: the next revision day's start. "after Fajr, at
 * 5:23 AM" with the Fajr boundary on; "at midnight" without.
 */
export function revoBackAt(user: User | null | undefined, now: Date): { short: string; long: string } {
  const at = getNextRevisionDayStart(user, now);
  const fajr = !!(user?.fajrBoundaryEnabled && user.locationCoords);
  if (!fajr) return { short: t('revo.back.midnight'), long: t('revo.back.midnightLong') };
  const time = formatTime(at);
  return { short: t('revo.back.fajr'), long: t('revo.back.fajrLong', { time }) };
}
