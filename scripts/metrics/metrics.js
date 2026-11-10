// The dashboard's numbers, worked out from what the collector read (pure: no I/O, so it is tested).
// Input: Firestore rows (non-content fields only), Revo's log lines, Cloud Monitoring summaries and
// the GitHub workflow's Sentry and App Store totals. Output: metrics.json, which the dashboard reads
// from Drive. Accounts appear only as a keyed hash (`hash(uid)`), never as a uid.

const RANGES = {
  '1h': { ms: 3600e3, step: 300e3 },
  '24h': { ms: 86400e3, step: 3600e3 },
  '7d': { ms: 7 * 86400e3, step: 6 * 3600e3 },
  '30d': { ms: 30 * 86400e3, step: 86400e3 },
};
const RANGE_KEYS = Object.keys(RANGES);
const DAILY_QUESTIONS = 20;

/** The range's buckets: aligned to the step (UTC), the last one holding `now`. */
function buckets(key, now) {
  const { ms, step } = RANGES[key];
  const n = Math.round(ms / step);
  const last = Math.floor(now / step) * step;
  const start = last - (n - 1) * step;
  return { start, step, n, end: last + step, index: (t) => (t >= start && t < last + step ? Math.floor((t - start) / step) : -1) };
}

const zeros = (n) => new Array(n).fill(0);
const round = (v, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;
const uidOf = (row) => row.uid || (row.path && row.path[0] === 'users' ? row.path[1] : row.path && row.path[1]);
const chatKey = (uid, chatId) => `${uid}/${chatId}`;
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

/** Revo's switch for an account, as functions/src/revo/settings.ts reads it. */
function revoOn(s) {
  return s.revoOn === true || (s.revoOn === undefined && s.optIn === true);
}

/** The caps as functions/src/coach/handler.ts reads them: $10 a month when unset; a day a tenth of it. */
function capsOf(coach) {
  const m = typeof coach?.monthlyCapUsd === 'number' && coach.monthlyCapUsd > 0 ? Math.min(coach.monthlyCapUsd, 1000) : 10;
  const d = typeof coach?.dailyCapUsd === 'number' && coach.dailyCapUsd > 0 ? coach.dailyCapUsd : m / 10;
  return { monthly: m, daily: d };
}

function prepare(input) {
  const chats = new Map();
  for (const c of input.chats || []) {
    const uid = uidOf(c);
    chats.set(chatKey(uid, c.path[3]), { uid, kind: c.kind === 'review' ? 'review' : 'chat', day: c.day || null, createdAt: c.createdAt || 0 });
  }
  const msgs = (input.messages || []).map((m) => {
    const uid = uidOf(m);
    const chat = chats.get(chatKey(uid, m.path[3])) || null;
    const kinds = Array.isArray(m.attachments) && m.attachments.length ? m.attachments.map((a) => a && a.kind).filter(Boolean) : m.attach && m.attach.kind ? [m.attach.kind] : [];
    return { uid, role: m.role, at: m.at || 0, day: chat ? chat.day : null, review: chat ? chat.kind === 'review' : false, feedback: m.feedback || null, action: !!(m.action && m.action.kind), actionState: m.actionState || null, kinds };
  });
  const testers = new Set((input.users || []).filter((u) => u.previewTester === true).map(uidOf));
  return { chats: [...chats.values()], msgs, testers };
}

/** Accounts at the limit: revision days with 20+ questions, and the longest run of consecutive ones. */
function limitDays(days) {
  const full = [...days.entries()].filter(([, n]) => n >= DAILY_QUESTIONS).map(([d]) => d).sort();
  let best = 0, run = 0, prev = null;
  for (const d of full) {
    const consecutive = prev && Date.parse(d) - Date.parse(prev) === 86400e3;
    run = consecutive ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { count: full.length, streak: best };
}

function revoRange(key, now, P, input, hash) {
  const B = buckets(key, now);
  const inR = (t) => B.index(t) >= 0;
  const lines = input.revoLines || null;
  const q = zeros(B.n), rev = zeros(B.n), failed = zeros(B.n), cr = zeros(B.n), cw = zeros(B.n);
  const T = { questions: 0, reviews: 0, calls: 0, costUsd: 0, failed: 0, failedByCode: {}, resting: 0, capped: 0, cutOff: 0, retried: 0, cached: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const acc = new Map();
  const A = (uid) => {
    if (!acc.has(uid)) acc.set(uid, { uid, q: 0, logQ: 0, days: new Map(), utcDays: new Map(), reviews: 0, logReviews: 0, calls: 0, cost: 0, tokens: 0, up: 0, down: 0, failed: 0 });
    return acc.get(uid);
  };

  if (lines) {
    for (const l of lines) {
      const i = B.index(l.t);
      if (i < 0) continue;
      const a = l.uid ? A(l.uid) : null;
      if (l.event === 'answer') {
        q[i]++; T.questions++;
        if (l.cached) { T.cached++; if (a) a.logQ++; continue; }
        if (a) { a.logQ++; const d = utcDay(l.t); a.utcDays.set(d, (a.utcDays.get(d) || 0) + 1); }
      }
      if (l.event === 'review') { rev[i]++; T.reviews++; if (a) a.logReviews++; }
      if ((l.event === 'answer' || l.event === 'review') && !l.cached) {
        T.calls++; T.costUsd += l.costUsd;
        T.tokens.input += l.input; T.tokens.output += l.output; T.tokens.cacheRead += l.cacheRead; T.tokens.cacheWrite += l.cacheWrite;
        cr[i] += l.cacheRead; cw[i] += l.cacheWrite;
        if (l.attempts > 1) T.retried++;
        if (l.stop === 'max_tokens') T.cutOff++;
        if (a) { a.calls++; a.cost += l.costUsd; a.tokens += l.input + l.output + l.cacheRead + l.cacheWrite; }
      }
      if (l.event === 'failed') { failed[i]++; T.failed++; const c = l.code || 'unknown'; T.failedByCode[c] = (T.failedByCode[c] || 0) + 1; if (a) a.failed++; }
      if (l.event === 'resting') T.resting++;
      if (l.event === 'capped') T.capped++;
    }
  }

  // From the stored chats: questions per revision day, reviews, thumbs, attachments, actions.
  const attach = {};
  let offered = 0, added = 0, up = 0, down = 0;
  for (const m of P.msgs) {
    if (!inR(m.at)) continue;
    if (m.role === 'user') {
      const a = A(m.uid);
      a.q++;
      if (m.day) a.days.set(m.day, (a.days.get(m.day) || 0) + 1);
      if (!lines) q[B.index(m.at)]++;
      for (const k of m.kinds) attach[k] = (attach[k] || 0) + 1;
    } else if (m.role === 'revo') {
      if (m.feedback === 'up') { up++; A(m.uid).up++; }
      if (m.feedback === 'down') { down++; A(m.uid).down++; }
      if (m.action) offered++;
      if (m.actionState === 'added') added++;
    }
  }
  for (const c of P.chats) if (c.kind === 'review' && inR(c.createdAt)) { A(c.uid).reviews++; if (!lines) rev[B.index(c.createdAt)]++; }
  if (!lines) { T.questions = q.reduce((x, y) => x + y, 0); T.reviews = rev.reduce((x, y) => x + y, 0); }

  const avg = T.calls ? T.costUsd / T.calls : 0;
  const owners = input.ownerUids || new Set();
  const rows = [...acc.values()].filter((a) => a.q + a.logQ + a.reviews + a.logReviews + a.up + a.down + a.failed > 0).map((a) => {
    const questions = Math.max(a.q, a.logQ);
    const reviews = Math.max(a.reviews, a.logReviews);
    const missing = Math.max(0, questions + reviews - a.calls);
    const lim = limitDays(a.days.size ? a.days : a.utcDays);
    return {
      id: hash(a.uid),
      tags: [...(owners.has(a.uid) ? ['you'] : []), ...(P.testers.has(a.uid) ? ['tester'] : [])],
      q: questions,
      days: Math.max(a.days.size, a.utcDays.size),
      reviews,
      tokens: Math.round(a.tokens + missing * (T.calls ? (T.tokens.input + T.tokens.output + T.tokens.cacheRead + T.tokens.cacheWrite) / T.calls : 0)),
      costUsd: round(a.cost + missing * avg, 6),
      costExact: missing === 0 && a.calls > 0,
      limitDays: lim.count,
      limitStreak: lim.streak,
      up: a.up,
      down: a.down,
      failed: a.failed,
      lastAt: lastSeen(a.uid, P, lines),
    };
  }).sort((x, y) => y.costUsd - x.costUsd || y.q - x.q).slice(0, 100);

  const returned = key === '7d' || key === '30d' ? rows.filter((r) => r.days >= 2).length : null;
  return {
    start: B.start, step: B.step, n: B.n,
    series: {
      q, rev, failed,
      cacheShare: cr.map((v, i) => (v + cw[i] > 0 ? round((v / (v + cw[i])) * 100, 1) : null)),
    },
    totals: { ...T, costUsd: round(T.costUsd, 6), people: rows.filter((r) => r.q > 0 || r.reviews > 0).length, limitPeople: rows.filter((r) => r.limitDays > 0).length, costPerCall: round(avg, 6) },
    funnel: { on: (input.settings || []).filter(revoOn).length, asked: rows.filter((r) => r.q > 0).length, returned },
    attach, actions: { offered, added }, thumbs: { up, down },
    accounts: rows,
  };
}

function lastSeen(uid, P, lines) {
  let t = 0;
  for (const m of P.msgs) if (m.uid === uid && m.at > t) t = m.at;
  if (lines) for (const l of lines) if (l.uid === uid && l.t > t) t = l.t;
  return t || null;
}

/** The month so far from the spend ledger (coachLedgerDay: Revo and the Ask coach, settled). */
function month(input, now) {
  const caps = capsOf(input.coach);
  const ym = utcDay(now).slice(0, 7);
  const byDay = new Map((input.ledgerDays || []).map((d) => [d.day || (d.path && d.path[1]), d]));
  const days = [];
  let total = 0;
  const today = Number(utcDay(now).slice(8, 10));
  for (let dd = 1; dd <= today; dd++) {
    const day = `${ym}-${String(dd).padStart(2, '0')}`;
    const spend = Number(byDay.get(day)?.spendUsd) || 0;
    total += spend;
    days.push({ day, spendUsd: round(spend), cumUsd: round(total) });
  }
  const daysInMonth = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  return { ym, daysInMonth, days, monthUsd: round(total), todayUsd: days.length ? days[days.length - 1].spendUsd : 0, capUsd: caps.monthly, dailyCapUsd: caps.daily };
}

/** Functions per range from Monitoring: calls by class, typical and slow latency (ms). */
function functionsRange(m) {
  if (!m) return null;
  return Object.entries(m.calls || {})
    .map(([name, c]) => ({ name, calls: (c['2xx'] || 0) + (c['3xx'] || 0) + (c['4xx'] || 0) + (c['5xx'] || 0), c4xx: c['4xx'] || 0, c5xx: c['5xx'] || 0, p50: m.p50?.[name] ?? null, p95: m.p95?.[name] ?? null }))
    .filter((f) => f.calls > 0)
    .sort((a, b) => b.calls - a.calls);
}

/** App health for one range from the workflow's Sentry totals. */
function appRange(key, totals) {
  const s = totals?.sentry;
  if (!s) return null;
  const out = {};
  for (const [chan, env] of [['prod', 'production'], ['test', 'preview']]) {
    const r = s[env]?.[key];
    if (!r) { out[chan] = null; continue; }
    const ios = zeros(r.times.length), android = zeros(r.times.length);
    for (const rel of r.releases) {
      const target = rel.platform === 'android' ? android : ios;
      rel.users.forEach((v, i) => { target[i] += v; });
    }
    const releases = r.releases
      .map((x) => ({ release: x.release, label: x.label, platform: x.platform, sessions: x.totalSessions, crashed: x.totalCrashed, users: x.totalUsers, crashFree: x.totalSessions ? round(1 - x.totalCrashed / x.totalSessions, 4) : null }))
      .filter((x) => x.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);
    const sessions = releases.reduce((a, x) => a + x.sessions, 0), crashed = releases.reduce((a, x) => a + x.crashed, 0);
    out[chan] = { times: r.times, ios, android, releases: releases.slice(0, 10), sessions, crashed, crashFree: sessions ? round(1 - crashed / sessions, 4) : null };
  }
  return out;
}

/** Store users on each JavaScript update, per platform, from the last 24 h of production sessions. */
function adoption(totals) {
  const r = totals?.sentry?.production?.['24h'];
  if (!r) return null;
  const out = {};
  for (const p of ['ios', 'android']) {
    const rel = r.releases.filter((x) => x.platform === p && x.totalUsers > 0);
    const all = rel.reduce((a, x) => a + x.totalUsers, 0);
    if (!all) { out[p] = []; continue; }
    out[p] = rel.sort((a, b) => b.totalUsers - a.totalUsers).map((x) => ({ label: x.label, users: x.totalUsers, share: round(x.totalUsers / all, 3), latest: !!x.latest }));
  }
  return out;
}

function appTiles(totals) {
  const s = totals?.sentry;
  if (!s) return null;
  const tile = (env) => {
    const u = s[env]?.unique || {};
    const day = s[env]?.['24h'];
    const split = { ios: 0, android: 0 };
    if (day) for (const rel of day.releases) split[rel.platform === 'android' ? 'android' : 'ios'] += rel.totalUsers;
    return { day: u['24h'] ?? null, week: u['7d'] ?? null, month: u['30d'] ?? null, split };
  };
  return { prod: tile('production'), test: tile('preview') };
}

/** Alerts worth acting on, from the numbers above (the page adds stale data). */
function alerts(m, now) {
  const out = [];
  const hour = m.revo['1h'];
  const lastHourCalls = hour.totals.calls + hour.totals.failed;
  let burst = 0;
  const f = hour.series.failed; // 5-minute steps: any 15 minutes with 3 or more
  for (let i = 0; i + 2 < f.length; i++) burst = Math.max(burst, f[i] + f[i + 1] + f[i + 2]);
  const failing = burst >= 3 || (lastHourCalls >= 5 && hour.totals.failed / lastHourCalls > 0.1);
  out.push({ id: 'revo-failing', level: failing ? 'alarm' : 'ok', title: 'Revo answers failing', value: `${hour.totals.failed} in the last hour` });
  const day = m.revo['24h'].totals;
  out.push({ id: 'revo-resting', level: day.resting + day.capped > 0 ? 'alarm' : 'ok', title: 'Revo resting or capped', value: day.resting + day.capped > 0 ? `${day.resting} resting, ${day.capped} capped in 24 h` : 'not in 24 h' });
  const mo = m.month;
  out.push({ id: 'spend-today', level: mo.todayUsd > mo.dailyCapUsd / 2 ? 'alarm' : 'ok', title: 'Revo spend today', value: `$${mo.todayUsd.toFixed(2)} of $${mo.dailyCapUsd.toFixed(0)}` });
  out.push({ id: 'spend-month', level: mo.monthUsd > mo.capUsd * 0.8 ? 'alarm' : 'ok', title: 'Month against the cap', value: `$${mo.monthUsd.toFixed(2)} of $${mo.capUsd.toFixed(0)}` });
  const fnHour = m.functions['1h'];
  if (fnHour) {
    const bad = fnHour.filter((x) => x.c5xx > 0 && x.c5xx / x.calls > 0.01);
    out.push({ id: 'function-errors', level: bad.length ? 'alarm' : 'ok', title: 'Function errors', value: bad.length ? bad.map((x) => `${x.name} ${x.c5xx}`).join(', ') + ' in the last hour' : 'none in the last hour' });
  } else out.push({ id: 'function-errors', level: 'nodata', title: 'Function errors', value: 'no data' });
  const prod = m.app['24h']?.prod;
  if (prod) {
    const low = prod.releases.filter((r) => r.sessions >= 50 && r.crashFree != null && r.crashFree < 0.99);
    out.push({ id: 'crash-free', level: low.length ? 'alarm' : 'ok', title: 'Crash-free (store users)', value: prod.crashFree == null ? 'no sessions' : `${(prod.crashFree * 100).toFixed(1)}%` });
  } else out.push({ id: 'crash-free', level: 'nodata', title: 'Crash-free (store users)', value: 'no data' });
  const streaks = m.revo['7d'].accounts.filter((a) => a.limitStreak >= 3);
  const atLimit = m.revo['7d'].accounts.filter((a) => a.limitDays > 0);
  out.push({ id: 'limit', level: streaks.length ? 'warn' : 'ok', title: 'Accounts at the limit', value: atLimit.length ? atLimit.slice(0, 2).map((a) => `${a.id}, ${a.limitDays} d`).join(' · ') : 'none in 7 d' });
  out.push({ id: 'tcq', level: 'nodata', title: 'The Clear Quran budget', value: 'not connected' });
  return out;
}

/** "Needs a look" lines for the phone view: alarms first, then accounts at the limit 3 days running. */
function look(m) {
  const items = [];
  for (const a of m.alerts) if (a.level === 'alarm') items.push({ level: 'alarm', text: `${a.title}: ${a.value}` });
  for (const a of m.revo['7d'].accounts) if (a.limitStreak >= 3) items.push({ level: 'warn', text: `${a.id} reached ${DAILY_QUESTIONS} questions on ${a.limitStreak} days in a row. Heavy use, not an error: the limit held.` });
  for (const [name, err] of Object.entries(m.sources)) if (err && err !== 'ok') items.push({ level: 'grey', text: `${name}: ${err}` });
  return items;
}

/** Everything the dashboard shows. */
function build(input) {
  const now = input.now;
  const hash = input.hash || ((u) => u);
  const P = prepare(input);
  const m = { v: 1, generatedAt: new Date(now).toISOString(), requestedAt: input.requestedAt || null, revo: {}, functions: {}, app: {} };
  for (const k of RANGE_KEYS) {
    m.revo[k] = revoRange(k, now, P, input, hash);
    m.revo[k].latency = input.monitoring?.revoLatency?.[k] || null;
    m.functions[k] = functionsRange(input.monitoring?.perRange?.[k]);
    m.app[k] = appRange(k, input.totals);
  }
  m.month = month(input, now);
  m.adoption = adoption(input.totals);
  m.appTiles = appTiles(input.totals);
  m.downloads = input.totals?.appStore || null;
  m.issues = input.totals?.sentry?.issues || null;
  m.firestore = input.monitoring?.firestoreToday || null;
  m.config = { revo: input.app?.revo || 'testers', revoPatterns: input.app?.revoPatterns === true || input.app?.revoPatterns === 'on' };
  m.totalsAt = input.totals?.generatedAt || null;
  m.sources = input.sources || {};
  m.alerts = alerts(m, now);
  m.look = look(m);
  return m;
}

module.exports = { build, buckets, RANGES, limitDays, capsOf, revoOn, alerts };
