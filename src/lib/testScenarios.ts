// Settings → Testing → Load test scenario (testers): the account is reset as
// Reset my data does it, then filled with a ready-made situation to test
// (TESTING-CHECKLIST.md says what to look at in each).
//
// The server builds and writes the scenario (functions loadTestScenario:
// previewTester only, the same backup first). It needs to know the phone's day:
// this sends the phone's time zone and clock, and for the Fajr scenario the Fajr
// times this phone's own prayer settings give (lib/fajrBoundary), so the server
// puts every session, note and reading on the revision day the app will show.
//
// The phone's part, as for Reset my data (lib/testerReset): nothing is sent while
// the server works; then the outbox and this phone's recordings go, and the new
// account arrives with its reset mark (AppProvider drops the old copy).
//
// Offline queue: the server can't fill a phone's outbox, so it answers with the
// changes to queue (today's session, a note, a timed reading). This holds the
// account's syncing (lib/offline/sync holdSync), waits until the phone has taken
// in the new account (a change queued before would be dropped as stale), then
// queues them. They wait until "Send held changes" in Settings, or the next start
// of the app (the hold lives in memory only).

import * as firestoreService from '../services/firestoreService';
import type { TestScenarioResult } from '../services/firestoreService';
import type { User } from '../types';
import { clearOutbox } from './offline/outbox';
import { queueChange } from './offline/queue';
import { holdSync, settleSync } from './offline/sync';
import { whenResetAdopted } from './offline/reset';
import type { OutboxOp } from './offline/ops';
import { deleteAllRecordings, forgetCloudDeletes } from './recordings';
import { DEFAULT_FAJR_METHOD, getFajrTimeFor } from './fajrBoundary';
import { auth } from './firebase';
import { logger } from './logger';

export interface TestScenario {
  id: string;
  title: string;
  detail: string;
}

/** The scenarios, in the order Settings lists them (ids as functions/src/testScenarios.ts). */
export const TEST_SCENARIOS: TestScenario[] = [
  { id: 'new', title: 'New account', detail: 'Just onboarded: Juz 30, five pages a day, nothing done yet.' },
  { id: 'beginner', title: 'Beginner', detail: 'Juz 30, two pages a day, a week of history with gaps.' },
  { id: 'hafiz', title: 'Hafiz', detail: 'All 604 pages, one juz a day, 60 days of history, ratings, recordings.' },
  { id: 'partial-today', title: 'Partly done today', detail: 'Today’s session half done; yesterday left two pages.' },
  { id: 'missed-days', title: 'Missed days', detail: 'The last session was three days ago.' },
  { id: 'revise-ahead', title: 'Revised ahead', detail: 'Today done, and two of tomorrow’s pages revised ahead.' },
  { id: 'fajr-edge', title: 'Fajr edge', detail: 'Fajr boundary on; sessions after midnight and just before Fajr.' },
  { id: 'custom-reverse', title: 'Custom reverse plan', detail: 'Juz 30 backwards, a page on two neighbouring days.' },
  { id: 'heavy-activity', title: 'Heavy Activity', detail: 'Three months of sessions, readings, notes and memorizing.' },
  { id: 'offline-queue', title: 'Offline queue', detail: 'Today’s session, a note and a reading held until you send them.' },
];

/** Who sees Load test scenario: a previewTester account, as the server requires. */
export function showsTestScenarios(user: { previewTester?: boolean } | null | undefined): boolean {
  return user?.previewTester === true;
}

function localDay(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * Where the Fajr scenario prays: the account's saved place when it has one,
 * otherwise a place in this phone's zone (its longitude from the zone's offset),
 * so that each Fajr falls in the early morning here.
 */
export function fajrScenarioPlace(user: Pick<User, 'locationCoords'> | null | undefined, now: Date): { latitude: number; longitude: number } {
  if (user?.locationCoords) return user.locationCoords;
  const offsetMinutes = -now.getTimezoneOffset();
  const longitude = Math.max(-179, Math.min(179, Math.round((offsetMinutes / 4) * 100) / 100));
  return { latitude: 30, longitude };
}

/** What the server needs of this phone's day (functions' parseContext). */
export function buildSeedContext(
  scenario: string,
  user: User | null | undefined,
  now: Date = new Date(),
): Record<string, unknown> {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const context: Record<string, unknown> = { zone, now: now.getTime() };
  if (scenario !== 'fajr-edge') return context;

  const coords = fajrScenarioPlace(user, now);
  const method = user?.fajrCalculationMethod || DEFAULT_FAJR_METHOD;
  const prayer = { ...(user ?? {}), fajrBoundaryEnabled: true, locationCoords: coords, fajrCalculationMethod: method } as User;
  const days: Record<string, number> = {};
  for (let k = -3; k <= 1; k++) {
    const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, 12);
    const fajr = getFajrTimeFor(noon, prayer);
    if (fajr) days[localDay(noon)] = fajr.getTime();
  }
  context.fajr = { coords, method, days };
  return context;
}

/** Resets the account and loads `scenario` into it; the phone's part as above. */
export async function loadTestScenario(scenario: string, user: User | null | undefined): Promise<TestScenarioResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  firestoreService.setResettingAccount(uid);
  try {
    // A change on its way finishes first; no other starts until this is over.
    await settleSync(uid);
    const result = await firestoreService.loadTestScenarioOnServer({ scenario, context: buildSeedContext(scenario, user) });
    await clearOutbox(uid);
    try {
      await deleteAllRecordings(uid);
      forgetCloudDeletes(uid);
    } catch (err) {
      logger.warn('Could not clear this phone’s recordings after loading a scenario', err);
    }
    if (result.outbox.length > 0) {
      holdSync(uid);
      await whenResetAdopted(uid, result.resetAt);
      for (const op of result.outbox) await queueChange(op as unknown as OutboxOp);
    }
    logger.log('Test scenario loaded', { scenario, seeded: result.seeded, held: result.outbox.length });
    return result;
  } finally {
    firestoreService.setResettingAccount(null);
  }
}
