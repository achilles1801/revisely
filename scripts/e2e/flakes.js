#!/usr/bin/env node
// The weekly E2E flake report (.github/workflows/e2e-flakes.yml, .maestro/README.md):
// every E2E job keeps attempts.json (e2e-<platform>-attempts-…: each flow's attempts and
// why a failed one failed, .maestro/scripts/attempts.js). This reads the last DAYS days of
// them and comments a table on the "E2E flakes (weekly report)" issue (label e2e-flakes):
// per flow and platform, how often the first attempt passed, worst first. The owner is
// mentioned (GitHub emails it) only when a flow is under 95%.
//
//   node scripts/e2e/flakes.js [--dry-run]     (GITHUB_TOKEN, GITHUB_REPOSITORY; DAYS=7)
//
// --dry-run prints it (and writes it to the job summary) instead of commenting.

const zlib = require('zlib');

const LABEL = 'e2e-flakes';
const TITLE = 'E2E flakes (weekly report)';
const ARTIFACT = /^e2e-(ios|android)-attempts-/;
/** Under this first-attempt pass rate a flow is flaky enough to mention the owner. */
const THRESHOLD = 0.95;
/** Fewer passing runs than this in the window: listed, never mentioned (too few to tell). */
const MIN_RUNS = 5;

/** The one file in a small zip (an artifact): its central directory, stored or deflated. */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip');
  const files = {};
  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method === 0) files[name] = data;
    else if (method === 8) files[name] = zlib.inflateRawSync(data);
    else throw new Error(`zip method ${method}`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/**
 * Per flow and platform: runs, first-attempt passes, passes on a retry, runs where every
 * attempt failed, and the first attempts that failed. `rate` is passed first ÷ (passed
 * first + passed on retry): a run that never passed is counted apart (`failed`), since
 * most are a branch's own bug rather than a flake.
 */
function aggregate(records) {
  const rows = new Map();
  const seen = new Set();
  for (const rec of records) {
    for (const f of rec.flows ?? []) {
      if (!f.attempts?.length) continue;
      const once = `${rec.run?.id}-${rec.run?.attempt}-${rec.platform}-${f.flow}`;
      if (seen.has(once)) continue;
      seen.add(once);
      const key = `${f.flow}|${rec.platform}`;
      if (!rows.has(key)) rows.set(key, { flow: f.flow, platform: rec.platform, runs: 0, first: 0, retry: 0, failed: 0, misses: [] });
      const row = rows.get(key);
      row.runs++;
      const passed = f.attempts.some((a) => a.passed);
      if (f.attempts[0].passed) row.first++;
      else if (passed) row.retry++;
      else row.failed++;
      if (!f.attempts[0].passed) {
        row.misses.push({ at: rec.at, url: rec.run?.url, branch: rec.run?.branch, reason: f.attempts[0].reason ?? '', recovered: passed });
      }
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, rate: r.first + r.retry > 0 ? r.first / (r.first + r.retry) : null, misses: r.misses.sort((a, b) => String(b.at).localeCompare(String(a.at))) }))
    .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || b.failed - a.failed || b.runs - a.runs || a.flow.localeCompare(b.flow) || a.platform.localeCompare(b.platform));
}

