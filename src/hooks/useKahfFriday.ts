import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { User } from '../types';
import { usePrayerPrefs } from '../lib/prayer/prefs';
import { prayerSettings } from '../lib/prayer/place';
import { KahfFriday, kahfFridayAt, kahfMaghribOf, kahfPlace, nextKahfChange } from '../lib/kahf';

// setTimeout misbehaves with very long delays, and timers do not run while the
// app is suspended (coming back to the foreground re-checks instead).
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

const same = (a: KahfFriday | null, b: KahfFriday | null) =>
  a === b || (a != null && b != null && a.day === b.day && a.start === b.start && a.end === b.end);

/**
 * The Islamic Friday it is now, for Friday's Al-Kahf card (KAHF-1): from
 * Thursday's maghrib to Friday's, where the user is; null the rest of the week.
 * Re-renders when a window opens or closes, and when the app comes back.
 */
export function useKahfFriday(user: User | null | undefined): KahfFriday | null {
  const prefs = usePrayerPrefs();
  const place = kahfPlace(user, prefs);
  const settings = prayerSettings(user, prefs);
  // Only the place and how maghrib is worked out matter, not every change to the user or prefs.
  const key = JSON.stringify([place, settings]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const maghribOf = useMemo(() => kahfMaghribOf(place, settings), [key]);
  const [friday, setFriday] = useState(() => kahfFridayAt(new Date(), maghribOf));

  useEffect(() => {
    const refresh = () => {
      const now = kahfFridayAt(new Date(), maghribOf);
      setFriday((was) => (same(was, now) ? was : now));
    };
    refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      let wait = nextKahfChange(now, maghribOf).getTime() - now.getTime();
      // Never spin: anything odd waits for the next hourly check instead.
      if (!Number.isFinite(wait) || wait <= 0) wait = 60 * 60 * 1000;
      timer = setTimeout(
        () => {
          refresh();
          schedule();
        },
        Math.min(wait + 1000, MAX_TIMER_MS),
      );
    };
    schedule();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        schedule();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [maghribOf]);

  return friday;
}
