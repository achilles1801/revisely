// The app's own screens inside a scenario: Home (DashboardScreen) and the
// revision session (ActiveRevisionScreen) in a real React Navigation stack, the
// way MainNavigator's Home stack holds them. Taps go through the screens'
// handlers; the session's pages come from the pager stand-in (harness/pager).

import type { ReactElement } from 'react';
import type { Booted, OpenApp } from './phone';
import { pagerState } from './pager';

/** The pages every scenario account holds (TOTAL_QURAN_PAGES). */
const TOTAL_PAGES = 604;

type ModalMock = { default: unknown; refusedModals: () => string[] };

/**
 * A tap on the screen under the sheets fails while a modal iOS refused is mounted (harness/modal):
 * on a phone its invisible host covers the screen and every touch is lost (SHEET-1). Taps inside a
 * sheet that is showing go to that sheet, as on a phone.
 */
export function assertTouchable(app: OpenApp, el: unknown, what: string): void {
  const mock = app.mods.require<ModalMock>('react-native/Libraries/Modal/Modal');
  const covered = mock.refusedModals();
  if (covered.length === 0) return;
  for (let node = el as { type?: unknown; parent?: unknown } | null; node; node = node.parent as typeof node) {
    if (node.type === mock.default) return;
  }
  throw new Error(
    `"${what}" got no tap: iOS refused to show ${covered.join(', ')} over another sheet, and its invisible host covers the screen, taking every touch (SHEET-1)`,
  );
}

function resetPager() {
  const s = pagerState();
  s.props = null;
  s.current = null;
}

/** Pass to Phone.open: the app opens on Home. */
export function homeStack(mods: Booted): ReactElement {
  return homeStackWith(mods, {});
}

/**
 * Home's stack with the app's own navigation ref too, as RootNavigator holds it: code that asks
 * which screen shows (lib/updates/busy: the update sheets open only on a tab's main screen) sees
 * Home. The other stacks leave it unset, so nothing there navigates the app's way.
 */
export function homeStackLive(mods: Booted): ReactElement {
  return homeStackWith(mods, {}, true);
}

/** Home's stack with the Activity screen real (Overview and Insights), the rest of "elsewhere" empty. */
export function activityStack(mods: Booted): ReactElement {
  return homeStackWith(mods, {
    Activity: mods.require<any>('src/screens/activity/ActivityScreen').default,
    LastRevised: mods.require<any>('src/screens/activity/LastRevisedScreen').default,
    // A section's own page on the one Activity tab (ACT-35).
    ActivitySection: mods.require<any>('src/screens/activity/ActivitySectionScreen').default,
    // Its full calendar, from "Month ›" over this week (ACT-35).
    ActivityMonth: mods.require<any>('src/screens/activity/ActivityMonthScreen').default,
  });
}

/** Home's stack with the reader and All activity real (the reader's pager is harness/pager), the rest of "elsewhere" empty. */
export function readerStack(mods: Booted): ReactElement {
  return homeStackWith(mods, {
    QuranReader: mods.require<any>('src/screens/read/QuranReaderScreen').default,
    ActivityAll: mods.require<any>('src/screens/activity/ActivityAllScreen').default,
  });
}

function homeStackWith(mods: Booted, real: Record<string, unknown>, appRef = false): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const Manager = req<any>('src/screens/main/MemorizationScreen').default;
  const ActivityDayScreen = req<any>('src/screens/activity/ActivityDayScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const app = appRef ? req<{ navigationRef: { current: unknown } }>('src/navigation/navigationRef').navigationRef : null;
  const ref = (r: unknown) => {
    nav.navigation.current = r;
    if (app) app.current = r;
  };
  const { ReadingTimerProvider } = req<any>('src/context/ReadingTimerContext');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  // Screens Home can open that aren't under test render nothing.
  const Elsewhere = () => null;
  return h(
    ReadingTimerProvider,
    null,
    h(
    NavigationContainer,
    { ref },
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
      h(Stack.Screen, { name: 'ActiveRevision', component: Session }),
      h(Stack.Screen, { name: 'Memorization', component: Manager }),
      h(Stack.Screen, { name: 'ActivityDay', component: ActivityDayScreen }),
      ...['Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'Insights', 'QuranReader', 'LastRevised', 'ActivitySection', 'ActivityMonth'].map(
        (name) => h(Stack.Screen, { key: name, name, component: real[name] ?? Elsewhere }),
      ),
    ),
    ),
  );
}

