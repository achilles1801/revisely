// What Insights' one-line taps open (the NOTE's proposals; mocks i7 and i10): the memorized pages not
// revised in the range, and a month of memorizing. Pure: InsightsView draws them.

import { getJuzForPage, getPagesForJuz } from './quranData';
import { describePassage } from './passages';
import { formatDayLong } from './activityFormat';

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

export interface UncoveredRow {
  /** A whole memorized juz not revised in the range, or a run of pages inside a juz. */
  kind: 'juz' | 'passage';
  /** The juz it opens (ACT-21). */
  juz: number;
  /** "Juz 4", "Al-Mulk 1–12". */
  label: string;
  /** "Ali 'Imran 92 to An-Nisa 23 · 41 days ago", "Memorized today, not revised yet". */
  detail: string;
  pages: number[];
}

function runs(pages: number[]): number[][] {
  const out: number[][] = [];
  for (const p of [...pages].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && p === last[last.length - 1] + 1) last.push(p);
    else out.push([p]);
  }
  return out;
}

const agoText = (days: number | null) => (days == null ? 'not revised yet' : days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

/**
 * The memorized pages not revised in the range (i7), in mushaf order: a memorized juz none of whose
 * memorized pages was revised as one row ("Juz 4"), otherwise each run of such pages ("Al-Mulk 1–12").
 * A run memorized in the range and never revised says so ("Memorized today, not revised yet").
 */
export function uncoveredRows(input: {
  memorized: Set<number>;
  /** Each page's last revision (YYYY-MM-DD), when there was one. */
  last: Map<number, string>;
  /** When each page was memorized (YYYY-MM-DD), when known. */
  memorizedOn?: Map<number, string>;
  today: string;
  window: number;
}): UncoveredRow[] {
  const { memorized, last, today, window } = input;
  const covered = (p: number) => {
    const d = last.get(p);
    return d != null && daysBetween(d, today) < window && daysBetween(d, today) >= 0;
  };
  const rows: UncoveredRow[] = [];
  for (let juz = 1; juz <= 30; juz++) {
    const pages = getPagesForJuz(juz).filter((p) => getJuzForPage(p) === juz);
    const mine = pages.filter((p) => memorized.has(p));
    const open = mine.filter((p) => !covered(p));
    if (open.length === 0) continue;
    const age = (ps: number[]): number | null => {
      let newest: string | null = null;
      for (const p of ps) {
        const d = last.get(p);
        if (d && (newest == null || d > newest)) newest = d;
      }
      return newest ? daysBetween(newest, today) : null;
    };
    if (open.length === mine.length && mine.length * 2 >= getPagesForJuz(juz).length) {
      rows.push({
        kind: 'juz',
        juz,
        label: `Juz ${juz}`,
        detail: `${describePassage(open, { form: 'short', wholeJuz: false })} · ${agoText(age(open))}`,
        pages: open,
      });
      continue;
    }
    for (const run of runs(open)) {
      const ago = age(run);
      const on = run.map((p) => input.memorizedOn?.get(p)).filter((d): d is string => !!d).sort().pop();
      const fresh = ago == null && on != null && daysBetween(on, today) < window;
      rows.push({
        kind: 'passage',
        juz,
        label: describePassage(run, { form: 'short' }),
        detail: fresh
          ? `Memorized ${on === today ? 'today' : formatDayLong(on!)}, not revised yet`
          : ago == null
            ? 'Not revised yet'
            : `Last revised ${agoText(ago)}`,
        pages: run,
      });
    }
  }
  return rows;
}

export interface MonthOfMemorizing {
  month: string;
  pages: number;
  /** All of the month's pages, by surah ("Al-Ma'idah 32–82"). */
  passage: string;
  /** Its memorizations, newest first: each opens its day. */
  items: { day: string; label: string; when: string; pages: number }[];
}

/** One month of memorization items (i10): its total, its passage, its items newest first. */
export function monthOfMemorizing(items: { day: string; pages: number[] }[], month: string): MonthOfMemorizing {
  const mine = items.filter((i) => i.day.startsWith(`${month}-`) && i.pages.length > 0).sort((a, b) => b.day.localeCompare(a.day));
  const all = [...new Set(mine.flatMap((i) => i.pages))];
  return {
    month,
    pages: mine.reduce((n, i) => n + i.pages.length, 0),
    passage: describePassage(all, { form: 'short' }),
    items: mine.map((i) => ({
      day: i.day,
      label: describePassage(i.pages, { form: 'short' }),
      when: `${formatDayLong(i.day)} · ${i.pages.length} ${i.pages.length === 1 ? 'page' : 'pages'}`,
      pages: i.pages.length,
    })),
  };
}
