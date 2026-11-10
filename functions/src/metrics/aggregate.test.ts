import { build, buckets, limitDays, capsOf, revoOn, Input, MessageRow, RevoLine } from './aggregate';

const NOW = Date.UTC(2026, 10, 9, 14, 30); // Nov 9 2026 14:30 UTC
const H = 3600e3;

const chat = (uid: string, chatId: string, day: string, kind = 'chat', createdAt = NOW - 2 * H) => ({ uid, chatId, kind, day, createdAt });
const msg = (uid: string, chatId: string, role: string, at: number, extra: Partial<MessageRow> = {}): MessageRow => ({ uid, chatId, role, at, ...extra });
const line = (t: number, event: string, extra: Partial<RevoLine> = {}): RevoLine => ({ t, service: 'revoask', event, cached: false, attempts: 1, costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, code: null, stop: null, uid: null, ...extra });

describe('buckets', () => {
  it('ends with the step that holds now, aligned to UTC', () => {
    const b = buckets('24h', NOW);
    expect(b.n).toBe(24);
    expect(b.index(NOW)).toBe(23);
    expect(new Date(b.start).toISOString()).toBe('2026-11-08T15:00:00.000Z');
    expect(b.index(b.start - 1)).toBe(-1);
    expect(buckets('7d', NOW).n).toBe(28);
    expect(buckets('1h', NOW).index(NOW - 61 * 60e3)).toBe(-1);
  });
});

describe('the switches and caps', () => {
  it('reads Revo on as functions/src/revo/settings.ts does', () => {
    expect(revoOn({ revoOn: true })).toBe(true);
    expect(revoOn({ revoOn: false, optIn: true })).toBe(false);
    expect(revoOn({ optIn: true })).toBe(true);
    expect(revoOn({})).toBe(false);
  });
  it('defaults the caps as the coach does: $10 a month, a tenth a day', () => {
    expect(capsOf({})).toEqual({ monthly: 10, daily: 1 });
    expect(capsOf({ monthlyCapUsd: 150 })).toEqual({ monthly: 150, daily: 15 });
    expect(capsOf({ monthlyCapUsd: 150, dailyCapUsd: 25 })).toEqual({ monthly: 150, daily: 25 });
  });
  it('counts days at the 20-question limit and the longest run of them', () => {
    const days = new Map([['2026-11-05', 20], ['2026-11-06', 21], ['2026-11-07', 20], ['2026-11-09', 20], ['2026-11-08', 3]]);
    expect(limitDays(days)).toEqual({ count: 4, streak: 3 });
  });
});

function input(extra: Partial<Input> = {}): Input {
  const chats = [chat('a', 'c1', '2026-11-09'), chat('b', 'c2', '2026-11-09'), chat('b', 'review-2026-11-09', '2026-11-09', 'review', NOW - H)];
  const messages = [
    msg('a', 'c1', 'user', NOW - 2 * H, { kinds: ['surah'] }),
    msg('a', 'c1', 'revo', NOW - 2 * H + 1, { feedback: 'up', hasAction: true, actionState: 'added' }),
    msg('a', 'c1', 'user', NOW - 90 * 60e3, { kinds: ['juz', 'day'] }),
    msg('a', 'c1', 'revo', NOW - 90 * 60e3 + 1),
    msg('b', 'c2', 'user', NOW - 30 * 60e3),
    msg('b', 'c2', 'revo', NOW - 30 * 60e3 + 1, { feedback: 'down' }),
  ];
  const revoLines = [
    line(NOW - 2 * H, 'answer', { uid: 'a', costUsd: 0.04, input: 500, output: 200, cacheWrite: 15000 }),
    line(NOW - 90 * 60e3, 'answer', { uid: 'a', costUsd: 0.006, input: 600, output: 220, cacheRead: 15000, attempts: 2 }),
    line(NOW - 30 * 60e3, 'answer', { costUsd: 0.01, input: 550, output: 230, cacheRead: 15000 }), // before #497: no uid
    line(NOW - H, 'review', { uid: 'b', costUsd: 0.005, input: 555, output: 250, cacheRead: 15000 }),
    line(NOW - 20 * 60e3, 'failed', { code: '529', uid: 'b' }),
    line(NOW - 3 * 86400e3, 'answer', { uid: 'a', costUsd: 0.02 }),
  ];
  return {
    now: NOW, ownerUids: new Set(['a']), testers: new Set(['b']),
    chats, messages, revoLines,
    settings: [{ uid: 'a', revoOn: true, memoryOn: true }, { uid: 'b', optIn: true }, { uid: 'c', revoOn: false }],
    ledgerDays: [{ day: '2026-11-01', spendUsd: 0.5 }, { day: '2026-11-08', spendUsd: 1.25 }, { day: '2026-11-09', spendUsd: 0.06 }],
    coach: { monthlyCapUsd: 150 },
    app: { revo: 'everyone', revoPatterns: true },
    monitoring: { perRange: { '1h': { calls: { revoask: { '2xx': 40, '4xx': 2, '5xx': 1 } }, p50: { revoask: 4800 }, p95: { revoask: 9600 } } }, revoLatency: {}, firestoreToday: null },
    sources: { Firestore: 'ok' },
    ...extra,
  };
}