/** Pass to Phone.open: the app opens on onboarding's "Which juz?" (Part of it). */
export function onboardingStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const JuzSelection = req<any>('src/screens/onboarding/JuzSelectionScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const DailyAmount = () => null;
  return h(
    NavigationContainer,
    { ref: nav.navigation },
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'JuzSelection', component: JuzSelection, initialParams: { journeyStage: 'in_progress' } }),
      h(Stack.Screen, { name: 'DailyAmount', component: DailyAmount }),
    ),
  );
}

/** Pass to Phone.open: the whole of onboarding, from the welcome. */
export function onboardingFlow(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { OnboardingNavigator } = req<any>('src/navigation/OnboardingNavigator');
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  return React.createElement(NavigationContainer, { ref: nav.navigation }, React.createElement(OnboardingNavigator));
}

/** Pass to Phone.open: Settings with Preview onboarding open over it (ONBOARD-5). */
export function onboardingPreviewStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const { View } = req<any>('react-native');
  const Preview = req<any>('src/screens/onboarding/OnboardingPreviewScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Settings = () => h(View, { testID: 'settings-stub' });
  return h(
    NavigationContainer,
    { ref: nav.navigation, initialState: { index: 1, routes: [{ name: 'Settings' }, { name: 'OnboardingPreview' }] } },
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'Settings', component: Settings }),
      h(Stack.Screen, { name: 'OnboardingPreview', component: Preview }),
    ),
  );
}

/** Onboarding's questions, read and driven through their own elements. */
export class Onboarding {
  constructor(private readonly app: OpenApp) {}

  /** What's chosen, at the foot: "Al-Fatihah and Juz 30 chosen" (without its no-break characters). */
  summary(): string {
    const el = this.app.screen.queryByTestId('juz-selection-summary');
    return el ? flatText(el).replace(/\u2011/g, '-').replace(/\u00a0/g, ' ') : '';
  }

  continueEnabled(): boolean {
    const el = this.app.screen.queryByTestId('juz-continue');
    return !!el && el.props.accessibilityState?.disabled !== true;
  }

  /** A tap on a juz in the grid. */
  async tapJuz(juz: number): Promise<void> {
    await this.press(`juz-cell-${juz}`);
  }

  /** A tap on anything in the flow, by its testID. */
  async press(testID: string): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId(testID));
    });
  }

  /** Until a question's screen is up. */
  async reach(testID: string): Promise<void> {
    await this.app.until(() => this.app.screen.queryByTestId(testID) != null, `onboarding's ${testID}`);
  }

  async continue(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('juz-continue'));
    });
  }
}

/** What Home shows, read from its own elements (testIDs in components/home/feed/TodayPost). */
export class Home {
  constructor(private readonly app: OpenApp) {}

  private text(testID: string): string | null {
    const { queryByTestId } = this.app.screen;
    const el = queryByTestId(testID);
    if (!el) return null;
    return flatText(el);
  }

  async ready(): Promise<void> {
    await this.app.until(() => this.app.screen.queryByTestId('today-post') != null, 'Home to show the Today post');
  }

  /** The Today post as one line of text. */
  today(): string {
    return this.text('today-post') ?? '';
  }

