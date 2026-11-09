// The app's calls to the Ask coach (C6). Only previewTester accounts that opted in get an answer;
// the server decides, and says why when not.
import { auth } from '../firebase';
import { callFunction } from '../../services/firestoreService';
import type { CoachInsight } from './totals';

export interface CoachAnswer {
  answer: string;
  cached: boolean;
  remainingToday: number;
}

function signedIn() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to ask the coach.');
  return user;
}

/** What a callable answered: the protocol sends it as `{ result }`, not the answer itself. */
function resultOf(out: unknown): Record<string, unknown> | null {
  const r = out !== null && typeof out === 'object' ? (out as { result?: unknown }).result : undefined;
  return r !== null && typeof r === 'object' ? (r as Record<string, unknown>) : null;
}

/** Asks about one insight. `day` is the revision day (YYYY-MM-DD): one answer per insight and day. */
export async function askCoach(insight: CoachInsight, totals: Record<string, number>, day: string): Promise<CoachAnswer> {
  const r = resultOf(await callFunction(signedIn(), 'askCoach', { insight, totals, day }));
  if (!r || typeof r.answer !== 'string' || r.answer.trim() === '') throw new Error('The coach is unavailable. Try again.');
  return { answer: r.answer, cached: r.cached === true, remainingToday: typeof r.remainingToday === 'number' ? r.remainingToday : 0 };
}

/** Turns the coach on or off for this account (the notice is shown before turning it on). */
export async function setCoachOptIn(optIn: boolean): Promise<{ optIn: boolean }> {
  const r = resultOf(await callFunction(signedIn(), 'setCoachOptIn', { optIn }));
  if (!r || typeof r.optIn !== 'boolean') throw new Error('The setting did not save. Try again.');
  return { optIn: r.optIn };
}
