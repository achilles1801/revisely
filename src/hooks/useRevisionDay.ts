import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { User } from '../types';
import { getNextRevisionDayStart, getRevisionDayForUser } from '../lib/fajrBoundary';

// setTimeout misbehaves with very long delays, and timers do not run while the
// app is suspended (coming back to the foreground re-checks instead).
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;

/**
 * The current revision day ('YYYY-MM-DD') and the same day as a local-midnight
 * Date, re-rendering when it rolls over at fajr (or midnight) and when the app
 * returns to the foreground. Without this, a screen left open overnight kept
 * showing yesterday's assignment until something else made it re-render.
 */
export function useRevisionDay(user: User | null | undefined): { day: string; date: Date } {
  const [day, setDay] = useState(() => getRevisionDayForUser(user));

  // Only the boundary settings matter, not every change to the user object.
  const enabled = user?.fajrBoundaryEnabled ?? false;
  const lat = user?.locationCoords?.latitude;
  const lng = user?.locationCoords?.longitude;
  const method = user?.fajrCalculationMethod;

  useEffect(() => {
    const boundaryUser = user;
    const refresh = () => setDay(getRevisionDayForUser(boundaryUser));
    refresh();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      const wait = getNextRevisionDayStart(boundaryUser, now).getTime() - now.getTime();
      timer = setTimeout(
        () => {
          refresh();
          schedule();
        },
        Math.min(Math.max(wait + 1000, 1000), MAX_TIMER_MS),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lat, lng, method]);

  const date = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [day]);

  return { day, date };
}