  /** Where today starts, without the "Change" after it (HOME-3: it opens Jump to). */
  title(): string | null {
    const text = this.text('today-title');
    return text == null ? null : text.replace(/\s*Change$/, '');
  }

  detail(): string | null {
    return this.text('today-detail');
  }

  /** "Tomorrow starts at …" (or "Thu starts at …") once today is done; null otherwise. */
  ahead(): string | null {
    return this.text('today-ahead');
  }

  /** The button that adds the catch-up pages to today ("Add to today"). */
  carryOver(): string | null {
    return this.text('today-carry-over');
  }

  /** The catch-up line above it: "Missed yesterday · Revise Al-Fatihah to Al-Baqarah" (harness/words catchUpWhat). */
  catchUp(): string | null {
    return this.text('today-catch-up');
  }

  /** The Today post's button: Start, Continue, Review session… */
  cta(): string | null {
    return this.text('today-cta');
  }

  /** Friday's Al-Kahf card as one line of text, or null when Home doesn't show it (KAHF-1). */
  kahf(): string | null {
    return this.text('kahf-post');
  }

  /** The memorized line under it: "3.4% of the Quran memorized" (MEM-2). */
  memorized(): string | null {
    return this.text('today-memorized');
  }

  /**
   * The streak beside "Today" ("Today · 8-day streak"): its days (0 when none
   * shows), and whether it is in grace (SESS-6: the ring for yesterday's missed
   * pages beside it), with the ring's label ("60 percent revised").
   */
  streak(): { days: number; grace: boolean; ring: string | null } {
    const m = /Today · (\d+)-day streak/.exec(this.today());
    const post = this.app.screen.queryByTestId('today-post');
    const { within } = this.app.mods.rtl;
    const ring = post ? within(post).queryByLabelText(/percent revised$/) : null;
    return { days: m ? Number(m[1]) : 0, grace: ring != null, ring: ring ? (ring.props.accessibilityLabel as string) : null };
  }

  /** Waits for the streak to read `days` (and `grace`): it loads from the Activity items after Home shows. */
  async untilStreak(days: number, grace = false): Promise<void> {
    await this.app.until(
      () => {
        const s = this.streak();
        return s.days === days && s.grace === grace;
      },
      `the streak to read ${days} days${grace ? ' (grace)' : ''}; it reads ${JSON.stringify(this.streak())} ("${this.today()}")`,
      20_000,
    );
  }

  /** The recent sessions under Today, each row as one line of text, newest first. */
  recent(): string[] {
    const list = this.app.screen.queryByTestId('home-recent');
    if (!list) return [];
    const { within } = this.app.mods.rtl;
    return within(list)
      .queryAllByTestId(/^item-revision-(?!.*-menu$)/)
      .map((r) => flatText(r));
  }

