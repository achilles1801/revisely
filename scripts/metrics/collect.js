#!/usr/bin/env node
// The metrics collector, run on the owner's Mac (by watch.js every 6 hours and on a Refresh tap):
// reads Firestore, Revo's log lines and Cloud Monitoring with the read-only service account, adds the
// GitHub workflow's Sentry and App Store totals, works out the numbers (metrics.js) and writes
// metrics.json to the dashboard's Drive folder, with a copy on this Mac. See README.md.
//
//   node collect.js              collect and upload
//   node collect.js --dry-run    collect and print a summary; upload nothing
//   node collect.js --who <id>   the uid behind a dashboard account id (this Mac only)
//
// Config: ~/.config/revisely-metrics/config.json (README.md). Nothing here holds a secret.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadKey, tokenSource, client } = require('./google');
const { store } = require('./firestore');
const { logEntries, revoLine, series, REVO_FILTER, RUN } = require('./cloud');
const { build, buckets, RANGES } = require('./metrics');
const { writeMetrics } = require('./drive');

const HOME = os.homedir();
const CONFIG = process.env.REVISELY_METRICS_CONFIG || path.join(HOME, '.config/revisely-metrics/config.json');
const DATA = process.env.REVISELY_METRICS_DATA || path.join(HOME, '.local/share/revisely-metrics');
const expand = (p) => p.replace(/^~(?=$|\/)/, HOME);

function readConfig() {
  const c = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  for (const k of ['keyFile', 'project', 'hashKey']) if (!c[k]) throw new Error(`${CONFIG}: ${k} is missing`);
  return { repo: 'achilles1801/revisely', workflow: 'metrics.yml', ownerUids: [], drive: {}, ...c, keyFile: expand(c.keyFile) };
}

