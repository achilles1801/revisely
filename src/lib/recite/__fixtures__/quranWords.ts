// The real word data, read straight from the asset (tests don't go through expo-asset).
import { readFileSync } from 'fs';
import { join } from 'path';
import { QuranWords, QuranWordsData } from '../quranWords';

let data: QuranWordsData | null = null;
let words: QuranWords | null = null;

export function wordsData(): QuranWordsData {
  if (!data) {
    data = JSON.parse(readFileSync(join(__dirname, '../../../data/quranWords.dat'), 'utf8')) as QuranWordsData;
  }
  return data;
}

export function quranWords(): QuranWords {
  if (!words) words = new QuranWords(wordsData());
  return words;
}

/** A verse in standard spelling, as recognition would write it. */
export function verse(sura: number, ayah: number): string[] {
  const w = quranWords();
  const [from, to] = w.verseRange(sura, ayah);
  const d = wordsData();
  const out: string[] = [];
  // Rebuild from the data's own imlaei text: the word index tells which verse.
  let v = 0;
  let index = 0;
  while (index + d.counts[v] <= from) index += d.counts[v++];
  out.push(...d.imlaei[v].split(' ').map((s) => s.replace(/ /g, ' ')));
  if (out.length !== to - from) throw new Error(`verse ${sura}:${ayah} has ${out.length} words, expected ${to - from}`);
  return out;
}

/** Several verses of one surah as one utterance. */
export function verses(sura: number, from: number, to: number): string[] {
  const out: string[] = [];
  for (let a = from; a <= to; a++) out.push(...verse(sura, a));
  return out;
}

export const say = (...parts: (string | string[])[]) =>
  parts.map((p) => (Array.isArray(p) ? p.join(' ') : p)).join(' ');