  async tap(testID: string): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const el = this.app.screen.getByTestId(testID);
    assertTouchable(this.app, el, testID);
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    await this.app.idle(50);
  }

  /**
   * Jump to: today's line ("Change", HOME-3), then a row of the sheet (`rowTestID`, e.g.
   * "jump-juz-28"), then "Start today at …".
   */
  async jumpTo(rowTestID: string): Promise<void> {
    await this.tap('today-summary');
    await this.app.until(() => this.app.screen.queryByTestId('jump-go') != null, 'the Jump to… sheet');
    await this.tap(rowTestID);
    await this.tap('jump-go');
    await this.app.untilSynced();
  }

  /** Opens today's session (the Today post's button). */
  async startSession(): Promise<Session> {
    return this.open('today-cta');
  }

  /** "Tomorrow starts at …": opens the session on the next day's pages. */
  async openAhead(): Promise<Session> {
    return this.open('today-ahead');
  }

  /** Review session (the Today post's button once the day is done): the pages it holds, in order. */
  async openReview(): Promise<number[]> {
    resetPager();
    await this.tap('today-cta');
    await this.app.until(() => this.app.screen.queryByTestId('edit-session') != null, 'the review to open');
    return [...(pagerState().props?.pages ?? [])];
  }

  /**
   * Taps a button that opens the session, and waits for it. A snapshot that
   * lands between finding the button and pressing it (the server's copy of a
   * change just saved) can draw Home again, and the press then reaches a button
   * that is gone; the phone would take the next tap. So while Home is still
   * the screen shown, the button is found again and pressed again (at most
   * twice more), as a user would.
   */
  private async open(testID: string): Promise<Session> {
    resetPager();
    // A listener can briefly hold part of the pages while a batch of them is
    // written (the emulator, under load: 584 of 604, the memorized ones
    // missing). Home then offers Memorization, not the session. Tap once the
    // phone holds all of them, as it does a moment later.
    await this.app.until(() => this.app.app.pages.length === TOTAL_PAGES, 'every page on the phone', 20_000);
    const session = new Session(this.app);
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    const onHome = () => nav.current?.getCurrentRoute?.()?.name === 'Dashboard';
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.tap(testID);
      try {
        await this.app.until(() => !onHome(), 'the session screen to open', 10_000);
        break;
      } catch {
        // Still on Home: the press was lost; tap again.
      }
    }
    const route = nav.current?.getCurrentRoute?.()?.name;
    if (route !== 'ActiveRevision') {
      throw new Error(`"${testID}" opened ${route ?? 'nothing'}, not the session. Home said: ${this.today()}\n${this.app.describe()}`);
    }
    await session.ready();
    return session;
  }
}

/** The revision session on screen, driven as a finger would. */
export class Session {
  constructor(private readonly app: OpenApp) {}

  async ready(timeoutMs?: number): Promise<void> {
    await this.app.until(() => (pagerState().props?.pages.length ?? 0) > 0, 'the session to hold pages', timeoutMs);
  }

  /** Every page the session holds, in order (today's, then any later days'). */
  pages(): number[] {
    return [...(pagerState().props?.pages ?? [])];
  }

  /** The page on screen. */
  current(): number | null {
    return pagerState().current;
  }

  text(): string {
    return flatText(this.app.screen.root);
  }

