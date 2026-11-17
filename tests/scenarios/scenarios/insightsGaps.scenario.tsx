// Insights' Gaps (ACT-28): how long since the last revision, the longest gap, the usual rhythm and how far the gaps
// pushed the full revision back, counted by
// the revision day the app files sessions on (DAY-2: from midnight until Fajr it is still the day before).
// Majd, Nov 16 2026: "the last time i revised was last week but other than looking at consistency there's no
// real metric for tracking that consistency".

import { CITIES, newAccount, pagesRange } from '../harness/account';
import { MINUTE, setNow, setZone, ZONES } from '../harness/clock';
import { Home, activityStack, homeStack } from '../harness/screens';
import { Phone, type Booted, type OpenApp } from '../harness/phone';
import { fajrOn } from './dayWeeks';
import { plain } from '../harness/words';

const label = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID)?.props.accessibilityLabel as string | undefined;

/** A session of today's five pages, opened from Home at `at`, swiped through and saved. */
async function revise(phone: Phone, at: string | Date): Promise<void> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(5);
  await session.back();
  await app.untilSynced();
  await app.close();
}

/** Activity in Revisely Dev, where Gaps is (gapsInsightsEnabled). */
function devActivity(mods: Booted) {
  mods.require<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  return activityStack(mods);
}

async function openInsights(phone: Phone): Promise<OpenApp> {
  const app = await phone.open(devActivity);
  await app.until(() => app.app.user != null, 'the account');
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => app.screen.queryByTestId('pill-insights') != null, 'Activity');
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('pill-insights'));
  });
  return app;
}

/**
 * Waits for Gaps' strip to read `strip`, and fails if Gaps was ever drawn from none of Activity's items on the way
 * (it then read "Today you revised" over "revised on 0 days" while they loaded, ACT-28).
 */
async function stripReads(app: OpenApp, strip: string) {
  let partial: string | undefined;
  await app.until(() => {
    const now = label(app, 'insights-gaps-strip');
    if (now?.includes('revised on 0 days')) partial = now;
    return now === strip;
  }, `Gaps: ${strip}`);
  expect(partial).toBeUndefined();
}

it('[ACT-28] [ACT-30] [DAY-2] Gaps counts by the revision day: a session after midnight, before Fajr, is the day before', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, {
    memorized: pagesRange(582, 604),
    user: { dailyPageCapacity: 5, fajrBoundaryEnabled: true, locationCoords: CITIES.chicago },
  });
  await first.close();

  // Monday 2 and Tuesday 3 November, then nothing until Saturday 7's revision day, revised at 4 a.m. on
  // Sunday 8, an hour before Fajr.
  await revise(phone, '2026-11-02 20:30');
  await revise(phone, '2026-11-03 09:00');
  const fajr = fajrOn('2026-11-08', { locationCoords: CITIES.chicago, fajrCalculationMethod: 'NorthAmerica' });
  await revise(phone, new Date(fajr.getTime() - 60 * MINUTE));

  // Monday 9 November, evening: two days since Saturday (one, had the session counted for Sunday).
  setNow('2026-11-09 20:00');
  const app = await openInsights(phone);
  // The account is a week old: the strip and its words start on its first day.
  await stripReads(app, 'Since 2 November: revised on 3 days. Gaps of 3 days or more: 4 days, from 3 November to 7 November.');
  expect(label(app, 'insights-gaps-figure')).toBe('2 days since your last revision');
  // 3 → 7 November is a gap of 4 days; 7 → today, open, two (not yet long).
  expect(label(app, 'insights-gaps-longest')).toBe('4 days Longest gap, 3 Nov – 7 Nov');
  // Steps of 1 and 4 days: usually every 2–3 days.
  expect(label(app, 'insights-gaps-rhythm')).toBe('Every 2–3 days. Your usual rhythm · 1 gap of 3+ days');
  // The full revision (the plan read forwards from today): 23 pages, five a day, so each comes round every 5
  // days. Missed on 4–6 November: Juz 30's end (592–604, never revised since it was memorized), 589–591 (last
  // revised on the 3rd) and 582–583 (the 2nd). 18 pages, the last due on the 8th, the last back on the 13th.
  expect(label(app, 'insights-gaps-revision')).toBe(
    'Full revision pushed back 5 days. 18 pages from your gaps come round by 13 Nov instead of 8 Nov. Your plan goes round every 5 days.',
  );

  const { fireEvent } = app.mods.rtl;
  // The longest gap opens Overview with it marked on the calendar, at November, from the 3rd to the 7th.
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('insights-gaps-longest'));
  });
  await app.until(() => app.screen.queryByTestId('calendar-gap-cue') != null, 'the gap on the calendar');
  expect(app.screen.getByText('Longest gap, 3 Nov – 7 Nov · 4 days')).toBeTruthy();
  expect(app.screen.getByTestId('calendar-month-title').props.children).toBe('November 2026');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('pill-insights'));
  });
  await app.until(() => app.screen.queryByTestId('insights-gaps-last-revised') != null, 'Gaps again');

  // When did I last revise…? (ACT-30): by surah, longest waiting first. An-Naba's 582 was last revised on the 2nd
  // (7 days), as long as Juz 30's end has waited since it was memorized; An-Naba comes first among them.
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('insights-gaps-last-revised'));
  });
  await app.until(() => app.screen.queryAllByTestId(/^last-revised-row-surah-/).length > 0, 'Last revised');
  const rows = app.screen.getAllByTestId(/^last-revised-row-surah-/);
  expect(rows[0].props.testID).toBe('last-revised-row-surah-78');
  expect(plain(label(app, 'last-revised-row-surah-78')!)).toBe('An-Naba. 2 Nov · 7 days ago. Shows its pages');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('last-revised-row-surah-78'));
  });
  await app.until(() => app.screen.queryByTestId('last-revised-page-surah-78-582') != null, 'An-Naba’s pages');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('last-revised-page-surah-78-582'));
  });
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.until(() => nav.current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav.current.getCurrentRoute().params).toMatchObject({ pageNumber: 582 });
  await app.close();

  // Revising now ends the open gap: "Today, you revised", and a 2-day gap isn't named.
  await revise(phone, '2026-11-09 20:30');
  const after = await openInsights(phone);
  // Wait for the strip itself: the session can reach the server (and the items) after the pages say today.
  await stripReads(after, 'Since 2 November: revised on 4 days. Gaps of 3 days or more: 4 days, from 3 November to 7 November.');
  expect(label(after, 'insights-gaps-figure')).toBe('Today you revised');
  // Today's five (594–598) are no longer late.
  expect(label(after, 'insights-gaps-revision')).toBe(
    'Full revision pushed back 5 days. 13 pages from your gaps come round by 13 Nov instead of 8 Nov. Your plan goes round every 5 days.',
  );
  await after.close();
});
