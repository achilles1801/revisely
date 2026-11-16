// What Insights' Recitation section says (pure; Revisely Dev, RINS-2): kinds in words, surahs and ayahs first, days as
// people say them. Words and similar ayahs come before harakat, and "Not clear" is never counted (Majd, Nov 14 2026).

import { dayMonth, formatNumber, weekdayName } from '../../i18n';
import { shiftDay } from '../journal';
import { ayahKey } from '../ayahKeys';
import { describeAyahs, NBSP, surahName } from '../passages';
import { daysSince } from '../recency';
import { formatAccuracy } from '../reciteLive/score';
import type { RecitationInsights, SimilarSlip, SlippingPassage } from './insights';

const count = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;
const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** A revision day as people say it: "today", "yesterday", "Tuesday" (this week), "12 days ago". */
export function dayWords(day: string, today: string): string {
  const n = Math.max(0, daysSince(day, today));
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return weekdayName(new Date(`${day}T12:00:00`));
  return `${n} days ago`;
}

/** "on Tuesday", "today", "12 days ago": after "last". */
const lastWords = (day: string, today: string) => {
  const n = Math.max(0, daysSince(day, today));
  const w = dayWords(day, today);
  return n >= 2 && n < 7 ? `on ${w}` : w;
};

/** A passage of one surah by its ayahs: "Al-Kahf, ayahs 22–23", "Al-Baqarah, ayah 48". */
export function passageName(sura: number, from: number, to: number): string {
  const keys: number[] = [];
  for (let a = from; a <= to; a++) keys.push(ayahKey(sura, a));
  return describeAyahs(keys, { juz: false });
}

/**
 * The figure's words: "14 takes · up from 97.2%", "3 takes", or none in the range. With the weeks drawn under it
 * (`trend` false), only the takes: the weeks' own line says how it moved, so there's one comparison, not two.
 */
export function scoreLine(ins: Pick<RecitationInsights, 'takes' | 'score' | 'earlierScore'>, inWords: string, trend = true): string {
  if (ins.takes === 0) return `No takes ${inWords}`;
  const takes = count(ins.takes, 'take');
  if (!trend || ins.earlierScore === null || ins.score === null) return takes;
  const now = formatAccuracy(ins.score);
  const then = formatAccuracy(ins.earlierScore);
  if (now === then) return `${takes} · the same as before`;
  return `${takes} · ${ins.score > ins.earlierScore ? 'up' : 'down'} from ${then}`;
}

/**
 * A passage that keeps slipping, under its name. Smart Tracking on: how often it went wrong ("3 words still marked ·
 * wrong in 3 of 4 takes"). Off: when it was last recited instead (Majd, Nov 8 2026: recency where there's no strength).
 */
export function slipNote(p: SlippingPassage, smartTracking: boolean, today: string): string {
  const marked = `${count(p.words.length, 'word')} still marked`;
  if (smartTracking) return `${marked} · wrong in ${p.wrong} of ${count(p.tries, 'take')}`;
  return `${marked} · last recited ${dayWords(p.lastDay, today)}`;
}

/** A slip into a similar ayah: "Al-Baqarah 48 → 123", "Al-Baqarah 48 → Al-Imran 7"; an ending, its own ayah. */
export function similarTitle(s: SimilarSlip): string {
  const from = `${surahName(s.from[0])}${NBSP}${s.from[1]}`;
  if (s.ending) return from;
  const into = s.into[0] === s.from[0] ? `${s.into[1]}` : `${surahName(s.into[0])}${NBSP}${s.into[1]}`;
  return `${from} → ${into}`;
}

/** "You went on with the similar ayah · twice, last on Tuesday", "You ended it as ayah 5 ends · once". */
export function similarNote(s: SimilarSlip, today: string): string {
  const when = s.times === 1 ? lastWords(s.lastDay, today) : `${timesWord(s.times)}, last ${lastWords(s.lastDay, today)}`;
  if (s.ending) {
    const as = s.into[0] === s.from[0] ? `ayah${NBSP}${s.into[1]}` : `${surahName(s.into[0])}${NBSP}${s.into[1]}`;
    return `You ended it as ${as} ends · ${when}`;
  }
  return `You went on with the similar ayah · ${when}`;
}

/**
 * A take's slip into a similar ayah, under its line in Activity (RINS-3): "You went on with Al-Baqarah 123, a similar
 * ayah"; an ending, "You ended Al-Falaq 3 as ayah 5 ends".
 */