  private async press(label: string): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    // The controls hide while reading; a tap on the page brings them back.
    if (!this.app.screen.queryByLabelText(label)) await this.tapPage();
    const el = this.app.screen.getByLabelText(label);
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    await this.app.idle(30);
  }

  /** A tap on the page: shows or hides the controls. */
  async tapPage(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const el = this.app.screen.getByLabelText('The page');
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    await this.app.idle(30);
  }

  /** The Pages sheet's circle for the page on screen, as a user reaches it: Pages, the circle, a tap outside. */
  private async toggleHere(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.openPages();
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('session-pages-toggle-here'));
    });
    await this.closePages();
  }

  /** Opens the Pages sheet (SESS-1). */
  async openPages(): Promise<void> {
    await this.press('Pages');
    await this.app.until(() => this.app.screen.queryByTestId('session-pages-toggle-here') != null, 'the Pages sheet');
  }

  /** Closes it with a tap on its backdrop. */
  async closePages(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('backdrop'));
    });
    await this.app.until(() => this.app.screen.queryByTestId('session-pages-toggle-here') == null, 'the Pages sheet to close');
    await this.app.idle(30);
  }

  /** Marks the page on screen as revised, in the Pages sheet. */
  async check(): Promise<void> {
    if (await this.isChecked()) throw new Error('the page on screen is already marked');
    await this.toggleHere();
  }

  async uncheck(): Promise<void> {
    if (!(await this.isChecked())) throw new Error('the page on screen is not marked');
    await this.toggleHere();
  }

  /** A swipe to the next page (the pager's own callbacks, in its order); past the last page, the end card. */
  async swipe(): Promise<void> {
    const state = pagerState();
    const props = state.props;
    if (!props || state.current == null) throw new Error('no page on screen');
    const i = props.pages.indexOf(state.current);
    await this.app.act(async () => {
      if (i === props.pages.length - 1) {
        props.onUserSwipe?.();
        props.onReachEnd?.(state.current!, true);
        return;
      }
      const left = state.current!;
      const next = props.pages[i + 1];
      props.onUserSwipe?.();
      state.current = next;
      props.onPageChange?.(next, i + 1);
      props.onAdvance?.(left, next);
    });
    await this.app.idle(30);
  }

  /**
   * `n` swipes that reach the app's JavaScript together, as on a phone whose JavaScript was held
   * up meanwhile (a long job, a slow phone): the list turned `n` pages natively, and MushafPager
   * credits each page they left, in order, then reports the one it landed on (or the end card),
   * before the screen has heard of any page between. E2E 04 on iOS CI, run 42746203992.
   */
  async swipeTogether(n: number): Promise<void> {
    const state = pagerState();
    const props = state.props;
    if (!props || state.current == null) throw new Error('no page on screen');
    const i = props.pages.indexOf(state.current);
    const last = props.pages.length - 1;
    if (i + n > last + 1) throw new Error(`only ${last + 1 - i} swipes left`);
    const left = props.pages.slice(i, i + n);
    await this.app.act(async () => {
      if (i + n === last + 1) {
        // Onto the end card: the pages before the last are advances, the last is the end card's.
        for (const page of left.slice(0, -1)) props.onAdvance?.(page, props.pages[last]);
        props.onUserSwipe?.();
        props.onReachEnd?.(props.pages[last], true);
        return;
      }
      const next = props.pages[i + n];
      for (const page of left) props.onAdvance?.(page, next);
      props.onUserSwipe?.();
      state.current = next;
      props.onPageChange?.(next, i + n);
    });
    await this.app.idle(30);
  }

  /** A swipe back to the page before (nothing is marked, as on the phone). */
  async swipeBack(): Promise<void> {
    const state = pagerState();
    const props = state.props;
    if (!props || state.current == null) throw new Error('no page on screen');
    const i = props.pages.indexOf(state.current);
    if (i <= 0) throw new Error('no page before this one');
    await this.app.act(async () => {
      props.onUserSwipe?.();
      state.current = props.pages[i - 1];
      props.onPageChange?.(state.current, i - 1);
    });
    await this.app.idle(30);
  }

  /** Revises `n` pages from the one on screen: each is checked by swiping on from it, the last onto the end card if it is the last. */
  async swipeThrough(n = this.pages().length): Promise<void> {
    for (let k = 0; k < n; k++) await this.swipe();
  }

  /** The end card's Keep going: the session goes on to the next revision day, which the pager then holds alone. */
  async keepGoing(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const before = this.pages().join(',');
    const el = this.app.screen.getByTestId('session-end-keep-going');
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    // A new round past the cycle's end (AHEAD-3) can hold the same pages again: the end card going is enough.
    await this.app.until(() => this.pages().join(',') !== before || !this.hasKeepGoing(), 'Keep going to open the next day');
    // The pager opens on that day's first page.
    const state = pagerState();
    state.current = state.props!.initialPage ?? state.props!.pages[0];
    await this.app.act(async () => {
      state.props?.onPageChange?.(state.current!, state.props!.pages.indexOf(state.current!));
    });
  }

  /** Whether there is a page before the one on screen to swipe back to. */
  canSwipeBack(): boolean {
    const state = pagerState();
    return state.props != null && state.current != null && state.props.pages.indexOf(state.current) > 0;
  }

  hasKeepGoing(): boolean {
    return this.app.screen.queryByTestId('session-end-keep-going') != null;
  }

  /** What the end card says ("Revision complete 5 pages revised today"), the page after the last. */
  endCard(): string {
    const el = this.app.screen.queryByTestId('session-end-summary');
    return el ? flatText(el) : '';
  }

  /** Whether the page on screen is marked: "Revised" beside its number, shown or waiting behind the controls. */
  async isChecked(): Promise<boolean> {
    return this.app.screen.queryByTestId('session-page-revised', { includeHiddenElements: true }) != null;
  }

  /** Back to Home (the session saves as it goes). */
  async back(): Promise<void> {
    await this.press('Back');
    await this.app.idle(100);
  }
}

