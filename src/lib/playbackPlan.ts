// How a recitation plays (Audio Options): the speed, how often each verse is
// repeated, the pause after each verse, and the range of verses. Pure, so the
// engine (lib/recitation) and the sheet share one set of rules.

import { versesOnPage } from './ayahBounds';
import { getJuzForPage, getJuzRange, getSurahDisplay } from './quranData';
import { globalVerseNumber, nextVerse, pageOfVerse, previousVerse, VerseKey } from './verses';

/** Playback speeds, fastest first (the speed menu's order). */
export const SPEEDS = [2, 1.75, 1.5, 1.25, 1.1, 1, 0.9, 0.75, 0.5, 0.25] as const;

/** How many times each verse plays; Infinity loops it until stopped. */
export const REPEATS = [Infinity, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** The pause after each verse, as a share of the verse's own length. */
export const PAUSES = [0, 0.5, 1, 1.5, 2] as const;

export type PlayUpTo = 'page' | 'surah' | 'juz' | 'custom';
export const PLAY_UP_TO: PlayUpTo[] = ['page', 'surah', 'juz', 'custom'];
export const PLAY_UP_TO_LABELS: Record<PlayUpTo, string> = {
  page: 'Page',
  surah: 'Surah',
  juz: 'Juz’',
  custom: 'Custom',
};

export interface PlaybackOptions {
  speed: number;
  repeat: number;
  pauseFactor: number;
  playUpTo: PlayUpTo;
}

export const DEFAULT_PLAYBACK: PlaybackOptions = { speed: 1, repeat: 1, pauseFactor: 0, playUpTo: 'juz' };

/** Keeps only values the menus offer; anything else falls back to the default. */
export function cleanOptions(raw: Partial<Record<keyof PlaybackOptions, unknown>> | null | undefined): PlaybackOptions {
  const o = raw ?? {};
  const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  // Infinity doesn't survive JSON: a loop is stored as 0.
  const repeat = o.repeat === 0 ? Infinity : o.repeat;
  return {
    speed: pick(o.speed, SPEEDS, DEFAULT_PLAYBACK.speed),
    repeat: pick(repeat, REPEATS, DEFAULT_PLAYBACK.repeat),
    pauseFactor: pick(o.pauseFactor, PAUSES, DEFAULT_PLAYBACK.pauseFactor),
    playUpTo: pick(o.playUpTo, PLAY_UP_TO, DEFAULT_PLAYBACK.playUpTo),
  };
}

/** For storage: a loop as 0, since JSON has no Infinity. */
export function storableOptions(o: PlaybackOptions): Record<string, unknown> {
  return { ...o, repeat: o.repeat === Infinity ? 0 : o.repeat };
}

export const speedLabel = (s: number) => `${s}×`;
export const repeatLabel = (r: number) => (r === Infinity ? 'Loop' : `${r}×`);
export const pauseLabel = (p: number) => (p === 0 ? 'Off' : `${p}×`);

/** After a verse ends: play it again, or go on. `round` counts from 1. */
export function afterVerse(round: number, repeat: number): 'again' | 'next' {
  return round < repeat ? 'again' : 'next';
}

/** The pause after a verse that took `durationSec` of audio at `speed`. */
export function pauseMs(durationSec: number, speed: number, pauseFactor: number): number {
  if (!(pauseFactor > 0) || !(durationSec > 0) || !(speed > 0)) return 0;
  return Math.round((durationSec / speed) * pauseFactor * 1000);
}

export const compareVerses = (a: VerseKey, b: VerseKey) => globalVerseNumber(a) - globalVerseNumber(b);
export const sameVerse = (a: VerseKey | null | undefined, b: VerseKey | null | undefined) =>
  !!a && !!b && a.sura === b.sura && a.ayah === b.ayah;

/** The last verse that begins on `page`. */
export function lastVerseOfPage(page: number): VerseKey {
  const starting = versesOnPage(page).filter((v) => pageOfVerse(v) === page);
  const last = starting[starting.length - 1] ?? versesOnPage(page).slice(-1)[0];
  return last ? { sura: last.sura, ayah: last.ayah } : { sura: 114, ayah: 6 };
}

/** Where "Play up to" ends a range that starts at `from`. */
export function rangeEnd(from: VerseKey, upTo: PlayUpTo, custom?: VerseKey | null): VerseKey {
  switch (upTo) {
    case 'page':
      return lastVerseOfPage(pageOfVerse(from));
    case 'surah':
      return { sura: from.sura, ayah: getSurahDisplay(from.sura)?.ayahCount ?? from.ayah };
    case 'juz':
      return lastVerseOfPage(getJuzRange(getJuzForPage(pageOfVerse(from))).end);
    case 'custom':
      return custom && compareVerses(custom, from) >= 0 ? custom : rangeEnd(from, 'surah');
  }
}

/** `to` never comes before `from`. */
export function clampTo(from: VerseKey, to: VerseKey): VerseKey {
  return compareVerses(to, from) < 0 ? from : to;
}

export interface VerseRange {
  from: VerseKey;
  to: VerseKey;
}

/** The verse after `v` within the range (null past its end). */
export function nextInRange(range: VerseRange, v: VerseKey): VerseKey | null {
  if (compareVerses(v, range.to) >= 0) return null;
  return nextVerse(v);
}

/** The verse before `v` within the range (null at its start). */
export function previousInRange(range: VerseRange, v: VerseKey): VerseKey | null {
  if (compareVerses(v, range.from) <= 0) return null;
  return previousVerse(v);
}
