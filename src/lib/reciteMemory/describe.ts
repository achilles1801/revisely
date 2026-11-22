// What the word's history card says (pure). Kinds in words, surah names, no page numbers.

import type { Attempt, WordMemory } from './memory';
import { CLEAR_AFTER } from './memory';
import { tajweedLines } from '../reciteLive/describe';
import { currentLanguage, dayMonth, formatTime, t } from '../../i18n';

const DAY_MS = 86_400_000;

/** A take's clock time: "7:51 PM" in English, as it always was; another language writes the phone's own. */
export function takeClock(at: number): string {
  const d = new Date(at);
  if (currentLanguage() !== 'en') return formatTime(d);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** How many days before `now`'s day a take's day was: 0 today, 1 yesterday. */
export function takeDaysAgo(at: number, now: number): number {
  return Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
}

/** When a take was: "Today, 7:51 PM", "Yesterday, 9:30 PM", "Fri 13 Nov", "13 Nov 2025" (another year). */
export function takeWhen(at: number, now: number, withTime = false): string {
  const d = new Date(at);
  const days = takeDaysAgo(at, now);
  if (days === 0) return t('reciteMemory.todayAt', { time: takeClock(at) });
  if (days === 1) return t('reciteMemory.yesterdayAt', { time: takeClock(at) });
  const date =
    d.getFullYear() === new Date(now).getFullYear()
      ? dayMonth(d, { month: 'short', weekday: 'short' })
      : dayMonth(d, { month: 'short', year: true });
  return withTime ? t('reciteMemory.dateAt', { date, time: takeClock(at) }) : date;
}

/** "wrong in 3 of 6 takes", "wrong in your 1 take". */
export function wrongCount(memory: WordMemory): string {
  const wrong = memory.attempts.filter((a) => !a.right).length;
  const all = memory.attempts.length;
  return all === 1 ? t('reciteMemory.wrongInOnly') : t('reciteMemory.wrongIn', { wrong, count: all });
}

/** What a try was, in words: "Right", or what went wrong ("said", "skipped", "added", the tajweed note). */
export function attemptWhat(a: Attempt): { right: boolean; text: string; heard: string | null } {
  if (a.right || !a.mark) return { right: true, text: t('reciteMemory.right'), heard: null };
  const m = a.mark;
  switch (m.kind) {
    case 'skipped':
      return { right: false, text: t('reciteMemory.wrongSkipped'), heard: null };
    case 'added':
      return { right: false, text: t('reciteMemory.wrongAdded'), heard: m.heard ?? null };
    case 'tajweed':
      return { right: false, text: t('reciteMemory.wrongNote', { note: tajweedLines(m).main.toLowerCase() || t('reciteMemory.tajweed') }), heard: null };
    default:
      return m.heard
        ? { right: false, text: t('reciteMemory.wrongSaid'), heard: m.heard }
        : { right: false, text: t('reciteMemory.wrong'), heard: null };
  }
}

/** The clear rule as it stands for this word (CLEAR_AFTER right takes on as many days). */
export function clearLine(memory: WordMemory, today: string | null): string {
  if (!memory.open) return memory.clearedByHand ? t('reciteMemory.clearedByYou') : t('reciteMemory.clearedTwoDays');
  // What clears it, plainly (Majd, Nov 22 2026, "yeah that's fine"): how many more right takes, and on other days. A
  // tajweed note clears only with takes that check tajweed (Strict).
  const strict = memory.group === 'tajweed';
  if (memory.needed >= CLEAR_AFTER) return t(strict ? 'reciteMemory.moreTakesStrict' : 'reciteMemory.moreTakes', { count: memory.needed });
  const last = memory.attempts[memory.attempts.length - 1];
  const rightToday = last?.right && last.take.day === today;
  if (strict) return rightToday ? t('reciteMemory.rightTodayStrict') : t('reciteMemory.rightOnceStrict');
  return rightToday ? t('reciteMemory.rightToday') : t('reciteMemory.rightOnce');
}