/** A day's notes in Activity, as a user writes them: the day's + adds one, a hold on one edits, copies or deletes it (ACT-6). */
export class DailyLog {
  constructor(private readonly app: OpenApp) {}

  /** Opens the day `date` ('YYYY-MM-DD'; today's revision day when left out). */
  async open(date?: string): Promise<void> {
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    const { getRevisionDayForUser } = this.app.mods.require<typeof import('../../../src/lib/fajrBoundary')>('src/lib/fajrBoundary');
    const day = date ?? getRevisionDayForUser(this.app.app.user);
    await this.app.act(async () => {
      nav.current.navigate('ActivityDay', { date: day });
    });
    await this.app.until(() => this.app.screen.queryByTestId('activity-day-v2') != null, 'the day to open');
    // Confirmations are answered yes.
    const { Alert } = this.app.mods.require<typeof import('react-native')>('react-native');
    (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { style?: string; onPress?: () => void }[]) =>
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  }

  /** The day's entries: kind and text. */
  entries(): { kind: string; text: string }[] {
    return this.rows().map(({ kind, text }) => ({ kind, text }));
  }

  /** The day's entries, with the time each shows ("12:40 am", or "12:40 am Wed"). */
  rows(): { kind: string; text: string; time: string }[] {
    return this.noteRows().map((r) => {
      const label: string = r.props.accessibilityLabel ?? '';
      const parts = label.split(', ');
      return { kind: parts[0], text: parts.slice(1, -1).join(', '), time: parts[parts.length - 1] };
    });
  }

  private noteRows() {
    return this.app.screen.queryAllByTestId(/^day-note-/);
  }

  private async press(el: unknown): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.app.act(async () => {
      fireEvent.press(el as never);
    });
    await this.app.idle(50);
  }

  /** The day's +, Note, the text, Add: returns once the sheet has been sent, before the note need show. */
  async write(text: string): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.press(this.app.screen.getByTestId('day-add'));
    // Today and yesterday have a menu first; an older day's + opens the note at once (ACT-17).
    await this.app.until(
      () => this.app.screen.queryByTestId('add-note-text') != null || this.app.screen.queryByTestId('sheet-action-note') != null,
      'the + to open',
    );
    const row = this.app.screen.queryByTestId('sheet-action-note');
    if (row) await this.press(row);
    await this.app.until(() => this.app.screen.queryByTestId('add-note-text') != null, 'the Note sheet');
    await this.app.act(async () => {
      fireEvent.changeText(this.app.screen.getByTestId('add-note-text'), text);
    });
    await this.press(this.app.screen.getByTestId('add-note-add'));
  }

  /** Adds a note from the day's +. */
  async add(text: string): Promise<void> {
    await this.write(text);
    await this.app.until(() => this.app.screen.queryByTestId('add-note-text') == null, 'the Note sheet to close');
    await this.app.until(() => this.entries().some((e) => e.text === text), `"${text}" to show on the day`);
    // The sheet has gone before the next one can open (one modal at a time).
    await this.app.idle(400);
  }

  row(text: string) {
    const row = this.noteRows().find((r) => (r.props.accessibilityLabel ?? '').includes(`, ${text}, `));
    if (!row) throw new Error(`no entry "${text}" in ${JSON.stringify(this.entries())}`);
    return row;
  }

  /** Holds an entry: its menu (Edit, Copy, Delete). */
  async menu(text: string) {
    const { fireEvent } = this.app.mods.rtl;
    const row = this.row(text);
    await this.app.act(async () => {
      fireEvent(row, 'longPress');
    });
    await this.app.until(() => this.app.screen.queryByTestId('activity-row-menu') != null, 'the note’s menu');
    return this.app.screen.getByTestId('activity-row-menu');
  }

  /** Hold on an entry, Edit, change its text, Save. */
  async edit(text: string, next: string): Promise<void> {
    const { fireEvent, within } = this.app.mods.rtl;
    const menu = await this.menu(text);
    await this.press(within(menu).getByText('Edit'));
    // A menu's action runs as it closes, and the sheet waits for it to go.
    await this.app.until(() => this.app.screen.queryByTestId('add-note-text') != null, 'the Note sheet, filled in');
    await this.app.act(async () => {
      fireEvent.changeText(this.app.screen.getByTestId('add-note-text'), next);
    });
    await this.press(this.app.screen.getByTestId('add-note-add'));
    await this.app.until(() => this.app.screen.queryByTestId('add-note-text') == null, 'the Note sheet to close');
    await this.app.until(() => this.entries().some((e) => e.text === next), `"${next}" to show on the day`);
    await this.app.idle(400);
  }

  /** Hold on an entry, Delete: it goes at once, with Undo. */
  async delete(text: string): Promise<void> {
    const { within } = this.app.mods.rtl;
    const menu = await this.menu(text);
    await this.press(within(menu).getByText('Delete'));
    await this.app.until(() => !this.entries().some((e) => e.text === text), `"${text}" to go`);
    await this.app.until(() => this.app.screen.queryByTestId('activity-row-menu') == null, 'the menu to close');
  }

  async back(): Promise<void> {
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    await this.app.act(async () => {
      nav.current.goBack();
    });
    await this.app.idle(100);
  }
}

