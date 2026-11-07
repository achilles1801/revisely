// Add to chat's search: what the user types, read the way people name things. "Yusuf" (a surah,
// Latin or Arabic), "Juz 14", "Al-Mulk 1–12" or "Al-Hashr 3" (ayahs, as the pages that hold them),
// "p. 288" or "288" (a page), "pp. 548–551", and days: "today", "yesterday", "Tuesday" (the last
// four), "3 Nov", "November 3", "3/11" (day/month). Pure: the sheet passes today and gets results.

import { getAllSurahs, getJuzForPage, getSurahDisplay } from '../quranData';
import { pageOfVerse } from '../verses';
import { describePassage, plainText } from '../passages';
import { shiftDay } from '../journal';

export type AddFound =
  | { kind: 'surah'; surah: number; label: string }
  | { kind: 'juz'; juz: number; label: string }
  | { kind: 'pages'; pages: number[]; label: string; ayahs?: boolean }
  | { kind: 'day'; day: string };

/** How far back a day can be found (Activity reads 400 days). */
export const DAYS_BACK = 400;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** Letters only (and Arabic), for matching names however they are typed: "al hashr" is "Al-Hashr". */
const letters = (s: string) => s.toLowerCase().replace(/[^a-z؀-ۿ]/g, '');

function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Surahs whose name holds what was typed (Latin, letters only, or Arabic). */
export function matchSurahs(text: string): number[] {
  const want = letters(text);
  if (!want) return [];
  const exact = getAllSurahs().filter((s) => letters(s.name) === want);
  const rest = getAllSurahs().filter((s) => letters(s.name) !== want && (letters(s.name).includes(want) || s.nameArabic.includes(text.trim())));
  return [...exact, ...rest].map((s) => s.number);
}

/** Ayahs of a surah ("Al-Mulk 1–12", "Al-Hashr 3") as the pages they start on, named as lib/passages names them. */
function ayahs(text: string): { found: Extract<AddFound, { kind: 'pages' }>; surah: number } | null {
  const m = /^(.*?[^\d\s])\s*(\d{1,3})(?:\s*[-–—‑:]\s*(\d{1,3}))?$/.exec(text.trim());
  if (!m) return null;
  const surah = matchSurahs(m[1])[0];
  if (!surah) return null;
  const count = getSurahDisplay(surah)?.ayahCount ?? 0;
  const a = Number(m[2]);
  const b = m[3] ? Number(m[3]) : a;
  if (a < 1 || b < a || b > count) return null;
  const pages = range(pageOfVerse({ sura: surah, ayah: a }), pageOfVerse({ sura: surah, ayah: b }));
  const name = plainText(getAllSurahs().find((s) => s.number === surah)!.name);
  return { found: { kind: 'pages', pages, label: a === b ? `${name}, ayah ${a}` : `${name}, ayahs ${a}–${b}`, ayahs: true }, surah };
}

/** The most recent day (up to today) with this day and month. */
function lastDate(day: number, month: number, today: string): string | null {
  const [ty] = today.split('-').map(Number);
  for (const y of [ty, ty - 1]) {
    const d = new Date(Date.UTC(y, month, day));
    if (d.getUTCMonth() !== month) return null;
    const iso = d.toISOString().slice(0, 10);
    if (iso <= today) return iso;
  }
  return null;
}

/** Days the text names: today, yesterday, a weekday (the last four), or a date. */
export function matchDays(text: string, today: string): string[] {
  const q = text.trim().toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
  if (!q) return [];
  if ('today'.startsWith(q) && q.length >= 3) return [today];
  if ('yesterday'.startsWith(q) && q.length >= 3) return [shiftDay(today, -1)];
  const wd = WEEKDAYS.findIndex((w) => q.length >= 3 && w.startsWith(q));
  if (wd >= 0) {
    const out: string[] = [];
    for (let k = 0; k <= 28 && out.length < 4; k++) {
      const d = shiftDay(today, -k);
      if (weekdayOf(d) === wd) out.push(d);
    }
    return out;
  }
  const month = (w: string) => MONTHS.findIndex((m) => w.length >= 3 && m.startsWith(w));
  let m = /^(\d{1,2}) ([a-z]+)$/.exec(q) ?? null;
  if (m && month(m[2]) >= 0) return [lastDate(Number(m[1]), month(m[2]), today)].filter((d): d is string => d != null && d >= shiftDay(today, -DAYS_BACK));
  m = /^([a-z]+) (\d{1,2})$/.exec(q);
  if (m && month(m[1]) >= 0) return [lastDate(Number(m[2]), month(m[1]), today)].filter((d): d is string => d != null && d >= shiftDay(today, -DAYS_BACK));
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(q);
  if (m) return [lastDate(Number(m[1]), Number(m[2]) - 1, today)].filter((d): d is string => d != null && d >= shiftDay(today, -DAYS_BACK));
  return [];
}

/** Everything the text names, best match first: ayahs, then surahs, juz, pages and days. */
export function searchAdd(text: string, today: string): AddFound[] {
  const q = text.trim();
  if (!q) return [];
  const lower = q.toLowerCase();

  const juz = /^(?:juz'?|j)\s*(\d{1,2})$/.exec(lower);
  if (juz) {
    const n = Number(juz[1]);
    return n >= 1 && n <= 30 ? [{ kind: 'juz', juz: n, label: `Juz ${n}` }] : [];
  }
  const page = /^(?:pp?\.?|pages?)?\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/.exec(lower);
  if (page) {
    const a = Number(page[1]);
    const b = page[2] ? Number(page[2]) : a;
    // "3/11" isn't a page; a bare number past 604 isn't either.
    if (a >= 1 && b >= a && b <= 604 && b - a < 60) {
      const pages = range(a, b);
      return [{ kind: 'pages', pages, label: plainText(describePassage(pages, { form: 'short' })) }];
    }
    return [];
  }

  const out: AddFound[] = [];
  const said = ayahs(q);
  const surahs = said ? [said.surah] : matchSurahs(q).slice(0, 8);
  if (said) out.push(said.found);
  for (const s of surahs) out.push({ kind: 'surah', surah: s, label: plainText(getAllSurahs().find((x) => x.number === s)!.name) });
  // Ayahs, or the one surah named: the juz it is in, beside it.
  const one = said ? said.found.pages : surahs.length === 1 ? surahPages(surahs[0]) : [];
  const juzOf = juzBeside(one, getJuzForPage);
  if (juzOf) out.push(juzOf);
  for (const d of matchDays(q, today)) out.push({ kind: 'day', day: d });
  return out;
}

function surahPages(surah: number): number[] {
  const s = getAllSurahs().find((x) => x.number === surah);
  return s ? range(s.startPage, s.endPage) : [];
}

/** The juz a surah or ayah result sits in, to offer it beside (the first page's). */
export function juzBeside(pages: readonly number[], juzOf: (page: number) => number): AddFound | null {
  if (pages.length === 0) return null;
  const a = juzOf(pages[0]);
  const b = juzOf(pages[pages.length - 1]);
  return a === b ? { kind: 'juz', juz: a, label: `Juz ${a}` } : null;
}

