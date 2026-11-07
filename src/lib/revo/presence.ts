// Whether Revo's button is on screen (RevoHost mounted for this account), for the lists that
// leave room at their end so the last row scrolls clear of it (TabBar's useTabBarFootprint).
// Kept tiny on purpose: the tab bar reads it without importing Revo or the app's context.

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
const listeners = new Set<() => void>();

export function setRevoPresent(next: boolean): void {
  if (present === next) return;
  present = next;
  listeners.forEach((l) => l());
}

export function useRevoPresent(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => present,
    () => present,
  );
}
