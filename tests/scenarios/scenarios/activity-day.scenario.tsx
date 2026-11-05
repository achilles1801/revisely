// Activity groups by the revision day (BEHAVIOUR.md, DAY-9): a session, pages
// revised ahead and a daily-log note made between midnight and Fajr all show on
// the day before, and nothing shows on a day that has not started yet.

import { setNow, setZone, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { DailyLog, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import type { JournalEntry, RevisionLog, User } from '../../../src/types';

// The plan starts on Monday Nov 2 2026: Mon 1–5, Tue 6–10, Wed 11–15, Thu 16–20.
const MON = pagesRange(1, 5);

type ActivityLib = {
  buildActivityDays: (s: { logs: RevisionLog[]; readings: never[]; journal: JournalEntry[] }, u?: User | null) => { date: string }[];
};
type ItemsLib = {
  buildActivityItems: (
    s: { logs: RevisionLog[]; journal: JournalEntry[] },
    u?: User | null,
  ) => { day: string; title: string; detail: string; kind: string }[];
};
type Service = { getJournalEntry: (date: string) => Promise<JournalEntry | null> };

/** What Activity shows, from the app's own builders and data: days, and items as "day kind title". */
async function activity(app: OpenApp, days: string[]) {
  const service = app.mods.require<Service>('src/services/firestoreService');
  const journal = (await Promise.all(days.map((d) => service.getJournalEntry(d)))).filter(
    (e): e is JournalEntry => e != null,
  );
  const logs = app.app.logs as RevisionLog[];
  const user = app.app.user as User;
  const { buildActivityDays } = app.mods.require<ActivityLib>('src/lib/activity');
  const { buildActivityItems } = app.mods.require<ItemsLib>('src/lib/activityItems');
  return {
    days: buildActivityDays({ logs, readings: [], journal }, user).map((d) => d.date),
    items: buildActivityItems({ logs, journal }, user),
  };
}

async function account(user: Partial<User>): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5, ...user } });
  await app.close();
  return phone;
}

/** Monday's session, two of Tuesday's pages ahead, and a note: all done at `at`. */
async function doTheDay(phone: Phone, at: string, note: string): Promise<OpenApp> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(session.pages().length);
  await session.keepGoing();
  await session.check();
  await session.swipe();
  await session.check();
  await session.back();
  const log = new DailyLog(app);
  await log.open();
  await log.add(note);
  await log.back();
  await app.untilSynced();
  return app;
}

it('[DAY-9] [DAY-2] [LOG-3] [AHEAD-2] at 00:30 before Fajr, everything done shows on the revision day before; nothing on the next', async () => {
  const phone = await account({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
  // Tuesday 00:30 in Chicago: still Monday until Fajr.
  const app = await doTheDay(phone, '2026-11-03 00:30', 'after midnight');

  // Stored on Monday: the session (with Tuesday's two pages ahead) and the note.
  const logs = app.app.logs as RevisionLog[];
  expect(logs.map((l) => [l.date, [...l.pagesRevised].sort((a, b) => a - b), l.ahead])).toEqual([
    ['2026-11-02', [...MON, 6, 7], { '2026-11-03': [6, 7] }],
  ]);

  const shown = await activity(app, ['2026-11-02', '2026-11-03']);
  expect(shown.days).toEqual(['2026-11-02']);
  expect(shown.items.map((i) => i.day)).toEqual(shown.items.map(() => '2026-11-02'));
  expect(shown.items.map((i) => i.title)).toEqual(
    expect.arrayContaining(['Revised ahead for Tue · 2 pages', 'Daily log']),
  );
  // The note's time is Monday's: no other weekday is named.
  const note = shown.items.find((i) => i.kind === 'log');
  expect(note?.detail).toMatch(/^12:30 am · after midnight$/);
  await app.close();

  // Tuesday's own log stays empty; Monday's holds the note, its time without a weekday.
  setNow('2026-11-03 00:35');
  const again = await phone.open(homeStack);
  await new Home(again).ready();
  const monday = new DailyLog(again);
  await monday.open('2026-11-02');
  await again.until(() => monday.entries().length === 1, "Monday's log to hold the note");
  const label: string = again.screen.queryAllByTestId(/^journal-note-(?!menu)[^-]+$/)[0].props.accessibilityLabel;
  expect(label).toMatch(/, 12:30 am$/);
  await monday.back();
  const tuesday = new DailyLog(again);
  await tuesday.open('2026-11-03');
  await again.idle(500);
  expect(tuesday.entries()).toEqual([]);
  await again.close();
});

it('[DAY-9] [DAY-2] after Fajr (07:00), the same things show on the new day', async () => {
  const phone = await account({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
  // Monday is left undone; at 07:00 on Tuesday the revision day is Tuesday.
  const app = await doTheDay(phone, '2026-11-03 07:00', 'morning');
  const logs = app.app.logs as RevisionLog[];
  expect(logs.map((l) => l.date)).toEqual(['2026-11-03']);
  const shown = await activity(app, ['2026-11-03', '2026-11-04']);
  expect(shown.days).toEqual(['2026-11-03']);
  expect(new Set(shown.items.map((i) => i.day))).toEqual(new Set(['2026-11-03']));
  await app.close();
});

it('[DAY-9] [DAY-1] the boundary off: at 00:30 it is already the calendar day', async () => {
  const phone = await account({ fajrBoundaryEnabled: false });
  const app = await doTheDay(phone, '2026-11-03 00:30', 'past midnight');
  const logs = app.app.logs as RevisionLog[];
  expect(logs.map((l) => l.date)).toEqual(['2026-11-03']);
  const shown = await activity(app, ['2026-11-03', '2026-11-04']);
  expect(shown.days).toEqual(['2026-11-03']);
  expect(new Set(shown.items.map((i) => i.day))).toEqual(new Set(['2026-11-03']));
  await app.close();
});
