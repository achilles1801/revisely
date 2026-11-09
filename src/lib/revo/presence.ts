// Whether Revo's button is on screen, for the lists that leave room at their end so their last row
// scrolls clear of it: useRevoFootprint(), which a screen showing the button adds to its scroll
// view's bottom padding (with useTabBarFootprint for the tab bar and the mini player).
// Kept tiny on purpose: screens read it without importing Revo or the app's context.

import { useSyncExternalStore } from 'react';

/**
 * The button's disc: 44, the smallest touch target, and clearly smaller than the 56 of the
 * mocks, which Majd found too big on his phone (Nov 7 2026).
 */
export const REVO_BUTTON_SIZE = 44;
/** Its gap above the tab bar (and the mini player). */
export const REVO_BUTTON_GAP = 14;
/** Lists leave this much room at the end so their last row scrolls clear of the button. */
export const REVO_BUTTON_FOOTPRINT = REVO_BUTTON_SIZE + REVO_BUTTON_GAP + 2;

let present = false;
let buttonRoute = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** RevoHost: Revo is on for this account (mounted), or not. */
export function setRevoPresent(next: boolean): void {
  if (present === next) return;
  present = next;
  listeners.forEach((l) => l());
}

/** RevoHost: the screen in front is one the button shows on (REVO_BUTTON_ROUTES). */
export function setRevoButtonRoute(next: boolean): void {
  if (buttonRoute === next) return;
  buttonRoute = next;
  listeners.forEach((l) => l());
}

export function useRevoPresent(): boolean {
  return useSyncExternalStore(subscribe, () => present, () => present);
}

/**
 * Room to leave at the end of a scroll view for Revo's button: REVO_BUTTON_FOOTPRINT where the
 * button shows (Revo on, on one of its screens), else 0. Add it to the bottom padding, beside
 * useTabBarFootprint(). It doesn't change while the sheet or the keyboard hides the button, so
 * lists don't jump.
 */
export function useRevoFootprint(): number {
  const shown = useSyncExternalStore(subscribe, () => present && buttonRoute, () => present && buttonRoute);
  return shown ? REVO_BUTTON_FOOTPRINT : 0;
}
