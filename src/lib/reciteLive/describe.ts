// How a mark is worded on its card and in the summary (pure). Surah first, never a page number (NAME-1).

import { checkerWord, onNextWord } from './markPlace';
import { ayahKey } from '../ayahKeys';
import { pageNameOfAyah, surahName } from '../passages';
import { firstWordsOfAyah } from '../recite/quranWords';
import { tajweedName } from '../reciteCheck/result';
import type { QuranWords } from '../recite/quranWords';
import { isUnclear, type Mark, type MarkInto } from './contract';
import { t } from '../../i18n';

/** A "not clear" mark's line, on its card and in the summary. */
export function unclearNote(): string {
  return t('reciteLive.describe.unclearNote');
}

/**
 * "Wrong word", "Wrong haraka", "Madd munfasil (Beta)". A wrong haraka or letter is a mistake like a wrong word (Majd,
 * Nov 22 2026), and a tajweed note is labelled Beta wherever it shows (RECITE-2).
 */
export function markTitle(mark: Mark): string {
  if (isUnclear(mark)) return t('reciteLive.describe.notClear');
  switch (mark.kind) {
    case 'word':
      return mark.detail === 'order' ? t('reciteLive.describe.outOfOrder') : t('reciteLive.describe.wrongWord');
    case 'skipped':
      return t('reciteLive.describe.skippedWord');
    case 'added':
      // On the word the reciter was reaching for (lib/reciteLive/markPlace): they hesitated there. Past the end, or at a
      // surah's end, it stays on the word before it, as an extra word.
      if (onNextWord(mark)) return t('reciteLive.describe.hesitated');
      return mark.detail === 'trail' ? t('reciteLive.describe.extraAfterEnd') : t('reciteLive.describe.extraWord');
    case 'harakat':
      return mark.detail === 'shadda' ? t('reciteLive.describe.wrongShadda') : t('reciteLive.describe.wrongHaraka');
    case 'letter':
      return t('reciteLive.describe.wrongLetter');
    case 'tajweed':
      return t('reciteLive.describe.beta', { title: mark.rule ? tajweedName(mark.rule) : t('reciteLive.describe.tajweed') });
  }
}

/** "An-Naml, ayah 23", and "· likely" for a mark past the normal bar only. */
export function markPlace(mark: Mark): string {
  const place = pageNameOfAyah(ayahKey(mark.ayah[0], mark.ayah[1]));
  return mark.sure === 'likely' && !isUnclear(mark) ? t('reciteLive.describe.placeLikely', { place }) : place;
}

/**
 * Where a slip went, on the end-of-take card (`into`; Majd said yes, Nov 15 2026): "You continued with «…» in Luqman
 * (31:6), a similar ayah", "(and 2 others)" with more ayat reading the same; for a swapped ending, "You ended ayah 5 as ayah 3
 * ends" (the same surah, as the checker only names those). `place` is where the mark is, as the card names it.
 */
export function intoLine(mark: Mark & { into: MarkInto }): string {
  const [s, a] = mark.into.ayah;
  // A swapped ending is about two exact ayat, so it keeps their numbers.
  const place =
    s === mark.ayah[0]
      ? t('reciteLive.describe.ayahN', { n: mark.ayah[1] })
      : t('reciteLive.describe.place', { surah: surahName(mark.ayah[0]), ayah: mark.ayah[1] });
  const words = firstWordsOfAyah(s, a);
  const there = words
    ? t('reciteLive.describe.thereWords', { words, surah: surahName(s), sura: s, ayah: a })
    : t('reciteLive.describe.there', { surah: surahName(s), sura: s, ayah: a });
  if (mark.into.ending) {
    const as = s === mark.ayah[0] ? t('reciteLive.describe.ayahN', { n: a }) : there;
    return t('reciteLive.describe.endedAs', { place, as });
  }
  const others = mark.into.also?.length ?? 0;
  return others
    ? t('reciteLive.describe.continuedOthers', { there, count: others })
    : t('reciteLive.describe.continued', { there });
}

/** The same for VoiceOver: the surah and ayah in words. */
export function spokenIntoLine(mark: Mark & { into: MarkInto }): string {
  const [s, a] = mark.into.ayah;
  const place =
    s === mark.ayah[0]
      ? t('reciteLive.describe.spokenAyahN', { n: mark.ayah[1] })
      : t('reciteLive.describe.spokenThere', { surah: surahName(mark.ayah[0]), ayah: mark.ayah[1] });
  const there = t('reciteLive.describe.spokenThere', { surah: surahName(s), ayah: a });
  if (mark.into.ending) {
    return t('reciteLive.describe.endedAs', { place, as: s === mark.ayah[0] ? t('reciteLive.describe.spokenAyahN', { n: a }) : there });
  }
  const others = mark.into.also?.length ?? 0;
  return others
    ? t('reciteLive.describe.spokenContinuedOthers', { there, count: others })
    : t('reciteLive.describe.continued', { there });
}

/** Marks that name where a slip went, in page order (none taken off: those are in the Removed list). */
export const intoMarks = (marks: Mark[]): (Mark & { into: MarkInto })[] =>
  marks.filter((m): m is Mark & { into: MarkInto } => m.into != null).sort((x, y) => x.w - y.w);

/** The label of the Recited row: what was heard spelt out isn't exact. */
export const recitedLabel = (mark: Mark) =>
  mark.heardExact === false ? t('reciteLive.describe.asHeard') : t('reciteLive.describe.recited');

