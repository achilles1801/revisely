// What Recitation's own page shows (pure; Revisely Dev, ACT-44), from its point: "Am I getting better at reciting from
// memory, and what do I still need to fix?" (Majd, Nov 27 2026: "the point of the graph is to illustrate a users trend in
// making mistakes categorized by the type of mistake and also taking into account other metrics that are USEFUL like
// knowing what mistakes has the user corrected and doesn't make anymore and which are still slipping all the time and
// maybe even length of recitations"). Board: ~/Documents/revisely-today-mocks/insights-v2/board-recitation.png.
//
// Mistakes are counted a page, so a long take and a short one weigh fairly: a take's pages are each page it reached, by
// the share of that page's words it recited (`takePages`). Mistakes are the take summary's (lib/reciteInsights/insights
// `mistakeKindOf`): never Not clear, a word corrected straight away or a tajweed note. A take kept without its final
// answer (RECITE-11) never counts in a rate: its end wasn't checked.

import { dayNumber, shiftDay } from '../dayKeys';
import type { QuranWords } from '../recite/quranWords';
import { pagesReached, PER_PAGE_FROM } from '../reciteLive/score';
import { wordMemories } from '../reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../reciteMemory/record';
import { clearedOn, liveTakes, markedWords, meanScore, mistakeKindOf, slippingPassages } from './insights';

/** The chart's three kinds, bottom first: wrong or skipped words, hesitations (an extra word), harakat and letters. */
export type KindKey = 'words' | 'hesitations' | 'slips';
export const KINDS: readonly KindKey[] = ['words', 'hesitations', 'slips'];
export type KindCounts = Record<KindKey, number>;
const noKinds = (): KindCounts => ({ words: 0, hesitations: 0, slips: 0 });

/** Which of the chart's kinds a mark is, or null when it isn't a mistake. */
export function kindKeyOf(m: Parameters<typeof mistakeKindOf>[0]): KindKey | null {
  const k = mistakeKindOf(m);
  if (k === null) return null;
  if (k === 'added') return 'hesitations';
  return k === 'harakat' || k === 'letter' ? 'slips' : 'words';
}

/** Words on an average page of the 1405 print (77,429 over 604), for a take's pages before the word data has loaded. */
export const AVG_PAGE_WORDS = 128;
/** The least a take counts as: a line of a page. Fewer words with a slip would read as dozens of mistakes a page. */
export const MIN_TAKE_PAGES = 1 / 15;

/** A take's pages: each page it reached, by the share of that page's words it recited; a line at least. */
export function takePages(t: Pick<TakeRecord, 'from' | 'to'>, words: QuranWords | null): number {
  const from = Math.min(t.from, t.to);
  const to = Math.max(t.from, t.to);
  let pages = 0;
  if (!words) pages = (to - from + 1) / AVG_PAGE_WORDS;
  else {
    for (let p = words.pageOf(from); p <= words.pageOf(to); p++) {
      const [a, b] = words.pageRange(p);
      const n = Math.min(b, to + 1) - Math.max(a, from);
      if (n > 0 && b > a) pages += n / (b - a);
    }
  }
  return Math.max(MIN_TAKE_PAGES, pages);
}

/** Some takes' mistakes against their pages (finished takes only). */
export interface Rate {
  takes: number;
  pages: number;
  mistakes: number;
  kinds: KindCounts;
}

export function rateOf(takes: readonly TakeRecord[], words: QuranWords | null): Rate {
  const r: Rate = { takes: 0, pages: 0, mistakes: 0, kinds: noKinds() };
  for (const t of takes) {
    if (t.unfinished) continue;
    r.takes += 1;
    r.pages += takePages(t, words);
    for (const m of t.marks) {
      const k = kindKeyOf(m);
      if (!k) continue;
      r.kinds[k] += 1;
      r.mistakes += 1;
    }
  }
  return r;
}

/** Mistakes a page, or null with no pages. */
export const perPage = (r: Pick<Rate, 'mistakes' | 'pages'>): number | null => (r.pages > 0 ? r.mistakes / r.pages : null);

/** The page's range against the same length before it (none for All time), and the words said right in the range. */
export interface RangeTrend {
  now: Rate;
  before: Rate | null;
  /** Takes in the range, finished or not. */
  takes: number;
  /** Each take's own score weighted by its words (lib/reciteInsights/insights `meanScore`). */
  score: number | null;
}

export function rangeTrend(
  records: readonly MemoryRecord[],
  today: string,
  window: number,
  all: boolean,
  words: QuranWords | null,
): RangeTrend {
  const takes = liveTakes(records);
  const from = shiftDay(today, -(window - 1));
  const these = takes.filter((t) => t.day >= from && t.day <= today);
  const before = all ? null : takes.filter((t) => t.day >= shiftDay(from, -window) && t.day < from);
  return { now: rateOf(these, words), before: before && before.length ? rateOf(before, words) : null, takes: these.length, score: meanScore(these) };
}

/** The chart's span: 4 weeks or 3 months, week by week; a year, month by month. */
export type ChartSpan = '4w' | '3m' | '1y';
export const CHART_SPANS: readonly ChartSpan[] = ['4w', '3m', '1y'];

