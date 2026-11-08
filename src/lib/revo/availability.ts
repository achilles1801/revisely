// Who sees Revo: what the release switch opens it to (config/app.revo, lib/revo/release, REVO-37):
// previewTester accounts until the release, then everyone; nobody while it is off. The server checks
// the same. E2E flows mark their account a tester through the emulator, as the owner's script does
// (.maestro/scripts/server-revo.js).

import type { User } from '../../types';
import { getNextRevisionDayStart } from '../fajrBoundary';
import { type RevoRelease, useRevoRelease } from './release';

export function revoAvailable(user: Pick<User, 'previewTester'> | null | undefined, release: RevoRelease): boolean {
  if (!user || release === 'off') return false;
  return release === 'everyone' || user.previewTester === true;
}

/** revoAvailable under the release as last read (it re-renders when that changes). */
export function useRevoAvailable(user: Pick<User, 'previewTester'> | null | undefined): boolean {
  return revoAvailable(user, useRevoRelease());
}

/** The main screens the button shows on (never the reader, a session or an editor). */
export const REVO_BUTTON_ROUTES = new Set(['Dashboard', 'Activity', 'ActivityDay', 'ActivityAll', 'PagesByStrength', 'ReadIndex']);

/**
 * When Revo is back after the day's questions: the next revision day's start. "after Fajr, at
 * 5:23 AM" with the Fajr boundary on; "at midnight" without.
 */
export function revoBackAt(user: User | null | undefined, now: Date): { short: string; long: string } {
  const at = getNextRevisionDayStart(user, now);
  const fajr = !!(user?.fajrBoundaryEnabled && user.locationCoords);
  if (!fajr) return { short: 'Back at midnight', long: 'Revo is back at midnight.' };
  const time = at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { short: 'Back after Fajr', long: `Revo is back after Fajr, at ${time}.` };
}
