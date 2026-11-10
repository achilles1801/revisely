#!/usr/bin/env node
// The metrics dashboard's app totals, run by .github/workflows/metrics.yml with the secrets already in
// the repository (SENTRY_API_TOKEN, ASC_REPORTS_*): Sentry sessions per release and channel (with each
// release's platform), unresolved issues per platform, and App Store downloads per day. Totals only:
// nothing per account, the same kind of numbers the public health and stats issues show. The Mac's
// collector (collect.js) downloads the result as the run's artifact.
//
//   node scripts/metrics/totals.js [out.json]

const fs = require('fs');
const { SENTRY, sentryApi } = require('../sentry/api');

const RANGES = { '1h': '5m', '24h': '1h', '7d': '6h', '30d': '1d' };
/** Below this build number a release is Android's (version codes are counted apart from iOS builds). */
const IOS_MIN_BUILD = Number(process.env.METRICS_IOS_MIN_BUILD || 20);

async function sentry(path, params) {
  const token = process.env.SENTRY_API_TOKEN;
  if (!token) throw new Error('SENTRY_API_TOKEN is not set');
  const url = new URL(`${SENTRY.base}${path}`);
  for (const [k, v] of Object.entries(params)) for (const one of [].concat(v)) if (one != null) url.searchParams.append(k, String(one));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sentry ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** "com.revisionbuddy.app@1.0.3+32.u532abc0c" → {version: "1.0.3", build: 32, update: "532abc0c"}. */
function parseRelease(release) {
  const m = /@([^+]+)\+(\d+)(?:\.u([0-9a-f]{8}))?$/.exec(release || '');
  return m ? { version: m[1], build: Number(m[2]), update: m[3] || null } : null;
}

function labelOf(release) {
  const p = parseRelease(release);
  if (!p) return String(release || 'unknown').slice(0, 60);
  return p.update ? `${p.version} (${p.build}) · update ${p.update}` : `${p.version} (${p.build}), built in`;
}

/**
 * Each release's platform: from Sentry events (os.name) where it sent any; else from another release
 * of the same build that did; else by build number (IOS_MIN_BUILD).
 */
function platformMap(eventRows) {
  const byRelease = new Map();
  for (const r of eventRows || []) {
    const os = String(r['os.name'] || '').toLowerCase();
    const p = os.includes('android') ? 'android' : os.includes('ios') || os.includes('ipados') ? 'ios' : null;
    if (!p || !r.release) continue;
    const cur = byRelease.get(r.release) || { ios: 0, android: 0 };
    cur[p] += Number(r['count()']) || 0;
    byRelease.set(r.release, cur);
  }
  const byBuild = new Map();
  for (const [rel, c] of byRelease) {
    const p = parseRelease(rel);
    if (!p) continue;
    const k = `${p.version}+${p.build}`;
    const cur = byBuild.get(k) || { ios: 0, android: 0 };
    cur.ios += c.ios; cur.android += c.android;
    byBuild.set(k, cur);
  }
  const pick = (c) => (c.android > c.ios ? 'android' : 'ios');
  return function platformOf(release) {
    if (byRelease.has(release)) return pick(byRelease.get(release));
    const p = parseRelease(release);
    if (p && byBuild.has(`${p.version}+${p.build}`)) return pick(byBuild.get(`${p.version}+${p.build}`));
    return p && p.build < IOS_MIN_BUILD ? 'android' : 'ios';
  };
}

/** Sessions (by status) and people per release for one channel and range. */
function shapeRange(bySession, byUser, platformOf, dated) {
  const times = (bySession.intervals || []).map((t) => Date.parse(t));
  const rel = new Map();
  const get = (release) => {
    if (!rel.has(release)) rel.set(release, { release, label: labelOf(release), platform: platformOf(release), sessions: new Array(times.length).fill(0), crashed: new Array(times.length).fill(0), users: new Array(times.length).fill(0), totalSessions: 0, totalCrashed: 0, totalUsers: 0 });
    return rel.get(release);
  };
  for (const g of bySession.groups || []) {
    const r = get(g.by.release);
    const s = g.series['sum(session)'] || [];
    s.forEach((v, i) => { r.sessions[i] += v || 0; if (g.by['session.status'] === 'crashed') r.crashed[i] += v || 0; });
    r.totalSessions += g.totals['sum(session)'] || 0;
    if (g.by['session.status'] === 'crashed') r.totalCrashed += g.totals['sum(session)'] || 0;
  }
  for (const g of byUser.groups || []) {
    const r = get(g.by.release);
    (g.series['count_unique(user)'] || []).forEach((v, i) => { if (i < times.length) r.users[i] = v || 0; });
    r.totalUsers = g.totals['count_unique(user)'] || 0;
  }
  // The newest update on each platform's builds is "latest".
  const newest = {};
  for (const r of rel.values()) {
    const p = parseRelease(r.release);
    if (!p || !p.update) continue;
    const t = dated.get(r.release) || 0;
    if (!newest[r.platform] || t > newest[r.platform].t) newest[r.platform] = { t, release: r.release };
  }
  for (const r of rel.values()) r.latest = newest[r.platform]?.release === r.release;
  return { times, releases: [...rel.values()] };
}

async function sentryTotals() {
  const base = `/organizations/${SENTRY.org}`;
  const events = await sentry(`${base}/events/`, { project: SENTRY.projectId, environment: SENTRY.environments, field: ['release', 'os.name', 'count()'], statsPeriod: '90d', per_page: 100, sort: '-count()' }).catch(() => ({ data: [] }));
  const platformOf = platformMap(events.data);
  const releases = await sentry(`${base}/releases/`, { project: SENTRY.projectId, per_page: 100 }).catch(() => []);
  const dated = new Map((releases || []).map((r) => [r.version, Date.parse(r.dateCreated) || 0]));
  const out = {};
  for (const env of ['production', 'preview']) {
    out[env] = { unique: {} };
    for (const [period, interval] of Object.entries(RANGES)) {
      try {
        const common = { project: SENTRY.projectId, environment: env, statsPeriod: period, interval };
        const [bySession, byUser] = await Promise.all([
          sentry(`${base}/sessions/`, { ...common, field: 'sum(session)', groupBy: ['release', 'session.status'] }),
          sentry(`${base}/sessions/`, { ...common, field: 'count_unique(user)', groupBy: 'release' }),
        ]);
        out[env][period] = shapeRange(bySession, byUser, platformOf, dated);
      } catch (err) {
        out[env][period] = null;
        console.error(`::warning title=Sentry ${env} ${period}::${err.message}`);
      }
    }
    for (const period of ['24h', '7d', '30d']) {
      const r = await sentry(`${base}/sessions/`, { project: SENTRY.projectId, environment: env, statsPeriod: period, interval: '1d', field: 'count_unique(user)' }).catch(() => null);
      out[env].unique[period] = r?.groups?.[0]?.totals?.['count_unique(user)'] ?? null;
    }
  }
  out.issues = {};
  for (const [key, os] of [['ios', 'iOS'], ['android', 'Android']]) {
    const list = await sentryApi.issues(`is:unresolved !issue.category:feedback os.name:${os}`, '24h', 100).catch(() => null);
    out.issues[key] = list ? { issues: list.length, events: list.reduce((a, i) => a + (Number(i.count) || 0), 0) } : null;
  }
  return out;
}

/** App Store first downloads, re-downloads and updates per day, the last 30 days Apple has published. */
async function appStoreTotals(now = new Date()) {
  const { salesSummary, token } = require('../stats/appStore');
  const { tally } = require('../stats/digest');
  const apple = process.env.ASC_APP_ID || '6767990248';
  const auth = token(process.env);
  const days = [];
  for (let i = 30; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
    const r = await salesSummary(d, { frequency: 'DAILY', env: process.env, auth });
    if (r.missing) { days.push({ day: d, missing: true }); continue; }
    const t = tally(r.rows, apple);
    days.push({ day: d, first: t.first, redownload: t.redownload, update: t.update, countries: t.countries });
  }
  const recent = days.filter((d) => !d.missing).slice(-7);
  const countries = {};
  for (const d of recent) for (const [c, n] of Object.entries(d.countries || {})) countries[c] = (countries[c] || 0) + n;
  const top = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, first]) => ({ country, first }));
  return { days: days.map(({ countries: _c, ...rest }) => rest), topCountries7d: top };
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), sentry: null, appStore: null, errors: {} };
  try { out.sentry = await sentryTotals(); } catch (err) { out.errors.sentry = err.message; console.error(`::error title=Sentry::${err.message}`); }
  if (process.env.ASC_REPORTS_KEY_ID) {
    try { out.appStore = await appStoreTotals(); } catch (err) { out.errors.appStore = err.message; console.error(`::error title=App Store::${err.message}`); }
  } else out.errors.appStore = 'App Store reports key not set';
  const file = process.argv[2];
  const text = JSON.stringify(out);
  if (file) fs.writeFileSync(file, text); else process.stdout.write(text);
  console.error(`Totals: sentry ${out.sentry ? 'ok' : 'failed'}, app store ${out.appStore ? 'ok' : 'skipped/failed'}`);
}

if (require.main === module) main().catch((err) => { console.error(`::error title=Metrics totals::${err.message}`); process.exit(1); });

module.exports = { parseRelease, labelOf, platformMap, shapeRange };
