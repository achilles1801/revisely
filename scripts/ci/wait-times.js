#!/usr/bin/env node
// CI congestion: how long jobs waited for a runner against how long they ran, per workflow, and the
// most jobs running at once (TESTING.md "Speed"; the weekly E2E flake report adds it). Waiting is
// what eight sessions pushing at once costs; the peak says whether a plan's job limit is reached.
//
//   node scripts/ci/wait-times.js [--since ISO] [--until ISO] [--days N] [--comment]
//     (GITHUB_TOKEN, GITHUB_REPOSITORY; default the last 7 days)
//
// Counted: jobs that held a runner (a runner name, a start and an end; skipped jobs never do), each
// job id once (a re-run is a new attempt with its own id, and it held a runner of its own). Waiting
// is started − created; a start before the creation (re-runs report those) counts as no wait.
// --comment posts the table on the "E2E flakes (weekly report)" issue (label e2e-flakes).

const MIN = 60_000;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const { githubGet: api } = require('./githubGet');

/** A job as counted here, or null when it held no runner. */
function counted(job, workflow) {
  if (!job.runner_name || !job.started_at || !job.completed_at || job.conclusion === 'skipped') return null;
  const created = Date.parse(job.created_at ?? job.started_at);
  const started = Date.parse(job.started_at);
  const ended = Date.parse(job.completed_at);
  if (!(ended >= started)) return null;
  const labels = (job.labels ?? []).join(' ');
  return {
    id: job.id,
    workflow,
    os: /macos/i.test(labels) ? 'macOS' : 'Linux',
    created,
    started,
    ended,
    wait: Math.max(0, started - created),
    run: ended - started,
  };
}

const quantile = (xs, q) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};

/** The most jobs running at once, and when (a sweep over starts and ends). */
function peak(jobs) {
  const events = jobs.flatMap((j) => [
    [j.started, 1],
    [j.ended, -1],
  ]);
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let best = { count: 0, at: null };
  for (const [t, d] of events) {
    now += d;
    if (now > best.count) best = { count: now, at: t };
  }
  return best;
}

function summarize(jobs) {
  const byWorkflow = new Map();
  for (const j of jobs) {
    if (!byWorkflow.has(j.workflow)) byWorkflow.set(j.workflow, []);
    byWorkflow.get(j.workflow).push(j);
  }
  const row = (name, js) => ({
    name,
    jobs: js.length,
    waitMin: js.reduce((a, j) => a + j.wait, 0) / MIN,
    runMin: js.reduce((a, j) => a + j.run, 0) / MIN,
    medianWait: quantile(js.map((j) => j.wait), 0.5) / MIN,
    p90Wait: quantile(js.map((j) => j.wait), 0.9) / MIN,
    over10: js.filter((j) => j.wait > 10 * MIN).length,
  });
  // By hour (of the start): the jobs, the most Linux jobs running at once, the long waits.
  const hours = new Map();
  for (const j of jobs) {
    const h = Math.floor(j.started / (60 * MIN)) * 60 * MIN;
    if (!hours.has(h)) hours.set(h, []);
    hours.get(h).push(j);
  }
  const hourly = [...hours.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, js]) => ({
      hour: h,
      jobs: js.length,
      peakLinux: peak(jobs.filter((j) => j.os === 'Linux' && j.ended > h && j.started < h + 60 * MIN).map((j) => ({ ...j, started: Math.max(j.started, h), ended: Math.min(j.ended, h + 60 * MIN) }))).count,
      medianWait: quantile(js.map((j) => j.wait), 0.5) / MIN,
      over10: js.filter((j) => j.wait > 10 * MIN).length,
    }));
  return {
    rows: [...byWorkflow.entries()].map(([n, js]) => row(n, js)).sort((a, b) => b.waitMin - a.waitMin),
    total: row('All', jobs),
    peaks: Object.fromEntries(['Linux', 'macOS'].map((os) => [os, peak(jobs.filter((j) => j.os === os))])),
    hourly,
  };
}

const f = (n) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1));
const t = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '');

function render({ rows, total, peaks, hourly = [] }, since, until) {
  const lines = [
    `### CI wait times, ${t(since)} to ${t(until)}`,
    '',
    'Jobs that held a runner (each job attempt once). Waiting: created to started.',
    '',
    `Most jobs running at once: **Linux ${peaks.Linux.count}** (${t(peaks.Linux.at)}), **macOS ${peaks.macOS.count}** (${t(peaks.macOS.at)}).`,
    '',
    '| Workflow | Jobs | Waiting (min) | Running (min) | Median wait | 90th % wait | Waits > 10 min |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const r of [...rows, total]) {
    const b = r.name === 'All' ? '**' : '';
    lines.push(`| ${b}${r.name}${b} | ${r.jobs} | ${f(r.waitMin)} | ${f(r.runMin)} | ${f(r.medianWait)} | ${f(r.p90Wait)} | ${r.over10} |`);
  }
  if (hourly.length > 1) {
    lines.push('', '| Hour (UTC) | Jobs started | Most Linux jobs at once | Median wait | Waits > 10 min |', '| --- | ---: | ---: | ---: | ---: |');
    for (const h of hourly) lines.push(`| ${t(h.hour).slice(5, 13)}h | ${h.jobs} | ${h.peakLinux} | ${f(h.medianWait)} | ${h.over10} |`);
  }
  return lines.join('\n') + '\n';
}

async function collect(since, until) {
  const jobs = new Map();
  const window = `${new Date(since).toISOString()}..${new Date(until).toISOString()}`;
  for (let page = 1; page <= 10; page++) {
    const { workflow_runs: runs } = await api(`/actions/runs?created=${encodeURIComponent(window)}&per_page=100&page=${page}`);
    for (const r of runs) {
      for (let jp = 1; jp <= 5; jp++) {
        const { jobs: batch } = await api(`/actions/runs/${r.id}/jobs?filter=all&per_page=100&page=${jp}`);
        for (const j of batch) {
          const c = counted(j, r.name);
          if (c && !jobs.has(c.id)) jobs.set(c.id, c);
        }
        if (batch.length < 100) break;
      }
    }
    if (runs.length < 100) break;
  }
  return [...jobs.values()].filter((j) => j.created >= since - 6 * 60 * MIN && j.started <= until);
}

async function main() {
  const until = Date.parse(arg('--until', new Date().toISOString()));
  const since = Date.parse(arg('--since', new Date(until - Number(arg('--days', 7)) * 24 * 60 * MIN).toISOString()));
  const body = render(summarize(await collect(since, until)), since, until);
  console.log(body);
  if (process.env.GITHUB_STEP_SUMMARY) require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
  if (process.argv.includes('--comment')) {
    const { githubApi } = require('../sentry/api');
    const issue = (await githubApi.issuesWithLabel('e2e-flakes', 'open')).find((i) => i.title === 'E2E flakes (weekly report)');
    if (issue) await githubApi.comment(issue.number, body);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=CI wait times::${err.message}`);
    process.exit(1);
  });
}

module.exports = { counted, summarize, peak, render };
