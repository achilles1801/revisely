// Home's today section as a ring, in Revisely Dev (BEHAVIOUR.md HOME-10; Majd, Nov 27 2026, his pick of the Home revision
// boards: "home direction C"). A ring of today's pages, the Today post's two lines without the page count, the one button,
// and the catch-up or the next day as a quiet line, in every state the section meets.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange, saveCustomPlan } from '../harness/account';
import { flatText, Home, homeStack } from '../harness/screens';
import { catchUpWhat, plain } from '../harness/words';
import { OpenApp, Phone } from '../harness/phone';

jest.mock('../../../src/lib/release/homeV3', () => ({
  ...jest.requireActual('../../../src/lib/release/homeV3'),
  homeV3Enabled: () => true,
  useHomeV3: () => true,
}));
jest.mock('../../../src/lib/release/homeRing', () => ({
  ...jest.requireActual('../../../src/lib/release/homeRing'),
  homeRingEnabled: () => true,
}));

// 5 pages a day over pages 1–20 from Monday Nov 2 2026: Monday 1–5, Tuesday 6–10.
const MONDAY = '2026-11-02';
const TUESDAY = '2026-11-03';

/** The ring is a picture (VoiceOver reads the lines), so its parts are hidden from accessibility: ask for them as such. */
const HIDDEN = { includeHiddenElements: true } as const;

function ring(app: OpenApp) {
  const q = (id: string) => app.screen.queryByTestId(id, HIDDEN);
  const text = (id: string) => {
    const el = q(id);
    return el ? plain(flatText(el)) : null;
  };
  return {
    shown: q('today-ring') != null,
    count: text('today-ring-count'),
    label: text('today-ring-label'),
    check: q('today-ring-check') != null,
    dashed: q('today-ring-dashed') != null,
    arc: q('today-ring-arc') != null,
    rest: q('today-ring-rest') != null,
    start: q('today-ring-start') != null,
  };
}

/** A button's fill: solid buttons are filled, outlines have a border and no fill (PillButton). */
function solid(app: OpenApp, testID: string): boolean {
  const { StyleSheet } = app.mods.require<typeof import('react-native')>('react-native');
  const style = StyleSheet.flatten(app.screen.getByTestId(testID).props.style) as { backgroundColor?: string };
  return style.backgroundColor != null && style.backgroundColor !== 'transparent';
}

/** The ring's button and its quiet lines, in the order they are drawn (top first). */
const order = (app: OpenApp) =>
  app.mods.rtl
    .within(app.screen.getByTestId('today-post'))
    .queryAllByTestId(/^today-(ring|summary|cta|carry-over|ahead)$/, HIDDEN)
    .map((el) => el.props.testID as string);

