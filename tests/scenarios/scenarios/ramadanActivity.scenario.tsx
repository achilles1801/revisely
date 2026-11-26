// The Ramadan theme on the one Activity tab (BEHAVIOUR.md THEME-5, THEME-6; Revisely Dev; Majd's picks of the v2 mocks,
// Nov 26 2026): the real Activity screen and the Ramadan page, against the emulators, on Revisely Dev's test dates
// (Settings → Testing → Ramadan dates). Lanterns and falling light, a star on "Your revision", the Ramadan row first
// (before the month, during it, the last ten nights), the day card's Hijri date, and the Ramadan page's figures.

import type { ReactElement } from 'react';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setNow, setZone, ZONES } from '../harness/clock';
import { Home, activityStack, flatText, homeStack } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

const HIDDEN = { includeHiddenElements: true };
const shows = (app: OpenApp, testID: string, hidden = false) => app.screen.queryByTestId(testID, hidden ? HIDDEN : undefined) != null;
const text = (app: OpenApp, testID: string) => {
  const el = app.screen.queryByTestId(testID);
  return el ? flatText(el).replace(/ /g, ' ') : null;
};

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

/** Revisely Dev's Activity stack, the one tab on. */
function devActivity(mods: Booted): ReactElement {
  mods.require<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  return activityStack(mods);
}

async function openActivity(phone: Phone): Promise<OpenApp> {
  const app = await phone.open(devActivity);
  app.mods.require<{ setActivityOneTabForTests: (on: boolean) => void }>('src/lib/release/activityOneTab').setActivityOneTabForTests(true);
  app.mods.require<{ setJournalDesignReleasedForTests: (on: boolean) => void }>('src/lib/release/journalDesign').setJournalDesignReleasedForTests(true);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const nav = app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
  await app.act(async () => {
    nav.current.navigate('Activity');
  });
  await app.until(() => shows(app, 'activity-blocks-views'), 'Activity');
  return app;
}

/** Juz 30, five pages a day, revised on 2 and 3 November (Chicago), then today, 11 November. */
async function account(): Promise<Phone> {
  setZone(ZONES.chicago);
  setNow('2026-11-01 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.close();
  await markPreviewTester(uid);
  for (const at of ['2026-11-02 09:00', '2026-11-03 09:00']) {
    setNow(at);
    const h = await phone.open(homeStack);
    const session = await new Home(h).startSession();
    await session.swipeThrough(5);
    await session.back();
    await h.untilSynced();
    await h.close();
  }
  setNow('2026-11-11 09:00');
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  return phone;
}

describe('the Ramadan theme on Activity', () => {
  it('[THEME-5] [THEME-6] during the month: lanterns, falling light, a star, the Ramadan row first with a moon a day, the day’s Hijri date, and the month’s page', async () => {
    const phone = await account();
    // Day 12 today (11 November): the 2nd and 3rd are days 3 and 4.
    phone.storage.set('@revisely_ramadan_test:v1', 'day12');
    let app = await openActivity(phone);
    await app.until(() => shows(app, 'ramadan-row'), 'the Ramadan row');
    for (const id of ['ramadan-activity-lanterns', 'ramadan-activity-sky', 'ramadan-star']) {
      const el = app.screen.getByTestId(id, HIDDEN);
      expect(el.props.accessibilityElementsHidden).toBe(true);
    }
    expect(text(app, 'ramadan-row-line')).toBe('Day 12 of Ramadan');
    expect(text(app, 'ramadan-row-figure')).toBe('2 of 12 days');
    expect(shows(app, 'ramadan-moons', true)).toBe(true);
    expect(shows(app, 'ramadan-moons-30', true)).toBe(true);
    // The picked day (today) has its Hijri date.
    expect(text(app, 'preview-hijri')).toBe('12 Ramadan');

    // The month's own page: its figures from the same days.
    await tap(app, 'ramadan-row');
    await app.until(() => shows(app, 'ramadan-page'), 'the Ramadan page');
    await app.until(() => text(app, 'ramadan-page-days') === '2 of 12', 'the days revised');
    expect(text(app, 'ramadan-khatmah')).toContain('10');
    expect(text(app, 'ramadan-page-revised')).toContain('10 pages');
    await app.close();

    // The last ten nights: the row says so.
    phone.storage.set('@revisely_ramadan_test:v1', 'day23');
    app = await openActivity(phone);
    await app.until(() => text(app, 'ramadan-row-line') === 'Day 23 · the last ten nights', 'the last ten nights');
    await app.close();
  });

  it('[THEME-6] before the month the row counts down; with the theme off there is none of it', async () => {
    const phone = await account();
    phone.storage.set('@revisely_ramadan_test:v1', 'before');
    let app = await openActivity(phone);
    await app.until(() => shows(app, 'ramadan-row'), 'the Ramadan row');
    expect(text(app, 'ramadan-row-line')).toBe('Build your Qur’an habit before it begins');
    expect(text(app, 'ramadan-row-figure')).toBe('75 days');
    expect(shows(app, 'ramadan-moons', true)).toBe(false);
    expect(shows(app, 'preview-hijri')).toBe(false);
    await app.close();

    phone.storage.set('@revisely_ramadan_theme:v1', 'off');
    app = await openActivity(phone);
    await app.idle(300);
    for (const id of ['ramadan-row', 'ramadan-activity-lanterns', 'ramadan-activity-sky', 'ramadan-star']) expect(shows(app, id, true)).toBe(false);
    await app.close();
  });
});