/** The span the chart opens on for the page's range: a week or a month, 4 weeks; 3 months; All time, a year. */
export function spanForRange(window: number, all: boolean): ChartSpan {
  if (all) return '1y';
  return window > 31 ? '3m' : '4w';
}

/** One bar: a week (from its Monday) or a month, its takes' mistakes by kind and their pages. */
export interface KindBar extends Rate {
  key: string;
  from: string;
  to: string;
  month: boolean;
}

/** The Monday of a day's week. */
export function weekStart(day: string): string {
  // 1970-01-01 was a Thursday: a Monday's day number + 3 is a multiple of 7.
  return shiftDay(day, -((dayNumber(day) + 3) % 7));
}

/** The bars of a span, oldest first, the current week or month last (ending today). */
export function kindBars(records: readonly MemoryRecord[], today: string, span: ChartSpan, words: QuranWords | null): KindBar[] {
  const takes = liveTakes(records);
  const spans: { key: string; from: string; to: string; month: boolean }[] = [];
  if (span === '1y') {
    const [y, m] = today.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      const from = d.toISOString().slice(0, 10);
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
      const end = shiftDay(next, -1);
      spans.push({ key: from.slice(0, 7), from, to: end < today ? end : today, month: true });
    }
  } else {
    const n = span === '4w' ? 4 : 13;
    const monday = weekStart(today);
    for (let i = n - 1; i >= 0; i--) {
      const from = shiftDay(monday, -7 * i);
      const end = shiftDay(from, 6);
      spans.push({ key: from, from, to: end < today ? end : today, month: false });
    }
  }
  return spans.map((s) => ({ ...s, ...rateOf(takes.filter((t) => t.day >= s.from && t.day <= s.to), words) }));
}

/** The words put right against those still slipping. */
export interface FixedSlipping {
  /** Words cleared by being said right on 2 days (never by Clear now), all time, and how many of them in the range. */
  fixed: number;
  fixedInRange: number;
  /** Words still marked on the page (wrong words and haraka or letter slips; tajweed apart), in how many passages. */
  slipping: number;
  passages: number;
  /** Of them, words that first went wrong in the range. */
  newInRange: number;
}

export function fixedAndSlipping(records: readonly MemoryRecord[], from: string, today: string): FixedSlipping {
  const memories = wordMemories(records);
  const clears = records.filter((r): r is ClearRecord => r.kind === 'clear' && !r.deleted);
  const { words: marked } = markedWords(memories);
  const still = new Set(marked.map((w) => w.w));
  const firstWrong = new Map<number, string>();
  const fixedDay = new Map<number, string>();
  for (const m of memories.values()) {
    if (m.group === 'tajweed') continue;
    for (const a of m.attempts) {
      if (a.right) continue;
      const held = firstWrong.get(m.w);
      if (!held || a.take.day < held) firstWrong.set(m.w, a.take.day);
      break;
    }
    const c = clearedOn(m, clears);
    // A word still marked in another group isn't fixed; one cleared in two groups counts once, on its latest day.
    if (!c || c.byHand || still.has(m.w)) continue;
    const held = fixedDay.get(m.w);
    if (!held || c.day > held) fixedDay.set(m.w, c.day);
  }
  // A word with a group cleared by hand and another by its right days is fixed only if no group of it was cleared by hand.
  for (const m of memories.values()) {
    if (m.group === 'tajweed') continue;
    const c = clearedOn(m, clears);
    if (c?.byHand) fixedDay.delete(m.w);
  }
  const days = [...fixedDay.values()];
  return {
    fixed: days.length,
    fixedInRange: days.filter((d) => d >= from && d <= today).length,
    slipping: still.size,
    passages: slippingPassages(memories).length,
    newInRange: [...still].filter((w) => (firstWrong.get(w) ?? '') >= from).length,
  };
}

/** How long the range's takes are, and whether long takes go better than short ones. */
export interface TakeLengths {
  takes: number;
  /** The middle take's pages and seconds. */
  pages: number;
  secs: number;
  longest: { pages: number; day: string };
  /** Takes of PER_PAGE_FROM pages or more (as a take's summary counts them, RECITE-24) and the shorter ones. */
  long: Rate | null;
  short: Rate | null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function takeLengths(records: readonly MemoryRecord[], today: string, window: number, words: QuranWords | null): TakeLengths | null {
  const from = shiftDay(today, -(window - 1));
  const these = liveTakes(records).filter((t) => t.day >= from && t.day <= today);
  if (these.length === 0) return null;
  const pages = these.map((t) => takePages(t, words));
  let at = 0;
  pages.forEach((p, i) => {
    if (p > pages[at] || (p === pages[at] && these[i].day > these[at].day)) at = i;
  });
  const isLong = (t: TakeRecord) => (words ? pagesReached(words, t.from, t.to) : takePages(t, null)) >= PER_PAGE_FROM;
  const long = rateOf(these.filter(isLong), words);
  const short = rateOf(these.filter((t) => !isLong(t)), words);
  return {
    takes: these.length,
    pages: median(pages),
    secs: median(these.map((t) => t.secs)),
    longest: { pages: pages[at], day: these[at].day },
    long: long.takes > 0 ? long : null,
    short: short.takes > 0 ? short : null,
  };
}
