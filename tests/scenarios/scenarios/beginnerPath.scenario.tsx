// The beginner path in Revisely Dev (BEHAVIOUR.md PATH-1, BEGIN-1 to BEGIN-5; Majd, Nov 28 2026: "build C then A -- just
// make sure there's literally no regression anywhere and this whole new "path" is treated completely independent of the
// normal current existing path"). Setup's "None yet, or a few surahs" leads to the beginner's own setup and Home; today's
// answers, and every account set up before, stay on today's path, exactly as they were.

import type { ReactElement } from 'react';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { createAccountPartWay, memorizedOnServer } from '../harness/admin';
import { getServerDoc, listServerDocs } from '../harness/serverDocs';
import { installQuranEnc, resetQuranEnc, serveWhole } from '../harness/quranenc';
import { Home, Onboarding, flatText, onboardingFlow } from '../harness/screens';
import { Phone, type Booted, type OpenApp, ramadanIntroSeen, revoMomentSeen } from '../harness/phone';

// Revisely Dev's Home: v3 with the ring, which the beginner's Home is drawn with. The beginner path's switch can be turned
// off, as the store app has it.
let mockBeginnerPath = true;
jest.mock('../../../src/lib/release/homeV3', () => ({
  ...jest.requireActual('../../../src/lib/release/homeV3'),
  homeV3Enabled: () => true,
  useHomeV3: () => true,
}));
jest.mock('../../../src/lib/release/homeRing', () => ({
  ...jest.requireActual('../../../src/lib/release/homeRing'),
  homeRingEnabled: () => true,
}));
jest.mock('../../../src/lib/release/beginnerPath', () => ({
  ...jest.requireActual('../../../src/lib/release/beginnerPath'),
  beginnerPathEnabled: () => mockBeginnerPath,
}));

beforeAll(() => installQuranEnc());
beforeEach(() => {
  mockBeginnerPath = true;
  resetQuranEnc();
});

