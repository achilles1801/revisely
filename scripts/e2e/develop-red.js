#!/usr/bin/env node
// E2E red on develop: a push's run or the nightly run that fails opens (or updates) one GitHub issue
// labelled develop-red, with the failing flows, the run and each flow's first failing step; the next
// run that is green on every platform that was red closes it (TESTING.md, .maestro/README.md).
// The nightly Test Lab run on real Android phones (testlab.yml) reports here too, as the platform
// `devices`: a phone whose crawl crashed or froze (ANR) is its failing "flow".
//
//   node scripts/e2e/develop-red.js <dir of attempts.json files>
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
function nextState(prev, run, verdicts) {
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

async function main() {
  const { githubApi } = require('../sentry/api');
  const run = { url: process.env.RUN_URL, sha: process.env.SHA };
  const attempts = readAttempts(process.argv[2]);
  const verdicts = {
    android: verdict(parseJob(process.env.ANDROID), attempts.android),
    ios: verdict(parseJob(process.env.IOS), attempts.ios),
    devices: verdict(parseJob(process.env.DEVICES), attempts.devices),
  };
  console.log(`This run: ${JSON.stringify(verdicts)}`);
  const open = (await githubApi.issuesWithLabel(LABEL, 'open')).find((i) => i.title === TITLE) ?? null;
  const next = nextState(stateOf(open), run, verdicts);
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

module.exports = { readAttempts, parseJob, verdict, nextState, render, stateOf };
