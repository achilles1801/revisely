// How a mark is worded on its card and in the summary (pure). Surah first, never a page number (NAME-1).

import { surahName } from '../passages';
import { tajweedName } from '../reciteCheck/result';
import type { QuranWords } from '../recite/quranWords';
import type { Mark } from './contract';

const NBSP = ' ';

/** "Wrong word", "Harakat slip", "Madd munfasil". */
export function markTitle(mark: Mark): string {
  switch (mark.kind) {
    case 'word':
      return mark.detail === 'order' ? 'Out of order' : 'Wrong word';
    case 'skipped':
      return 'Skipped word';
    case 'added':
      return mark.detail === 'trail' ? 'Added after the end' : 'Added word';
    case 'harakat':
      return mark.detail === 'shadda' ? 'Shadda slip' : 'Harakat slip';
    case 'letter':
      return 'Letter slip';
    case 'tajweed':
      return mark.rule ? tajweedName(mark.rule) : 'Tajweed';
  }
}

/** "An-Naml, ayah 23", with "· likely" for a mark past the normal bar only. */
export function markPlace(mark: Mark): string {
  const place = `${surahName(mark.ayah[0])}, ayah${NBSP}${mark.ayah[1]}`;
  return mark.sure === 'likely' ? `${place} · likely` : place;
}

/** The label of the Recited row: what was heard spelt out isn't exact. */
export const recitedLabel = (mark: Mark) => (mark.heardExact === false ? 'As heard' : 'Recited');

/**
 * A harakat or letter slip in a line, Latin first and the Arabic in isolates: "ي heard for ء". A haraka alone is shown
 * on a tatweel (ـَ) so it has something to sit on. Null when the checker didn't say which.
 */
export function slipLine(mark: Mark): string | null {
  if (!mark.slip || (mark.kind !== 'harakat' && mark.kind !== 'letter')) return null;
  const iso = (s: string) => `\u2068${/^[\u064B-\u0652\u0670]+$/.test(s) ? `\u0640${s}` : s}\u2069`;
  const { expected, heard } = mark.slip;
  if (!heard) return `${iso(expected)} not heard`;
  if (!expected) return `${iso(heard)} added`;
  return `${iso(heard)} heard for ${iso(expected)}`;
}

/** For a tajweed note: what was heard, and the setting. */
export function tajweedLines(mark: Mark): { main: string; sub: string | null } {
  const counts = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'count' : 'counts'}`;
  switch (mark.rule) {
    case 'madd_munfasil':
    case 'madd_muttasil':
    case 'madd_aared':
      return {
        main: mark.got != null ? `Held about ${counts(mark.got)}` : 'Not the length set',
        sub: mark.expected != null ? `Your setting: ${counts(mark.expected)}` : null,
      };
    case 'madd_lazim':
      return { main: mark.got != null ? `Held about ${counts(mark.got)}` : 'Held short', sub: 'Hold it for 6 counts' };
    case 'madd_dropped':
      return { main: 'The madd wasn’t heard', sub: null };
    case 'qalqalah':
      return { main: 'The qalqalah wasn’t heard', sub: null };
    case 'ghunnah':
      return { main: 'The ghunnah wasn’t held', sub: null };
    case 'ikhfa':
    case 'idgham':
    case 'idgham_no_ghunnah':
      return { main: 'The noon was said clearly', sub: null };
    case 'iqlab':
      return { main: 'The noon was said clearly', sub: 'It turns into a meem here' };
    default:
      return { main: '', sub: null };
  }
}

/** A piece of an Arabic phrase on the card: the words around, the expected or recited word, or a gap. */
export interface PhrasePart {
  text: string;
  role: 'context' | 'expected' | 'recited' | 'gap';
}

/** The words of the mark's ayah within `reach` of [a, b]. */
function around(words: QuranWords, a: number, b: number, reach: number): [number, number] {
  const ref = words.ref(a);
  const [vFrom, vTo] = words.verseRange(ref.sura, ref.ayah);
  return [Math.max(vFrom, a - reach), Math.min(vTo, b + reach + 1)];
}

/**
 * The Expected row: the mark's word in its place with `reach` words either side (in its ayah). An added word has no
 * word of its own: the words either side of the gap.
 */
export function expectedPhrase(words: QuranWords, mark: Mark, reach = 2): PhrasePart[] {
  const added = mark.kind === 'added';
  const [from, to] = added ? around(words, mark.w, mark.w + 1, reach - 1) : around(words, mark.w, mark.w, reach);
  const out: PhrasePart[] = [];
  for (let i = from; i < to; i++) {
    out.push({ text: words.uthmani(i), role: !added && i === mark.w ? 'expected' : 'context' });
  }
  return out;
}

/**
 * The Recited row: the same words with what was said in the mark's place (a gap for a skipped word, the added words
 * after their word). Null when there's nothing to show (a wrong word with no heard text, a tajweed note).
 */
export function recitedPhrase(words: QuranWords, mark: Mark, reach = 2): PhrasePart[] | null {
  if (mark.kind === 'tajweed') return null;
  if (mark.kind !== 'skipped' && !mark.heard) return null;
  const added = mark.kind === 'added';
  const [from, to] = added ? around(words, mark.w, mark.w + 1, reach - 1) : around(words, mark.w, mark.w, reach);
  const out: PhrasePart[] = [];
  for (let i = from; i < to; i++) {
    if (!added && i === mark.w) {
      out.push(mark.kind === 'skipped' ? { text: '', role: 'gap' } : { text: mark.heard ?? '', role: 'recited' });
      continue;
    }
    out.push({ text: words.uthmani(i), role: 'context' });
    if (added && i === mark.w) out.push({ text: mark.heard ?? '', role: 'recited' });
  }
  return out;
}

/** The summary's line under a finding: "Recited وَأُوهِيَتْ" (Arabic last, in an isolate), "Held about 2 counts, set to 4". */
export function findingNote(mark: Mark): string {
  const iso = (s: string) => `⁨${s}⁩`;
  if (mark.kind === 'tajweed') {
    const { main, sub } = tajweedLines(mark);
    return sub ? `${main} · ${sub}` : main;
  }
  if (mark.kind === 'skipped') return 'Left out';
  if (!mark.heard) return mark.kind === 'word' ? 'Said as another word' : '';
  return `${recitedLabel(mark)} ${iso(mark.heard)}`;
}