export function intoLine(s: Pick<SimilarSlip, 'from' | 'into' | 'ending'>): string {
  if (s.ending) {
    const as = s.into[0] === s.from[0] ? `ayah${NBSP}${s.into[1]}` : `${surahName(s.into[0])}${NBSP}${s.into[1]}`;
    return `You ended ${surahName(s.from[0])}${NBSP}${s.from[1]} as ${as} ends`;
  }
  return `You went on with ${surahName(s.into[0])}${NBSP}${s.into[1]}, a similar ayah`;
}

/** "6 words cleared · said right on 2 different days"; null with none. */
export function clearedLine(n: number): string | null {
  return n > 0 ? `${count(n, 'word')} cleared · said right on 2 different days` : null;
}

/**
 * The kinds in one line, words first: "Mostly words: 7 wrong · 3 skipped · 2 harakat." Then Not clear and tajweed
 * notes, never counted ("4 weren’t clear enough to check (not counted).").
 */
export function kindsLine(ins: Pick<RecitationInsights, 'kinds' | 'mistakes' | 'unclear' | 'tajweed' | 'strictTakes'>): string {
  const k = ins.kinds;
  const parts: string[] = [];
  if (ins.mistakes === 0) parts.push('No mistakes.');
  else {
    const words = k.wrong + k.skipped + k.added;
    const slips = k.harakat + k.letter;
    const list = [
      k.wrong ? `${k.wrong} wrong` : '',
      k.skipped ? `${k.skipped} skipped` : '',
      k.added ? `${k.added} extra` : '',
      k.harakat ? `${k.harakat} harakat` : '',
      k.letter ? `${k.letter} ${k.letter === 1 ? 'letter' : 'letters'}` : '',
    ].filter(Boolean);
    const lead = words === 0 ? 'Harakat and letters' : slips === 0 ? 'Words' : words >= slips ? 'Mostly words' : 'Mostly harakat and letters';
    parts.push(`${lead}: ${list.join(' · ')}.`);
  }
  if (ins.unclear > 0) parts.push(`${ins.unclear} ${ins.unclear === 1 ? 'wasn’t' : 'weren’t'} clear enough to check (not counted).`);
  if (ins.strictTakes > 0 && ins.tajweed > 0) parts.push(`${count(ins.tajweed, 'tajweed note')}.`);
  return parts.join(' ');
}

/** "Rated strong · wrong in 2 takes" (Smart Tracking on only). */
export function strongNote(p: SlippingPassage): string {
  return `Rated strong · wrong in ${count(p.wrong, 'take')}`;
}

/** The weeks for a screen reader: "Score by week: 2 Nov 96.9%, 9 Nov no takes, this week 98.9%". */
export function weeksSpoken(weeks: readonly { to: string; score: number | null }[]): string {
  const said = weeks.map((w, i) => {
    const v = w.score === null ? 'no takes' : formatAccuracy(w.score);
    const last = i === weeks.length - 1;
    return `${last ? 'this week' : weekLabel(w.to, false)} ${v}`;
  });
  return `Score by week: ${said.join(', ')}`;
}

/** A week under its bar: "This week", or the day it began ("2 Nov"). */
export function weekLabel(to: string, last: boolean): string {
  if (last) return 'This week';
  return dayMonth(new Date(`${shiftDay(to, -6)}T12:00:00`), { month: 'short' });
}

/** "3 weeks ago", "last week". */
const weeksAgo = (n: number) => (n === 1 ? 'last week' : `${n} weeks ago`);

/**
 * The weeks drawn, in one line above them (Majd, Nov 16 2026: the bare line "isn't intuitive"): the latest week with
 * takes against the first, "Up from 96.9% 3 weeks ago", "Down from 99.1% last week", "About the same as 4 weeks ago".
 * Null with fewer than two weeks that had takes.
 */
export function weeksTakeaway(weeks: readonly { score: number | null }[]): string | null {
  const lit = weeks.map((w, i) => ({ s: w.score, i })).filter((w): w is { s: number; i: number } => w.s !== null);
  if (lit.length < 2) return null;
  const first = lit[0];
  const last = lit[lit.length - 1];
  const ago = weeksAgo(last.i - first.i);
  const a = formatAccuracy(first.s);
  const b = formatAccuracy(last.s);
  // Within a tenth of a point: no direction worth naming.
  if (Math.abs(last.s - first.s) < 0.001 || a === b) return `About the same as ${ago}`;
  return `${last.s > first.s ? 'Up' : 'Down'} from ${a} ${ago}`;
}

/** The weeks to draw: the last `max`, from the first of them with takes to this week (at least the last two). */
export function weeksToDraw<T extends { score: number | null }>(weeks: readonly T[], max: number): T[] {
  let shown = weeks.slice(Math.max(0, weeks.length - max));
  while (shown.length > 2 && shown[0].score === null) shown = shown.slice(1);
  return shown;
}
