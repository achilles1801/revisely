// Majd's test pass (~/Documents/revisely-android/testing-checklist.md), scenario 10, the
// Offline queue (RESET-3): today's session, a revision note and an 8-minute reading wait on the
// phone until Send held changes (or the next start of the app), then go in order (SYNC-1).
//
// Loaded on Thursday Nov 5 2026 at noon in Chicago (D = 2026-11-05): Juz 30, three a day from
// D−2 (582–584, 585–587), both done on the server; today is 588–590.

import { DailyLog, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import { scenarioPhone } from '../harness/testScenario';
import type { OpenApp } from '../harness/phone';

type Sync = typeof import('../../../src/lib/offline/sync');
type Outbox = typeof import('../../../src/lib/offline/outbox');
type Service = typeof import('../../../src/services/firestoreService');

/**
 * The changes held on the phone, in order. Besides the scenario's three, the start-up self-heal
 * queues the pages' revision dates (in the app's own form) behind them; that one is not counted.
 */
function held(app: OpenApp): string[] {
  const outbox = app.mods.require<Outbox>('src/lib/offline/outbox');
  return outbox
    .pendingEntries(app.uid)
    .map((e) => e.op.kind)
    .filter((k) => k !== 'pages');
}

async function onServer(app: OpenApp, D: string) {
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const session = await app.act(() => svc.getSession(D, app.uid));
  const notes = await app.act(() => svc.getJournalEntries(400, app.uid));
  const readings = await app.act(() => svc.getReadingSessions(500, app.uid));
  return {
    session: session ? [...session.pagesRevised].sort((a, b) => a - b) : null,
    notes: notes.find((d) => d.date === D)?.entries.map((e) => e.text) ?? [],
    readings: readings.filter((r) => r.date === D).map((r) => Math.round(r.durationSeconds / 60)),
  };
}

describe('10. Offline queue', () => {
  it('[RESET-3] [SYNC-1] [SYNC-3] [SESS-2] today shows Done from the held session; Send held changes sends all three, the streak counts today, and another phone sees them', async () => {
    const { phone, app, D } = await scenarioPhone('offline-queue');
    const home = new Home(app);
    await home.ready();
    const sync = app.mods.require<Sync>('src/lib/offline/sync');
    expect(sync.isSyncHeld(app.uid)).toBe(true);
    expect(home.title()).toBe('Done · 3 pages');
    expect(held(app)).toEqual(['session.add', 'journal.entry.add', 'reading.add']);
    expect(await onServer(app, D)).toEqual({ session: null, notes: [], readings: [] });

    // Send held changes.
    await app.act(async () => sync.releaseSync(app.uid));
    await app.until(() => app.app.pendingChanges === 0, 'the held changes to be sent');
    expect(sync.isSyncHeld(app.uid)).toBe(false);
    expect(await onServer(app, D)).toEqual({ session: [588, 589, 590], notes: ['Revised offline, held to test syncing'], readings: [8] });
    // Today counts: D−2, D−1 and today.
    await home.untilStreak(3);
    await app.close();

    // Another phone signed in to the account: today done, the note and the streak.
    const other = new Phone('other');
    const app2 = await other.open(homeStack);
    await app2.signIn(phone.email!);
    const home2 = new Home(app2);
    await home2.ready();
    await app2.until(() => home2.title() === 'Done · 3 pages', 'the other phone to show today done');
    await home2.untilStreak(3);
    const log = new DailyLog(app2);
    await log.open(D);
    await app2.until(() => log.entries().length > 0, 'today’s note on the other phone');
    expect(log.entries()).toEqual([{ kind: 'Revision', text: 'Revised offline, held to test syncing' }]);
    await app2.close();
  });

  it('[RESET-3] [SYNC-1] relaunching instead: the held changes are sent at the next start', async () => {
    const { phone, app, D } = await scenarioPhone('offline-queue');
    await new Home(app).ready();
    expect(held(app)).toEqual(['session.add', 'journal.entry.add', 'reading.add']);
    await app.close();
    const next = await phone.open(homeStack);
    await new Home(next).ready();
    await next.until(() => next.app.pendingChanges === 0, 'the held changes to be sent at the start');
    expect(await onServer(next, D)).toEqual({ session: [588, 589, 590], notes: ['Revised offline, held to test syncing'], readings: [8] });
    await next.close();
  });

  it('[RESET-3] [SYNC-1] offline, Send held changes keeps them queued; back online, they go', async () => {
    const { phone, app, D } = await scenarioPhone('offline-queue');
    const home = new Home(app);
    await home.ready();
    const sync = app.mods.require<Sync>('src/lib/offline/sync');
    await phone.goOffline();
    await app.act(async () => sync.releaseSync(app.uid));
    await app.idle(3000);
    expect(held(app)).toEqual(['session.add', 'journal.entry.add', 'reading.add']);
    expect(home.title()).toBe('Done · 3 pages');
    await phone.goOnline();
    await app.until(() => app.app.pendingChanges === 0, 'the held changes to be sent once online');
    expect(await onServer(app, D)).toEqual({ session: [588, 589, 590], notes: ['Revised offline, held to test syncing'], readings: [8] });
    await home.untilStreak(3);
    await app.close();
  });
});
