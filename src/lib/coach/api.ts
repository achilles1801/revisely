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

/** Asks about one insight. `day` is the revision day (YYYY-MM-DD): one answer per insight and day. */
export async function askCoach(insight: CoachInsight, totals: Record<string, number>, day: string): Promise<CoachAnswer> {
  return (await callFunction(signedIn(), 'askCoach', { insight, totals, day })) as CoachAnswer;
}

/** Turns the coach on or off for this account (the notice is shown before turning it on). */
export async function setCoachOptIn(optIn: boolean): Promise<{ optIn: boolean }> {
  return (await callFunction(signedIn(), 'setCoachOptIn', { optIn })) as { optIn: boolean };
}
