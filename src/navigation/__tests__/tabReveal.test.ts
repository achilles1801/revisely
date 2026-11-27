// TAB-3: the tab bar, the mini player and Revo's button follow the screen a back swipe brings back from the moment the
// swipe starts, not once navigation's state has caught up (it does only when the swipe ends). The native stack's own
// events (transitionStart, gestureCancel, transitionEnd), as react-native-screens sends them for a swipe that ends, one
// let go halfway and Back with the button.

import { Animated } from 'react-native';
import { currentReveal, fade, front, registerProgress, resetReveal, revealListeners, type Front } from '../tabReveal';

const HIDDEN = new Set(['ActiveRevision', 'QuranReader']);
const showsBar = (name: string) => !HIDDEN.has(name);

/** A stack, as navigation's state has it: its routes, the last in front. */
function stack(...names: string[]) {
  const routes = names.map((name, i) => ({ name, key: `${name}-${i}` }));
  const state = { index: routes.length - 1, routes };
  const navigation = { getState: () => state };
  const listeners = (name: string) => {
    const route = routes.find((r) => r.name === name)!;
    return revealListeners({ navigation, route });
  };
  const top = (): Front => ({ name: state.routes[state.index].name, key: state.routes[state.index].key });
  // The pop navigation's state takes once the swipe has ended (onDismissed), or at once for Back.
  const pop = () => {
    state.routes = state.routes.slice(0, -1);
    state.index = state.routes.length - 1;
  };
  return { listeners, top, pop };
}

beforeEach(() => resetReveal());

it('[TAB-3] a back swipe brings the tab bar back as it starts, fading in with Home, and it stays once the swipe ends', () => {
  const s = stack('Dashboard', 'ActiveRevision');
  const progress = new Animated.Value(0);
  registerProgress('Dashboard-0', progress);
  expect(front(s.top(), currentReveal())).toEqual({ name: 'ActiveRevision', key: 'ActiveRevision-1' });

  // The swipe starts: Home begins to show (UIKit's viewWillAppear), the session still in navigation's state.
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  s.listeners('ActiveRevision').transitionStart({ data: { closing: true } });
  expect(front(s.top(), currentReveal())).toEqual({ name: 'Dashboard', key: 'Dashboard-0' });
  // The bar fades in with Home's own transition progress, as the swipe reveals it.
  expect(fade(s.top(), currentReveal(), showsBar)).toBe(progress);

  // The swipe ends: Home appears, the session goes, then navigation pops it.
  s.listeners('Dashboard').transitionEnd({ data: { closing: false } });
  s.listeners('ActiveRevision').transitionEnd({ data: { closing: true } });
  expect(front(s.top(), currentReveal())?.name).toBe('Dashboard');
  s.pop();
  expect(front(s.top(), currentReveal())).toEqual({ name: 'Dashboard', key: 'Dashboard-0' });
  expect(fade(s.top(), currentReveal(), showsBar)).toBeNull();
});

it('[TAB-3] a back swipe let go halfway leaves the session as it was, without the tab bar', () => {
  const s = stack('Dashboard', 'QuranReader');
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  expect(front(s.top(), currentReveal())?.name).toBe('Dashboard');
  // Let go: Home goes again (viewWillDisappear), the reader reports the cancelled gesture and appears again.
  s.listeners('Dashboard').transitionStart({ data: { closing: true } });
  s.listeners('QuranReader').gestureCancel();
  s.listeners('QuranReader').transitionEnd({ data: { closing: false } });
  expect(currentReveal()).toBeNull();
  expect(front(s.top(), currentReveal())).toEqual({ name: 'QuranReader', key: 'QuranReader-1' });

  // Any one of the three signals is enough.
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  s.listeners('QuranReader').gestureCancel();
  expect(currentReveal()).toBeNull();
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  s.listeners('QuranReader').transitionEnd({ data: { closing: false } });
  expect(currentReveal()).toBeNull();
});

it('[TAB-3] Back with the button changes navigation’s state at once: nothing to reveal', () => {
  const s = stack('Dashboard', 'ActiveRevision');
  s.pop();
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  expect(currentReveal()).toBeNull();
  expect(front(s.top(), currentReveal())).toEqual({ name: 'Dashboard', key: 'Dashboard-0' });
});

it('[TAB-3] what both screens show is not faded: from Settings back to Home the tab bar stays as it is, and Revo’s button fades in', () => {
  const s = stack('Dashboard', 'Settings');
  const progress = new Animated.Value(0);
  registerProgress('Dashboard-0', progress);
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  // The tab bar shows on Settings and on Home: shown, not faded.
  expect(fade(s.top(), currentReveal(), showsBar)).toBeNull();
  // Revo's button shows on Home, not on Settings: it fades in with Home.
  const revoOn = (name: string) => name === 'Dashboard';
  expect(fade(s.top(), currentReveal(), revoOn)).toBe(progress);
  expect(front(s.top(), currentReveal())?.name).toBe('Dashboard');
});

it('[TAB-3] a reveal left from a finished swipe never applies to a later screen', () => {
  const s = stack('Dashboard', 'ActiveRevision');
  s.listeners('Dashboard').transitionStart({ data: { closing: false } });
  s.pop();
  // Pushed again: a new route, a new key.
  const again = stack('Dashboard', 'Settings', 'ActiveRevision');
  expect(front(again.top(), currentReveal())).toEqual({ name: 'ActiveRevision', key: 'ActiveRevision-2' });
  // A push over Home (Home goes) clears it.
  s.listeners('Dashboard').transitionStart({ data: { closing: true } });
  expect(currentReveal()).toBeNull();
});