/** The text a user reads in an element: its Text children, joined with spaces. */
export function flatText(node: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    const inst = n as { children?: unknown[]; props?: { children?: unknown } };
    if (Array.isArray(inst.children)) inst.children.forEach(walk);
  };
  walk(node);
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** The memorization manager (Memorization): mark a juz in mark mode and save it. */
export class Manager {
  constructor(private readonly app: OpenApp) {}

  async open(): Promise<void> {
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    await this.app.act(async () => {
      nav.current.navigate('Memorization');
    });
    await this.app.until(() => this.app.screen.queryByTestId('memorization-v2') != null, 'the memorization manager to open');
  }

  /**
   * Edits, marks or unmarks `changes` (page → status) as the browser's checks do,
   * then Save and Save in its sheet. "When did you memorize these?" is answered
   * with `answer`; returns the question's buttons in order (null when not asked).
   */
  async save(changes: Record<number, 'memorized' | 'not_memorized'>, answer: string): Promise<string[] | null> {
    const { fireEvent } = this.app.mods.rtl;
    const { Alert } = this.app.mods.require<typeof import('react-native')>('react-native');
    let asked: string[] | null = null;
    (Alert as { alert: unknown }).alert = (title: string, _m?: string, buttons?: { text?: string; onPress?: () => void }[]) => {
      if (title !== 'When did you memorize these?') return;
      asked = (buttons ?? []).map((b) => b.text ?? '');
      buttons?.find((b) => b.text === answer)?.onPress?.();
    };
    await this.app.until(() => this.app.screen.queryByTestId('memorization-edit') != null, 'the edit control');
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('memorization-edit'));
    });
    const { MemorizationBrowser } = this.app.mods.require<any>('src/components/MemorizationBrowser');
    const browser = this.app.screen.UNSAFE_getByType(MemorizationBrowser);
    const next = new Map(browser.props.pendingChanges as Map<number, string>);
    for (const [page, status] of Object.entries(changes)) next.set(Number(page), status);
    await this.app.act(async () => browser.props.onChange(next));
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('memorization-save'));
    });
    await this.app.until(() => this.app.screen.queryByTestId('confirm-save') != null, 'the save sheet');
    await this.app.act(async () => {
      fireEvent.press(this.app.screen.getByTestId('confirm-save'));
    });
    await this.app.until(() => this.app.screen.queryByTestId('memorization-edit') != null, 'the save to finish');
    await this.app.untilSynced();
    return asked;
  }

  /** Marks a whole juz (mark mode, its check) and saves; "Today" answers the When question. */
  async markJuzToday(juz: number): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const { Alert } = this.app.mods.require<typeof import('react-native')>('react-native');
    (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { text?: string; onPress?: () => void }[]) =>
      buttons?.find((b) => b.text === 'Today')?.onPress?.();
    await this.app.until(() => this.app.screen.queryByTestId('memorization-edit') != null, 'the edit control');
    fireEvent.press(this.app.screen.getByTestId('memorization-edit'));
    // The browser opens on Surahs: the Juz tab shows the juz checks.
    fireEvent.press(this.app.screen.getByText('Juz'));
    await this.app.until(() => this.app.screen.queryByTestId(`juz-${juz}-check`) != null, 'the juz check');
    fireEvent.press(this.app.screen.getByTestId(`juz-${juz}-check`));
    fireEvent.press(this.app.screen.getByTestId('memorization-save'));
    await this.app.until(() => this.app.screen.queryByTestId('confirm-save') != null, 'the save sheet');
    fireEvent.press(this.app.screen.getByTestId('confirm-save'));
  }
}

