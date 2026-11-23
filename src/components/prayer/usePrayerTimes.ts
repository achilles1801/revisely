import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { User } from '../../types';
import { Place, usePrayerPrefs } from '../../lib/prayer/prefs';
import { CalcSettings, currentPrayer, dayTimes, DayTimes, nextPrayer } from '../../lib/prayer/times';
import { prayerPlace, prayerSettings } from '../../lib/prayer/place';
import { placeName } from '../../lib/qibla';
import type { PrayerName } from '../../lib/prayer/prefs';

/** Now, a new value at each minute (and on coming back to the app): countdowns move by the minute. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const d = new Date();
      setNow(d);
      timer = setTimeout(tick, 60_000 - (d.getTime() % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(new Date());
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return now;
}

// They live in lib/prayer/place (Friday's Al-Kahf card uses them too); kept here for their callers.
export { prayerPlace, prayerSettings };

export interface PrayerTimesNow {
  place: Place | null;
  /** "London, United Kingdom", or null if no listed city is near. */
  placeLabel: string | null;
  settings: CalcSettings;
  now: Date;
  today: DayTimes | null;
  next: { name: PrayerName; time: Date } | null;
  current: PrayerName | null;
}

export function usePrayerTimes(user: User | null | undefined): PrayerTimesNow {
  const prefs = usePrayerPrefs();
  const now = useMinuteClock();
  const place = prayerPlace(user, prefs);
  const settings = prayerSettings(user, prefs);
  const key = JSON.stringify(settings);
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const today = useMemo(
    () => (place ? dayTimes(place, now, settings) : null),
    // The day's times change with the day, the place and the settings only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [place?.latitude, place?.longitude, key, dayKey],
  );
  const next = place ? nextPrayer(place, now, settings) : null;
  const placeLabel = useMemo(() => (place ? placeName(place) : null), [place?.latitude, place?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    place,
    placeLabel,
    settings,
    now,
    today,
    next,
    current: today ? currentPrayer(today, now) : null,
  };
}