const flaky = (r) => r.rate != null && r.rate < THRESHOLD && r.first + r.retry >= MIN_RUNS;
/** In a code span: no backticks, no line breaks, short. */
const code = (s) => '`' + String(s ?? '').replace(/[`\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) + '`';
const day = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const when = (d) =>
  `${day(d)}, ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
const PLATFORM = { ios: 'iOS', android: 'Android' };

function render({ rows, since, until, jobs, mention = '' }) {
  const out = [];
  out.push(`## E2E flakes, ${day(since)} – ${day(until)}`);
  out.push('');
  const bad = rows.filter(flaky);
  if (bad.length && mention) {
    out.push(
      `${mention} ${bad.length === 1 ? 'one flow' : `${bad.length} flows`} passed on the first attempt less than ` +
        `${Math.round(THRESHOLD * 100)}% of the time: ${bad.map((r) => `${r.flow} (${PLATFORM[r.platform]})`).join(', ')}.`,
    );
    out.push('');
  }
  if (!rows.length) {
    out.push(`No E2E jobs recorded their attempts in these ${Math.round((until - since) / 864e5)} days.`);
    return out.join('\n') + '\n';
  }
  out.push(
    `Every E2E flow's first attempts in ${jobs} jobs (CI on pull requests and develop, nightly, by hand). A failed flow ` +
      'is run once more (`E2E_RETRIES`), and a pass on that retry hides a flake: this counts them.',
  );
  out.push('');
  out.push('| Flow | Platform | Runs | Passed first time | Passed on retry | Failed both | First-attempt pass rate |');
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const rate = r.rate == null ? '–' : `${Math.floor(r.rate * 1000) / 10}%`;
    out.push(
      `| ${r.flow} | ${PLATFORM[r.platform] ?? r.platform} | ${r.runs} | ${r.first} | ${r.retry} | ${r.failed} | ${flaky(r) ? `**${rate}**` : rate} |`,
    );
  }
  out.push('');
  out.push(
    `Rate: passed first time ÷ runs that passed. Runs where both attempts failed are counted apart: most are a branch's ` +
      `own bug, not a flake. In bold: under ${Math.round(THRESHOLD * 100)}% with ${MIN_RUNS} or more passing runs.`,
  );
  const shown = rows.filter((r) => r.retry > 0);
  if (shown.length) {
    out.push('');
    out.push('### First attempts that failed, then passed');
    for (const r of shown) {
      out.push('');
      out.push(`**${r.flow} (${PLATFORM[r.platform] ?? r.platform})**`);
      for (const m of r.misses.filter((x) => x.recovered).slice(0, 5)) {
        out.push(`- ${when(m.at)} · [run](${m.url}) · ${code(m.branch)} · ${code(m.reason)}`);
      }
    }
  }
  return out.join('\n') + '\n';
}

async function api(path, { raw = false } = {}) {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: raw ? 'manual' : 'follow',
  });
  if (raw) return res;
  if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** attempts.json of every E2E job since `since`, from this repository's own branches. */
async function records(since) {
  const found = [];
  for (let page = 1; page <= 30; page++) {
    const { artifacts } = await api(`/actions/artifacts?per_page=100&page=${page}`);
    for (const a of artifacts) {
      if (!ARTIFACT.test(a.name) || a.expired || new Date(a.created_at) < since) continue;
      // Runs of a fork's pull request ran a fork's code: left out.
      const w = a.workflow_run ?? {};
      if (w.head_repository_id && w.repository_id && w.head_repository_id !== w.repository_id) continue;
      found.push(a);
    }
    if (artifacts.length < 100 || new Date(artifacts[artifacts.length - 1].created_at) < since) break;
  }
  const out = [];
  for (const a of found) {
    try {
      const res = await api(`/actions/artifacts/${a.id}/zip`, { raw: true });
      const url = res.headers.get('location');
      const zip = url ? await fetch(url) : res;
      if (!zip.ok) throw new Error(`download ${zip.status}`);
      const files = unzip(Buffer.from(await zip.arrayBuffer()));
      const file = files['attempts.json'] ?? Object.values(files)[0];
      out.push(JSON.parse(file.toString('utf8')));
    } catch (err) {
      console.error(`::warning title=E2E flakes::${a.name}: ${err.message}`);
    }
  }
  return out;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const days = Number(process.env.DAYS || 7);
  const until = new Date();
  const since = new Date(until - days * 864e5);
  const recs = (await records(since)).filter((r) => new Date(r.at) >= since);
  const body = render({ rows: aggregate(recs), since, until, jobs: recs.length, mention: dry ? '' : process.env.MENTION || '' });
  if (dry) {
    console.log(body);
    if (process.env.GITHUB_STEP_SUMMARY) require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
    return;
  }
  const { githubApi } = require('../sentry/api');
  const open = await githubApi.issuesWithLabel(LABEL, 'open');
  let issue = open.find((i) => i.title === TITLE);
  if (!issue) {
    await githubApi.ensureLabel(LABEL, 'fbca04', 'Weekly E2E flake report');
    issue = await githubApi.createIssue(
      TITLE,
      'Every Monday the `E2E flakes` workflow adds a comment here: for each E2E flow and platform, how often its first ' +
        'attempt passed over the last 7 days, worst first, and why the first attempts that needed a retry failed. ' +
        'The owner is mentioned only when a flow is under 95%. See .maestro/README.md ("Flakes").',
      [LABEL],
    );
  }
  await githubApi.comment(issue.number, body);
  console.log(`Posted the report on #${issue.number} (${recs.length} jobs).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`::error title=E2E flakes::${err.message}`);
    process.exit(1);
  });
}

module.exports = { aggregate, render, unzip, THRESHOLD, MIN_RUNS };
