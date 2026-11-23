// Where Revo's `openScreen` action takes the user (REVO-31): a screen of a fixed list, opened only
// when the user taps the card's button. The server checks the same list (functions/src/revo/reply.ts).

import { getJuzRange, getSurah } from '../quranData';
import { requestPrayerSheet } from '../widgets/links';
import { REVO_SCREENS, REVO_SETTINGS_SECTIONS, type RevoAction, type RevoScreen } from './types';
import { t } from '../../i18n';

type OpenScreen = Extract<RevoAction, { kind: 'openScreen' }>;

/** The card's button for each screen. */
export const screenButton = (screen: RevoScreen): string => t(`revo.screens.${screen}`);

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
  /** navigation.navigate(name, params); ActivityTab is Activity's tab (TAB-2). */
  name: 'Home' | 'ActivityTab' | 'Read';
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

// i18n-ignore-start (route names)
export function screenTarget(a: OpenScreen, today: string): ScreenTarget {
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
      // Activity's tab (TAB-2).
      return { name: 'ActivityTab', params: { screen: 'Activity' } };
    case 'dailyLog':
      // Today's day in Activity, where notes are written and edited (ACT-6).
      return { name: 'ActivityTab', params: { screen: 'ActivityDay', params: { date: today }, initial: false } };
    case 'settings':
      return home('Settings', a.section ? { section: a.section } : undefined);
    case 'reader': {
      const page = readerPage(a);
      return page ? { name: 'Read', params: { screen: 'QuranReader', params: { pageNumber: page }, initial: false } } : { name: 'Read', params: { screen: 'ReadIndex' } };
    }
  }
}
// i18n-ignore-end

/** Opens the screen: navigates, then opens its sheet over Home. */
export function openScreen(navigate: (name: string, params: object) => void, a: OpenScreen, today: string): void {
  const target = screenTarget(a, today);
  navigate(target.name, target.params);
  if (target.sheet === 'jumpTo') requestJumpSheet();
  else if (target.sheet === 'prayerTimes') requestPrayerSheet('times');
  else if (target.sheet === 'qibla') requestPrayerSheet('qibla');
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
