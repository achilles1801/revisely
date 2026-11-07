// The app's own screens inside a scenario: Home (DashboardScreen) and the
// revision session (ActiveRevisionScreen) in a real React Navigation stack, the
// way MainNavigator's Home stack holds them. Taps go through the screens'
// handlers; the session's pages come from the pager stand-in (harness/pager).

import type { ReactElement } from 'react';
import type { Booted, OpenApp } from './phone';
import { pagerState } from './pager';

/** The pages every scenario account holds (TOTAL_QURAN_PAGES). */
const TOTAL_PAGES = 604;

function resetPager() {
  const s = pagerState();
  s.props = null;
  s.current = null;
}

/** Pass to Phone.open: the app opens on Home. */
export function homeStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const Dashboard = req<any>('src/screens/main/DashboardScreen').default;
  const Session = req<any>('src/screens/revision/ActiveRevisionScreen').default;
  const Journal = req<any>('src/screens/journal/JournalEntryScreen').default;
  const Manager = req<any>('src/screens/main/MemorizationScreen').default;
  const ActivityDayScreen = req<any>('src/screens/activity/ActivityDayScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
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
    { ref: nav.navigation },
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'Dashboard', component: Dashboard }),
      h(Stack.Screen, { name: 'ActiveRevision', component: Session }),
      h(Stack.Screen, { name: 'JournalEntry', component: Journal }),
      h(Stack.Screen, { name: 'Memorization', component: Manager }),
      h(Stack.Screen, { name: 'ActivityDay', component: ActivityDayScreen }),
      ...['Settings', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityAll', 'Insights'].map(
        (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
      ),
    ),
    ),
  );
}

/** Pass to Phone.open: the app opens on onboarding's "Select memorized portions" (in progress). */
export function onboardingStack(mods: Booted): ReactElement {
  const { React, require: req } = mods;
  const { NavigationContainer } = req<any>('@react-navigation/native');
  const { createNativeStackNavigator } = req<any>('@react-navigation/native-stack');
  const JuzSelection = req<any>('src/screens/onboarding/JuzSelectionScreen').default;
  const nav = req<{ navigation: { current: unknown } }>('./navRef');
  const Stack = createNativeStackNavigator();
  const h = React.createElement;
  const Schedule = () => null;
  return h(
    NavigationContainer,
    { ref: nav.navigation },
    h(
      Stack.Navigator,
      { screenOptions: { headerShown: false, animation: 'none' } },
      h(Stack.Screen, { name: 'JuzSelection', component: JuzSelection, initialParams: { journeyStage: 'in_progress' } }),
      h(Stack.Screen, { name: 'Schedule', component: Schedule }),
    ),
  );
}

/** Onboarding's "Select memorized portions", read and driven through its own elements. */
export class Onboarding {
  constructor(private readonly app: OpenApp) {}

  /** The count at the foot: "24 of 604 pages memorized". */
  summary(): string {
    const el = this.app.screen.queryByTestId('juz-selection-summary');
    return el ? flatText(el) : '';
  }

  continueEnabled(): boolean {
    const el = this.app.screen.queryByTestId('juz-continue');
    return !!el && el.props.accessibilityState?.disabled !== true;
  }

