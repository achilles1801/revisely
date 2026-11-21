// Dates, times and numbers in the app's language (step 4 of the Arabic study).
//
// English shows exactly what it always has. Each call names the locale it has always used:
// 'en-US' (the default: names and US-order dates, "Nov 15"), 'en-GB' (day first, "15 November")
// or 'device' (the phone's own, for clock times: 12 or 24 hours as the phone is set). The orders
// the designs chose by hand ("Wednesday 28 October", no comma) stay hand-built in English.
// Another language uses Intl with its own locale and order for all of them.
import { localDigits, localNumber, localNumeral } from './digits';
import { currentLanguage } from './instance';

export type EnglishLocale = 'en-US' | 'en-GB' | 'device';

/** Each language's Intl locale. Arabic's digits come from digits.ts (Majd's choice 1). */
const LOCALES: Record<string, string> = { en: 'en-US', ar: 'ar' };

const isEnglish = () => currentLanguage() === 'en';

/** Intl's text in the language's digits: unchanged in English. */
const digits = (text: string): string => (isEnglish() ? text : localDigits(text, currentLanguage()));

/**
 * The locale for a toLocale…String or Intl call: in English the one this call has always used
 * (undefined = the phone's), in another language that language's.
 */
export function dateLocale(english: EnglishLocale = 'en-US'): string | undefined {
  if (isEnglish()) return english === 'device' ? undefined : english;
  return LOCALES[currentLanguage()] ?? currentLanguage();
}

/** The locale for numbers: "1,234" in English. */
export function numberLocale(): string {
  return isEnglish() ? 'en-US' : (LOCALES[currentLanguage()] ?? currentLanguage());
}

/** A date with Intl's options: "Sat, Oct 24", "October 2026". */
export function formatDate(date: Date, options: Intl.DateTimeFormatOptions, english: EnglishLocale = 'en-US'): string {
  return digits(date.toLocaleDateString(dateLocale(english), options));
}

/**
 * A calendar day ('YYYY-MM-DD') with Intl's date options: "Tuesday", "November 17". It names the day as written in
 * any time zone, so each language and set of options makes its formatter once: toLocaleDateString makes a new one on
 * every call, and Activity's search words asked three times an item (Nov 17 2026).
 */
export function formatDay(day: string, options: Intl.DateTimeFormatOptions, english: EnglishLocale = 'en-US'): string {
  const [y, m, d] = day.split('-').map(Number);
  const locale = dateLocale(english);
  const date = new Date(Date.UTC(y, m - 1, d));
  // The phone's own locale can change while the app runs: only named locales are kept.
  if (locale === undefined) return digits(date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' }));
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dayFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
    dayFormats.set(key, format);
  }
  return digits(format.format(date));
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** A clock time, "5:07 AM", in the phone's 12- or 24-hour style. */
export function formatTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
  english: EnglishLocale = 'device',
): string {
  return digits(date.toLocaleTimeString(dateLocale(english), options));
}

/** A number, "1,234" (in Arabic "١٢٣٤": digits.ts). */
export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return isEnglish() ? n.toLocaleString(numberLocale(), options) : localNumber(n, currentLanguage(), options);
}

/** A number written by the code ("0.4" from toFixed) in the language's digits; unchanged in English. */
export function formatNumeral(text: string): string {
  return isEnglish() ? text : localNumeral(text, currentLanguage());
}

/** "Wednesday", "Wed", "W". */
export function weekdayName(date: Date, width: 'long' | 'short' | 'narrow' = 'long', timeZone?: string): string {
  return formatDate(date, timeZone ? { weekday: width, timeZone } : { weekday: width });
}

/** "October", "Oct". */
export function monthName(date: Date, width: 'long' | 'short' = 'long', timeZone?: string): string {
  return formatDate(date, timeZone ? { month: width, timeZone } : { month: width });
}

/**
 * The day and the month, day first: "28 October", "1 Oct", "28 October 2025" with `year`; with
 * `weekday`, "Wednesday 28 October" or "Mon 16 Nov". No commas in English, as the designs have it.
 */
export function dayMonth(
  date: Date,
  opts: { month?: 'long' | 'short'; weekday?: 'long' | 'short'; year?: boolean } = {},
): string {
  const month = opts.month ?? 'long';
  if (isEnglish()) {
    const parts = [`${date.getDate()}`, monthName(date, month)];
    if (opts.weekday) parts.unshift(weekdayName(date, opts.weekday));
    if (opts.year) parts.push(`${date.getFullYear()}`);
    return parts.join(' ');
  }
  return formatDate(date, {
    day: 'numeric',
    month,
    ...(opts.weekday ? { weekday: opts.weekday } : {}),
    ...(opts.year ? { year: 'numeric' } : {}),
  });
}
