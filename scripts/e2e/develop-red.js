#!/usr/bin/env node
// E2E red on develop: a push's run or the nightly run that fails opens (or updates) one GitHub issue
// labelled develop-red, with the failing flows, the run and each flow's first failing step; the next
// run that is green on every platform that was red closes it (TESTING.md, .maestro/README.md).
// The nightly Test Lab run on real Android phones (testlab.yml) reports here too, as the platform
// `devices`: a phone whose crawl crashed or froze (ANR) is its failing "flow".
//
//   node scripts/e2e/develop-red.js <dir of attempts.json files>
//
// Suspects: when a platform goes red (or what fails changes), the issue lists the PRs merged since
// its last green run, and marks those that changed a file a failing flow uses (its subflows and
// scripts, followed as .github/scripts/affected-flows.js does), so a revert can go up in minutes
// (Actions → Revert a suspect; scripts/e2e/revert-suspect.sh).
//
// Environment: GITHUB_TOKEN, GITHUB_REPOSITORY; RUN_URL, SHA; MENTION (who is told when it opens);
// IOS, ANDROID and DEVICES, each `<flows planned: true|false>:<job planned: true|false>:<job result>`
// (a platform left unset keeps what the issue says).
//
// A platform is tested by a run when its job ran flows (a push to develop builds iOS without flows:
// only a failed build counts there). Red: a flow failed every attempt (a pass on the retry is a
// flake, which the weekly flake report counts), or the job failed. Cancelled (a newer push) or not
// planned: the platform keeps what the issue says.

const fs = require('fs');
const path = require('path');

const LABEL = 'develop-red';
const TITLE = 'E2E is red on develop';
const STATE = /<!-- develop-red-state (\{[\s\S]*?\}) -->/;
const PLATFORMS = ['android', 'ios', 'devices'];
const NAMES = { android: 'Android', ios: 'iOS', devices: 'Real Android phones (Test Lab)' };

/** Every attempts.json under `dir` (one per E2E job), by platform. */
function readAttempts(dir) {
  const out = { android: [], ios: [], devices: [] };
  if (!dir || !fs.existsSync(dir)) return out;
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'attempts.json' ? [path.join(d, e.name)] : []));
  for (const file of walk(dir)) {
    try {
      const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (out[rec.platform]) out[rec.platform].push(rec);
    } catch (err) {
      console.error(`::warning title=develop-red::${file}: ${err.message}`);
    }
  }
  return out;
}

/** `true:true:failure` → { flows, planned, result }. */
function parseJob(s) {
  const [flows, planned, result] = String(s ?? '').split(':');
  return { flows: flows === 'true', planned: planned === 'true', result: result || 'skipped' };
}

/** What this run says of one platform: null (nothing), or { red, flows: [{ flow, reason }] }. */
function verdict(job, records) {
  if (!job.planned || job.result === 'cancelled' || job.result === 'skipped') return null;
  const failed = records.flatMap((r) => (r.flows ?? []).filter((f) => !f.passed).map((f) => ({ flow: f.flow, reason: f.attempts?.[0]?.reason ?? '' })));
  if (job.result === 'success') return job.flows ? { red: false, flows: [] } : null;
  if (failed.length > 0) return { red: true, flows: failed };
  return { red: true, flows: [{ flow: job.flows ? '(the job)' : '(the native build)', reason: 'the job failed outside the flows: see the run' }] };
}

/**
 * The issue's state after this run. `prev`: { android, ios } from the issue (each { red, since,
 * last, flows }) or null. Returns { state, changed, opened, closed }.
 */
