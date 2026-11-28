// Insights' own pages from their point (Revisely Dev; Majd, Nov 27 2026: "yes build all seven screens"; boards in
// ~/Documents/revisely-today-mocks/insights-v2/): the real Activity screen and a section's page against the emulators, on
// an account with months of revisions on record.

import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setNow, setZone, ZONES } from '../harness/clock';
import { activityStack, flatText } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { setServerDoc, timestamp } from '../harness/serverDocs';

const TODAY = '2026-11-28';
const ago = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}
const shows = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID) != null;
const text = (app: OpenApp, testID: string) => {
  const el = app.screen.queryByTestId(testID);
  return el ? flatText(el).replace(/ /g, ' ') : null;
};
const label = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID)?.props.accessibilityLabel as string | undefined;

/** Pages revised by hand on `day` (a Revised item, as the day's + writes), and each page's own record. */
async function revisedOn(uid: string, day: string, pages: number[]): Promise<void> {
  const at = `${day}T18:00:00.000Z`;
  await setServerDoc(`users/${uid}/revisions/manual-${day}`, {
    id: `manual-${day}`,
    uid,
    day,
    countsFor: day,
    occurredAt: Date.parse(at),
    source: 'manual',
    pages,
    skipped: [],
    assigned: [],
    minutes: null,
    recordings: [],
  });
  for (const p of pages) await setServerDoc(`users/${uid}/pages/${p}`, { lastRevisedAt: timestamp(at) });
}

/** Activity in Revisely Dev: the one tab (ACT-35), Gaps' reading of the plan (gapsInsightsEnabled) and #1066's Memorization. */
function devActivity(mods: Booted) {
  mods.require<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  mods.require<{ setActivityOneTabForTests: (on: boolean) => void }>('src/lib/release/activityOneTab').setActivityOneTabForTests(true);
  // Memorization as #1066 built it (MEM-10).
  mods.require<{ setMemorizedInSettingsForTests: (on: boolean) => void }>('src/lib/release/memorizedInSettings').setMemorizedInSettingsForTests(true);
  return activityStack(mods);
}

async function openSection(phone: Phone, row: string): Promise<OpenApp> {
  const app = await phone.open(devActivity);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => shows(app, 'activity-blocks-views'), 'Activity');
  await tap(app, row);
  await app.until(() => shows(app, 'activity-section'), 'the section’s page');
  return app;
}

