import { readFileSync } from 'fs';
import { join } from 'path';
import { knownAction, onJumpSheetRequest, openScreen, requestJumpSheet, SCREEN_BUTTON, screenTarget } from '../screens';
import { REVO_SCREENS, type RevoAction, type RevoScreen } from '../types';

const action = (screen: RevoScreen, more: Partial<Extract<RevoAction, { kind: 'openScreen' }>> = {}) =>
  ({ kind: 'openScreen', title: 'Go there', detail: '', screen, ...more }) as const;

describe('Revo’s openScreen (REVO-31)', () => {
  const nav = readFileSync(join(__dirname, '../../../navigation/MainNavigator.tsx'), 'utf8');
  const screens = new Set([...nav.matchAll(/\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]));

  it('every screen opens a route the app has, with a button that says where', () => {
    for (const s of REVO_SCREENS) {
      const t = screenTarget(action(s));
      expect(screens.has(t.name)).toBe(true);
      expect(screens.has(t.params.screen)).toBe(true);
      expect(SCREEN_BUTTON[s].length).toBeGreaterThan(0);
    }
  });

  it('the reader opens at a surah’s or a juz’s first page, or on the list', () => {
    expect(screenTarget(action('reader', { surah: 67 })).params).toEqual({ screen: 'QuranReader', params: { pageNumber: 562 }, initial: false });
    expect(screenTarget(action('reader', { juz: 30 })).params).toEqual({ screen: 'QuranReader', params: { pageNumber: 582 }, initial: false });
    expect(screenTarget(action('reader', { surah: 1 })).params.params).toEqual({ pageNumber: 1 });
    expect(screenTarget(action('reader')).params).toEqual({ screen: 'ReadIndex' });
  });

  it('Settings opens at a section; the plan editor and memorized pages keep Home beneath', () => {
    expect(screenTarget(action('settings', { section: 'mushaf' }))).toEqual({ name: 'Home', params: { screen: 'Settings', params: { section: 'mushaf' }, initial: false } });
    expect(screenTarget(action('planEditor')).params).toEqual({ screen: 'PlanEdit', initial: false });
    expect(screenTarget(action('memorized')).params).toEqual({ screen: 'Memorization', params: { edit: true }, initial: false });
  });

  it('Jump to opens Home, then its sheet; a request before Home listens waits for it', () => {
    const navigate = jest.fn();
    openScreen(navigate, action('jumpTo'));
    expect(navigate).toHaveBeenCalledWith('Home', { screen: 'Dashboard' });
    const open = jest.fn();
    const stop = onJumpSheetRequest(open);
    expect(open).toHaveBeenCalledTimes(1);
    requestJumpSheet();
    expect(open).toHaveBeenCalledTimes(2);
    stop();
    requestJumpSheet();
    expect(open).toHaveBeenCalledTimes(2);
    // The waiting request is taken once.
    const next = jest.fn();
    onJumpSheetRequest(next)();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('an action this app doesn’t know (a newer server’s) shows no card', () => {
    expect(knownAction(action('activity'))).toBe(true);
    expect(knownAction({ kind: 'startRevision', title: 'Start', detail: '' })).toBe(true);
    expect(knownAction({ kind: 'openScreen', title: 'x', detail: '', screen: 'somewhereNew' } as unknown as RevoAction)).toBe(false);
    expect(knownAction({ kind: 'openScreen', title: 'x', detail: '', screen: 'settings', section: 'nowhere' } as unknown as RevoAction)).toBe(false);
    expect(knownAction({ kind: 'teleport', title: 'x', detail: '' } as unknown as RevoAction)).toBe(false);
    expect(knownAction(undefined)).toBe(false);
  });
});