function nextState(prev, run, verdicts, suspectsFor = () => null) {
  const state = { android: prev?.android ?? null, ios: prev?.ios ?? null, devices: prev?.devices ?? null };
  let changed = false;
  for (const p of PLATFORMS) {
    const v = verdicts[p];
    if (!v) continue;
    const before = state[p];
    if (v.red) {
      const same = before?.red && JSON.stringify(before.flows.map((f) => f.flow)) === JSON.stringify(v.flows.map((f) => f.flow));
      if (!same) changed = true;
      state[p] = { red: true, since: before?.red ? before.since : run, last: run, flows: v.flows };
      // The last green run: before this red spell (kept while it lasts).
      state[p].green = before?.red ? (before.green ?? null) : before?.last ?? null;
      state[p].suspects = same ? (before.suspects ?? null) : suspectsFor(p, state[p].green, v.flows);
    } else {
      if (before?.red) changed = true;
      state[p] = { red: false, last: run, flows: [] };
    }
  }
  const redNow = PLATFORMS.some((p) => state[p]?.red);
  const redBefore = PLATFORMS.some((p) => prev?.[p]?.red);
  return { state, changed, opened: redNow && !redBefore, closed: !redNow && redBefore };
}

/** Text from a run as a code span, safe in Markdown. */
const code = (s) => `\`${String(s).replace(/`/g, "'").replace(/\s+/g, ' ').slice(0, 300)}\``;
const runLink = (r) => `[${String(r.sha ?? '').slice(0, 7) || 'run'}](${r.url})`;

function render(state) {
  const lines = [
    'E2E fails on `develop` (a push\'s run, the nightly run, or the nightly run on real phones). Each run updates this issue, and the first run that is green on every platform that was red closes it (`scripts/e2e/develop-red.js`).',
    '',
    'Fix the cause; a flaky flow is fixed too, never skipped (TESTING.md).',
  ];
  for (const p of PLATFORMS) {
    const s = state[p];
    if (p === 'devices' && !s) continue;
    lines.push('', `## ${NAMES[p]}: ${s ? (s.red ? 'red' : 'green') : 'not run yet'}`);
    if (!s) continue;
    if (!s.red) {
      lines.push('', `Last run: ${runLink(s.last)}.`);
      continue;
    }
    lines.push('', `Red since ${runLink(s.since)}; last red run ${runLink(s.last)}.`, '', '| Flow | First failing step |', '| --- | --- |');
    for (const f of s.flows) lines.push(`| ${code(f.flow)} | ${code(f.reason || 'no reason recorded')} |`);
    if (s.suspects) {
      const from = s.green ? `the last green run, ${runLink(s.green)}` : 'the last push whose CI passed';
      lines.push('', `**Suspects:** merged since ${from}:`);
      if (s.suspects.length === 0) lines.push('- none found (a flake, or a change outside develop: the emulator, a runner image)');
      for (const x of s.suspects) {
        const touched = x.touched.length ? `: changed ${x.touched.map((t) => code(t)).join(', ')}, which a failing flow uses` : '';
        lines.push(`- ${x.touched.length ? '**' : ''}#${x.number}${x.touched.length ? '**' : ''} ${String(x.title).replace(/[<>]/g, '').slice(0, 100)}${touched}`);
      }
      lines.push('', 'To revert one: Actions → **Revert a suspect** → Run workflow with its number (a revert PR into develop, with auto-merge).');
    }
  }
  lines.push('', `<!-- develop-red-state ${JSON.stringify(state)} -->`);
  return lines.join('\n') + '\n';
}

