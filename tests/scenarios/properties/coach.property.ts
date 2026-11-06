// The Ask coach (C6): cost, validation, the cacheable prompt, retries, and the handler's gates,
// daily limit, monthly cap and answer cache. Storage and the API are fakes.
import { costUsd, splitUsage, worstCaseCostUsd, PRICING } from '../../../functions/src/coach/pricing';
import { COACH_INSIGHTS, COACH_SYSTEM_PROMPT, buildCoachRequest, validateTotals } from '../../../functions/src/coach/prompt';
import { CoachCallError, backoffMs, callCoach, BASE_BACKOFF_MS } from '../../../functions/src/coach/call';
import { CoachError, CoachStore, DAILY_QUESTIONS, MONTHLY_CAP_USD, handleAskCoach, handleSetOptIn } from '../../../functions/src/coach/handler';

const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 2000, cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 1000 } };

describe('cost (COACH-3)', () => {
  it('[COACH-3] prices each part of the usage at its own rate', () => {
    const expected = (1000 * 0.1 + 100 * 0.5 + 1000 * 0.125 + 1000 * 0.2 + 5000 * 0.01) / 1e6;
    expect(costUsd(usage)).toBeCloseTo(expected, 8);
  });

  it('[COACH-3] counts cache creation as 5-minute when it is not split', () => {
    expect(splitUsage({ cache_creation_input_tokens: 500 })).toMatchObject({ cacheWrite5m: 500, cacheWrite1h: 0 });
  });

  it('[COACH-1] a worst-case reserve is never below the real cost of the same prompt', () => {
    const reserve = worstCaseCostUsd(10_000, 300);
    expect(reserve).toBeGreaterThanOrEqual(costUsd({ input_tokens: 5000, output_tokens: 300 }));
    expect(PRICING.cacheReadPerMTok).toBeLessThan(PRICING.inputPerMTok);
  });
});

describe('the payload (COACH-2)', () => {
  it('[COACH-2] accepts exactly an insight’s numeric totals', () => {
    expect(validateTotals('pace', { pagesPerDay7: 4.5, pagesPerDay30: 3, plannedPerDay: 5 }).totals.plannedPerDay).toBe(5);
  });

  it('[COACH-2] refuses an unknown insight, extra or missing fields, and non-numbers', () => {
    expect(() => validateTotals('notes', {})).toThrow('unknown insight');
    expect(() => validateTotals('pace', { pagesPerDay7: 1, pagesPerDay30: 1, plannedPerDay: 1, note: 'x' })).toThrow();
    expect(() => validateTotals('pace', { pagesPerDay7: 1, pagesPerDay30: 1 })).toThrow();
    expect(() => validateTotals('pace', { pagesPerDay7: 'a', pagesPerDay30: 1, plannedPerDay: 1 })).toThrow();
    expect(() => validateTotals('pace', { pagesPerDay7: -1, pagesPerDay30: 1, plannedPerDay: 1 })).toThrow();
  });
});

describe('the prompt (COACH-3)', () => {
  it('[COACH-3] is cached: a stable system prompt above the 512-token minimum (about four characters a token)', () => {
    expect(COACH_SYSTEM_PROMPT.length / 4).toBeGreaterThan(512);
    const req = buildCoachRequest('coverage', { memorizedPages: 10, revisedWithin7Days: 4, revisedWithin30Days: 9 });
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[0].text).toBe(COACH_SYSTEM_PROMPT);
    expect(req.max_tokens).toBe(300);
    expect(req.model).toBe('claude-haiku-5-5');
  });

  it('[COACH-2] sends only the totals for the asked insight, as the user turn', () => {
    const req = buildCoachRequest('weakSpots', { weakPages: 3, moderatePages: 9, strongPages: 40, weakRevisedLast7Days: 1 });
    expect(req.messages[0].content).toContain('"weakPages":3');
    expect(req.messages[0].content).not.toMatch(/note|recording|name/i);
    expect(COACH_INSIGHTS).toHaveLength(4);
  });
});

