// Prayer times, worked out on the phone with adhan (MIT; already used for the
// Fajr day boundary): the five prayers and sunrise for a day, the next prayer,
// its countdown, and the Hijri date. The same parameters give the Fajr that
// starts the revision day (lib/fajrBoundary), so the two always agree.

import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PolarCircleResolution,
  PrayerTimes,
} from 'adhan';
import type { Place, PrayerName, PrayerPrefs, TimeName } from './prefs';
import { PRAYERS } from './prefs';

/** The methods offered (adhan's factory names). */
export const CALCULATION_METHODS = [
  { id: 'MuslimWorldLeague', label: 'Muslim World League', short: 'MWL' },
  { id: 'Egyptian', label: 'Egyptian', short: 'Egyptian' },
  { id: 'Karachi', label: 'Karachi', short: 'Karachi' },
  { id: 'UmmAlQura', label: 'Umm al-Qura (Makkah)', short: 'Umm al-Qura' },
  { id: 'Dubai', label: 'Dubai', short: 'Dubai' },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee', short: 'Moonsighting' },
  { id: 'NorthAmerica', label: 'ISNA (North America)', short: 'ISNA' },
  { id: 'Kuwait', label: 'Kuwait', short: 'Kuwait' },
  { id: 'Qatar', label: 'Qatar', short: 'Qatar' },
  { id: 'Singapore', label: 'Singapore', short: 'Singapore' },
  { id: 'Turkey', label: 'Turkey', short: 'Turkey' },
  { id: 'Tehran', label: 'Tehran', short: 'Tehran' },
] as const;

export const DEFAULT_METHOD = 'NorthAmerica';

export const HIGH_LATITUDE_OPTIONS = [
  { id: 'recommended', label: 'Recommended', detail: 'Middle of the night below 48°, a seventh of it above' },
  { id: 'middleofthenight', label: 'Middle of the night', detail: undefined },
  { id: 'seventhofthenight', label: 'Seventh of the night', detail: undefined },
  { id: 'twilightangle', label: 'Twilight angle', detail: undefined },
] as const;

export function methodLabel(id: string, short = false): string {
  const m = CALCULATION_METHODS.find((x) => x.id === id) ?? CALCULATION_METHODS.find((x) => x.id === DEFAULT_METHOD)!;
  return short ? m.short : m.label;
}

/** The usual method where the phone is, by the bundled city list's country. */
export function defaultMethodFor(country: string | null | undefined): string {
  switch (country) {
    case 'United Kingdom':
    case 'Ireland':
      return 'MoonsightingCommittee';
    case 'United States':
    case 'Canada':
      return 'NorthAmerica';
    case 'Saudi Arabia':
    case 'Yemen':
      return 'UmmAlQura';
    case 'Egypt':
    case 'Libya':
    case 'Sudan':
    case 'Syria':
    case 'Lebanon':
    case 'Iraq':
      return 'Egyptian';
    case 'Pakistan':
    case 'India':
    case 'Bangladesh':
    case 'Afghanistan':
      return 'Karachi';
    case 'United Arab Emirates':
    case 'Oman':
      return 'Dubai';
    case 'Kuwait':
      return 'Kuwait';
    case 'Qatar':
    case 'Bahrain':
      return 'Qatar';
    case 'Singapore':
    case 'Malaysia':
    case 'Indonesia':
    case 'Brunei':
      return 'Singapore';
    case 'Turkey':
      return 'Turkey';
    case 'Iran':
      return 'Tehran';
    default:
      return 'MuslimWorldLeague';
  }
}

export type CalcSettings = Pick<PrayerPrefs, 'highLatitude' | 'madhab' | 'adjustments'> & { method: string };

/** adhan's parameters for a method and the phone's settings, at a place. */
export function calcParams(settings: CalcSettings, place: Place): CalculationParameters {
  const factories = CalculationMethod as unknown as Record<string, () => CalculationParameters>;
  const params = (factories[settings.method] ?? factories[DEFAULT_METHOD])();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule =
    settings.highLatitude === 'recommended'
      ? HighLatitudeRule.recommended(new Coordinates(place.latitude, place.longitude))
      : settings.highLatitude;
  // Days with no sunrise or sunset (inside the polar circles): from the
  // nearest latitude that has them.
  params.polarCircleResolution = PolarCircleResolution.AqrabBalad;
  params.adjustments = { ...params.adjustments, ...settings.adjustments, sunrise: 0 };
  return params;
}

export type DayTimes = Record<TimeName, Date | null> & {
  /** The local day ('YYYY-MM-DD'). */
  day: string;
};

const valid = (d: Date | undefined | null) => (d && !isNaN(d.getTime()) ? d : null);

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The six times of the local day of `date`. A time adhan can't give is null. */
export function dayTimes(place: Place, date: Date, settings: CalcSettings): DayTimes {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const t = new PrayerTimes(new Coordinates(place.latitude, place.longitude), day, calcParams(settings, place));
  return {
    day: localDay(day),
    fajr: valid(t.fajr),
    sunrise: valid(t.sunrise),
    dhuhr: valid(t.dhuhr),
    asr: valid(t.asr),
    maghrib: valid(t.maghrib),
    isha: valid(t.isha),
  };
}

/** The next prayer after `now` (today's, else tomorrow's Fajr). */
export function nextPrayer(place: Place, now: Date, settings: CalcSettings): { name: PrayerName; time: Date } | null {
  for (let d = 0; d < 3; d++) {
    const t = dayTimes(place, new Date(now.getFullYear(), now.getMonth(), now.getDate() + d), settings);
    for (const p of PRAYERS) {
      const at = t[p];
      if (at && at.getTime() > now.getTime()) return { name: p, time: at };
    }
  }
  return null;
}

/** The prayer whose time it is now (since it began, before the next), today; none between sunrise and Dhuhr. */
export function currentPrayer(times: DayTimes, now: Date): PrayerName | null {
  let current: PrayerName | null = null;
  for (const name of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'] as TimeName[]) {
    const at = times[name];
    if (at && at.getTime() <= now.getTime()) current = name === 'sunrise' ? null : (name as PrayerName);
  }
  return current;
}

/** "in 1h 12m", "in 12m", "in 2h", "now". Whole minutes, rounded up. */
export function countdown(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) return 'now';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `in ${m}m`;
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const TIME_LABELS: Record<TimeName, { en: string; ar: string }> = {
  fajr: { en: 'Fajr', ar: 'الفجر' },
  sunrise: { en: 'Sunrise', ar: 'الشروق' },
  dhuhr: { en: 'Dhuhr', ar: 'الظهر' },
  asr: { en: 'Asr', ar: 'العصر' },
  maghrib: { en: 'Maghrib', ar: 'المغرب' },
  isha: { en: 'Isha', ar: 'العشاء' },
};

const HIJRI_MONTHS = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qa'dah",
  'Dhu al-Hijjah',
];

/** "17 Jumada al-Ula 1448" (Umm al-Qura), or null where the phone's Intl lacks that calendar. */
export function hijriDate(date: Date): string | null {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
    if (f.resolvedOptions().calendar !== 'islamic-umalqura') return null;
    const parts = f.formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const day = get('day');
    const month = get('month');
    const year = parseInt(parts.find((p) => (p.type as string) === 'year' || (p.type as string) === 'relatedYear')?.value ?? '', 10);
    if (!day || !month || !year || month < 1 || month > 12) return null;
    return `${day} ${HIJRI_MONTHS[month - 1]} ${year}`;
  } catch {
    return null;
  }
}

/** "Wednesday 28 October". */
export function gregorianDate(date: Date): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return `${weekday} ${dayMonth}`;
}