/** A dashboard account id: a keyed hash of the uid, "k7f2·a9". The key stays in this Mac's config. */
function hasher(key) {
  const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
  return (uid) => {
    const h = crypto.createHmac('sha256', key).update(uid).digest();
    let s = '';
    for (let i = 0; i < 6; i++) s += alphabet[h[i] % 32];
    return `${s.slice(0, 4)}·${s.slice(4)}`;
  };
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, ...opts });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The newest totals from the GitHub workflow: start a run and wait for it (fresh), or take the last good one. */
async function totals(cfg, { fresh }) {
  const list = () => JSON.parse(gh(['run', 'list', '-R', cfg.repo, '--workflow', cfg.workflow, '--limit', '10', '--json', 'databaseId,status,conclusion,createdAt,event']));
  let runId = null;
  if (fresh) {
    const since = Date.now() - 5000;
    gh(['workflow', 'run', cfg.workflow, '-R', cfg.repo]);
    for (let i = 0; i < 40 && !runId; i++) {
      await sleep(6000);
      const run = list().find((r) => r.event === 'workflow_dispatch' && Date.parse(r.createdAt) >= since);
      if (run && run.status === 'completed') {
        if (run.conclusion === 'success') runId = run.databaseId;
        else break;
      }
    }
  }
  if (!runId) runId = list().find((r) => r.status === 'completed' && r.conclusion === 'success')?.databaseId;
  if (!runId) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revisely-totals-'));
  try {
    gh(['run', 'download', String(runId), '-R', cfg.repo, '-n', 'metrics-totals', '-D', dir]);
    return JSON.parse(fs.readFileSync(path.join(dir, 'metrics-totals.json'), 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function firestore(fs_) {
  const [chats, messages, settings, users, ledgerDays, coach, app] = await Promise.all([
    fs_.all('revoChats', ['uid', 'kind', 'day', 'createdAt'], { group: true }),
    // Never `text`, `textAfter` or `title`: only who, when, and the kinds of things.
    fs_.all('messages', ['uid', 'role', 'at', 'feedback', 'actionState', 'attach.kind', 'attachments', 'action.kind'], { group: true }),
    fs_.all('coachSettings', ['revoOn', 'optIn', 'memoryOn']),
    fs_.all('users', ['previewTester']),
    fs_.all('coachLedgerDay', ['day', 'spendUsd', 'calls']),
    fs_.get('config/coach'),
    fs_.get('config/app'),
  ]);
  // Only revoChats' messages: the group "messages" exists nowhere else, but check the path anyway.
  const revoMessages = messages.filter((m) => m.path[2] === 'revoChats').map((m) => ({ ...m, attachments: (m.attachments || []).map((a) => ({ kind: a && a.kind })) }));
  return { chats, messages: revoMessages, settings, users, ledgerDays, coach, app };
}

async function monitoring(call, project, now) {
  const perRange = {};
  const revoLatency = {};
  for (const [key, r] of Object.entries(RANGES)) {
    const start = now - r.ms, periodS = Math.round(r.ms / 1000);
    const [counts, p50, p95] = await Promise.all([
      series(call, project, { metric: 'run.googleapis.com/request_count', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_SUM', groupBy: ['resource.label.service_name', 'metric.label.response_code_class'], extraFilter: RUN }),
      series(call, project, { metric: 'run.googleapis.com/request_latencies', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_50', groupBy: ['resource.label.service_name'], extraFilter: RUN }),
      series(call, project, { metric: 'run.googleapis.com/request_latencies', start, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_PERCENTILE_95', groupBy: ['resource.label.service_name'], extraFilter: RUN }),
    ]);
    const calls = {};
    for (const s of counts) {
      const name = s.labels.service_name;
      const cls = s.labels.response_code_class || '2xx';
      calls[name] = calls[name] || {};
      calls[name][cls] = (calls[name][cls] || 0) + s.points.reduce((a, p) => a + p.v, 0);
    }
    const latest = (list) => Object.fromEntries(list.map((s) => [s.labels.service_name, Math.round([...s.points].sort((a, b) => b.t - a.t)[0]?.v || 0)]));
    perRange[key] = { calls, p50: latest(p50), p95: latest(p95) };
    // Revo's answer time per step of the range.
    const B = buckets(key, now);
    const lat = async (reducer) => {
      const out = new Array(B.n).fill(null);
      const res = await series(call, project, { metric: 'run.googleapis.com/request_latencies', start: B.start, end: B.end, periodS: B.step / 1000, aligner: 'ALIGN_DELTA', reducer, groupBy: ['resource.label.service_name'], extraFilter: `${RUN} AND resource.label.service_name="revoask"` });
      for (const s of res) for (const p of s.points) { const i = B.index(p.t - 1); if (i >= 0 && p.v > 0) out[i] = Math.round(p.v / 100) / 10; }
      return out;
    };
    revoLatency[key] = { p50: await lat('REDUCE_PERCENTILE_50'), p95: await lat('REDUCE_PERCENTILE_95') };
  }
  // Firestore today (UTC).
  const midnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const periodS = Math.max(60, Math.round((now - midnight) / 1000));
  const sum = async (metric, groupBy = []) => {
    const res = await series(call, project, { metric, start: now - periodS * 1000, end: now, periodS, aligner: 'ALIGN_DELTA', reducer: 'REDUCE_SUM', groupBy }).catch(() => []);
    return res;
  };
  const total = (res) => res.reduce((a, s) => a + s.points.reduce((x, p) => x + p.v, 0), 0);
  const [reads, writes, rules] = await Promise.all([
    sum('firestore.googleapis.com/document/read_count'),
    sum('firestore.googleapis.com/document/write_count'),
    sum('firestore.googleapis.com/rules/evaluation_count', ['metric.label.result']),
  ]);
  const firestoreToday = { reads: total(reads), writes: total(writes), denies: total(rules.filter((s) => s.labels.result === 'DENY')) };
  return { perRange, revoLatency, firestoreToday };
}

/** Collects everything and returns metrics.json's content. */
async function collect(cfg, { fresh = false, requestedAt = null } = {}) {
  const now = Date.now();
  const call = client(tokenSource(loadKey(cfg.keyFile)));
  const sources = {};
  const attempt = async (name, f) => {
    try { const v = await f(); sources[name] = 'ok'; return v; } catch (err) { sources[name] = String(err.message || err).replace(/[A-Za-z0-9_-]{20,}/g, '…').slice(0, 160); return null; }
  };
  const [fsData, lines, mon, tot] = await Promise.all([
    attempt('Firestore', () => firestore(store(call, cfg.project))),
    attempt('Revo logs', async () => (await logEntries(call, cfg.project, REVO_FILTER, new Date(now - RANGES['30d'].ms - 86400e3).toISOString())).map(revoLine)),
    attempt('Cloud Monitoring', () => monitoring(call, cfg.project, now)),
    attempt('Sentry and App Store', () => totals(cfg, { fresh })),
  ]);
  if (tot && tot.errors) for (const [k, v] of Object.entries(tot.errors)) if (v) sources[k === 'sentry' ? 'Sentry' : 'App Store'] = v;
  const owners = new Set(cfg.ownerUids || []);
  const hash = hasher(cfg.hashKey);
  const metrics = build({
    now, requestedAt, hash, ownerUids: owners,
    ...(fsData || {}),
    revoLines: lines, monitoring: mon, totals: tot, sources,
  });
  // The lookup from dashboard ids to uids stays on this Mac.
  const ids = new Set([...(fsData?.messages || []).map((m) => m.uid || m.path[1]), ...(lines || []).map((l) => l.uid).filter(Boolean)]);
  const lookup = Object.fromEntries([...ids].filter(Boolean).map((u) => [hash(u), u]));
  return { metrics, lookup };
}

function save(name, data, mode = 0o600) {
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
  const file = path.join(DATA, name);
  fs.writeFileSync(`${file}.part`, JSON.stringify(data), { mode });
  fs.renameSync(`${file}.part`, file);
  return file;
}

async function run(opts = {}) {
  const cfg = readConfig();
  const { metrics, lookup } = await collect(cfg, opts);
  save('metrics.json', metrics);
  save('lookup.json', lookup);
  if (!opts.dryRun && cfg.drive.metricsFileId) {
    const call = client(tokenSource(loadKey(cfg.keyFile)));
    await writeMetrics(call, cfg.drive.metricsFileId, metrics);
  }
  return metrics;
}

function summary(m) {
  const d = m.revo['24h'].totals;
  const lines = [
    `Revo, 24 h: ${d.questions} questions, ${d.people} people, $${d.costUsd.toFixed(2)}, ${d.failed} failed`,
    `Month: $${m.month.monthUsd.toFixed(2)} of $${m.month.capUsd}`,
    `Sources: ${Object.entries(m.sources).map(([k, v]) => `${k} ${v === 'ok' ? 'ok' : 'FAILED (' + v + ')'}`).join(', ')}`,
    `Alarms: ${m.alerts.filter((a) => a.level === 'alarm').map((a) => a.title).join(', ') || 'none'}`,
  ];
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--who') {
    const lookup = JSON.parse(fs.readFileSync(path.join(DATA, 'lookup.json'), 'utf8'));
    const want = String(args[1] || '').replace(/[^0-9a-z]/g, '');
    const hit = Object.entries(lookup).find(([id]) => id.replace(/[^0-9a-z]/g, '') === want);
    console.log(hit ? hit[1] : 'Not found (the lookup holds accounts seen in the last 30 days).');
    return;
  }
  const m = await run({ dryRun: args.includes('--dry-run'), fresh: args.includes('--fresh') });
  console.log(summary(m));
}

if (require.main === module) main().catch((err) => { console.error(err.message || err); process.exit(1); });

module.exports = { run, collect, readConfig, hasher, summary, DATA };