async function account(memorized = pagesRange(1, 20)): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow(`${MONDAY} 20:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized, user: { dailyPageCapacity: 5 } });
  await app.close();
  return phone;
}

async function openHome(phone: Phone, at: string): Promise<{ app: OpenApp; home: Home }> {
  setNow(at);
  const app = await phone.open(homeStack);
  const home = new Home(app);
  await home.ready();
  return { app, home };
}

/** The day's session with its first `n` pages revised. */
async function revise(phone: Phone, at: string, n: number): Promise<void> {
  const { app, home } = await openHome(phone, at);
  const session = await home.startSession();
  await session.swipeThrough(n);
  await session.back();
  await app.untilSynced();
  await app.close();
}

describe('Home as a ring (Revisely Dev)', () => {
  it('[HOME-10] a day not started: the ring holds its count, the lines the post’s without it, Change at the end, one solid button', async () => {
    const phone = await account();
    const { app, home } = await openHome(phone, `${MONDAY} 21:00`);
    expect(ring(app)).toMatchObject({ shown: true, count: '5', label: 'pages today', arc: false, dashed: false });
    expect(plain(home.title())).toBe('Starts at Al-Fatihah');
    // "5 pages · to Al-Baqarah · Juz 1" without the count, which the ring holds.
    expect(plain(home.detail())).toBe('to Al-Baqarah · Juz 1 · Change');
    expect(app.screen.queryByTestId('today-change')).not.toBeNull();
    // Under the ring: the lines, then the one button; no memorized line on the ring.
    expect(order(app)).toEqual(['today-ring', 'today-summary', 'today-cta']);
    expect(home.cta()).toBe('Start revision');
    expect(solid(app, 'today-cta')).toBe(true);
    expect(app.screen.queryByTestId('today-memorized')).toBeNull();
    // VoiceOver reads the lines, with the count, not the ring.
    expect(app.screen.getByTestId('today-summary').props.accessibilityLabel).toMatch(/^Starts at Al-Fatihah\. 5 pages/);
    await app.close();
  });

  it('[HOME-10] part done: the ring fills, "Continue at …" with the day’s juz, and Continue revision', async () => {
    const phone = await account();
    await revise(phone, `${MONDAY} 21:00`, 2);
    const { app, home } = await openHome(phone, `${MONDAY} 21:30`);
    expect(ring(app)).toMatchObject({ count: '2', label: 'of 5 pages', arc: true, check: false });
    expect(plain(home.title())).toMatch(/^Continue at /);
    expect(plain(home.detail())).toBe('Juz 1 · Change');
    expect(home.cta()).toBe('Continue revision');
    await app.close();
  });

  it('[HOME-10] done: a full ring with a check, "Done for today", Review session (outline), then where tomorrow starts', async () => {
    const phone = await account();
    await revise(phone, `${MONDAY} 21:00`, 5);
    const { app, home } = await openHome(phone, `${MONDAY} 21:30`);
    expect(ring(app)).toMatchObject({ check: true, arc: true, label: '5 pages', count: null });
    expect(home.title()).toBe('Done for today');
    expect(app.screen.queryByTestId('today-change')).toBeNull();
    expect(home.cta()).toBe('Review session');
    expect(solid(app, 'today-cta')).toBe(false);
    expect(home.ahead()).toMatch(/^Tomorrow starts at /);
    expect(order(app)).toEqual(['today-ring', 'today-summary', 'today-cta', 'today-ahead']);
    await app.close();
  });

  it('[HOME-10] [CARRY-1] yesterday’s pages are a quiet line under the button; a tap adds them and the line says so', async () => {
    const phone = await account();
    await revise(phone, `${MONDAY} 21:00`, 2);
    const { app, home } = await openHome(phone, `${TUESDAY} 09:00`);
    expect(plain(home.catchUp())).toBe(`Left yesterday · ${catchUpWhat([3, 4, 5])}`);
    expect(order(app)).toEqual(['today-ring', 'today-summary', 'today-cta', 'today-carry-over']);
    expect(solid(app, 'today-cta')).toBe(true);
    expect(solid(app, 'today-carry-over')).toBe(false);

    await home.tap('today-carry-over');
    await app.untilSynced();
    await app.until(() => app.screen.queryByTestId('today-carry-over') == null, 'the line to go');
    // Today starts at the added pages, which the line says come first; the ring still counts the day's amount (Keep daily
    // amount: they take the place of the day's last pages).
    await app.until(() => plain(home.detail()) === '3 from yesterday first · Change', 'the line to say they come first');
    expect(plain(home.title())).toBe('Starts at Al-Baqarah, 2nd page');
    expect(ring(app).count).toBe('5');
    await app.close();
  });

  it('[HOME-10] [HOME-9] a rest day: a dashed ring with “Rest”, where tomorrow starts, and Revise ahead (an outline)', async () => {
    setZone(ZONES.chicago);
    setNow('2026-11-27 11:58');
    const phone = new Phone();
    const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
    await saveCustomPlan(first, [[], pagesRange(1, 5), pagesRange(6, 10), pagesRange(11, 20)]);
    await first.close();
    const { app, home } = await openHome(phone, '2026-11-27 12:00');
    await app.until(() => home.title() === 'Rest day', 'the rest day');
    expect(ring(app)).toMatchObject({ dashed: true, rest: true, label: 'Rest', arc: false });
    expect(home.detail()).toMatch(/^Tomorrow starts at /);
    expect(app.screen.queryByTestId('today-change')).toBeNull();
    expect(home.cta()).toBe('Revise ahead');
    expect(solid(app, 'today-cta')).toBe(false);
    expect(home.ahead()).toBeNull();
    await app.close();
  });

  it('[HOME-10] [USER-1] nothing memorized: a dashed ring with “Start here” and Mark memorized pages', async () => {
    const phone = await account([]);
    const { app, home } = await openHome(phone, `${MONDAY} 21:00`);
    expect(ring(app)).toMatchObject({ dashed: true, start: true, label: 'Start here' });
    expect(home.title()).toBe('Nothing to revise yet');
    expect(home.cta()).toBe('Mark memorized pages');
    expect(solid(app, 'today-cta')).toBe(true);
    await app.close();
  });
});