describe('the API call (COACH-3)', () => {
  const req = buildCoachRequest('pace', { pagesPerDay7: 1, pagesPerDay30: 1, plannedPerDay: 1 });
  const ok = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }], usage }), { status: 200 });
  const err = (status: number, retryAfter?: string) =>
    new Response('{}', { status, headers: retryAfter ? { 'retry-after': retryAfter } : {} });

  it('[COACH-3] retries 429 and 5xx with backoff, then answers', async () => {
    const sleeps: number[] = [];
    const replies = [err(429, '2'), err(529), ok('Keep going.')];
    const reply = await callCoach(req, {
      apiKey: 'k',
      fetch: async () => replies.shift() as Response,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(reply.text).toBe('Keep going.');
    expect(reply.attempts).toBe(3);
    expect(sleeps).toEqual([2000, BASE_BACKOFF_MS * 2]);
  });

  it('[COACH-3] does not retry a 400, and gives up after three attempts', async () => {
    let calls = 0;
    await expect(callCoach(req, { apiKey: 'k', fetch: async () => (calls++, err(400)), sleep: async () => undefined })).rejects.toBeInstanceOf(CoachCallError);
    expect(calls).toBe(1);
    calls = 0;
    await expect(callCoach(req, { apiKey: 'k', fetch: async () => (calls++, err(500)), sleep: async () => undefined })).rejects.toBeInstanceOf(CoachCallError);
    expect(calls).toBe(3);
  });

  it('[COACH-3] ignores a retry-after too long to wait for', () => {
    expect(backoffMs(1, '600')).toBe(BASE_BACKOFF_MS);
  });
});

// A fake store: counters and spend live in memory.
function fakeStore(over: Partial<CoachStore> & { tester?: boolean; optIn?: boolean } = {}) {
  const answers = new Map<string, string>();
  const questions = new Map<string, number>();
  let spend = 0;
  const store: CoachStore = {
    isPreviewTester: async () => over.tester ?? true,
    hasOptedIn: async () => over.optIn ?? true,
    setOptIn: async () => undefined,
    getAnswer: async (uid, insight, day) => answers.get(`${uid}|${insight}|${day}`) ?? null,
    setAnswer: async (uid, insight, day, text) => void answers.set(`${uid}|${insight}|${day}`, text),
    reserveQuestion: async (uid, day, limit) => {
      const n = questions.get(`${uid}|${day}`) ?? 0;
      if (n >= limit) return false;
      questions.set(`${uid}|${day}`, n + 1);
      return true;
    },
    releaseQuestion: async (uid, day) => void questions.set(`${uid}|${day}`, Math.max(0, (questions.get(`${uid}|${day}`) ?? 0) - 1)),
    questionsToday: async (uid, day) => questions.get(`${uid}|${day}`) ?? 0,
    reserveSpend: async (_m, amount, cap) => {
      if (spend + amount > cap) return false;
      spend += amount;
      return true;
    },
    settleSpend: async (_m, reserved, actual) => void (spend = spend - reserved + actual),
    ...over,
  };
  return { store, spend: () => spend };
}

const payload = { insight: 'coverage', day: '2026-11-05', totals: { memorizedPages: 10, revisedWithin7Days: 4, revisedWithin30Days: 9 } };
const deps = (store: CoachStore, call: Parameters<typeof handleAskCoach>[2]['call'], logs: unknown[] = []) => ({
  store,
  call,
  now: () => new Date('2026-11-05T12:00:00Z'),
  log: (e: unknown) => void logs.push(e),
});
const reply = (text = 'Good.') => async () => ({ text, usage, attempts: 1 });

