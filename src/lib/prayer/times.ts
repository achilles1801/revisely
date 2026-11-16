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
import { dayMonth, formatTime as localeTime, t } from '../../i18n';

/** The methods offered (adhan's factory names). */
export const CALCULATION_METHODS = [
  {
    id: 'MuslimWorldLeague',
    get label() {
      return t('prayer.methods.MuslimWorldLeague.label');
    },
    get short() {
      return t('prayer.methods.MuslimWorldLeague.short');
    },
  },
  {
    id: 'Egyptian',
    get label() {
      return t('prayer.methods.Egyptian.label');
    },
    get short() {
      return t('prayer.methods.Egyptian.short');
    },
  },
  {
    id: 'Karachi',
    get label() {
      return t('prayer.methods.Karachi.label');
    },
    get short() {
      return t('prayer.methods.Karachi.short');
    },
  },
  {
    id: 'UmmAlQura',
    get label() {
      return t('prayer.methods.UmmAlQura.label');
    },
    get short() {
      return t('prayer.methods.UmmAlQura.short');
    },
  },
  {
    id: 'Dubai',
    get label() {
      return t('prayer.methods.Dubai.label');
    },
    get short() {
      return t('prayer.methods.Dubai.short');
    },
  },
  {
    id: 'MoonsightingCommittee',
    get label() {
      return t('prayer.methods.MoonsightingCommittee.label');
    },
    get short() {
      return t('prayer.methods.MoonsightingCommittee.short');
    },
  },
  {
    id: 'NorthAmerica',
    get label() {
      return t('prayer.methods.NorthAmerica.label');
    },
    get short() {
      return t('prayer.methods.NorthAmerica.short');
    },
  },
  {
    id: 'Kuwait',
    get label() {
      return t('prayer.methods.Kuwait.label');
    },
    get short() {
      return t('prayer.methods.Kuwait.short');
    },
  },
  {
    id: 'Qatar',
    get label() {
      return t('prayer.methods.Qatar.label');
    },
    get short() {
      return t('prayer.methods.Qatar.short');
    },
  },
  {
    id: 'Singapore',
    get label() {
      return t('prayer.methods.Singapore.label');
    },
    get short() {
      return t('prayer.methods.Singapore.short');
    },
  },
  {
    id: 'Turkey',
    get label() {
      return t('prayer.methods.Turkey.label');
    },
    get short() {
      return t('prayer.methods.Turkey.short');
    },
  },
  {
    id: 'Tehran',
    get label() {
      return t('prayer.methods.Tehran.label');
    },
    get short() {
      return t('prayer.methods.Tehran.short');
    },
  },
] as const;

export const DEFAULT_METHOD = 'NorthAmerica';

export const HIGH_LATITUDE_OPTIONS = [
  {
    id: 'recommended',
    get label() {
      return t('prayer.highLatitude.recommended');
    },
    get detail(): string | undefined {
      return t('prayer.highLatitude.recommendedDetail');
    },
  },
  ...(['middleofthenight', 'seventhofthenight', 'twilightangle'] as const).map((id) => ({
    id,
    get label() {
      return t(`prayer.highLatitude.${id}`);
    },
    detail: undefined as string | undefined,
  })),
] as const;

export function methodLabel(id: string, short = false): string {
  const m = CALCULATION_METHODS.find((x) => x.id === id) ?? CALCULATION_METHODS.find((x) => x.id === DEFAULT_METHOD)!;
  return short ? m.short : m.label;
}

