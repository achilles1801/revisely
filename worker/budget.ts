// Daily budgets for requests to The Clear Quran API, so no one user, and no
// burst of use, can spend the plan (10,000 requests a month) for everyone:
// - all users together: TCQ_DAILY_LIMIT_LIVE (production key) or
//   TCQ_DAILY_LIMIT_SANDBOX a day;
// - each user: TCQ_USER_DAILY_LIMIT a day.
// Only requests that reach The Clear Quran count (not answers from the cache).
// The counts live in one Durable Object and reset at midnight UTC.

export interface BudgetLimits {
  liveDaily: number;
  sandboxDaily: number;
  userDaily: number;
}

export type BudgetVerdict = { ok: true } | { ok: false; scope: 'user' | 'everyone'; retryAfter: number };

/** The storage the counts need (a Durable Object's, or a Map in tests). */
export interface CounterStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
}

export function utcDay(now: number): string {
  return new Date(now * 1000).toISOString().slice(0, 10);
}

/** Seconds until the next midnight UTC (when the counts reset). */
export function secondsToMidnight(now: number): number {
  return 86_400 - (Math.floor(now) % 86_400);
}

/** Count one request to The Clear Quran for `uid`, unless a budget is spent. */
export async function spend(
  storage: CounterStorage,
  { uid, env, now, limits }: { uid: string; env: 'live' | 'sandbox'; now: number; limits: BudgetLimits },
): Promise<BudgetVerdict> {
  const day = utcDay(now);
  // A new day: yesterday's counts (and every user's key) go.
  if ((await storage.get<string>('day')) !== day) {
    await storage.deleteAll();
    await storage.put('day', day);
  }
  const allKey = `all:${env}`;
  const userKey = `user:${uid}`;
  const all = (await storage.get<number>(allKey)) ?? 0;
  const user = (await storage.get<number>(userKey)) ?? 0;
  const cap = env === 'live' ? limits.liveDaily : limits.sandboxDaily;
  if (user >= limits.userDaily) return { ok: false, scope: 'user', retryAfter: secondsToMidnight(now) };
  if (all >= cap) return { ok: false, scope: 'everyone', retryAfter: secondsToMidnight(now) };
  await storage.put(allKey, all + 1);
  await storage.put(userKey, user + 1);
  return { ok: true };
}

/**
 * The Durable Object holding the counts (one instance, "global"). Each call is
 * handled in turn, so two requests can't both take the last one.
 */
export class TcqBudget {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const input = (await request.json()) as Parameters<typeof spend>[1];
    return Response.json(await spend(this.state.storage, input));
  }
}

/** Asks the budget; if the Durable Object can't answer, lets the request through (logged). */
export async function checkBudget(
  namespace: DurableObjectNamespace | undefined,
  input: Parameters<typeof spend>[1],
): Promise<BudgetVerdict> {
  if (!namespace) return { ok: true };
  try {
    const stub = namespace.get(namespace.idFromName('global'));
    const res = await stub.fetch('https://budget/spend', { method: 'POST', body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`budget: ${res.status}`);
    return (await res.json()) as BudgetVerdict;
  } catch (err) {
    console.error('tcq: budget unavailable; allowing the request', err);
    return { ok: true };
  }
}