describe('the handler (COACH-1)', () => {
  it('[COACH-1] refuses a signed-out caller, a non-tester, and an account that has not opted in', async () => {
    const { store } = fakeStore();
    await expect(handleAskCoach(undefined, payload, deps(store, reply()))).rejects.toMatchObject({ code: 'unauthenticated' });
    const notTester = fakeStore({ tester: false }).store;
    await expect(handleAskCoach({ uid: 'u' }, payload, deps(notTester, reply()))).rejects.toMatchObject({ code: 'permission-denied' });
    const notOpted = fakeStore({ optIn: false }).store;
    await expect(handleAskCoach({ uid: 'u' }, payload, deps(notOpted, reply()))).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('[COACH-1] refuses a bad payload before any call is made', async () => {
    const { store } = fakeStore();
    let called = false;
    const d = deps(store, async () => ((called = true), { text: 'x', usage, attempts: 1 }));
    await expect(handleAskCoach({ uid: 'u' }, { ...payload, day: 'today' }, d)).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(handleAskCoach({ uid: 'u' }, { ...payload, insight: 'notes' }, d)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(called).toBe(false);
  });

  it('[COACH-1] answers once per insight and day: the repeat is free and counts nothing', async () => {
    const { store } = fakeStore();
    let calls = 0;
    const d = deps(store, async () => (calls++, { text: 'Good.', usage, attempts: 1 }));
    const first = await handleAskCoach({ uid: 'u' }, payload, d);
    const second = await handleAskCoach({ uid: 'u' }, payload, d);
    expect(first).toMatchObject({ answer: 'Good.', cached: false, remainingToday: DAILY_QUESTIONS - 1 });
    expect(second).toMatchObject({ answer: 'Good.', cached: true, remainingToday: DAILY_QUESTIONS - 1 });
    expect(calls).toBe(1);
  });

  it('[COACH-1] allows five new questions a day, then refuses', async () => {
    const { store } = fakeStore();
    const d = deps(store, reply());
    for (let i = 0; i < DAILY_QUESTIONS; i++) {
      await handleAskCoach({ uid: 'u' }, { ...payload, day: `2026-11-0${i + 1}` }, d);
    }
    await expect(handleAskCoach({ uid: 'u' }, { ...payload, day: '2026-11-09' }, d)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('[COACH-1] refuses once the month’s cap is reached, and gives back the question', async () => {
    const { store, spend } = fakeStore();
    // Spend the whole cap first.
    await store.reserveSpend('2026-11', MONTHLY_CAP_USD, MONTHLY_CAP_USD);
    const d = deps(store, reply());
    await expect(handleAskCoach({ uid: 'u' }, payload, d)).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(await store.questionsToday('u', '2026-11-05')).toBe(0);
    expect(spend()).toBe(MONTHLY_CAP_USD);
  });

  it('[COACH-1] a failed call gives back the question and the reserve, and stores no answer', async () => {
    const { store, spend } = fakeStore();
    const d = deps(store, async () => {
      throw new CoachCallError('busy', 529, true);
    });
    await expect(handleAskCoach({ uid: 'u' }, payload, d)).rejects.toMatchObject({ code: 'unavailable' });
    expect(await store.questionsToday('u', '2026-11-05')).toBe(0);
    expect(spend()).toBe(0);
    expect(await store.getAnswer('u', 'coverage', '2026-11-05')).toBeNull();
  });

  it('[COACH-3] logs the usage and never the content', async () => {
    const { store } = fakeStore();
    const logs: unknown[] = [];
    await handleAskCoach({ uid: 'u' }, payload, deps(store, reply('A private sentence about pages 1–3.'), logs));
    expect(JSON.stringify(logs)).not.toContain('private sentence');
    expect(logs).toContainEqual(expect.objectContaining({ event: 'answer', insight: 'coverage', cached: false, cacheRead: 5000, cacheWrite: 2000 }));
  });

  it('[COACH-1] turns the coach on and off only for a tester, with a boolean', async () => {
    const { store } = fakeStore();
    await expect(handleSetOptIn({ uid: 'u' }, { optIn: true }, deps(store, reply()))).resolves.toEqual({ optIn: true });
    await expect(handleSetOptIn({ uid: 'u' }, { optIn: 'yes' }, deps(store, reply()))).rejects.toBeInstanceOf(CoachError);
    const notTester = fakeStore({ tester: false }).store;
    await expect(handleSetOptIn({ uid: 'u' }, { optIn: true }, deps(notTester, reply()))).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
