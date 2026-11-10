const { build, buckets, limitDays, capsOf, revoOn } = require('../metrics');
const { parseRelease, labelOf, platformMap, shapeRange } = require('../totals');
const { hasher } = require('../collect');

const NOW = Date.UTC(2026, 10, 9, 14, 30); // Nov 9 2026 14:30 UTC
const H = 3600e3;
const hash = (u) => `#${u}`;

const chat = (uid, id, day, kind = 'chat', createdAt = NOW - 2 * H) => ({ path: ['users', uid, 'revoChats', id], uid, kind, day, createdAt });
const msg = (uid, chatId, role, at, extra = {}) => ({ path: ['users', uid, 'revoChats', chatId, 'messages', `${role}${at}`], uid, role, at, ...extra });
const line = (t, event, extra = {}) => ({ t, service: 'revoask', event, cached: false, attempts: 1, costUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, code: null, stop: null, uid: null, ...extra });

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

function input(extra = {}) {
  const chats = [chat('a', 'c1', '2026-11-09'), chat('b', 'c2', '2026-11-09'), chat('b', 'review-2026-11-09', '2026-11-09', 'review', NOW - H)];
  const messages = [
    msg('a', 'c1', 'user', NOW - 2 * H, { attach: { kind: 'surah' } }),
    msg('a', 'c1', 'revo', NOW - 2 * H + 1, { feedback: 'up', action: { kind: 'reviseFirst' }, actionState: 'added' }),
    msg('a', 'c1', 'user', NOW - 90 * 60e3, { attachments: [{ kind: 'juz' }, { kind: 'day' }] }),
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
    now: NOW, hash, ownerUids: new Set(['a']),
    chats, messages, revoLines,
    settings: [{ path: ['coachSettings', 'a'], revoOn: true, memoryOn: true }, { path: ['coachSettings', 'b'], optIn: true }, { path: ['coachSettings', 'c'], revoOn: false }],
    users: [{ path: ['users', 'b'], previewTester: true }, { path: ['users', 'a'] }],
    ledgerDays: [{ day: '2026-11-01', spendUsd: 0.5 }, { day: '2026-11-08', spendUsd: 1.25 }, { day: '2026-11-09', spendUsd: 0.06 }],
    coach: { monthlyCapUsd: 150 },
    app: { revo: 'everyone', revoPatterns: true },
    monitoring: { perRange: { '1h': { calls: { revoask: { '2xx': 40, '4xx': 2, '5xx': 1 } }, p50: { revoask: 4800 }, p95: { revoask: 9600 } } } },
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

  it('lists accounts by keyed id only, with exact cost where the logs name them', () => {
    const [first, second] = day.accounts;
    expect(day.accounts.map((r) => r.id).sort()).toEqual(['#a', '#b']);
    const a = day.accounts.find((r) => r.id === '#a');
    expect(a).toMatchObject({ q: 2, days: 1, costExact: true, tags: ['you'], up: 1, down: 0 });
    expect(a.costUsd).toBeCloseTo(0.046, 6);
    const b = day.accounts.find((r) => r.id === '#b');
    // b's question came before #497 (no uid on the line): its call is estimated at the range's average.
    expect(b).toMatchObject({ q: 1, reviews: 1, costExact: false, tags: ['tester'], down: 1, failed: 1 });
    expect(b.costUsd).toBeCloseTo(0.005 + 0.061 / 4, 6);
    expect(first.costUsd).toBeGreaterThanOrEqual(second.costUsd);
    expect(JSON.stringify(m)).not.toMatch(/"uid"|"a"|"b"/);
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
    const lines = [0, 2, 4].map((k) => line(NOW - k * 60e3, 'failed', { code: 'network' }));
    lines.push(line(NOW - 5 * H, 'resting'));
    const m = build(input({ revoLines: lines, ledgerDays: [{ day: '2026-11-09', spendUsd: 9 }] }));
    const levels = Object.fromEntries(m.alerts.map((a) => [a.id, a.level]));
    expect(levels['revo-failing']).toBe('alarm');
    expect(levels['revo-resting']).toBe('alarm');
    expect(levels['spend-today']).toBe('alarm');
  });
});

describe('Sentry totals', () => {
  it('reads release names', () => {
    expect(parseRelease('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toEqual({ version: '1.0.3', build: 32, update: '532abc0c' });
    expect(parseRelease('com.revisionbuddy.app@1.0.3+6')).toEqual({ version: '1.0.3', build: 6, update: null });
    expect(labelOf('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toBe('1.0.3 (32) · update 532abc0c');
    expect(labelOf('com.revisionbuddy.app@1.0.3+32')).toBe('1.0.3 (32), built in');
  });
  it("takes a release's platform from its events, then its build's, then the build number", () => {
    const platformOf = platformMap([
      { release: 'com.revisionbuddy.app@1.0.3+32.u532abc0c', 'os.name': 'iOS', 'count()': 4 },
      { release: 'com.revisionbuddy.app@1.0.3+25.uaaaaaaaa', 'os.name': 'Android', 'count()': 2 },
    ]);
    expect(platformOf('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toBe('ios');
    expect(platformOf('com.revisionbuddy.app@1.0.3+32')).toBe('ios');
    expect(platformOf('com.revisionbuddy.app@1.0.3+25')).toBe('android');
    expect(platformOf('com.revisionbuddy.app@1.0.3+6.ubedea4a5')).toBe('android');
    expect(platformOf('com.revisionbuddy.app@1.0.4+33')).toBe('ios');
  });
  it('adds sessions over statuses, counts crashes and marks the newest update', () => {
    const rel = 'com.revisionbuddy.app@1.0.3+32.u532abc0c';
    const old = 'com.revisionbuddy.app@1.0.3+32.u11111111';
    const r = shapeRange(
      {
        intervals: ['2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z'],
        groups: [
          { by: { release: rel, 'session.status': 'healthy' }, totals: { 'sum(session)': 9 }, series: { 'sum(session)': [4, 5] } },
          { by: { release: rel, 'session.status': 'crashed' }, totals: { 'sum(session)': 1 }, series: { 'sum(session)': [0, 1] } },
          { by: { release: old, 'session.status': 'healthy' }, totals: { 'sum(session)': 2 }, series: { 'sum(session)': [2, 0] } },
        ],
      },
      { groups: [{ by: { release: rel }, totals: { 'count_unique(user)': 3 }, series: { 'count_unique(user)': [2, 3] } }] },
      () => 'ios',
      new Map([[rel, 2000], [old, 1000]]),
    );
    const mine = r.releases.find((x) => x.release === rel);
    expect(mine).toMatchObject({ totalSessions: 10, totalCrashed: 1, totalUsers: 3, sessions: [4, 6], crashed: [0, 1], users: [2, 3], latest: true });
    expect(r.releases.find((x) => x.release === old).latest).toBe(false);
  });
});

describe('account ids', () => {
  it('are a keyed hash: stable, short, and different with another key', () => {
    const h = hasher('k1');
    expect(h('uid-123')).toBe(h('uid-123'));
    expect(h('uid-123')).toMatch(/^[0-9a-z]{4}·[0-9a-z]{2}$/);
    expect(hasher('k2')('uid-123')).not.toBe(h('uid-123'));
  });
});
