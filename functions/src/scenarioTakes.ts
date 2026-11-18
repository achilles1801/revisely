/**
 * Recite takes for the test scenarios (testScenarios.ts): word lookups over scenarioQuran.ts, the marks a take finds,
 * and a take's document as the app stores it (users/<uid>/reciteTakes, src/lib/reciteMemory/record.ts's toStored).
 * Pure: the scenarios pass their own random source, so a scenario is the same on the same day.
 */
import { PAGE_FIRST_WORD, SLIPS, SURAH_VERSES, VERSE_TEXT, VERSE_WORDS } from './scenarioQuran';

// ---------------------------------------------------------------------------------------------- words

/** The first word of each verse (index: the verse in mushaf order); the last entry is the word count. */
const VERSE_START: number[] = [0];
for (const n of VERSE_WORDS) VERSE_START.push(VERSE_START[VERSE_START.length - 1] + n);
/** The verse index of each surah's first verse; the last entry is the verse count. */
const SURAH_START: number[] = [0];
for (const n of SURAH_VERSES) SURAH_START.push(SURAH_START[SURAH_START.length - 1] + n);

/** The last index in `starts` whose value is at most `x` (starts ascending). */
function floorIndex(starts: readonly number[], x: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A page's words: its first and its last (inclusive). */
export function pageWords(page: number): [number, number] {
  return [PAGE_FIRST_WORD[page - 1], PAGE_FIRST_WORD[page] - 1];
}

/** The page a word is on. */
export function pageOfWord(w: number): number {
  return floorIndex(PAGE_FIRST_WORD, w) + 1;
}

/** The surah and ayah of a verse index. */
function ayahOfVerse(v: number): [number, number] {
  const s = floorIndex(SURAH_START, v);
  return [s + 1, v - SURAH_START[s] + 1];
}

/** The surah and ayah a word is in. */
export function ayahOfWord(w: number): [number, number] {
  return ayahOfVerse(floorIndex(VERSE_START, w));
}

/** The verses (as surah * 1000 + ayah, src/lib/ayahKeys) that start on a page. */
export function ayahKeysStartingOn(page: number): number[] {
  const [first, last] = pageWords(page);
  const out: number[] = [];
  for (let v = floorIndex(VERSE_START, first); v < VERSE_WORDS.length && VERSE_START[v] <= last; v++) {
    if (VERSE_START[v] >= first) {
      const [s, a] = ayahOfVerse(v);
      out.push(s * 1000 + a);
    }
  }
  return out;
}

/** A verse's words, first and last, by its key (surah * 1000 + ayah). */
export function ayahWords(key: number): [number, number] {
  const v = SURAH_START[Math.floor(key / 1000) - 1] + (key % 1000) - 1;
  return [VERSE_START[v], VERSE_START[v + 1] - 1];
}

/** A word's Uthmani text, for the verses scenarioQuran.ts writes out (null for the rest). */
export function wordText(w: number): string | null {
  const v = floorIndex(VERSE_START, w);
  const [s, a] = ayahOfVerse(v);
  const text = VERSE_TEXT[`${s}:${a}`];
  return text ? (text.split(' ')[w - VERSE_START[v]] ?? null) : null;
}

/** The words on the pages from `from`'s to `to`'s (src/lib/reciteLive/score's wordsOnPagesReached). */
export function wordsOnPagesReached(from: number, to: number): number {
  return PAGE_FIRST_WORD[pageOfWord(Math.max(from, to))] - PAGE_FIRST_WORD[pageOfWord(Math.min(from, to)) - 1];
}

// ---------------------------------------------------------------------------------------------- marks

export type MarkKind = 'word' | 'skipped' | 'added' | 'harakat' | 'letter' | 'tajweed';

/** A mark as the document holds it (src/lib/reciteMemory/record.ts's StoredMark). */
export interface StoredMark {
  id: string;
  w: number;
  sura: number;
  ayah: number;
  kind: MarkKind;
  sure: 'clear' | 'likely';
  detail?: 'lookalike' | 'sound' | 'replaced' | 'order' | 'trail' | 'shadda';
  heard?: string;
  heardExact?: boolean;
  slipExpected?: string;
  slipHeard?: string;
  at0?: number;
  at1?: number;
  rule?: string;
  got?: number;
  expected?: number;
  t0?: number;
  t1?: number;
  intoW?: number;
  intoSura?: number;
  intoAyah?: number;
}

export type Rand = () => number;

const pick = <T>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const HARAKAT = [FATHA, DAMMA, KASRA];
/** Letters memorizers confuse, each with the one heard instead. */
const LETTER_SWAPS: [string, string][] = [
  ['ح', 'ه'],
  ['ص', 'س'],
  ['ض', 'د'],
  ['ط', 'ت'],
  ['ق', 'ك'],
  ['ذ', 'ز'],
  ['ث', 'س'],
  ['ظ', 'ز'],
];

function base(id: string, w: number, kind: MarkKind, sure: 'clear' | 'likely' = 'clear'): StoredMark {
  const [sura, ayah] = ayahOfWord(w);
  return { id, w, sura, ayah, kind, sure };
}

/** A skipped word. */
export function skippedMark(id: string, w: number): StoredMark {
  return base(id, w, 'skipped');
}

/** A haraka said as another, or null when the word has none to swap (or no text here). `sure: 'likely'` is Not clear. */
export function harakatMark(id: string, w: number, rand: Rand, sure: 'clear' | 'likely' = 'clear'): StoredMark | null {
  const text = wordText(w);
  if (!text) return null;
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) if (HARAKAT.includes(text[i])) at.push(i);
  if (at.length === 0) return null;
  const i = pick(rand, at);
  const expected = text[i];
  const heard = pick(rand, HARAKAT.filter((h) => h !== expected));
  return {
    ...base(id, w, 'harakat', sure),
    heard: text.slice(0, i) + heard + text.slice(i + 1),
    heardExact: true,
    slipExpected: expected,
    slipHeard: heard,
    at0: i,
    at1: i + 1,
  };
}

