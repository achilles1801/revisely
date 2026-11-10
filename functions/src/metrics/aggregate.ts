/**
 * The owner's metrics console: every number, worked out from what was read (pure, so it is tested).
 * Input: Firestore rows with non-content fields only, Revo's log lines, Cloud Monitoring summaries and
 * the GitHub workflow's Sentry and App Store totals. Output: what adminMetrics returns. Conversation
 * text never passes through here (adminRevo reads it on demand, for one account).
 */

export type RangeKey = '1h' | '24h' | '7d' | '30d';
export const RANGES: Record<RangeKey, { ms: number; step: number }> = {
  '1h': { ms: 3600e3, step: 300e3 },
  '24h': { ms: 86400e3, step: 3600e3 },
  '7d': { ms: 7 * 86400e3, step: 6 * 3600e3 },
  '30d': { ms: 30 * 86400e3, step: 86400e3 },
};
export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];
/** The daily question limit (functions/src/revo/handler.ts REVO_DAILY_QUESTIONS). */
export const DAILY_QUESTIONS = 20;

export interface ChatRow { uid: string; chatId: string; kind?: string; day?: string; createdAt?: number }
export interface MessageRow {
  uid: string;
  chatId: string;
  role?: string;
  at?: number;
  feedback?: string | null;
  actionState?: string | null;
  hasAction?: boolean;
  kinds?: string[];
}
export interface SettingsRow { uid: string; revoOn?: unknown; optIn?: unknown; memoryOn?: unknown }
export interface LedgerDay { day: string; spendUsd?: number; calls?: number }
export interface RevoLine {
  t: number;
  service: string;
  event: string;
  cached: boolean;
  attempts: number;
  costUsd: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  code: string | null;
  stop: string | null;
  uid: string | null;
}
export interface FunctionsWindow {
  calls: Record<string, Record<string, number>>;
  p50: Record<string, number>;
  p95: Record<string, number>;
}
export interface Monitoring {
  perRange: Partial<Record<RangeKey, FunctionsWindow>>;
  revoLatency: Partial<Record<RangeKey, { p50: (number | null)[]; p95: (number | null)[] }>>;
  firestoreToday: { reads: number; writes: number; denies: number } | null;
}
export interface SentryRelease {
  release: string;
  label: string;
  platform: 'ios' | 'android';
  sessions: number[];
  crashed: number[];
  users: number[];
  totalSessions: number;
  totalCrashed: number;
  totalUsers: number;
  latest?: boolean;
}
export interface SentryRange { times: number[]; releases: SentryRelease[] }
export interface Totals {
  generatedAt: string;
  sentry: null | {
    production?: Partial<Record<RangeKey, SentryRange | null>> & { unique?: Record<string, number | null> };
    preview?: Partial<Record<RangeKey, SentryRange | null>> & { unique?: Record<string, number | null> };
    issues?: Record<string, { issues: number; events: number } | null>;
  };
  appStore: null | { days: { day: string; missing?: boolean; first?: number; redownload?: number; update?: number }[]; topCountries7d: { country: string; first: number }[] };
  errors?: Record<string, string>;
}

export interface Input {
  now: number;
  ownerUids?: Set<string>;
  chats?: ChatRow[];
  messages?: MessageRow[];
  settings?: SettingsRow[];
  testers?: Set<string>;
  ledgerDays?: LedgerDay[];
  coach?: { monthlyCapUsd?: unknown; dailyCapUsd?: unknown } | null;
  app?: { revo?: unknown; revoPatterns?: unknown } | null;
  revoLines?: RevoLine[] | null;
  monitoring?: Monitoring | null;
  totals?: Totals | null;
  sources?: Record<string, string>;
}

export interface Buckets { start: number; step: number; n: number; end: number; index: (t: number) => number }

/** The range's buckets, aligned to the step (UTC), the last one holding `now`. */
export function buckets(key: RangeKey, now: number): Buckets {
  const { ms, step } = RANGES[key];
  const n = Math.round(ms / step);
  const last = Math.floor(now / step) * step;
  const start = last - (n - 1) * step;
  return { start, step, n, end: last + step, index: (t) => (t >= start && t < last + step ? Math.floor((t - start) / step) : -1) };
}

