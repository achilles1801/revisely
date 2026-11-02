// Small shared state for prayer times, kept apart from the components that
// set it (so screens can read it without loading the app's contexts).

import { useSyncExternalStore } from 'react';

/**
 * Prayer times are for every account from 1.0.3 (the owner's decision, Oct 28
 * 2026). This is on the 1.0.3 binary's branch only: 1.0.2 (develop's updates
 * until 1.0.3 merges) kept them for testers (previewTester). Kept as a function
 * so they can be gated again in one place.
 */
export const prayerTimesEnabled = (user: { previewTester?: boolean } | null | undefined) => user != null;

// How many days the scheduled notifications reach ("the next 6 days").
let scheduledDays = 0;
const listeners = new Set<() => void>();

export function setScheduledPrayerDays(days: number) {
  if (days === scheduledDays) return;
  scheduledDays = days;
  listeners.forEach((l) => l());
}

export function useScheduledPrayerDays(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => scheduledDays,
  );
}
