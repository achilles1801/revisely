// What the word's history card says (pure). Kinds in words, surah names, no page numbers.

import type { Attempt, WordMemory } from './memory';
import { CLEAR_AFTER } from './memory';
import { tajweedLines } from '../reciteLive/describe';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function clock(d: Date): string {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** When a take was: "Today, 7:51 PM", "Yesterday, 9:30 PM", "Fri 13 Nov", "13 Nov 2025" (another year). */
export function takeWhen(at: number, now: number, withTime = false): string {
  const d = new Date(at);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) return `Today, ${clock(d)}`;
  if (days === 1) return `Yesterday, ${clock(d)}`;
  const date =
    d.getFullYear() === new Date(now).getFullYear()
      ? `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
      : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return withTime ? `${date}, ${clock(d)}` : date;
}

/** "wrong in 3 of 6 takes", "wrong in your 1 take". */
export function wrongCount(memory: WordMemory): string {
  const wrong = memory.attempts.filter((a) => !a.right).length;
  const all = memory.attempts.length;
  return all === 1 ? 'wrong in your 1 take' : `wrong in ${wrong} of ${all} takes`;
}

/** What a try was, in words: "Right", or what went wrong ("said", "skipped", "added", the tajweed note). */
export function attemptWhat(a: Attempt): { right: boolean; text: string; heard: string | null } {
  if (a.right || !a.mark) return { right: true, text: 'Right', heard: null };
  const m = a.mark;
  switch (m.kind) {
    case 'skipped':
      return { right: false, text: 'Wrong · skipped', heard: null };
    case 'added':
      return { right: false, text: 'Wrong · added', heard: m.heard ?? null };
    case 'tajweed':
      return { right: false, text: `Wrong · ${tajweedLines(m).main.toLowerCase() || 'tajweed'}`, heard: null };
    default:
      return m.heard ? { right: false, text: 'Wrong · said', heard: m.heard } : { right: false, text: 'Wrong', heard: null };
  }
}

/** The clear rule as it stands for this word (CLEAR_AFTER right takes on as many days). */
export function clearLine(memory: WordMemory, today: string | null): string {
  if (!memory.open) return memory.clearedByHand ? 'Cleared by you.' : 'Cleared: said right on 2 different days.';
  if (memory.needed >= CLEAR_AFTER) return `Say it right on ${CLEAR_AFTER} different days to clear it.`;
  const last = memory.attempts[memory.attempts.length - 1];
  const rightToday = last?.right && last.take.day === today;
  return rightToday ? 'Right today. Right again on another day clears it.' : 'Right once. Right again on another day clears it.';
}