/** The usual method where the phone is, by the bundled city list's country. */
export function defaultMethodFor(country: string | null | undefined): string {
  // i18n-ignore-start (country names from the city list, method ids)
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
    // i18n-ignore-end
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

const TIME_NAMES: TimeName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
type Times = Record<TimeName, Date | null>;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function timesOf(t: PrayerTimes): Times {
  return {
    fajr: valid(t.fajr),
    sunrise: valid(t.sunrise),
    dhuhr: valid(t.dhuhr),
    asr: valid(t.asr),
    maghrib: valid(t.maghrib),
    isha: valid(t.isha),
  };
}

/** The times in order, Fajr to Isha (a time adhan can't give is skipped). */
function inOrder(t: Times): boolean {
  const seq = TIME_NAMES.map((n) => t[n]).filter((d): d is Date => d !== null);
  return seq.every((d, i) => i === 0 || seq[i - 1].getTime() < d.getTime());
}

/**
 * `a` and `b` moved by `da` and `db` milliseconds, averaged time by time (either
 * alone where the other has none), to the minute as adhan gives them.
 */
function blend(a: Times | null, da: number, b: Times | null, db: number): Times {
  const out = {} as Times;
  for (const n of TIME_NAMES) {
    const x = a?.[n] ? a[n]!.getTime() + da : null;
    const y = b?.[n] ? b[n]!.getTime() + db : null;
    const v = x !== null && y !== null ? (x + y) / 2 : (x ?? y);
    out[n] = v === null ? null : new Date(Math.round(v / MINUTE_MS) * MINUTE_MS);
  }
  return out;
}

/**
 * The six times of the local day of `date`: the prayers whose Dhuhr falls on
 * that day. A time adhan can't give is null.
 *
 * adhan reads the date it is given as the UTC day of the sun's transit at the
 * place. Near the date line (Kiritimati, Samoa, Tonga; Fiji around October and
 * November) that transit is on the next or the previous local day, so the
 * phone's date alone gave another day's prayers; the dates either side are
 * asked too. Where the transit crosses 00:00 UTC, adhan skips a day (no date
 * gives its prayers) or returns a set out of order (a "Fajr" at noon). That day
 * is then made from the days either side, moved by 24 hours: Fajr moves by
 * seconds a day there. A saved place far from the phone's zone may have no
 * Dhuhr on a day at all; the set nearest the day's noon is used.
 */
export function dayTimes(place: Place, date: Date, settings: CalcSettings): DayTimes {
  const at = (k: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + k, 12);
  const noon = at(0);
  const target = localDay(noon);
  const coords = new Coordinates(place.latitude, place.longitude);
  const params = calcParams(settings, place);
  const sets = [-1, 0, 1].map((k) => timesOf(new PrayerTimes(coords, at(k), params))).filter((t) => t.dhuhr && inOrder(t));
  const on = (day: string) =>
    sets
      .filter((t) => localDay(t.dhuhr!) === day)
      .sort((a, b) => Math.abs(a.dhuhr!.getTime() - noon.getTime()) - Math.abs(b.dhuhr!.getTime() - noon.getTime()))[0] ?? null;

  let times = on(target);
  if (!times) {
    const before = on(localDay(at(-1)));
    const after = on(localDay(at(1)));
    const made = before || after ? blend(before, DAY_MS, after, -DAY_MS) : null;
    if (made?.dhuhr && localDay(made.dhuhr) === target && inOrder(made)) times = made;
  }
  if (!times) {
    times =
      [...sets].sort((a, b) => Math.abs(a.dhuhr!.getTime() - noon.getTime()) - Math.abs(b.dhuhr!.getTime() - noon.getTime()))[0] ??
      timesOf(new PrayerTimes(coords, noon, params));
  }
  return { day: target, ...times };
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
  if (minutes <= 0) return t('prayer.countdown.now');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t('prayer.countdown.minutes', { m });
  return m === 0 ? t('prayer.countdown.hours', { h }) : t('prayer.countdown.hoursMinutes', { h, m });
}

export function formatTime(date: Date): string {
  return localeTime(date);
}

/** A time's name in the app's language (`en`, named before there was another) and in Arabic. */
export const TIME_LABELS: Record<TimeName, { readonly en: string; readonly ar: string }> = {
  fajr: {
    get en() {
      return t('prayer.names.fajr');
    },
    ar: 'الفجر' },
  sunrise: {
    get en() {
      return t('prayer.names.sunrise');
    },
    ar: 'الشروق' },
  dhuhr: {
    get en() {
      return t('prayer.names.dhuhr');
    },
    ar: 'الظهر' },
  asr: {
    get en() {
      return t('prayer.names.asr');
    },
    ar: 'العصر' },
  maghrib: {
    get en() {
      return t('prayer.names.maghrib');
    },
    ar: 'المغرب' },
  isha: {
    get en() {
      return t('prayer.names.isha');
    },
    ar: 'العشاء' },
};

/** The months' keys, 1 to 12. */
const HIJRI_MONTHS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12'] as const;

/** "17 Jumada al-Ula 1448" (Umm al-Qura), or null where the phone's Intl lacks that calendar. */
export function hijriDate(date: Date): string | null {
  try {
    // i18n-ignore (numbers only: the month's name comes from HIJRI_MONTHS)
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
    if (f.resolvedOptions().calendar !== 'islamic-umalqura') return null;
    const parts = f.formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const day = get('day');
    const month = get('month');
    const year = parseInt(parts.find((p) => (p.type as string) === 'year' || (p.type as string) === 'relatedYear')?.value ?? '', 10);
    if (!day || !month || !year || month < 1 || month > 12) return null;
    return `${day} ${t(`prayer.hijri.${HIJRI_MONTHS[month - 1]}`)} ${year}`;
  } catch {
    return null;
  }
}

/** "Wednesday 28 October". */
export function gregorianDate(date: Date): string {
  return dayMonth(date, { weekday: 'long' });
}
