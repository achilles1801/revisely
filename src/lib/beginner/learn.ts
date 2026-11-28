// Learning a surah on the beginner path (BEGIN-7): one ayah at a time, heard from Al-Husary's Mu'allim recitation (a
// teacher's pace, made for repeating after), slowly and three times, the way the short surahs are taught by ear. The
// recitation is the app's one player (lib/recitation), set for Learn while it plays and given back as it was after.

import type { RecitationOptions } from '../recitation';
import { loadQuranWords } from '../recite/quranWords';

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
