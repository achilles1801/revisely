// Learning a surah on the beginner path (BEGIN-7): one ayah at a time, heard from Al-Husary's Mu'allim recitation (a
// teacher's pace, made for repeating after), slowly and three times, the way the short surahs are taught by ear. The
// recitation is the app's one player (lib/recitation), set for Learn while it plays and given back as it was after.

import type { TextSegment } from '../clearQuran';
import type { RecitationOptions } from '../recitation';
import { loadQuranWords } from '../recite/quranWords';
import { saheehFootnotes, saheehSegments, type SaheehVerse } from '../saheeh';

export type LearnStep = 'listen' | 'repeat' | 'recall';

export const LEARN_STEPS: readonly LearnStep[] = ['listen', 'repeat', 'recall'];

/** Al-Husary, Mu'allim: a teacher's recitation with a pause to repeat. */
export const LEARN_VOICE = 'husary:muallim';
export const LEARN_SPEED = 0.75;
export const LEARN_PLAYS = 3;

/** How an ayah plays at each step: Listen three times through; Repeat three times with a pause as long as it after each. */
export function learnOptions(step: LearnStep): RecitationOptions {
  return { speed: LEARN_SPEED, repeat: LEARN_PLAYS, pauseFactor: step === 'repeat' ? 1 : 0 };
}

/** A surah's ayahs in the mushaf's script, from the app's own Qur'an text (src/data/quranWords.dat, on the phone). */
export async function surahText(sura: number, ayahs: number): Promise<string[]> {
  const words = await loadQuranWords();
  return Array.from({ length: ayahs }, (_, i) => {
    const [start, end] = words.verseRange(sura, i + 1);
    const out: string[] = [];
    for (let w = start; w < end; w++) out.push(words.uthmani(w));
    return out.join(' ');
  });
}

/** An ayah's meaning as a beginner's screens show it (BEGIN-4, BEGIN-7): the text with its footnote numbers raised, and the footnotes. */
export interface Meaning {
  segments: TextSegment[];
  footnotes: { mark: string; text: string }[];
}

/**
 * Saheeh International's verse as shown, every one: its text exactly as given, a "[n]" marker that has its footnote
 * raised, and its footnotes (QuranEnc's terms: nothing cut). Null only with no verse or no text. (Before: a verse with a
 * footnote was left out, so Al-Fatihah's first, second and fourth ayahs, and 161 of the path's 571, had none.)
 */
export function meaningOf(verse: Pick<SaheehVerse, 'text' | 'footnotes'> | null | undefined): Meaning | null {
  const text = verse?.text.trim();
  if (!verse || !text) return null;
  const footnotes = verse.footnotes ?? '';
  return { segments: saheehSegments(text, footnotes), footnotes: footnotes.trim() ? saheehFootnotes(footnotes) : [] };
}

/** The meaning as one line of text (VoiceOver, tests): the footnote numbers raised in place. */
export const meaningText = (m: Meaning): string => m.segments.map((s) => ('footnote' in s ? s.footnote : s.text)).join('');