const zeros = (n: number) => new Array<number>(n).fill(0);
const round = (v: number, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Revo's switch for an account, as functions/src/revo/settings.ts reads it. */
export function revoOn(s: Pick<SettingsRow, 'revoOn' | 'optIn'>): boolean {
  return s.revoOn === true || (s.revoOn === undefined && s.optIn === true);
}

/** The caps as functions/src/coach/handler.ts reads them: $10 a month when unset (at most $1,000); a day a tenth of it. */
export function capsOf(coach: Input['coach']): { monthly: number; daily: number } {
  const m = typeof coach?.monthlyCapUsd === 'number' && coach.monthlyCapUsd > 0 ? Math.min(coach.monthlyCapUsd, 1000) : 10;
  const d = typeof coach?.dailyCapUsd === 'number' && coach.dailyCapUsd > 0 ? coach.dailyCapUsd : m / 10;
  return { monthly: m, daily: d };
}

/** Revision days with 20+ questions, and the longest run of consecutive ones. */
export function limitDays(days: Map<string, number>): { count: number; streak: number } {
  const full = [...days.entries()].filter(([, n]) => n >= DAILY_QUESTIONS).map(([d]) => d).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of full) {
    run = prev && Date.parse(d) - Date.parse(prev) === 86400e3 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { count: full.length, streak: best };
}

interface Msg { uid: string; role?: string; at: number; day: string | null; feedback: string | null; action: boolean; actionState: string | null; kinds: string[] }
interface Prepared { chats: { uid: string; kind: string; day: string | null; createdAt: number }[]; msgs: Msg[] }

function prepare(input: Input): Prepared {
  const chats = new Map<string, { uid: string; kind: string; day: string | null; createdAt: number }>();
  for (const c of input.chats ?? []) chats.set(`${c.uid}/${c.chatId}`, { uid: c.uid, kind: c.kind === 'review' ? 'review' : 'chat', day: c.day ?? null, createdAt: c.createdAt ?? 0 });
  const msgs = (input.messages ?? []).map((m) => {
    const chat = chats.get(`${m.uid}/${m.chatId}`);
    return { uid: m.uid, role: m.role, at: m.at ?? 0, day: chat?.day ?? null, feedback: m.feedback ?? null, action: !!m.hasAction, actionState: m.actionState ?? null, kinds: m.kinds ?? [] };
  });
  return { chats: [...chats.values()], msgs };
}

export interface AccountRow {
  uid: string;
  tags: string[];
  q: number;
  days: number;
  reviews: number;
  tokens: number;
  costUsd: number;
  costExact: boolean;
  limitDays: number;
  limitStreak: number;
  up: number;
  down: number;
  failed: number;
  lastAt: number | null;
}

interface Acc { uid: string; q: number; logQ: number; days: Map<string, number>; utcDays: Map<string, number>; reviews: number; logReviews: number; calls: number; cost: number; tokens: number; up: number; down: number; failed: number }

function lastSeen(uid: string, P: Prepared, lines: RevoLine[] | null): number | null {
  let t = 0;
  for (const m of P.msgs) if (m.uid === uid && m.at > t) t = m.at;
  if (lines) for (const l of lines) if (l.uid === uid && l.t > t) t = l.t;
  return t || null;
}

function revoRange(key: RangeKey, now: number, P: Prepared, input: Input) {
  const B = buckets(key, now);
  const inR = (t: number) => B.index(t) >= 0;
  const lines = input.revoLines ?? null;
  const q = zeros(B.n), rev = zeros(B.n), failed = zeros(B.n), cr = zeros(B.n), cw = zeros(B.n);
  // The same counts from the stored chats: used when they hold more (logs missing or not read).
  const fsQ = zeros(B.n), fsRev = zeros(B.n);
  const T = { questions: 0, reviews: 0, calls: 0, costUsd: 0, failed: 0, failedByCode: {} as Record<string, number>, resting: 0, capped: 0, cutOff: 0, retried: 0, cached: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const acc = new Map<string, Acc>();
  const A = (uid: string): Acc => {
    let a = acc.get(uid);
    if (!a) {
      a = { uid, q: 0, logQ: 0, days: new Map(), utcDays: new Map(), reviews: 0, logReviews: 0, calls: 0, cost: 0, tokens: 0, up: 0, down: 0, failed: 0 };
      acc.set(uid, a);
    }
    return a;
  };

  if (lines) {
    for (const l of lines) {
      const i = B.index(l.t);
      if (i < 0) continue;
      const a = l.uid ? A(l.uid) : null;
      if (l.event === 'answer') {
        q[i]++;
        T.questions++;
        if (a) a.logQ++;
        if (l.cached) { T.cached++; continue; }
        if (a) { const d = utcDay(l.t); a.utcDays.set(d, (a.utcDays.get(d) ?? 0) + 1); }
      }
      if (l.event === 'review') { rev[i]++; T.reviews++; if (a) a.logReviews++; }
      if ((l.event === 'answer' || l.event === 'review') && !l.cached) {
        T.calls++;
        T.costUsd += l.costUsd;
        T.tokens.input += l.input; T.tokens.output += l.output; T.tokens.cacheRead += l.cacheRead; T.tokens.cacheWrite += l.cacheWrite;
        cr[i] += l.cacheRead; cw[i] += l.cacheWrite;
        if (l.attempts > 1) T.retried++;
        if (l.stop === 'max_tokens') T.cutOff++;
        if (a) { a.calls++; a.cost += l.costUsd; a.tokens += l.input + l.output + l.cacheRead + l.cacheWrite; }
      }
      if (l.event === 'failed') { failed[i]++; T.failed++; const c = l.code ?? 'unknown'; T.failedByCode[c] = (T.failedByCode[c] ?? 0) + 1; if (a) a.failed++; }
      if (l.event === 'resting') T.resting++;
      if (l.event === 'capped') T.capped++;
    }
  }

  const attach: Record<string, number> = {};
  let offered = 0, added = 0, up = 0, down = 0;
  for (const m of P.msgs) {
    if (!inR(m.at)) continue;
    if (m.role === 'user') {
      const a = A(m.uid);
      a.q++;
      if (m.day) a.days.set(m.day, (a.days.get(m.day) ?? 0) + 1);
      fsQ[B.index(m.at)]++;
      for (const k of m.kinds) attach[k] = (attach[k] ?? 0) + 1;
    } else if (m.role === 'revo') {
      if (m.feedback === 'up') { up++; A(m.uid).up++; }
      if (m.feedback === 'down') { down++; A(m.uid).down++; }
      if (m.action) offered++;
      if (m.actionState === 'added') added++;
    }
  }
  for (const c of P.chats) if (c.kind === 'review' && inR(c.createdAt)) { A(c.uid).reviews++; fsRev[B.index(c.createdAt)]++; }
  const total = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (total(fsQ) > T.questions) { fsQ.forEach((v, i) => (q[i] = v)); T.questions = total(fsQ); }
  if (total(fsRev) > T.reviews) { fsRev.forEach((v, i) => (rev[i] = v)); T.reviews = total(fsRev); }

  const avg = T.calls ? T.costUsd / T.calls : 0;
  const avgTokens = T.calls ? (T.tokens.input + T.tokens.output + T.tokens.cacheRead + T.tokens.cacheWrite) / T.calls : 0;
  const owners = input.ownerUids ?? new Set<string>();
  const testers = input.testers ?? new Set<string>();
  const rows: AccountRow[] = [...acc.values()]
    .filter((a) => a.q + a.logQ + a.reviews + a.logReviews + a.up + a.down + a.failed > 0)
    .map((a) => {
      const questions = Math.max(a.q, a.logQ);
      const reviews = Math.max(a.reviews, a.logReviews);
      const missing = Math.max(0, questions + reviews - a.calls);
      const lim = limitDays(a.days.size ? a.days : a.utcDays);
      return {
        uid: a.uid,
        tags: [...(owners.has(a.uid) ? ['you'] : []), ...(testers.has(a.uid) ? ['tester'] : [])],
        q: questions,
        days: Math.max(a.days.size, a.utcDays.size),
        reviews,
        tokens: Math.round(a.tokens + missing * avgTokens),
        costUsd: round(a.cost + missing * avg, 6),
        costExact: missing === 0 && a.calls > 0,
        limitDays: lim.count,
        limitStreak: lim.streak,
        up: a.up,
        down: a.down,
        failed: a.failed,
        lastAt: lastSeen(a.uid, P, lines),
      };
    })
    .sort((x, y) => y.costUsd - x.costUsd || y.q - x.q)
    .slice(0, 200);

  const asked = rows.filter((r) => r.q > 0).length;
  return {
    start: B.start,
    step: B.step,
    n: B.n,
    series: { q, rev, failed, cacheShare: cr.map((v, i) => (v + cw[i] > 0 ? round((v / (v + cw[i])) * 100, 1) : null)) },
    totals: { ...T, costUsd: round(T.costUsd, 6), people: rows.filter((r) => r.q > 0 || r.reviews > 0).length, limitPeople: rows.filter((r) => r.limitDays > 0).length, costPerCall: round(avg, 6) },
    funnel: { on: (input.settings ?? []).filter(revoOn).length, asked, returned: key === '7d' || key === '30d' ? rows.filter((r) => r.days >= 2).length : null },
    attach,
    actions: { offered, added },
    thumbs: { up, down },
    accounts: rows,
    latency: input.monitoring?.revoLatency?.[key] ?? null,
  };
}
export type RevoRange = ReturnType<typeof revoRange>;

function month(input: Input, now: number) {
  const caps = capsOf(input.coach);
  const ym = utcDay(now).slice(0, 7);
  const byDay = new Map((input.ledgerDays ?? []).map((d) => [d.day, d]));
  const days: { day: string; spendUsd: number; cumUsd: number }[] = [];
  let total = 0;
  const today = Number(utcDay(now).slice(8, 10));
  for (let dd = 1; dd <= today; dd++) {
    const day = `${ym}-${String(dd).padStart(2, '0')}`;
    const spend = Number(byDay.get(day)?.spendUsd) || 0;
    total += spend;
    days.push({ day, spendUsd: round(spend, 6), cumUsd: round(total, 6) });
  }
  const daysInMonth = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  return { ym, daysInMonth, days, monthUsd: round(total, 6), todayUsd: days.length ? days[days.length - 1].spendUsd : 0, capUsd: caps.monthly, dailyCapUsd: caps.daily };
}

function functionsRange(m: FunctionsWindow | undefined) {
  if (!m) return null;
  return Object.entries(m.calls)
    .map(([name, c]) => ({ name, calls: (c['2xx'] ?? 0) + (c['3xx'] ?? 0) + (c['4xx'] ?? 0) + (c['5xx'] ?? 0), c4xx: c['4xx'] ?? 0, c5xx: c['5xx'] ?? 0, p50: m.p50[name] ?? null, p95: m.p95[name] ?? null }))
    .filter((f) => f.calls > 0)
    .sort((a, b) => b.calls - a.calls);
}

function appRange(key: RangeKey, totals: Totals | null | undefined) {
  const s = totals?.sentry;
  if (!s) return null;
  const out: Record<string, unknown> = {};
  for (const [chan, env] of [['prod', 'production'], ['test', 'preview']] as const) {
    const r = s[env]?.[key] as SentryRange | null | undefined;
    if (!r) { out[chan] = null; continue; }
    const ios = zeros(r.times.length), android = zeros(r.times.length);
    for (const rel of r.releases) rel.users.forEach((v, i) => { (rel.platform === 'android' ? android : ios)[i] += v; });
    const releases = r.releases
      .map((x) => ({ release: x.release, label: x.label, platform: x.platform, sessions: x.totalSessions, crashed: x.totalCrashed, users: x.totalUsers, crashFree: x.totalSessions ? round(1 - x.totalCrashed / x.totalSessions) : null }))
      .filter((x) => x.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
    const sessions = releases.reduce((a, x) => a + x.sessions, 0);
    const crashed = releases.reduce((a, x) => a + x.crashed, 0);
    out[chan] = { times: r.times, ios, android, releases: releases.slice(0, 10), sessions, crashed, crashFree: sessions ? round(1 - crashed / sessions) : null };
  }
  return out as { prod: AppChannel | null; test: AppChannel | null };
}
export interface AppChannel { times: number[]; ios: number[]; android: number[]; releases: { release: string; label: string; platform: string; sessions: number; crashed: number; users: number; crashFree: number | null }[]; sessions: number; crashed: number; crashFree: number | null }

function adoption(totals: Totals | null | undefined) {
  const r = totals?.sentry?.production?.['24h'] as SentryRange | null | undefined;
  if (!r) return null;
  const out: Record<string, { label: string; users: number; share: number; latest: boolean }[]> = {};
  for (const p of ['ios', 'android'] as const) {
    const rel = r.releases.filter((x) => x.platform === p && x.totalUsers > 0);
    const all = rel.reduce((a, x) => a + x.totalUsers, 0);
    out[p] = all ? rel.sort((a, b) => b.totalUsers - a.totalUsers).map((x) => ({ label: x.label, users: x.totalUsers, share: round(x.totalUsers / all, 3), latest: !!x.latest })) : [];
  }
  return out;
}

function appTiles(totals: Totals | null | undefined) {
  const s = totals?.sentry;
  if (!s) return null;
  const tile = (env: 'production' | 'preview') => {
    const u = s[env]?.unique ?? {};
    const day = s[env]?.['24h'] as SentryRange | null | undefined;
    const split = { ios: 0, android: 0 };
    if (day) for (const rel of day.releases) split[rel.platform === 'android' ? 'android' : 'ios'] += rel.totalUsers;
    return { day: u['24h'] ?? null, week: u['7d'] ?? null, month: u['30d'] ?? null, split };
  };
  return { prod: tile('production'), test: tile('preview') };
}

export interface Alert { id: string; level: 'ok' | 'warn' | 'alarm' | 'nodata'; title: string; value: string }

export function alertsOf(m: Pick<Metrics, 'revo' | 'month' | 'functions' | 'app'>): Alert[] {
  const out: Alert[] = [];
  const hour = m.revo['1h'];
  const calls = hour.totals.calls + hour.totals.failed;
  let burst = 0;
  const f = hour.series.failed; // 5-minute steps: any 15 minutes with 3 or more
  for (let i = 0; i + 2 < f.length; i++) burst = Math.max(burst, f[i] + f[i + 1] + f[i + 2]);
  const failing = burst >= 3 || (calls >= 5 && hour.totals.failed / calls > 0.1);
  out.push({ id: 'revo-failing', level: failing ? 'alarm' : 'ok', title: 'Revo answers failing', value: `${hour.totals.failed} in the last hour` });
  const day = m.revo['24h'].totals;
  const blocked = day.resting + day.capped;
  out.push({ id: 'revo-resting', level: blocked > 0 ? 'alarm' : 'ok', title: 'Revo resting or capped', value: blocked > 0 ? `${day.resting} resting, ${day.capped} capped in 24 h` : 'not in 24 h' });
  const mo = m.month;
  out.push({ id: 'spend-today', level: mo.todayUsd > mo.dailyCapUsd / 2 ? 'alarm' : 'ok', title: 'Revo spend today', value: `$${mo.todayUsd.toFixed(2)} of $${mo.dailyCapUsd.toFixed(0)}` });
  out.push({ id: 'spend-month', level: mo.monthUsd > mo.capUsd * 0.8 ? 'alarm' : 'ok', title: 'Month against the cap', value: `$${mo.monthUsd.toFixed(2)} of $${mo.capUsd.toFixed(0)}` });
  const fnHour = m.functions['1h'];
  if (fnHour) {
    const bad = fnHour.filter((x) => x.c5xx > 0 && x.c5xx / x.calls > 0.01);
    out.push({ id: 'function-errors', level: bad.length ? 'alarm' : 'ok', title: 'Function errors', value: bad.length ? `${bad.map((x) => `${x.name} ${x.c5xx}`).join(', ')} in the last hour` : 'none in the last hour' });
  } else out.push({ id: 'function-errors', level: 'nodata', title: 'Function errors', value: 'no data' });
  const prod = m.app['24h']?.prod;
  if (prod) {
    const low = prod.releases.filter((r) => r.sessions >= 50 && r.crashFree != null && r.crashFree < 0.99);
    out.push({ id: 'crash-free', level: low.length ? 'alarm' : 'ok', title: 'Crash-free (store users)', value: prod.crashFree == null ? 'no sessions' : `${(prod.crashFree * 100).toFixed(1)}%` });
  } else out.push({ id: 'crash-free', level: 'nodata', title: 'Crash-free (store users)', value: 'no data' });
  const atLimit = m.revo['7d'].accounts.filter((a) => a.limitDays > 0);
  const streaks = atLimit.filter((a) => a.limitStreak >= 3);
  out.push({ id: 'limit', level: streaks.length ? 'warn' : 'ok', title: 'Accounts at the limit', value: atLimit.length ? `${atLimit.length} in 7 d` : 'none in 7 d' });
  out.push({ id: 'tcq', level: 'nodata', title: 'The Clear Quran budget', value: 'not connected' });
  return out;
}

export interface Metrics {
  v: 2;
  generatedAt: string;
  revo: Record<RangeKey, RevoRange>;
  functions: Record<RangeKey, ReturnType<typeof functionsRange>>;
  app: Record<RangeKey, ReturnType<typeof appRange>>;
  month: ReturnType<typeof month>;
  adoption: ReturnType<typeof adoption>;
  appTiles: ReturnType<typeof appTiles>;
  downloads: Totals['appStore'];
  issues: Record<string, { issues: number; events: number } | null> | null;
  firestore: Monitoring['firestoreToday'];
  config: { revo: string; revoPatterns: boolean };
  totalsAt: string | null;
  sources: Record<string, string>;
  alerts: Alert[];
  look: { level: string; text: string; uid?: string }[];
}

/** Everything the console shows. */
export function build(input: Input): Metrics {
  const now = input.now;
  const P = prepare(input);
  const revo = {} as Metrics['revo'];
  const functions = {} as Metrics['functions'];
  const app = {} as Metrics['app'];
  for (const k of RANGE_KEYS) {
    revo[k] = revoRange(k, now, P, input);
    functions[k] = functionsRange(input.monitoring?.perRange?.[k]);
    app[k] = appRange(k, input.totals);
  }
  const m = month(input, now);
  const alerts = alertsOf({ revo, month: m, functions, app });
  const look: Metrics['look'] = [];
  for (const a of alerts) if (a.level === 'alarm') look.push({ level: 'alarm', text: `${a.title}: ${a.value}` });
  for (const a of revo['7d'].accounts) if (a.limitStreak >= 3) look.push({ level: 'warn', uid: a.uid, text: `reached ${DAILY_QUESTIONS} questions on ${a.limitStreak} days in a row. Heavy use, not an error: the limit held.` });
  for (const [name, err] of Object.entries(input.sources ?? {})) if (err && err !== 'ok') look.push({ level: 'grey', text: `${name}: ${err}` });
  const rp = input.app?.revoPatterns;
  return {
    v: 2,
    generatedAt: new Date(now).toISOString(),
    revo,
    functions,
    app,
    month: m,
    adoption: adoption(input.totals),
    appTiles: appTiles(input.totals),
    downloads: input.totals?.appStore ?? null,
    issues: input.totals?.sentry?.issues ?? null,
    firestore: input.monitoring?.firestoreToday ?? null,
    config: { revo: typeof input.app?.revo === 'string' ? input.app.revo : 'testers', revoPatterns: rp === true || rp === 'on' },
    totalsAt: input.totals?.generatedAt ?? null,
    sources: input.sources ?? {},
    alerts,
    look,
  };
}