/** A letter said as one memorizers confuse it with, or null when the word has none of them. */
export function letterMark(id: string, w: number, rand: Rand): StoredMark | null {
  const text = wordText(w);
  if (!text) return null;
  const found: [number, string, string][] = [];
  for (let i = 0; i < text.length; i++) {
    const swap = LETTER_SWAPS.find(([a]) => a === text[i]);
    if (swap) found.push([i, swap[0], swap[1]]);
  }
  if (found.length === 0) return null;
  const [i, expected, heard] = pick(rand, found);
  return {
    ...base(id, w, 'letter'),
    heard: text.slice(0, i) + heard + text.slice(i + 1),
    heardExact: true,
    slipExpected: expected,
    slipHeard: heard,
    at0: i,
    at1: i + 1,
  };
}

/** Another word of the page said in this one's place. */
export function wrongWordMark(id: string, w: number, heard: number): StoredMark | null {
  const text = wordText(heard);
  if (!text || text === wordText(w)) return null;
  return { ...base(id, w, 'word'), heard: text, heardExact: true, detail: 'replaced' };
}

const TAJWEED: { rule: string; madd?: [number, number] }[] = [
  { rule: 'madd_munfasil', madd: [2, 4] },
  { rule: 'madd_muttasil', madd: [2, 4] },
  { rule: 'madd_lazim', madd: [4, 6] },
  { rule: 'qalqalah' },
  { rule: 'ghunnah' },
  { rule: 'ikhfa' },
  { rule: 'idgham' },
];

/** A tajweed note (Strict takes only). */
export function tajweedMark(id: string, w: number, rand: Rand): StoredMark {
  const t = pick(rand, TAJWEED);
  return { ...base(id, w, 'tajweed'), rule: t.rule, ...(t.madd ? { got: t.madd[0], expected: t.madd[1] } : {}) };
}

/** One of the well-known slips into a similar ayah (scenarioQuran.ts's SLIPS). */
export function slipMark(id: string, slip: (typeof SLIPS)[number]): StoredMark {
  const m = base(id, slip.w, slip.kind);
  return {
    ...m,
    ...(slip.heard ? { heard: slip.heard, heardExact: true, detail: 'lookalike' as const } : {}),
    intoW: slip.into.w,
    intoSura: slip.into.ayah[0],
    intoAyah: slip.into.ayah[1],
  };
}

/** Seconds into a take for each mark, in word order (about 0.55 s a word from the take's first). */
export function timeMarks(marks: StoredMark[], from: number): StoredMark[] {
  return marks
    .sort((a, b) => a.w - b.w)
    .map((m) => {
      const t0 = Math.round((m.w - from) * 55) / 100;
      return { ...m, t0, t1: Math.round((t0 + 0.6) * 100) / 100 };
    });
}

// ---------------------------------------------------------------------------------------------- takes

export interface SeedTake {
  id: string;
  createdAt: number;
  day: string;
  level: 'words' | 'strict';
  hidden: boolean;
  from: number;
  to: number;
  secs: number;
  marks: StoredMark[];
}

export interface SeedClear {
  id: string;
  createdAt: number;
  day: string;
  w: number;
  group: 'word' | 'slip' | 'tajweed';
}

const counts = (marks: readonly StoredMark[]) => ({
  mistakes: marks.filter((m) => m.kind !== 'tajweed' && !((m.kind === 'harakat' || m.kind === 'letter') && m.sure === 'likely')).length,
  tajweed: marks.filter((m) => m.kind === 'tajweed').length,
  unclear: marks.filter((m) => (m.kind === 'harakat' || m.kind === 'letter') && m.sure === 'likely').length,
});

/** A take's document (record.ts's toStored, with the server's `updatedAt`). */
export function takeDocument(t: SeedTake, now: unknown): Record<string, unknown> {
  const c = counts(t.marks);
  const accuracy = Math.max(0, 1 - c.mistakes / wordsOnPagesReached(t.from, t.to));
  return {
    v: 1,
    kind: 'take',
    take: `scenario-${t.id}`,
    createdAt: t.createdAt,
    rev: t.createdAt + Math.round(t.secs * 1000),
    day: t.day,
    level: t.level,
    hidden: t.hidden,
    from: t.from,
    to: t.to,
    secs: t.secs,
    mistakes: c.mistakes,
    tajweed: c.tajweed,
    unclear: c.unclear,
    accuracy: Math.round(accuracy * 10000) / 10000,
    marks: t.marks,
    passed: [],
    recordingId: null,
    deleted: false,
    updatedAt: now,
  };
}

/** A "Clear now" record's document. */
export function clearDocument(c: SeedClear, now: unknown): Record<string, unknown> {
  return { v: 1, kind: 'clear', createdAt: c.createdAt, rev: c.createdAt, day: c.day, w: c.w, group: c.group, deleted: false, updatedAt: now };
}

export { SLIPS };