describe('Revo over a range', () => {
  const m = build(input());
  const day = m.revo['24h'];

  it('counts questions, reviews, calls and cost from the log lines', () => {
    expect(day.totals.questions).toBe(3);
    expect(day.totals.reviews).toBe(1);
    expect(day.totals.calls).toBe(4);
    expect(day.totals.costUsd).toBeCloseTo(0.061, 6);
    expect(day.totals.failed).toBe(1);
    expect(day.totals.failedByCode).toEqual({ 529: 1 });
    expect(day.totals.retried).toBe(1);
    expect(day.series.q.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it('lists accounts with exact cost where the logs name them', () => {
    const [first, second] = day.accounts;
    expect(day.accounts.map((r) => r.uid).sort()).toEqual(['a', 'b']);
    const a = day.accounts.find((r) => r.uid === 'a')!;
    expect(a).toMatchObject({ q: 2, days: 1, costExact: true, tags: ['you'], up: 1, down: 0 });
    expect(a.costUsd).toBeCloseTo(0.046, 6);
    const b = day.accounts.find((r) => r.uid === 'b')!;
    // b's question came before #497 (no uid on the line): its call is estimated at the range's average.
    expect(b).toMatchObject({ q: 1, reviews: 1, costExact: false, tags: ['tester'], down: 1, failed: 1 });
    expect(b.costUsd).toBeCloseTo(0.005 + 0.061 / 4, 6);
    expect(first.costUsd).toBeGreaterThanOrEqual(second.costUsd);
  });

  it('counts who has Revo on, attachments, actions and thumbs', () => {
    expect(day.funnel).toEqual({ on: 2, asked: 2, returned: null });
    expect(day.attach).toEqual({ surah: 1, juz: 1, day: 1 });
    expect(day.actions).toEqual({ offered: 1, added: 1 });
    expect(day.thumbs).toEqual({ up: 1, down: 1 });
  });

  it('keeps the month from the ledger against the cap', () => {
    expect(m.month).toMatchObject({ monthUsd: 1.81, todayUsd: 0.06, capUsd: 150, dailyCapUsd: 15, daysInMonth: 30 });
    expect(m.month.days).toHaveLength(9);
    expect(m.month.days[7]).toEqual({ day: '2026-11-08', spendUsd: 1.25, cumUsd: 1.75 });
  });

  it('counts questions from the stored chats when the logs could not be read', () => {
    const noLogs = build(input({ revoLines: null }));
    expect(noLogs.revo['24h'].totals.questions).toBe(3);
    expect(noLogs.revo['24h'].totals.reviews).toBe(1);
    expect(noLogs.revo['24h'].totals.costUsd).toBe(0);
  });

  it('spans 30 days for the long range', () => {
    expect(m.revo['30d'].totals.questions).toBe(4);
    expect(m.revo['30d'].funnel.returned).toBe(1);
  });
});

describe('alerts', () => {
  it('stays quiet on a normal day', () => {
    const m = build(input());
    const levels = Object.fromEntries(m.alerts.map((a) => [a.id, a.level]));
    expect(levels).toMatchObject({ 'revo-failing': 'ok', 'revo-resting': 'ok', 'spend-today': 'ok', 'spend-month': 'ok', 'function-errors': 'alarm', tcq: 'nodata' });
    expect(m.look.some((l) => /Function errors/.test(l.text))).toBe(true);
  });
  it('rings when Revo fails 3 times in 15 minutes, rests, or spends half the day', () => {
    const lines: RevoLine[] = [0, 2, 4].map((k) => line(NOW - k * 60e3, 'failed', { code: 'network' }));
    lines.push(line(NOW - 5 * H, 'resting'));
    const m = build(input({ revoLines: lines, ledgerDays: [{ day: '2026-11-09', spendUsd: 9 }] }));
    const levels = Object.fromEntries(m.alerts.map((a) => [a.id, a.level]));
    expect(levels['revo-failing']).toBe('alarm');
    expect(levels['revo-resting']).toBe('alarm');
    expect(levels['spend-today']).toBe('alarm');
  });
});
