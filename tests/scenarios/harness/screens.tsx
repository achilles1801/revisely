// The app's own screens inside a scenario: Home (DashboardScreen) and the
// revision session (ActiveRevisionScreen) in a real React Navigation stack, the
// way MainNavigator's Home stack holds them. Taps go through the screens'
// handlers; the session's pages come from the pager stand-in (harness/pager).

import type { ReactElement } from 'react';
import type { Booted, OpenApp } from './phone';
import { pagerState } from './pager';

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
      ...['Settings', 'Memorization', 'PlanEdit', 'PlanDayEdit', 'Activity', 'ActivityDay', 'ActivityAll', 'Insights'].map(
        (name) => h(Stack.Screen, { key: name, name, component: Elsewhere }),
      ),
    ),
    ),
  );
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

  /** The catch-up line above it: "Missed yesterday · Revise p. 1–5". */
  catchUp(): string | null {
    return this.text('today-catch-up');
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
    resetPager();
    await this.tap('today-cta');
    const session = new Session(this.app);
    await session.ready();
    return session;
  }

  /** "Tomorrow starts at …": opens the session on the next day's pages. */
  async openAhead(): Promise<Session> {
    resetPager();
    await this.tap('today-ahead');
    const session = new Session(this.app);
    await session.ready();
    return session;
  }
}

/** The revision session on screen, driven as a finger would. */
export class Session {
  constructor(private readonly app: OpenApp) {}

  async ready(): Promise<void> {
    await this.app.until(() => (pagerState().props?.pages.length ?? 0) > 0, 'the session to hold pages');
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

  /** The end card's Keep going: the next revision day's pages join the session. */
  async keepGoing(): Promise<void> {
    const { fireEvent } = this.app.mods.rtl;
    const before = this.pages().length;
    const el = this.app.screen.getByTestId('session-end-keep-going');
    await this.app.act(async () => {
      fireEvent.press(el);
    });
    await this.app.until(() => this.pages().length > before, 'Keep going to add the next day');
    // The pager moves to the first page of the day added.
    const state = pagerState();
    state.current = state.props!.pages[before];
    await this.app.act(async () => {
      state.props?.onPageChange?.(state.current!, before);
    });
  }

  hasKeepGoing(): boolean {
    return this.app.screen.queryByTestId('session-end-keep-going') != null;
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
    const rows = this.app.screen.queryAllByTestId(/^journal-note-(?!menu)[^-]+$/);
    return rows.map((r) => {
      const label: string = r.props.accessibilityLabel ?? '';
      const parts = label.split(', ');
      return { kind: parts[0], text: parts.slice(1, -1).join(', ') };
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
