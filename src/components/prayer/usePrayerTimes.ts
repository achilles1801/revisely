import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { User } from '../../types';
import { Place, usePrayerPrefs } from '../../lib/prayer/prefs';
import {
  CalcSettings,
  currentPrayer,
  dayTimes,
  DayTimes,
  DEFAULT_METHOD,
  nextPrayer,
} from '../../lib/prayer/times';
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

/** The method, the phone's settings: what the times are worked out with. */
export function prayerSettings(user: User | null | undefined, prefs: ReturnType<typeof usePrayerPrefs>): CalcSettings {
  return {
    method: user?.fajrCalculationMethod || DEFAULT_METHOD,
    highLatitude: prefs.highLatitude,
    madhab: prefs.madhab,
    adjustments: prefs.adjustments,
  };
}

/** Where times are worked out: the phone's last position, else the Fajr location. On the phone only. */
export function prayerPlace(user: User | null | undefined, prefs: ReturnType<typeof usePrayerPrefs>): Place | null {
  return prefs.place ?? user?.locationCoords ?? null;
}

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
