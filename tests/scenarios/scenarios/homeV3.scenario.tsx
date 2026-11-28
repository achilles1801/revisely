// Home, version 3, in Revisely Dev (BEHAVIOUR.md HOME-4, HOME-5, CARRY-1; Majd's Nov 26 2026 boards, "perfect build it"):
// Home is today alone, with no Recent sessions, and has one solid button: "Add to today" ends a grey line under the Today
// post's button, and Al-Kahf's Read is an outline. Past sessions stay a tap or two away in Activity.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, readerStack } from '../harness/screens';
import { catchUpWhat, plain } from '../harness/words';
import { OpenApp, Phone } from '../harness/phone';

jest.mock('../../../src/lib/release/homeV3', () => ({
  ...jest.requireActual('../../../src/lib/release/homeV3'),
  homeV3Enabled: () => true,
  useHomeV3: () => true,
}));

// 5 pages a day over pages 1–20 from Monday Nov 2 2026: Monday 1–5, Tuesday 6–10. Friday Nov 6 is a Friday.
const MONDAY = '2026-11-02';

async function account(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow(`${MONDAY} 20:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await app.close();
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  // Home with All activity real: where its past sessions went.
  const app = await phone.open(readerStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

/** Monday's session with its first `n` pages revised. */
async function revise(phone: Phone, at: string, n: number): Promise<void> {
  const { app, home } = await openHome(phone, at);
  const session = await home.startSession();
  await session.swipeThrough(n);
  await session.back();
  await app.untilSynced();
  await app.close();
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current;

/** A button's fill: solid buttons are filled, outlines have a border and no fill (PillButton). */
function solid(app: OpenApp, testID: string): boolean {
  const { StyleSheet } = app.mods.require<typeof import('react-native')>('react-native');
  const style = StyleSheet.flatten(app.screen.getByTestId(testID).props.style) as { backgroundColor?: string };
  return style.backgroundColor != null && style.backgroundColor !== 'transparent';
}

/** The Today post's button and catch-up line, in the order they are drawn (top first). */
const footerOrder = (app: OpenApp) =>
  app.mods.rtl
    .within(app.screen.getByTestId('today-post'))
    .queryAllByTestId(/^today-(cta|carry-over)$/)
    .map((el) => el.props.testID as string);

describe('Home, version 3 (Revisely Dev)', () => {
  it('[HOME-4] Home is today alone; a past session is in All activity and its search, and on its day; Review session opens today’s', async () => {
    const phone = await account();
    await revise(phone, `${MONDAY} 21:00`, 5);

    const { app, home } = await openHome(phone, '2026-11-03 09:00');
    expect(app.screen.queryByTestId('home-recent')).toBeNull();
    expect(app.screen.queryByTestId('today-journal')).toBeNull();
    expect(home.cta()).toBe('Start revision');

    // All activity (Activity's search): Monday's session is in the list, and a search for its surah finds it.
    const monday = app.app.logs.find((l) => l.date === MONDAY);
    expect(monday).toBeDefined();
    const row = `item-revision-${monday!.id}`;
    await app.act(async () => {
      nav(app).navigate('ActivityAll');
    });
    await app.until(() => app.screen.queryByTestId(row) != null, 'Monday’s session in All activity');
    const { fireEvent } = app.mods.rtl;
    await app.act(async () => {
      fireEvent.changeText(app.screen.getByTestId('activity-search'), 'Fatihah');
    });
    await app.until(() => app.screen.queryByTestId(row) != null, 'the search to find it');
    await app.act(async () => {
      fireEvent.changeText(app.screen.getByTestId('activity-search'), 'Mulk');
    });
    await app.until(() => app.screen.queryByTestId(row) == null, 'another surah’s search to leave it out');
    await app.act(async () => {
      nav(app).goBack();
    });
    await home.ready();

    // Its day's page shows it.
    await new ActivityDayView(app).open(MONDAY);
    await app.until(() => app.screen.queryByTestId('activity-block-revised') != null, 'the day’s revision');
    await app.act(async () => {
      nav(app).goBack();
    });
    await home.ready();

    // Today revised whole: Review session (an outline) opens today’s pages, not Monday’s.
    const session = await home.startSession();
    await session.swipeThrough(5);
    await session.back();
    await app.untilSynced();
    await app.until(() => home.cta() === 'Review session', 'Review session');
    expect(solid(app, 'today-cta')).toBe(false);
    expect(await home.openReview()).toEqual([6, 7, 8, 9, 10]);
    await app.close();
  });

  it('[CARRY-1] [HOME-5] yesterday’s pages are a grey line under the one button; a tap on it adds them', async () => {
    const phone = await account();
    await revise(phone, `${MONDAY} 21:00`, 2);

    const { app, home } = await openHome(phone, '2026-11-03 09:00');
    // The line has no "Revise": "Add to today" follows it, in the accent colour, held together.
    expect(plain(home.catchUp())).toBe(`Left yesterday · ${catchUpWhat([3, 4, 5])}`);
    expect(plain(app.screen.getByTestId('today-add').props.children as string)).toBe('Add to today');
    // VoiceOver reads the line, then what a tap does.
    expect(app.screen.getByTestId('today-carry-over').props.accessibilityLabel).toMatch(/^Left yesterday · .+\. Add to today$/);
    // Under the Today post's button, which stays the one solid button.
    expect(footerOrder(app)).toEqual(['today-cta', 'today-carry-over']);
    expect(home.cta()).toBe('Start revision');
    expect(solid(app, 'today-cta')).toBe(true);
    expect(solid(app, 'today-carry-over')).toBe(false);

    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => app.screen.queryByTestId('today-carry-over') == null, 'the line to go');
    expect(home.detail()).toMatch(/3 from yesterday first/);
    const session = await home.startSession();
    expect(session.pages().slice(0, 3)).toEqual([3, 4, 5]);
    await session.back();
    await app.close();
  });

  it('[HOME-5] [KAHF-1] [KAHF-2] on Friday Al-Kahf is one row with no buttons: the Today post’s button is Home’s one solid button', async () => {
    const phone = await account();
    const { app, home } = await openHome(phone, '2026-11-06 10:00');
    await app.until(() => home.kahf() != null, 'the Al-Kahf card');
    expect(solid(app, 'kahf-read')).toBe(false);
    expect(solid(app, 'kahf-mark')).toBe(false);
    expect(solid(app, 'today-cta')).toBe(true);
    await app.close();
  });
});