/** The day's Activity (ActivityDay): its blocks and their menus. */
export class ActivityDayView {
  constructor(private readonly app: OpenApp) {}

  async open(date: string): Promise<void> {
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    await this.app.act(async () => {
      nav.current.navigate('ActivityDay', { date });
    });
    await this.app.until(() => this.app.screen.queryByTestId('activity-day-v2') != null, 'the day to open');
  }

  /** Waits for the Memorized block: the day's items load after the screen opens. */
  async waitMemorized(): Promise<void> {
    await this.app.until(() => this.memorizedBlockShown(), 'the Memorized block');
  }

  memorizedBlockShown(): boolean {
    return this.app.screen.queryByTestId('activity-block-memorized') != null;
  }

  /**
   * Deletes the day's Memorized entry from the Memorized block's header (#260):
   * the header holds the menu, and VoiceOver gets the same actions, one
   * "delete-<id>" per entry, run here directly. The deletion is confirmed.
   */
  async deleteMemorized(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const { Alert } = this.app.mods.require<typeof import('react-native')>('react-native');
    (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { style?: string; onPress?: () => void }[]) =>
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    type A11y = { name: string };
    const deleteAction = (el: { props: { accessibilityActions?: A11y[] } }) =>
      (el.props.accessibilityActions ?? []).find((a) => String(a.name).startsWith('delete-'));
    // The header reads its title and figure together ("Memorized, 5 pages").
    const header = () => this.app.screen.queryAllByLabelText(/^Memorized(,|$)/).find((el) => deleteAction(el) != null);
    await this.app.until(() => header() != null, 'the Memorized block header');
    const el = header()!;
    const action = deleteAction(el)!.name;
    await this.app.act(async () => {
      fireEvent(el, 'accessibilityAction', { nativeEvent: { actionName: action } });
    });
    // Delete reads the account's other entries from the server, saves the pages, and only then
    // queues the delete (ActivityDayScreen.onDeleteMemorized). Until then the outbox can be empty
    // (during the read, and again once the pages have gone), so a test's untilSynced could pass before
    // the delete was even queued: [ACT-7] failed that way in CI (Nov 9 2026, today's entry still on
    // the server). Done here once the entry has left the day, which it does when the delete is queued.
    await this.app.until(() => header()?.props.accessibilityActions?.some((a: A11y) => a.name === action) !== true, 'the entry to leave the day');
  }
}

