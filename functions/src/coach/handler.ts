/**
 * The Ask coach (C6): one answer per user, insight and revision day, cached; at most
 * DAILY_QUESTIONS new answers a user a day; a monthly hard cap in dollars that stops calls.
 * Only previewTester accounts that have opted in may ask (the privacy wording waits for
 * Majd's sign-off). Storage and the model call are injected, so this runs in tests.
 */
import { CallDeps, CoachCallError, CoachReply, callCoach } from './call';
import { costUsd, Usage, worstCaseCostUsd } from './pricing';
import { COACH_MAX_TOKENS, buildCoachRequest, validateTotals, CoachInsight } from './prompt';

export const DAILY_QUESTIONS = 5;
/**
 * The monthly hard cap in dollars, shared by the Ask coach and Revo (one ledger), unless
 * config/coach.monthlyCapUsd sets another (functions/scripts/set-coach-cap.js): raising it
 * needs no code change or deploy.
 */
export const MONTHLY_CAP_USD = 10;
/** The highest cap the config may set (a typo can't open the budget wide). */
export const MAX_MONTHLY_CAP_USD = 1000;

/** The cap a config value gives: a number from 0 to MAX_MONTHLY_CAP_USD, else the default. */
export function monthlyCapFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_MONTHLY_CAP_USD ? value : MONTHLY_CAP_USD;
}

/**
 * The share of the month's cap one UTC day may spend on Revo, unless config/coach.dailyCapUsd sets
 * another: a burst (or one account's abuse) then rests Revo until the next UTC day, not the month.
 */
export const DAILY_CAP_SHARE = 0.1;

/** The daily cap a config value gives: a number from 0 to the monthly cap, else DAILY_CAP_SHARE of it. */
export function dailyCapFrom(value: unknown, monthly: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= monthly) return value;
  return Math.round(monthly * DAILY_CAP_SHARE * 100) / 100;
}
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CoachErrorCode = 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'resource-exhausted' | 'unavailable';

