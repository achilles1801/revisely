// A take's passage history (pure; RMEM-7, Revisely Dev): the takes of the same stretch before it, for the summary's
// "This passage: your last 3 takes" (Majd, Nov 22 2026, after the Tarteel analysis: "we can queue up another session to
// implement this").

import type { QuranWords } from '../recite/quranWords';
import { ayahKey } from '../ayahKeys';
import { describeAyahs, spokenText } from '../passages';
import { formatAccuracy, mistakesLabel, scoreLevel } from '../reciteLive/score';
import type { ScoreLevel } from '../reciteLive/score';
import type { MemoryRecord, TakeRecord } from './record';
import { takeDaysAgo } from './describe';
import { t, weekdayName } from '../../i18n';

/** The summary lists at most this many earlier takes; the progress page has every one. */
export const HISTORY_MAX = 5;

/**
 * Whether two stretches of words are substantially the same: they share at least half of each. A take of the whole page
 * isn't the history of a take of two of its ayat (its score and mistakes are the page's), nor the other way round.
 */
export function samePassage(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  const shared = Math.min(a.to, b.to) - Math.max(a.from, b.from) + 1;
  if (shared <= 0) return false;
  return shared * 2 >= a.to - a.from + 1 && shared * 2 >= b.to - b.from + 1;
}

/**
 * The takes of this take's passage before it, newest first, at most `max`. A take forgotten, or kept without its final
 * answer (RECITE-11: its end wasn't checked, so its score isn't the passage's), isn't one.
 */
export function passageHistory(
  records: readonly MemoryRecord[],
  take: Pick<TakeRecord, 'id' | 'createdAt' | 'from' | 'to'>,
  max = HISTORY_MAX,
): TakeRecord[] {
  return records
    .filter((r): r is TakeRecord => r.kind === 'take' && !r.deleted && !r.unfinished)
    .filter((r) => r.id !== take.id && r.createdAt < take.createdAt && samePassage(r, take))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, max);
}

/** When a take was, as a day and never a date: "Earlier today", "Yesterday", "Friday", "9 days ago", "3 weeks ago". */
export function takeDay(at: number, now: number): string {
  const days = takeDaysAgo(at, now);
  if (days <= 0) return t('reciteMemory.history.earlierToday');
  if (days === 1) return t('reciteMemory.history.yesterday');
  if (days < 7) return weekdayName(new Date(at));
  if (days < 14) return t('reciteMemory.history.daysAgo', { count: days });
  if (days < 60) return t('reciteMemory.history.weeksAgo', { count: Math.floor(days / 7) });
  return t('reciteMemory.history.monthsAgo', { count: Math.max(2, Math.floor(days / 30)) });
}

/** The ayat a take ran over, as its first and last [surah, ayah]. */
function ayahsOf(words: QuranWords, take: { from: number; to: number }): [[number, number], [number, number]] {
  const a = words.ref(take.from);
  const b = words.ref(take.to);
  return [
    [a.sura, a.ayah],
    [b.sura, b.ayah],
  ];
}

/** "Ayahs 80–98" within the summary's surah, else the take's own surah-first name ("Yusuf 98 to Ar-Ra'd 2"). */
function rangeOf(words: QuranWords, take: { from: number; to: number }, sura: number): string {
  const [[s1, a1], [s2, a2]] = ayahsOf(words, take);
  if (s1 === sura && s2 === sura) {
    return a1 === a2 ? t('reciteMemory.passage.ayahN', { n: a1 }) : t('reciteMemory.passage.ayahs', { from: a1, to: a2 });
  }
  const keys: number[] = [];
  for (let w = take.from; w <= take.to; ) {
    const r = words.ref(w);
    keys.push(ayahKey(r.sura, r.ayah));
    w = words.verseRange(r.sura, r.ayah)[1];
  }
  return describeAyahs(keys);
}

export interface HistoryRow {
  take: TakeRecord;
  /** "Yesterday". */
  when: string;
  /** "97.2%" (by the page, as the score pill shows it). */
  score: string;
  level: ScoreLevel;
  /** "Ayahs 80–98 · 2 mistakes · page hidden": its ayat only when they aren't this take's. */
  detail: string;
  /** For VoiceOver, in words: "Yesterday: 97.2%, Ayahs 80 to 98, 2 mistakes, page hidden. Show it on the page". */
  label: string;
}

/**
 * The summary's rows for a take's history. A row's mistakes are as the summary counts them (tajweed notes and Not clear
 * apart, `TakeRecord.mistakes`).
 */
export function historyRows(words: QuranWords, current: { from: number; to: number }, takes: readonly TakeRecord[], now: number): HistoryRow[] {
  const [first, last] = ayahsOf(words, current);
  const sura = first[0];
  return takes.map((take) => {
    const [a, b] = ayahsOf(words, take);
    const same = a[0] === first[0] && a[1] === first[1] && b[0] === last[0] && b[1] === last[1];
    const range = same ? null : rangeOf(words, take, sura);
    const mistakes = mistakesLabel(take.mistakes);
    const hidden = take.hidden ? t('reciteMemory.rows.pageHidden') : null;
    const when = takeDay(take.createdAt, now);
    const score = formatAccuracy(take.accuracy);
    const spoken = [range ? spokenText(range) : null, mistakes, hidden].filter(Boolean).join(', '); // i18n-ignore (a list joined for VoiceOver)
    return {
      take,
      when,
      score,
      level: scoreLevel(take.accuracy),
      detail: [range, mistakes, hidden].filter(Boolean).join(' · '), // i18n-ignore (the rows' separator)
      label: t('reciteMemory.history.rowLabel', { when, score, detail: spoken }),
    };
  });
}
