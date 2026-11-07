// Who sees Revo: previewTester accounts (the server checks the same), and E2E builds, whose
// accounts can't be testers (the field is admin-only) and whose Revo is the in-memory stand-in.

import type { User } from '../../types';
import { getNextRevisionDayStart } from '../fajrBoundary';

export function revoAvailable(user: Pick<User, 'previewTester'> | null | undefined): boolean {
  if (process.env.EXPO_PUBLIC_E2E === '1') return !!user;
  return user?.previewTester === true;
}

/** The main screens the button shows on (never the reader, a session or an editor). */
export const REVO_BUTTON_ROUTES = new Set(['Dashboard', 'Activity', 'ActivityDay', 'ActivityAll', 'ReadIndex', 'Insights']);

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