function stateOf(issue) {
  const m = STATE.exec(issue?.body ?? '');
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** PR numbers named by commit messages, newest first: merge commits and squash merges. */
function prNumbers(messages) {
  const out = [];
  for (const m of messages) {
    const first = String(m).split('\n')[0];
    const n = /^Merge pull request #(\d+)/.exec(first)?.[1] ?? /\(#(\d+)\)$/.exec(first)?.[1];
    if (n && !out.includes(Number(n))) out.push(Number(n));
  }
  return out;
}

/** The failing flows' files: the flow and every subflow and script it uses. */
function flowFiles(flows, closure) {
  const files = new Set();
  for (const f of flows) {
    const name = String(f.flow).replace(/-run\d+$/, '');
    if (!/^\d{2}-/.test(name)) continue;
    for (const file of closure(`.maestro/flows/${name}.yaml`)) files.add(file);
  }
  return files;
}

/** Suspects: each PR, with the files it changed that a failing flow uses. */
function suspects(prs, files) {
  return prs.map((pr) => ({ number: pr.number, title: pr.title, touched: pr.files.filter((f) => files.has(f)) }));
}

async function gh(path) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status}`);
  return res.json();
}

/** The PRs merged between two commits on develop, with their files (at most 30 PRs). */
async function mergedBetween(from, to) {
  const cmp = await gh(`/compare/${from}...${to}`);
  const numbers = prNumbers((cmp.commits ?? []).map((c) => c.commit.message).reverse()).slice(0, 30);
  const prs = [];
  for (const n of numbers) {
    const pr = await gh(`/pulls/${n}`);
    const files = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await gh(`/pulls/${n}/files?per_page=100&page=${page}`);
      files.push(...batch.map((f) => f.filename));
      if (batch.length < 100) break;
    }
    prs.push({ number: n, title: pr.title, files });
  }
  return prs;
}

async function main() {
  const { githubApi } = require('../sentry/api');
  // The nightly run names develop: the commit it tested.
  if (process.env.SHA === 'develop') process.env.SHA = (await gh('/commits/develop')).sha;
  const run = { url: process.env.RUN_URL, sha: process.env.SHA };
  const attempts = readAttempts(process.argv[2]);
  const verdicts = {
    android: verdict(parseJob(process.env.ANDROID), attempts.android),
    ios: verdict(parseJob(process.env.IOS), attempts.ios),
    devices: verdict(parseJob(process.env.DEVICES), attempts.devices),
  };
  console.log(`This run: ${JSON.stringify(verdicts)}`);
  const open = (await githubApi.issuesWithLabel(LABEL, 'open')).find((i) => i.title === TITLE) ?? null;
  // Worked out before nextState (which is synchronous): the PRs since each platform's last green run.
  const prev = stateOf(open);
  let lastPassed = null;
  const found = {};
  const { closure } = require('../../.github/scripts/affected-flows');
  for (const p of PLATFORMS) {
    if (!verdicts[p]?.red) continue;
    try {
      let green = prev?.[p] && !prev[p].red ? prev[p].last?.sha : prev?.[p]?.green?.sha;
      if (!green) {
        lastPassed ??= (await gh('/actions/workflows/ci.yml/runs?branch=develop&event=push&status=success&per_page=1')).workflow_runs?.[0]?.head_sha ?? '';
        green = lastPassed;
      }
      if (green && green !== run.sha) found[p] = suspects(await mergedBetween(green, run.sha), flowFiles(verdicts[p].flows, closure));
    } catch (err) {
      console.error(`::warning title=develop-red::suspects for ${p}: ${err.message}`);
    }
  }
  const next = nextState(prev, run, verdicts, (p) => found[p] ?? null);
  const red = PLATFORMS.filter((p) => next.state[p]?.red);

  if (!open) {
    if (red.length === 0) return console.log('Green, and no develop-red issue open: nothing to do.');
    await githubApi.ensureLabel(LABEL, 'b60205', 'E2E fails on develop (scripts/e2e/develop-red.js)');
    const issue = await githubApi.createIssue(TITLE, render(next.state), [LABEL]);
    const mention = process.env.MENTION ? `${process.env.MENTION} ` : '';
    await githubApi.comment(issue.number, `${mention}E2E went red on develop in ${runLink(run)}: ${red.map((p) => NAMES[p]).join(' and ')}.`);
    return console.log(`Opened #${issue.number}.`);
  }
  await githubApi.update(open.number, { body: render(next.state) });
  if (next.closed) {
    await githubApi.comment(open.number, `Green again in ${runLink(run)}. Closing.`);
    await githubApi.update(open.number, { state: 'closed', state_reason: 'completed' });
    return console.log(`Closed #${open.number}.`);
  }
  if (next.changed) {
    const now = red.map((p) => `${NAMES[p]}: ${next.state[p].flows.map((f) => f.flow).join(', ')}`).join('; ');
    await githubApi.comment(open.number, `Still red after ${runLink(run)}, and what fails changed. ${now}.`);
  }
  console.log(`Updated #${open.number}.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=develop-red::${err.message}`);
    process.exit(1);
  });
}

module.exports = { readAttempts, parseJob, verdict, nextState, render, stateOf, prNumbers, flowFiles, suspects };