// A Thursday: no Al-Kahf post under today.
const DAY = '2026-11-19';
const newEmail = () => `beginner-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;

/** Home with Your surahs behind it, as Revisely Dev. */
function devHome(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  req<{ default: { expoConfig: { extra: Record<string, unknown> } } }>('expo-constants').default.expoConfig.extra.variant = 'dev';
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Elsewhere = () => null;
  return h(
    ReadingTimerProvider,
    null,
    h(
      NavigationContainer,
      { ref: (r: unknown) => (nav.navigation.current = r) },
      h(
        Stack.Navigator,
        { screenOptions: { headerShown: false, animation: 'none' } },
        h(Stack.Screen, { name: 'Dashboard', component: req<any>('src/screens/main/DashboardScreen').default }),
        h(Stack.Screen, { name: 'YourSurahs', component: req<any>('src/screens/main/YourSurahsScreen').default }),
        h(Stack.Screen, { name: 'LearnSurah', component: req<any>('src/screens/main/LearnSurahScreen').default }),
        ...['ActiveRevision', 'Settings', 'Activity', 'ActivityDay', 'PlanEdit', 'PlanDayEdit', 'Memorization', 'ActivityAll', 'Insights', 'QuranReader'].map(
          (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
        ),
      ),
    ),
  );
}

// The ring is a picture to VoiceOver (HOME-10): its figures are looked for among hidden elements too.
const HIDDEN = { includeHiddenElements: true };
const has = (app: OpenApp, testID: string) => app.screen.queryByTestId(testID, HIDDEN) != null;
const text = (app: OpenApp, testID: string) => {
  const el = app.screen.queryByTestId(testID, HIDDEN);
  return el ? flatText(el).replace(/[ ‑]/g, (c) => (c === ' ' ? ' ' : '-')) : null;
};

async function tap(app: OpenApp, testID: string): Promise<void> {
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    app.mods.rtl.fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

const route = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current.getCurrentRoute();

/** A new account through the real setup, from the welcome, with today's answers or the beginner's. */
async function setUp(how: { beginner: number[] } | 'part'): Promise<{ phone: Phone; app: OpenApp; email: string }> {
  setZone(ZONES.london);
  setNow(`${DAY} 08:00`);
  const email = newEmail();
  createAccountPartWay(email, 'scenario-password', 604);
  const phone = new Phone('phone');
  const app = await phone.open(onboardingFlow);
  await app.act(() => app.auth.signIn(email, 'scenario-password'));
  await app.until(() => app.app.pages.length === 604, 'the pages');
  const flow = new Onboarding(app);
  await flow.press('welcome-begin');
  await flow.reach('journey-select');
  if (how === 'part') {
    await flow.press('journey-part');
    await flow.reach('juz-selection');
    await app.until(() => flow.summary() === '1 page chosen', 'Al-Fatihah to start chosen');
    await flow.press('juz-continue');
    await flow.reach('daily-amount');
    await flow.press('amount-continue');
  } else {
    await flow.press('journey-beginner');
    await flow.reach('beginner-surahs');
    for (const sura of how.beginner) await flow.press(`beginner-surah-${sura}`);
    await flow.press('beginner-surahs-continue');
  }
  await flow.reach('day-start');
  await flow.press('day-midnight');
  await flow.reach('reminder');
  await flow.press('reminder-off');
  await app.until(() => app.app.onboardingComplete, 'onboarding to complete');
  await app.untilSynced();
  revoMomentSeen(phone, app.uid);
  ramadanIntroSeen(phone);
  return { phone, app, email };
}

/** An account made as the app makes one, with these pages memorized, on the beginner path or not. */
async function account(memorized: number[], beginner: boolean): Promise<Phone> {
  setZone(ZONES.london);
  setNow(`${DAY} 08:00`);
  const phone = new Phone();
  const app = await newAccount(phone, { memorized, user: { dailyPageCapacity: 10, ...(beginner ? { path: 'beginner' as const } : {}) } });
  const uid = app.uid;
  await app.untilSynced();
  await app.close();
  revoMomentSeen(phone, uid);
  ramadanIntroSeen(phone);
  return phone;
}

async function openHome(phone: Phone): Promise<OpenApp> {
  setNow(`${DAY} 10:00`);
  const app = await phone.open(devHome);
  await new Home(app).ready();
  return app;
}

/** Today's path's Home, as every account set up before the beginner path sees it. */
function expectTodaysHome(app: OpenApp): void {
  expect(has(app, 'beginner-mark')).toBe(false);
  expect(has(app, 'beginner-add')).toBe(false);
  expect(has(app, 'learn-next')).toBe(false);
  expect(text(app, 'today-detail')).not.toMatch(/about \d+ min/);
  expect(has(app, 'home-ayah-translation')).toBe(false);
}

describe('the beginner path (Revisely Dev)', () => {
  it('[PATH-1] [BEGIN-1] setup’s third answer: the short surahs (none is fine), the day’s start, the reminder; it saves the surahs by the ayah, 10 pages a day and the path', async () => {
    // Set up with none ticked first; a second account ticks three.
    const { app, email } = await setUp({ beginner: [] });
    expect(app.app.user).toMatchObject({ path: 'beginner', dailyPageCapacity: 10, scheduleMode: 'pages' });
    expect(app.app.pages.filter((p) => p.status !== 'not_memorized')).toEqual([]);
    expect((await getServerDoc(`users/${app.uid}`))?.path).toBe('beginner');
    expect(memorizedOnServer(email)).toEqual([]);
    await app.close();

    // Three surahs ticked: Al-Fatihah's page memorized, An-Nas and Al-Falaq by their ayahs on the last page (MEM-1).
    const second = await setUp({ beginner: [1, 114, 113] });
    const last = second.app.app.pages.find((p) => p.pageNumber === 604)!;
    expect(second.app.app.pages.find((p) => p.pageNumber === 1)?.status).toBe('memorized');
    expect(last.status).toBe('in_progress');
    expect(last.verses).toEqual([...[1, 2, 3, 4, 5].map((a) => 113000 + a), ...[1, 2, 3, 4, 5, 6].map((a) => 114000 + a)]);
    // Setup's surahs are known from before: nothing is logged on today.
    expect(await listServerDocs(`users/${second.app.uid}/memorizations`)).toEqual([]);
    await second.app.close();
  });

  it('[BEGIN-1] the beginner’s questions: three answers first, none chosen still goes on, then four steps in all', async () => {
    setZone(ZONES.london);
    setNow(`${DAY} 08:00`);
    const email = newEmail();
    createAccountPartWay(email, 'scenario-password', 604);
    const phone = new Phone('phone');
    const app = await phone.open(onboardingFlow);
    await app.act(() => app.auth.signIn(email, 'scenario-password'));
    await app.until(() => app.app.pages.length === 604, 'the pages');
    const flow = new Onboarding(app);
    await flow.press('welcome-begin');
    await flow.reach('journey-select');
    // One answer a path: the beginner's first, today's two under it.
    expect(['journey-beginner', 'journey-part', 'journey-all'].map((id) => has(app, id))).toEqual([true, true, true]);
    expect(text(app, 'journey-beginner')).toContain('None yet, or a few surahs');
    await flow.press('journey-beginner');
    await flow.reach('beginner-surahs');
    // The path's 38 surahs, Al-Fatihah then An-Nas back to An-Naba; four steps.
    expect(has(app, 'beginner-surah-1') && has(app, 'beginner-surah-114') && has(app, 'beginner-surah-78')).toBe(true);
    expect(has(app, 'beginner-surah-77')).toBe(false);
    const steps = app.mods.rtl.within(app.screen.getByTestId('beginner-surahs'));
    expect([steps.queryByTestId('step-4') != null, steps.queryByTestId('step-5') != null]).toEqual([true, false]);
    expect(text(app, 'beginner-surahs-summary')).toBe('None yet? That’s fine. You’ll start with Al-Fatihah.');
    expect(app.screen.getByTestId('beginner-surahs-continue').props.accessibilityState?.disabled).not.toBe(true);
    await flow.press('beginner-surah-112');
    expect(text(app, 'beginner-surahs-summary')).toBe('1 surah chosen');
    await flow.press('beginner-surah-112');
    // "Choose by juz" is today's juz grid: today's path.
    await flow.press('beginner-by-juz');
    await flow.reach('juz-selection');
    await app.close();
  });

  it('[PATH-1] today’s answers in Revisely Dev: no path is saved, and Home is today’s', async () => {
    const { phone, app } = await setUp('part');
    expect(app.app.user?.path).toBeUndefined();
    const doc = await getServerDoc(`users/${app.uid}`);
    expect(doc && 'path' in doc).toBe(false);
    await app.close();
    const home = await openHome(phone);
    expectTodaysHome(home);
    expect(text(home, 'today-title')).toBe('Starts at Al-Fatihah');
    await home.close();
  });

  it('[PATH-1] an account set up before the beginner path is never on it: today’s Home, ayah and help', async () => {
    const phone = await account(pagesRange(582, 604), false);
    const app = await openHome(phone);
    const { pathOf } = app.mods.require<typeof import('../../../src/lib/paths')>('src/lib/paths');
    expect(pathOf(app.app.user)).toBe('middle');
    expectTodaysHome(app);
    expect(text(app, 'today-title')).toMatch(/^Starts at /);
    await app.close();
  });

  it('[PATH-1] with the switch off (the store app), a beginner’s account is on today’s path', async () => {
    const phone = await account([], true);
    mockBeginnerPath = false;
    const app = await openHome(phone);
    expect(text(app, 'today-title')).toBe('Nothing to revise yet');
    expect(has(app, 'beginner-mark')).toBe(false);
    await app.close();
  });

  it('[PATH-1] setting up again with today’s answers takes a beginner off the path', async () => {
    const phone = await account([], true);
    const app = await phone.open(onboardingFlow);
    await app.untilLoaded();
    expect(app.app.user?.path).toBe('beginner');
    const flow = new Onboarding(app);
    await flow.press('welcome-begin');
    await flow.reach('journey-select');
    await flow.press('journey-part');
    await flow.reach('juz-selection');
    await app.until(() => flow.continueEnabled(), 'Continue');
    await flow.press('juz-continue');
    await flow.reach('daily-amount');
    await flow.press('amount-continue');
    await flow.reach('day-start');
    await flow.press('day-midnight');
    await flow.reach('reminder');
    await flow.press('reminder-off');
    await app.until(() => app.app.user?.path === undefined, 'the path to go');
    await app.untilSynced();
    expect((await getServerDoc(`users/${app.uid}`))?.path).toBeNull();
    await app.close();
  });

  it('[BEGIN-2] a beginner with nothing memorized: Start with Al-Fatihah, Learn Al-Fatihah, Mark them', async () => {
    const phone = await account([], true);
    const app = await openHome(phone);
    expect(text(app, 'today-title')).toBe('Start with Al-Fatihah');
    expect(text(app, 'today-detail')).toBe('Listen to it ayah by ayah, with its meaning. Mark it once you know it.');
    expect(text(app, 'today-cta')).toBe('Learn Al-Fatihah');
    expect(has(app, 'today-ring-start')).toBe(true);
    expect(app.screen.queryByText('Mark memorized pages')).toBeNull();
    expect(text(app, 'beginner-mark')).toBe('Know some surahs already? Mark them');
    // The start is Learn itself: no Learn next under it (BEGIN-6).
    expect(has(app, 'learn-next')).toBe(false);

    await tap(app, 'today-cta');
    await app.until(() => route(app)?.name === 'LearnSurah', 'Learn');
    expect(route(app).params).toEqual({ sura: 1 });
    await app.act(async () => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation.current.goBack());
    await tap(app, 'beginner-mark');
    await app.until(() => has(app, 'your-surahs'), 'Your surahs');
    await app.close();
  });

  it('[BEGIN-3] a beginner with surahs: today’s ring with about how long it takes, and Learned another surah? Add it', async () => {
    // Al-Fatihah's page (half a page of text) and the last page: about 3 minutes.
    const phone = await account([1, 604], true);
    const app = await openHome(phone);
    expect(text(app, 'today-ring-count')).toBe('2');
    expect(text(app, 'today-title')).toBe('Starts at Al-Fatihah');
    expect(text(app, 'today-detail')).toMatch(/about 3 min · Change$/);
    expect(text(app, 'beginner-add')).toBe('Learned another surah? Add it');
    await tap(app, 'beginner-add');
    await app.until(() => has(app, 'your-surahs'), 'Your surahs');
    await app.close();
  });

  it('[BEGIN-4] a beginner’s ayah keeps Saheeh International’s English under the Arabic', async () => {
    serveWhole('english_saheeh');
    const phone = await account([1], true);
    const app = await openHome(phone);
    const { ayahForDay } = app.mods.require<typeof import('../../../src/lib/homeAyah')>('src/lib/homeAyah');
    const { sura, ayah } = ayahForDay(DAY);
    await app.until(() => has(app, 'home-ayah-translation'), 'its English');
    expect(text(app, 'home-ayah-translation')).toBe(`english_saheeh ${sura}:${ayah}`);
    expect(text(app, 'home-ayah-reference')).toMatch(new RegExp(`${sura}:${ayah} · Saheeh International$`));
    await app.close();
  });

  it('[BEGIN-5] Your surahs: the memorized ticked and fixed; Save asks when, and Today memorizes them by the ayah and logs them', async () => {
    const phone = await account([1], true);
    const app = await openHome(phone);
    await tap(app, 'beginner-add');
    await app.until(() => has(app, 'your-surahs'), 'Your surahs');
    // Al-Fatihah is memorized: ticked, not tappable.
    expect(app.screen.getByTestId('your-surah-1').props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    expect(has(app, 'your-surahs-save')).toBe(false);
    await tap(app, 'your-surah-112');
    await tap(app, 'your-surah-114');
    expect(text(app, 'your-surahs-save')).toBe('Save 2 surahs');

    const { Alert } = app.mods.require<typeof import('react-native')>('react-native');
    let asked: string[] = [];
    (Alert as { alert: unknown }).alert = (title: string, _m?: string, buttons?: { text?: string; onPress?: () => void }[]) => {
      if (title !== 'When did you memorize these?') return;
      asked = (buttons ?? []).map((b) => b.text ?? '');
      buttons?.find((b) => b.text === 'Today')?.onPress?.();
    };
    await tap(app, 'your-surahs-save');
    await app.until(() => route(app)?.name === 'Dashboard', 'back on Home');
    await app.untilSynced();
    expect(asked).toEqual(['Today', "Before (don't log)", 'Cancel']);
    const last = app.app.pages.find((p) => p.pageNumber === 604)!;
    expect(last.status).toBe('in_progress');
    expect(last.verses).toEqual([...[1, 2, 3, 4].map((a) => 112000 + a), ...[1, 2, 3, 4, 5, 6].map((a) => 114000 + a)]);
    // Logged on today, by those ayahs.
    const items = await listServerDocs(`users/${app.uid}/memorizations`);
    expect(items.map((i) => [i.id, i.pages, i.verses])).toEqual([[DAY, [604], last.verses]]);
    // Home names the last page by its memorized ayahs (MEM-4) and offers its time.
    await app.until(() => /about \d+ min/.test(text(app, 'today-detail') ?? ''), 'Home with the new surahs');
    await app.close();
  });

  it('[BEGIN-6] Learn next: the next surah on the path, its ayahs and how far along, opening Learn on it', async () => {
    const phone = await account([1], true);
    const app = await openHome(phone);
    await app.until(() => has(app, 'learn-next'), 'Learn next');
    expect(text(app, 'learn-next-name')).toBe('An-Nas');
    expect(text(app, 'learn-next-meta')).toBe('Learn next · 6 ayahs');
    expect(text(app, 'learn-next-learned')).toBe('1 of 38 learned');
    await tap(app, 'learn-next-cta');
    await app.until(() => route(app)?.name === 'LearnSurah', 'Learn');
    expect(route(app).params).toEqual({ sura: 114 });
    await app.close();
  });

  it('[BEGIN-7] [BEGIN-8] Learn: an ayah at a time with its meaning, the three steps; I can recite it memorizes it, logs it, and names the next', async () => {
    serveWhole('english_saheeh');
    const phone = await account([1], true);
    const app = await openHome(phone);
    // The app's own Qur'an text, as the phone reads it from its asset.
    const fixture = jest.requireActual<typeof import('../../../src/lib/recite/__fixtures__/quranWords')>('../../../src/lib/recite/__fixtures__/quranWords');
    app.mods.require<typeof import('../../../src/lib/recite/quranWords')>('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
    await tap(app, 'learn-next-cta');
    await app.until(() => has(app, 'learn-arabic'), 'An-Nas’s first ayah');
    expect(text(app, 'learn-hint')).toBe('Ayah 1 of 6 · Hear it three times, slowly.');
    expect(text(app, 'learn-arabic')).toMatch(/^قُلْ أَعُوذُ/);
    await app.until(() => has(app, 'learn-meaning'), 'its meaning');
    expect(text(app, 'learn-meaning')).toBe('english_saheeh 114:1');
    expect(text(app, 'learn-credit')).toBe('Saheeh International');
    expect(text(app, 'learn-voice')).toMatch(/Mu'allim, slowly, three times each$/);
    // The rest of the surah below, a tap going to it.
    await tap(app, 'learn-ayah-3');
    expect(text(app, 'learn-hint')).toBe('Ayah 3 of 6 · Hear it three times, slowly.');
    await tap(app, 'learn-next-ayah');
    expect(text(app, 'learn-hint')).toMatch(/^Ayah 4 of 6/);
    await tap(app, 'learn-step-repeat');
    expect(text(app, 'learn-hint')).toBe('Ayah 4 of 6 · Say it after the reciter: a pause follows each time.');
    // Without looking: hidden until shown.
    await tap(app, 'learn-step-recall');
    expect(has(app, 'learn-arabic')).toBe(false);
    await tap(app, 'learn-show');
    expect(has(app, 'learn-arabic')).toBe(true);

    await tap(app, 'learn-recite');
    await app.until(() => has(app, 'learn-learned'), 'Learned');
    await app.untilSynced();
    expect(text(app, 'learn-learned-title')).toBe('An-Nas is memorized');
    expect(text(app, 'learn-learned-body')).toBe('It’s part of your revision now. You know 2 surahs.');
    expect(text(app, 'learn-learned-path')).toBe('2 of 38 learned');
    expect(text(app, 'learn-learned-next-name')).toBe('Al-Falaq · 5 ayahs');
    const last = app.app.pages.find((p) => p.pageNumber === 604)!;
    expect(last.verses).toEqual([1, 2, 3, 4, 5, 6].map((a) => 114000 + a));
    // Logged on today by its ayahs, as Your surahs' Today does.
    const items = await listServerDocs(`users/${app.uid}/memorizations`);
    expect(items.map((i) => [i.id, i.verses])).toEqual([[DAY, last.verses]]);

    // Done: Home, where Learn next has moved on.
    await tap(app, 'learn-done');
    await app.until(() => route(app)?.name === 'Dashboard', 'Home');
    await app.until(() => text(app, 'learn-next-name') === 'Al-Falaq', 'Learn next on Al-Falaq');
    expect(text(app, 'learn-next-learned')).toBe('2 of 38 learned');
    await app.close();
  });
});
