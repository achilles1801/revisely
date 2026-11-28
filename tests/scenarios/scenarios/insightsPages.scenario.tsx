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

/** Activity in Revisely Dev: the one tab (ACT-35), with Gaps' reading of the plan (gapsInsightsEnabled). */
function devActivity(mods: Booted) {
  mods.require<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  mods.require<{ setActivityOneTabForTests: (on: boolean) => void }>('src/lib/release/activityOneTab').setActivityOneTabForTests(true);
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
