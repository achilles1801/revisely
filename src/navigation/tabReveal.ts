// The screen beneath a pushed one, from the first moment it shows (TAB-3; Majd, Nov 26 2026: "the tabs on the bottom
// disappear and then they come back up, but this should always be consistent").
//
// Navigation's state is the native stack's only once a back swipe has ended (`onDismissed` pops it then), so the tab
// bar, the mini player and Revo's button, which follow the screen in front, came back only after the swipe: Home showed
// without them while the finger moved them in. The native stack tells the screen beneath as the swipe starts
// (`transitionStart`, not closing: UIKit's viewWillAppear), and again if the swipe is let go (`transitionStart`
// closing, and `gestureCancel` on the pushed screen). From then until navigation's state catches up, the chrome follows
// the screen coming back: `front()` names it, and it fades in with that screen's transition progress (`fade`), as the
// swipe reveals it. Back with the button changes the state at once, so nothing is needed there.
//
// No React render while the pager moves (CLAUDE.md "Tabs are a pager"): this changes only on a stack's own transitions.

import { useSyncExternalStore } from 'react';
import type { Animated } from 'react-native';

/** A screen coming back from under `leaving`, which navigation's state still has in front. */
export interface Reveal {
  /** The pushed screen's route key: its stack's front in navigation's state until the swipe ends. */
  leaving: string;
  leavingName: string;
  /** The screen beneath, coming back. */
  appearing: string;
  appearingName: string;
}

/** A stack's front screen, as navigation's state has it. */
export interface Front {
  name: string;
  key: string;
}

let reveal: Reveal | null = null;
const progress = new Map<string, Animated.Value>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function set(next: Reveal | null): void {
  if (next === reveal || (next && reveal && next.leaving === reveal.leaving && next.appearing === reveal.appearing)) return;
  reveal = next;
  notify();
}

/** The screen coming back, while one is (null otherwise). */
export function useReveal(): Reveal | null {
  return useSyncExternalStore(subscribe, () => reveal, () => reveal);
}

export function currentReveal(): Reveal | null {
  return reveal;
}

/**
 * The screen the chrome follows: the one coming back while a back swipe reveals it, else navigation's front. A reveal
 * counts only while its pushed screen is still the front, so one left over from a finished swipe never applies.
 */
export function front(stackFront: Front | null, r: Reveal | null): Front | null {
  if (r && stackFront && stackFront.key === r.leaving) return { name: r.appearingName, key: r.appearing };
  return stackFront;
}

/**
 * What fades in as a back swipe reveals the screen beneath: the transition progress of that screen (0 to 1 as it comes
 * back, back to 0 if the swipe is let go), for something the pushed screen didn't show (`shownOn` its name is false)
 * that the screen beneath does. Null (fully shown) otherwise.
 */
export function fade(stackFront: Front | null, r: Reveal | null, shownOn: (name: string) => boolean): Animated.Value | null {
  if (!r || !stackFront || stackFront.key !== r.leaving) return null;
  if (shownOn(r.leavingName) || !shownOn(r.appearingName)) return null;
  return progress.get(r.appearing) ?? null;
}

/** A stack screen's transition progress (react-native-screens), registered by its layout (`RevealLayout`). */
export function registerProgress(key: string, value: Animated.Value): () => void {
  progress.set(key, value);
  return () => {
    if (progress.get(key) === value) progress.delete(key);
  };
}

type TransitionEvent = { data?: { closing?: boolean } };
type StackNavigation = { getState: () => { index: number; routes: readonly { key: string; name: string }[] } };

/**
 * A stack navigator's `screenListeners`: a screen beneath starting to show while another is still the front is a back
 * swipe under way; its end, or the swipe let go, clears it.
 */
export function revealListeners({ navigation, route }: { navigation: unknown; route: { key: string; name: string } }) {
  return {
    transitionStart: (e: TransitionEvent) => {
      if (e.data?.closing) {
        // The screen beneath going again: a swipe let go (or a push over it).
        if (reveal?.appearing === route.key) set(null);
        return;
      }
      const state = (navigation as StackNavigation).getState();
      const top = state.routes[state.index];
      // The state already has it in front (Back, a tap, a push): nothing to reveal.
      if (!top || top.key === route.key) return;
      set({ leaving: top.key, leavingName: top.name, appearing: route.key, appearingName: route.name });
    },
    // The pushed screen stays: the swipe was let go.
    gestureCancel: () => {
      if (reveal?.leaving === route.key) set(null);
    },
    transitionEnd: (e: TransitionEvent) => {
      // The pushed screen in front again after a swipe let go.
      if (!e.data?.closing && reveal?.leaving === route.key) set(null);
    },
  };
}

/** For tests. */
export function resetReveal(): void {
  reveal = null;
  progress.clear();
  notify();
}