it('[ACT-38] Coverage’s page starts from its point: the share that came round and its trend, each juz by its last revision, and the juz slipping out of rotation with Plan them', async () => {
  setZone(ZONES.chicago);
  // An account since July: Juz 27 to 30 memorized (83 pages), five pages a day.
  setNow('2026-07-01 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(522, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  // Juz 29 and 30 revised 3 days ago (43 pages, 52%); Juz 27 41 days ago and Juz 28 33, both in the 30 days before the
  // range (40 pages, 48%).
  await revisedOn(uid, ago(41), pagesRange(522, 541));
  await revisedOn(uid, ago(33), pagesRange(542, 561));
  await revisedOn(uid, ago(3), pagesRange(562, 604));

  setNow(`${TODAY} 09:00`);
  const app = await openSection(phone, 'insights-row-coverage');

  // The point first: the share that came round in 30 days, up from the 30 days before.
  await app.until(() => /^52%/.test(label(app, 'insights-coverage-figure') ?? ''), 'the share, 52%');
  expect(label(app, 'insights-coverage-figure')).toBe('52% came round, Up from 48% the month before');
  expect(text(app, 'insights-coverage-figure-trend')).toBe('[arrow-up] from 48%');
  expect(text(app, 'insights-coverage-figure-line')).toBe('43 of your 83 memorized pages were revised in 30 days ›');

  // Each juz by its last revision, in a card that says a tile opens its juz.
  expect(text(app, 'insights-coverage-card')).toMatch(/^Each juz, by its last revision\s*tap a juz/);
  expect(label(app, 'juz-tile-27')).toBe('Juz 27, revised 41 days ago');
  expect(label(app, 'juz-tile-30')).toBe('Juz 30, revised this week');

  // The two juz slipping out of rotation, longer than the plan goes round (83 pages at five a day).
  await app.until(() => shows(app, 'insights-slipping'), 'the juz slipping');
  expect(text(app, 'insights-slipping-row')).toBe(
    '[warning-outline] Juz 27 and Juz 28 are slipping out of rotation Last revised 41 and 33 days ago; your plan goes round every 17 days.',
  );
  expect(label(app, 'insights-plan-them')).toBe('Plan Juz 27 and Juz 28');

  // Plan them puts both juz first tomorrow, and says so.
  await tap(app, 'insights-plan-them');
  await app.until(() => shows(app, 'insights-plan-them-done'), 'First tomorrow ✓');
  expect(text(app, 'insights-plan-them-done')).toMatch(/First tomorrow/);
  await app.close();
});

/** Pages memorized on `day` (a Memorized item, as the day's + writes). */
async function memorizedOn(uid: string, day: string, pages: number[]): Promise<void> {
  await setServerDoc(`users/${uid}/memorizations/m-${day}`, { id: `m-${day}`, uid, day, pages, minutes: null });
}

it('[MEM-11] Memorization’s page says when the juz in progress is done at this pace', async () => {
  setZone(ZONES.chicago);
  // An account since July: Juz 30 and the last 11 pages of Juz 29 memorized, 9 of Juz 29 to go.
  setNow('2026-07-01 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(571, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  // Those 11 pages of Juz 29 memorized over the last three months: about 4 a month.
  await memorizedOn(uid, ago(80), [571, 572, 573]);
  await memorizedOn(uid, ago(50), [574, 575, 576]);
  await memorizedOn(uid, ago(10), [577, 578, 579, 580, 581]);

  setNow(`${TODAY} 09:00`);
  const app = await openSection(phone, 'insights-row-memorization');
  await app.until(() => shows(app, 'insights-memorization-bars-month'), 'Memorization’s chart (MEM-10)');
  // A timeline from a young history (ACT-41): September to November in six slots, the three before them marked on the
  // baseline and the first named by its month.
  expect(text(app, 'insights-memorization-bars-month-label-first')).toBe('Jun');
  expect(app.screen.queryAllByTestId('insights-memorization-bars-month-mark')).toHaveLength(3);

  // Under #1066's chart, the one addition: 9 pages at 11 in 90 days take 74 days, to 10 February.
  await app.until(() => shows(app, 'insights-memorization-done-by'), 'the line on when Juz 29 is done');
  expect(text(app, 'insights-memorization-done-by')).toBe('[flag-outline] At this pace, Juz 29 is done in early February 2027 9 pages to go, at about 4 a month.');
  await app.close();
});

/** A finished session on `day` (the app's shape), revising `pages`, with `ratings` [page, rating]. */
async function sessionOn(uid: string, day: string, pages: number[], ratings: [number, number][]): Promise<void> {
  const at = `${day}T19:00:00.000Z`;
  await setServerDoc(`users/${uid}/sessions/${day}`, {
    id: day,
    date: day,
    state: 'COMPLETED',
    createdAt: timestamp(at),
    updatedAt: timestamp(at),
    completedAt: timestamp(at),
    durationMinutes: 12,
    assignedPages: pages,
    totalAssignedPages: pages.length,
    pagesRevised: pages,
    pagesSkipped: [],
    weaknessUpdates: ratings.map(([pageNumber, newRating]) => ({ pageNumber, previousRating: 4, newRating, changedAt: timestamp(at) })),
    completionPercentage: 100,
  });
}

it('[ACT-39] Weak spots’ page starts from its point: the pages weak now and their trend, weak and moderate week by week, the page weak most often, and Revise them', async () => {
  setZone(ZONES.chicago);
  setNow('2026-07-01 20:00');
  const phone = new Phone();
  // Juz 30 memorized, with Smart Tracking (pages are rated).
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5, smartTrackingEnabled: true } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  // 40 days ago three pages weak and one moderate; 20 days ago one of them strong again and another moderate; lately one
  // more strong, and 590 weak twice.
  await sessionOn(uid, ago(40), [582, 583, 584, 585], [[582, 1], [583, 2], [584, 2], [585, 3]]);
  await sessionOn(uid, ago(20), [584, 585, 586], [[584, 4], [585, 3], [586, 3]]);
  await sessionOn(uid, ago(10), [590], [[590, 1]]);
  await sessionOn(uid, ago(3), [583, 590], [[583, 4], [590, 2]]);
  for (const [p, r] of [[582, 1], [583, 4], [584, 4], [585, 3], [586, 3], [590, 2]]) await setServerDoc(`users/${uid}/pages/${p}`, { weaknessRating: r });

  setNow(`${TODAY} 09:00`);
  const app = await openSection(phone, 'insights-row-weak');

  // The point: two pages weak now, down from three as the range began.
  await app.until(() => /^2 weak pages/.test(label(app, 'insights-weak-figure') ?? ''), 'two weak pages');
  expect(label(app, 'insights-weak-figure')).toBe('2 weak pages, Down from 3 the month before');
  expect(text(app, 'insights-weak-figure-line')).toBe('Pages you rated weak in your last session of them');

  // Weak and moderate week by week: five weeks for 30 days, the newest on the line; a tap picks a week.
  expect(text(app, 'insights-weak-week')).toBe('This week · 2 weak · 2 moderate');
  await tap(app, `insights-weak-chart-bar-${ago(28)}`);
  expect(text(app, 'insights-weak-week')).toMatch(/^Week of \d+ \w+ · 3 weak · 1 moderate$/);

  // The page weak most often opens it; Revise them puts the two weak pages first tomorrow.
  // Page 590 is Al-Buruj, whole (its name held together by a no-break hyphen).
  expect(text(app, 'insights-weak-often-row')?.replace(/\u2011/g, '-')).toBe('Al-Buruj weak in 2 sessions in the last 30 days [chevron-forward]');
  expect(text(app, 'insights-revise-weak')).toBe('Revise the 2 weak pages first tomorrow [chevron-forward]');
  await tap(app, 'insights-revise-weak-row');
  await app.until(() => shows(app, 'insights-revise-weak-done'), 'First tomorrow ✓');
  await app.close();
});

it('[ACT-40] Pace’s page starts from its point: minutes a page and its trend, week by week, and the part of the day they’re quickest', async () => {
  setZone(ZONES.chicago);
  setNow('2026-07-01 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);

  /** Five pages revised on `day` at `hour` (Chicago), in `minutes`. */
  const timed = async (n: number, hour: number, minutes: number) => {
    const day = ago(n);
    const at = new Date(`${day}T${String(hour + 6).padStart(2, '0')}:00:00.000Z`).getTime();
    await setServerDoc(`users/${uid}/revisions/manual-${day}`, {
      id: `manual-${day}`, uid, day, countsFor: day, occurredAt: at, source: 'manual', pages: [582, 583, 584, 585, 586], skipped: [], assigned: [], minutes, recordings: [],
    });
  };
  // This week, six at dawn (6 AM) at 1.6 min a page; last week six in the morning (9 AM) at 2.2; a month before, 2.5.
  for (const n of [1, 2, 3, 4, 5, 6]) await timed(n, 6, 8);
  for (const n of [8, 9, 10, 11, 12, 13]) await timed(n, 9, 11);
  for (const n of [40, 45, 50]) await timed(n, 9, 12.5);

  setNow(`${TODAY} 09:00`);
  const app = await openSection(phone, 'insights-row-pace');

  // The point: 1.9 min a page, down from 2.5 the month before, over its twelve timed revisions.
  await app.until(() => /^1\.9 min a page/.test(label(app, 'insights-pace-figure') ?? ''), 'the pace, 1.9');
  expect(label(app, 'insights-pace-figure')).toBe('1.9 min a page, Down from 2.5 the month before');
  expect(text(app, 'insights-pace-figure-line')).toBe('12 timed revisions, against the month before ›');

  // Week by week from the first with a timed revision: this week on the line, last week on a tap.
  expect(text(app, 'insights-pace-week')).toBe('This week · 1.6 min a page');
  await tap(app, `insights-pace-chart-bar-${ago(7)}`);
  expect(text(app, 'insights-pace-week')).toMatch(/^Week of \d+ \w+ · 2\.2 min a page$/);

  // Quickest at dawn, slowest in the morning.
  expect(text(app, 'insights-pace-quickest')).toBe('[sunny-outline] Quickest at dawn 1.6 min a page before 7 AM, 2.2 from 7 AM to noon.');
  await app.close();
});