  /**
   * Marks a juz as its row's check does (MemorizationBrowser.applyBulk: every
   * page of the juz by number, loaded or not). Its row isn't drawn here, the
   * list being virtualized, so the browser's change goes in directly.
   */
  async markJuz(pages: number[]): Promise<void> {
    const { MemorizationBrowser } = this.app.mods.require<any>('src/components/MemorizationBrowser');
    const browser = this.app.screen.UNSAFE_getByType(MemorizationBrowser);
    const next = new Map(browser.props.pendingChanges as Map<number, string>);
    for (const p of pages) next.set(p, 'memorized');
    await this.app.act(async () => browser.props.onChange(next));
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

  title(): string | null {
    return this.text('today-title');
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
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    await this.app.idle(50);
  }

  /**
   * Jump to…: the Today menu's action, then a row of the sheet (`rowTestID`, e.g.
   * "jump-juz-28"), then "Start today at …".
   */
  async jumpTo(rowTestID: string): Promise<void> {
    await this.tap('today-summary');
    await this.tap('sheet-action-jump');
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

  /** The check: marks the page on screen as revised (or unmarks it). */
  async check(): Promise<void> {
    await this.press('Mark current page as revised');
  }

  async uncheck(): Promise<void> {
    await this.press('Unmark current page');
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
    await this.app.until(() => this.pages().join(',') !== before, 'Keep going to open the next day');
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

  /** Whether the page on screen is checked (its check reads "Unmark current page"). */
  async isChecked(): Promise<boolean> {
    if (!this.app.screen.queryByLabelText('Unmark current page') && !this.app.screen.queryByLabelText('Mark current page as revised')) {
      await this.tapPage();
    }
    return this.app.screen.queryByLabelText('Unmark current page') != null;
  }

  /** Back to Home (the session saves as it goes). */
  async back(): Promise<void> {
    await this.press('Back');
    await this.app.idle(100);
  }
}

/** The daily log of a day (JournalEntryScreen), as a user writes in it. */
export class DailyLog {
  constructor(private readonly app: OpenApp) {}

  /** Opens the log of `date` ('YYYY-MM-DD'; today's revision day when left out), as Activity's day does. */
  async open(date?: string): Promise<void> {
    const nav = this.app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
    await this.app.act(async () => {
      nav.current.navigate('JournalEntry', date ? { date } : undefined);
    });
    await this.app.until(() => this.app.screen.queryByTestId('journal-composer') != null, 'the daily log to open');
    // Confirmations (Delete this entry?) are answered yes.
    const { Alert } = this.app.mods.require<typeof import('react-native')>('react-native');
    (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { style?: string; onPress?: () => void }[]) =>
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  }

  /** The day's entries, oldest first: kind and text. */
  entries(): { kind: string; text: string }[] {
    return this.rows().map(({ kind, text }) => ({ kind, text }));
  }

  /** The day's entries, oldest first, with the time each shows ("12:40 am", or "12:40 am Wed"). */
  rows(): { kind: string; text: string; time: string }[] {
    const rows = this.app.screen.queryAllByTestId(/^journal-note-(?!menu)[^-]+$/);
    return rows.map((r) => {
      const label: string = r.props.accessibilityLabel ?? '';
      const parts = label.split(', ');
      return { kind: parts[0], text: parts.slice(1, -1).join(', '), time: parts[parts.length - 1] };
    });
  }

  private async press(el: unknown): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    await this.app.act(async () => {
      fireEvent.press(el as never);
    });
    await this.app.idle(50);
  }

  /** Writes a note of `kind` ('Note', 'Revision', 'Memorization') and taps Add. */
  async add(text: string, kind = 'Note'): Promise<void> {
    const { fireEvent, within } = this.app.mods.rtl;
    await this.press(within(this.app.screen.getByTestId('journal-kind')).getByText(kind));
    await this.app.act(async () => {
      fireEvent.changeText(this.app.screen.getByTestId('journal-text-input'), text);
    });
    await this.press(this.app.screen.getByTestId('journal-send'));
    await this.app.until(() => this.entries().some((e) => e.text === text), `"${text}" to show in the log`);
  }

  private row(text: string) {
    const row = this.app.screen
      .queryAllByTestId(/^journal-note-(?!menu)[^-]+$/)
      .find((r) => (r.props.accessibilityLabel ?? '').includes(`, ${text}, `));
    if (!row) throw new Error(`no entry "${text}" in ${JSON.stringify(this.entries())}`);
    return row;
  }

  /** Hold on an entry, Edit, change its text, Save. */
  async edit(text: string, next: string): Promise<void> {
    const { fireEvent, within } = this.app.mods.rtl;
    const row = this.row(text);
    await this.app.act(async () => {
      fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'options' } });
    });
    await this.app.idle(50);
    await this.press(within(this.app.screen.getByTestId('journal-note-menu')).getByText('Edit'));
    // A menu's action runs once the sheet has gone (v2/ActionSheet).
    await this.app.until(() => this.app.screen.queryByLabelText('Save entry') != null, 'the note to be in the composer');
    await this.app.act(async () => {
      fireEvent.changeText(this.app.screen.getByTestId('journal-text-input'), next);
    });
    await this.press(this.app.screen.getByLabelText('Save entry'));
    await this.app.until(() => this.entries().some((e) => e.text === next), `"${next}" to show in the log`);
  }

  /** Swipe an entry away (Delete, confirmed). */
  async delete(text: string): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const row = this.row(text);
    await this.app.act(async () => {
      fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    await this.app.until(() => !this.entries().some((e) => e.text === text), `"${text}" to go`);
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
    await this.app.idle(50);
  }
}

