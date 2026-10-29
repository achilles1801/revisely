// Small shared state for prayer times, kept apart from the components that
// set it (so screens can read it without loading the app's contexts).

import { useSyncExternalStore } from 'react';

/** Prayer times are for testers for now (previewTester on the account). */
export const prayerTimesEnabled = (user: { previewTester?: boolean } | null | undefined) => user?.previewTester === true;

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
