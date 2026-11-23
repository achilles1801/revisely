// The journal's new look in Revisely Dev (BEHAVIOUR.md ACT-33, ACT-34, HOME-2; Majd's picks, Nov 23 2026). Revised elsewhere picks
// from a search and the thirty juz, the day under Overview's calendar is one entry, and one quiet row on Home opens today's journal.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, DailyLog, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { AddToDay, goBack } from '../harness/addToDay';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));

// 5 pages a day from 1–41 memorized (Juz 1 and Juz 2): Monday 1–5, Tuesday 6–10.
const TUESDAY = '2026-11-03';

async function open(): Promise<{ app: OpenApp; home: Home; add: AddToDay }> {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 41), user: { dailyPageCapacity: 5 } });
  await first.untilSynced();
  await first.close();
  setNow(`${TUESDAY} 21:00`);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home, add: new AddToDay(app) };
}

async function loggedPages(app: OpenApp): Promise<number[]> {
  const svc = app.mods.require<typeof import('../../../src/services/firestoreService')>('src/services/firestoreService');
  const items = await app.act(() => svc.getActivityItemsForDay(TUESDAY));
  return items.revisions.filter((r) => r.countsFor === TUESDAY).flatMap((r) => r.pages).sort((a, b) => a - b);
}

const text = (app: OpenApp, testID: string) => {
  const c = app.screen.getByTestId(testID).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};

async function press(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
}

describe('the journal’s new look', () => {
  it('[ACT-33] nothing is chosen at first; a tap takes a whole juz, a hold part of it, and Add logs them apart from the schedule', async () => {
    const { app, home, add } = await open();
    const before = { today: home.today(), title: home.title() };
    await new ActivityDayView(app).open(TUESDAY);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(text(app, 'elsewhere-summary')).toBe('Nothing chosen yet');
    expect(app.screen.getByTestId('add-revised-add').props.accessibilityState.disabled).toBe(true);
    // Nothing of Juz 3 is memorized: it can't be chosen.
    expect(app.screen.getByTestId('juz-cell-3').props.accessibilityState.disabled).toBe(true);

    await press(app, 'juz-cell-1');
    expect(text(app, 'elsewhere-summary')).toBe('Juz 1');
    await press(app, 'juz-cell-1');
    expect(text(app, 'elsewhere-summary')).toBe('Nothing chosen yet');

    // A hold opens Juz 2: its second half is its second hizb.
    await app.act(async () => {
      app.mods.rtl.fireEvent(app.screen.getByTestId('juz-cell-2'), 'longPress');
    });
    await app.until(() => app.screen.queryByTestId('elsewhere-juz') != null, 'the juz');
    await press(app, 'elsewhere-half-second');
    expect(text(app, 'elsewhere-summary')).toBe('Second half of Juz 2');
    expect(text(app, 'elsewhere-summary-detail')).toMatch(/pages · Hizb 4$/);
    await press(app, 'elsewhere-juz-done');
    expect(text(app, 'elsewhere-summary')).toBe('half of Juz 2');

    const { getPagesForHizb } = app.mods.require<typeof import('../../../src/lib/quranData')>('src/lib/quranData');
    const half = getPagesForHizb(4).filter((p) => p <= 41);
    await add.add('revised');
    await app.untilSynced();
    await app.idle(400);
    expect(await loggedPages(app)).toEqual(half);

    await goBack(app);
    await app.idle(400);
    expect({ today: home.today(), title: home.title() }).toEqual(before);
    await app.close();
  });

  it('[ACT-33] the search swaps the grid for what it finds, and a page of the day’s schedule logged there ticks off', async () => {
    const { app, add } = await open();
    await new ActivityDayView(app).open(TUESDAY);
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    await add.type('elsewhere-search', 'baqara');
    await app.until(() => app.screen.queryByTestId('elsewhere-result-surah-2') != null, 'the surah');
    expect(app.screen.queryByTestId('juz-cell-1')).toBeNull();
    // The juz that hold it, by what of it they hold.
    expect(app.screen.getByTestId('elsewhere-result-juz-1')).toBeTruthy();
    await add.type('elsewhere-search', 'zzz');
    await app.until(() => app.screen.queryByTestId('elsewhere-no-results') != null, 'nothing found');
    await add.type('elsewhere-search', '');
    await app.until(() => app.screen.queryByTestId('juz-cell-1') != null, 'the grid again');

    await press(app, 'juz-cell-1');
    await add.add('revised');
    await app.untilSynced();
    await app.idle(400);
    const logged = await loggedPages(app);
    expect(logged).toEqual(expect.arrayContaining([6, 7, 8, 9, 10]));

    // Those pages are done for the day: Juz 1 has nothing left to choose.
    await add.open();
    await add.choose('revised');
    await app.idle(400);
    expect(app.screen.getByTestId('juz-cell-1').props.accessibilityState.disabled).toBe(true);
    await app.close();
  });

  it('[HOME-2] one quiet row under Today opens today’s journal and shows its note', async () => {
    const { app, home } = await open();
    await app.until(() => app.screen.queryByTestId('today-journal') != null, 'the row');
    expect(text(app, 'today-journal-detail')).toBe('Add a note');
    await press(app, 'today-journal');
    await app.until(() => app.screen.queryByTestId('activity-day-v2') != null, 'today’s journal');
    const log = new DailyLog(app);
    await log.open(TUESDAY);
    await log.add('Kept mixing up the two endings');
    await app.untilSynced();
    await goBack(app);
    await home.ready();
    await app.until(() => text(app, 'today-journal-detail') === 'Kept mixing up the two endings', 'the note on Home');
    await app.close();
  });
});