// i18n-ignore-start (each haraka's key in src/i18n/en/reciteLive.ts, describe)
const HARAKA_NAMES: Record<string, 'fathatan' | 'dammatan' | 'kasratan' | 'fatha' | 'damma' | 'kasra' | 'shadda' | 'sukun' | 'daggerAlif'> = {
  '\u064B': 'fathatan',
  '\u064C': 'dammatan',
  '\u064D': 'kasratan',
  '\u064E': 'fatha',
  '\u064F': 'damma',
  '\u0650': 'kasra',
  '\u0651': 'shadda',
  '\u0652': 'sukun',
  '\u0670': 'daggerAlif',
};
// i18n-ignore-end

/** A slip's side in words: harakat by name ("dammatan and shadda"), letters as Arabic in an isolate. */
function slipSide(text: string): string {
  const chars = [...text];
  if (chars.length && chars.every((c) => HARAKA_NAMES[c])) {
    // A shadda first reads best: "shadda and damma".
    const names = chars.map((c) => t(`reciteLive.describe.${HARAKA_NAMES[c]}`));
    return names.length === 1
      ? names[0]
      : t('reciteLive.describe.listAnd', {
          list: names.slice(0, -1).join(t('reciteLive.describe.listSeparator')),
          last: names[names.length - 1],
        });
  }
  return `\u2068${text}\u2069`;
}

/**
 * A harakat or letter slip in a line, Latin first: "Dammatan and shadda heard for kasratan", "⁨س⁩ heard for ⁨ص⁩".
 * A lone haraka is too small to read in a line of text, so harakat are named. Null when the checker didn't say which.
 */
export function slipLine(mark: Mark): string | null {
  if (onNextWord(mark)) return t('reciteLive.describe.hesitatedLine');
  if (!mark.slip || (mark.kind !== 'harakat' && mark.kind !== 'letter')) return null;
  const cap = (x: string) => (x.startsWith('\u2068') ? x : x.charAt(0).toUpperCase() + x.slice(1));
  const { expected, heard } = mark.slip;
  if (!heard) return t('reciteLive.describe.notHeard', { side: cap(slipSide(expected)) });
  if (!expected) return t('reciteLive.describe.added', { side: cap(slipSide(heard)) });
  return t('reciteLive.describe.heardFor', { heard: cap(slipSide(heard)), expected: slipSide(expected) });
}

/** For a tajweed note: what was heard, and the setting. */
export function tajweedLines(mark: Mark): { main: string; sub: string | null } {
  const counts = (n: number) => t('reciteLive.describe.counts', { count: Math.round(n) });
  switch (mark.rule) {
    case 'madd_munfasil':
    case 'madd_muttasil':
    case 'madd_aared':
      return {
        main: mark.got != null ? t('reciteLive.describe.heldAbout', { counts: counts(mark.got) }) : t('reciteLive.describe.notLengthSet'),
        sub: mark.expected != null ? t('reciteLive.describe.yourSetting', { counts: counts(mark.expected) }) : null,
      };
    case 'madd_lazim':
      return {
        main: mark.got != null ? t('reciteLive.describe.heldAbout', { counts: counts(mark.got) }) : t('reciteLive.describe.heldShort'),
        sub: t('reciteLive.describe.holdSix'),
      };
    case 'madd_dropped':
      return { main: t('reciteLive.describe.maddNotHeard'), sub: null };
    case 'qalqalah':
      return { main: t('reciteLive.describe.qalqalahNotHeard'), sub: null };
    case 'ghunnah':
      return { main: t('reciteLive.describe.ghunnahNotHeld'), sub: null };
    case 'ikhfa':
    case 'idgham':
    case 'idgham_no_ghunnah':
      return { main: t('reciteLive.describe.noonClear'), sub: null };
    case 'iqlab':
      return { main: t('reciteLive.describe.noonClear'), sub: t('reciteLive.describe.turnsMeem') };
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
  const at = checkerWord(mark);
  const [from, to] = added ? around(words, at, at + 1, reach - 1) : around(words, mark.w, mark.w, reach);
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
  const at = checkerWord(mark);
  const [from, to] = added ? around(words, at, at + 1, reach - 1) : around(words, mark.w, mark.w, reach);
  const out: PhrasePart[] = [];
  for (let i = from; i < to; i++) {
    if (!added && i === mark.w) {
      out.push(mark.kind === 'skipped' ? { text: '', role: 'gap' } : { text: mark.heard ?? '', role: 'recited' });
      continue;
    }
    out.push({ text: words.uthmani(i), role: 'context' });
    if (added && i === at) out.push({ text: mark.heard ?? '', role: 'recited' });
  }
  return out;
}

/** The summary's line under a finding: "Recited وَأُوهِيَتْ" (Arabic last, in an isolate), "Held about 2 counts, set to 4". */
export function findingNote(mark: Mark): string {
  const iso = (s: string) => `⁨${s}⁩`;
  if (mark.kind === 'tajweed') {
    const { main, sub } = tajweedLines(mark);
    return sub ? t('reciteLive.describe.noteWithSub', { main, sub }) : main;
  }
  if (mark.kind === 'skipped') return t('reciteLive.describe.leftOut');
  if (isUnclear(mark)) return unclearNote();
  const slip = slipLine(mark);
  if (!mark.heard) return mark.kind === 'word' ? t('reciteLive.describe.anotherWord') : (slip ?? '');
  return t('reciteLive.describe.recitedNote', { label: recitedLabel(mark), word: iso(mark.heard) });
}
