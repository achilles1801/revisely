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

// The screens the button shows on, and those without a tab bar: lib/revo/presence, where useRevoFootprint reads them.
export { REVO_BUTTON_ROUTES, REVO_BUTTON_NO_TAB_BAR } from './presence';

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
