// A day's Hijri date for the day card (BEHAVIOUR.md THEME-6), "12 Ramadan" or "1 Shawwal", while the Ramadan theme
// shows; else null. Its own file, light on imports, so the calendar doesn't load the app's context through it.

import { hijriLabel, ramadanDates, useRamadanDatesVersion } from '../../lib/ramadanDates';
import { useRamadanDecor } from './quiet';

export function useRamadanHijri(day: string): string | null {
  const shows = useRamadanDecor();
  useRamadanDatesVersion();
  return shows ? hijriLabel(day, ramadanDates(day)) : null;
}
