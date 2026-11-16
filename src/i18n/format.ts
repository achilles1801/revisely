// Dates, times and numbers in the app's language (step 4 of the Arabic study).
//
// English shows exactly what it always has. Each call names the locale it has always used:
// 'en-US' (the default: names and US-order dates, "Nov 15"), 'en-GB' (day first, "15 November")
// or 'device' (the phone's own, for clock times: 12 or 24 hours as the phone is set). The orders
// the designs chose by hand ("Wednesday 28 October", no comma) stay hand-built in English.
// Another language uses Intl with its own locale and order for all of them.
import { currentLanguage } from './instance';

export type EnglishLocale = 'en-US' | 'en-GB' | 'device';

/** Each language's Intl locale. Arabic's digits (Western or Arabic-Indic) are still Majd's call. */
const LOCALES: Record<string, string> = { en: 'en-US' };

const isEnglish = () => currentLanguage() === 'en';

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
  return date.toLocaleDateString(dateLocale(english), options);
}

/** A clock time, "5:07 AM", in the phone's 12- or 24-hour style. */
export function formatTime(
  date: Date,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
  english: EnglishLocale = 'device',
): string {
  return date.toLocaleTimeString(dateLocale(english), options);
}

/** A number, "1,234". */
export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(numberLocale(), options);
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
