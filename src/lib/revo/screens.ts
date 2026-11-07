// Where Revo's `openScreen` action takes the user (REVO-31): a screen of a fixed list, opened only
// when the user taps the card's button. The server checks the same list (functions/src/revo/reply.ts).

import { getJuzRange, getSurah } from '../quranData';
import { requestPrayerSheet } from '../widgets/links';
import { REVO_SCREENS, REVO_SETTINGS_SECTIONS, type RevoAction, type RevoScreen } from './types';

type OpenScreen = Extract<RevoAction, { kind: 'openScreen' }>;

/** The card's button for each screen. */
export const SCREEN_BUTTON: Record<RevoScreen, string> = {
  jumpTo: 'Open Jump to',
  planEditor: 'Edit schedule',
  memorized: 'Open memorized pages',
  activity: 'Open Activity',
  // Testers' Insights are a tab at the top of Activity.
  insights: 'Open Activity',
  dailyLog: 'Open the daily log',
  settings: 'Open Settings',
  prayerTimes: 'Show prayer times',
  qibla: 'Find the Qibla',
  reader: 'Open in the reader',
};

/**
 * An action this app knows how to show: one of the kinds it has, and for `openScreen` a screen
 * (and section) of its list. A newer server's action this app doesn't know shows no card.
 */
export function knownAction(a: RevoAction | null | undefined): a is RevoAction {
  if (!a) return false;
  if (a.kind === 'reviseFirst' || a.kind === 'openPage' || a.kind === 'startRevision') return true;
  if (a.kind !== 'openScreen') return false;
  if (!(REVO_SCREENS as readonly string[]).includes(a.screen)) return false;
  return a.section == null || (REVO_SETTINGS_SECTIONS as readonly string[]).includes(a.section);
}

/** What opening a screen does: a navigation, and a sheet over Home afterwards. */
export interface ScreenTarget {
  /** navigation.navigate(name, params) */
  name: 'Home' | 'Read';
  params: { screen: string; params?: object; initial?: false };
  /** Opened over Home once it shows. */
  sheet?: 'jumpTo' | 'prayerTimes' | 'qibla';
}

/** The reader's first page for a surah or a juz (the same in both mushaf editions). */
function readerPage(a: OpenScreen): number | null {
  if (a.surah != null) return getSurah(a.surah)?.startPage ?? null;
  if (a.juz != null && a.juz >= 1 && a.juz <= 30) return getJuzRange(a.juz).start;
  return null;
}

export function screenTarget(a: OpenScreen): ScreenTarget {
  // `initial: false` keeps Home beneath, so Back comes home.
  const home = (screen: string, params?: object): ScreenTarget => ({ name: 'Home', params: { screen, ...(params ? { params } : {}), initial: false } });
  switch (a.screen) {
    case 'jumpTo':
      return { name: 'Home', params: { screen: 'Dashboard' }, sheet: 'jumpTo' };
    case 'prayerTimes':
      return { name: 'Home', params: { screen: 'Dashboard' }, sheet: 'prayerTimes' };
    case 'qibla':
      return { name: 'Home', params: { screen: 'Dashboard' }, sheet: 'qibla' };
    case 'planEditor':
      return home('PlanEdit');
    case 'memorized':
      return home('Memorization', { edit: true });
    case 'activity':
    case 'insights':
      return home('Activity');
    case 'dailyLog':
      // No date: today's revision day.
      return home('JournalEntry', {});
    case 'settings':
      return home('Settings', a.section ? { section: a.section } : undefined);
    case 'reader': {
      const page = readerPage(a);
      return page ? { name: 'Read', params: { screen: 'QuranReader', params: { pageNumber: page }, initial: false } } : { name: 'Read', params: { screen: 'ReadIndex' } };
    }
  }
}

/** Opens the screen: navigates, then opens its sheet over Home. */
export function openScreen(navigate: (name: string, params: object) => void, a: OpenScreen): void {
  const t = screenTarget(a);
  navigate(t.name, t.params);
  if (t.sheet === 'jumpTo') requestJumpSheet();
  else if (t.sheet === 'prayerTimes') requestPrayerSheet('times');
  else if (t.sheet === 'qibla') requestPrayerSheet('qibla');
}

// Home's Jump to… sheet, opened from elsewhere (Revo): Home listens with onJumpSheetRequest. A
// request made before Home listens waits for it, once.
let pendingJump = false;
const jumpListeners = new Set<() => void>();

export function requestJumpSheet(): void {
  if (jumpListeners.size === 0) {
    pendingJump = true;
    return;
  }
  jumpListeners.forEach((l) => l());
}

export function onJumpSheetRequest(open: () => void): () => void {
  jumpListeners.add(open);
  if (pendingJump) {
    pendingJump = false;
    open();
  }
  return () => {
    jumpListeners.delete(open);
  };
}