export class CoachError extends Error {
  constructor(
    readonly code: CoachErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface CoachStore {
  isPreviewTester(uid: string): Promise<boolean>;
  hasOptedIn(uid: string): Promise<boolean>;
  setOptIn(uid: string, optIn: boolean): Promise<void>;
  getAnswer(uid: string, insight: CoachInsight, day: string): Promise<string | null>;
  setAnswer(uid: string, insight: CoachInsight, day: string, text: string): Promise<void>;
  /** Counts a new question for the UTC day if under the limit. False when the limit is reached. */
  reserveQuestion(uid: string, utcDay: string, limit: number): Promise<boolean>;
  releaseQuestion(uid: string, utcDay: string): Promise<void>;
  questionsToday(uid: string, utcDay: string): Promise<number>;
  /** Adds `amount` to the month's spend if it stays within `cap`. False when it would not. */
  reserveSpend(month: string, amount: number, cap: number): Promise<boolean>;
  /** The monthly cap in dollars (config/coach.monthlyCapUsd); MONTHLY_CAP_USD when unset. */
  monthlyCapUsd?(): Promise<number>;
  /** Replaces a reservation with the real cost and adds the call's tokens to the ledger. */
  settleSpend(month: string, reserved: number, actual: number, usage: CallLedger, day: string): Promise<void>;
}

/** What the usage ledger keeps: token counts and calls, never content. */
export interface CallLedger {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface CoachLog {
  (entry: { event: string; insight?: CoachInsight; cached?: boolean; attempts?: number; costUsd?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number; code?: string }): void;
}

export interface Deps {
  store: CoachStore;
  call: (request: ReturnType<typeof buildCoachRequest>) => Promise<CoachReply>;
  now: () => Date;
  log: CoachLog;
}

export interface AskResult {
  answer: string;
  cached: boolean;
  remainingToday: number;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** The ledger entry for one call (Revo uses the same). */
export function ledgerOf(usage: Usage): CallLedger {
  const u = usage as Record<string, number | undefined>;
  const cacheWrite = (u.cache_creation_input_tokens ?? 0) || 0;
  return {
    calls: 1,
    input: u.input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite,
  };
}

export async function handleAskCoach(
  auth: { uid: string } | undefined,
  data: unknown,
  deps: Deps,
): Promise<AskResult> {
  if (!auth?.uid) throw new CoachError('unauthenticated', 'Sign in to ask the coach.');
  const uid = auth.uid;
  if (!(await deps.store.isPreviewTester(uid))) throw new CoachError('permission-denied', 'The coach is not available on this account yet.');
  if (!(await deps.store.hasOptedIn(uid))) throw new CoachError('permission-denied', 'Turn the coach on first, in Insights.');

  const body = (data ?? {}) as { insight?: unknown; totals?: unknown; day?: unknown };
  let checked: { insight: CoachInsight; totals: Record<string, number> };
  try {
    checked = validateTotals(body.insight, body.totals);
  } catch (err) {
    throw new CoachError('invalid-argument', err instanceof Error ? err.message : 'The question is not valid.');
  }
  if (typeof body.day !== 'string' || !DAY_RE.test(body.day)) throw new CoachError('invalid-argument', 'The day is not valid.');
  const day = body.day;
  const { insight, totals } = checked;

  // One answer per insight and revision day: a repeat tap is free.
  const cachedAnswer = await deps.store.getAnswer(uid, insight, day);
  if (cachedAnswer != null) {
    deps.log({ event: 'answer', insight, cached: true });
    return { answer: cachedAnswer, cached: true, remainingToday: await remaining(deps, uid, utcDay(deps.now())) };
  }

  const today = utcDay(deps.now());
  if (!(await deps.store.reserveQuestion(uid, today, DAILY_QUESTIONS))) {
    throw new CoachError('resource-exhausted', `You have used today’s ${DAILY_QUESTIONS} questions. Ask again tomorrow.`);
  }

  const request = buildCoachRequest(insight, totals);
  const month = today.slice(0, 7);
  const reserved = worstCaseCostUsd(JSON.stringify(request).length, COACH_MAX_TOKENS);
  const cap = (await deps.store.monthlyCapUsd?.()) ?? MONTHLY_CAP_USD;
  if (!(await deps.store.reserveSpend(month, reserved, cap))) {
    await deps.store.releaseQuestion(uid, today);
    deps.log({ event: 'capped', insight });
    throw new CoachError('resource-exhausted', 'The coach is paused until next month.');
  }

  let reply: CoachReply;
  try {
    reply = await deps.call(request);
  } catch (err) {
    await deps.store.settleSpend(month, reserved, 0, { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, today);
    await deps.store.releaseQuestion(uid, today);
    const code = err instanceof CoachCallError ? err.status : null;
    deps.log({ event: 'failed', insight, code: code == null ? 'network' : String(code) });
    throw new CoachError('unavailable', err instanceof Error ? err.message : 'The coach is unavailable. Try again.');
  }

  const actual = costUsd(reply.usage);
  const ledger = ledgerOf(reply.usage);
  await deps.store.settleSpend(month, reserved, actual, ledger, today);
  await deps.store.setAnswer(uid, insight, day, reply.text);
  deps.log({
    event: 'answer',
    insight,
    cached: false,
    attempts: reply.attempts,
    costUsd: actual,
    input: ledger.input,
    output: ledger.output,
    cacheRead: ledger.cacheRead,
    cacheWrite: ledger.cacheWrite,
  });
  return { answer: reply.text, cached: false, remainingToday: await remaining(deps, uid, today) };
}

/** Turns the coach on or off for the caller (a previewTester account). */
export async function handleSetOptIn(auth: { uid: string } | undefined, data: unknown, deps: Deps): Promise<{ optIn: boolean }> {
  if (!auth?.uid) throw new CoachError('unauthenticated', 'Sign in first.');
  if (!(await deps.store.isPreviewTester(auth.uid))) throw new CoachError('permission-denied', 'The coach is not available on this account yet.');
  const optIn = (data as { optIn?: unknown } | null)?.optIn;
  if (typeof optIn !== 'boolean') throw new CoachError('invalid-argument', 'optIn must be true or false.');
  await deps.store.setOptIn(auth.uid, optIn);
  return { optIn };
}

async function remaining(deps: Deps, uid: string, today: string): Promise<number> {
  return DAILY_QUESTIONS - (await deps.store.questionsToday(uid, today));
}
