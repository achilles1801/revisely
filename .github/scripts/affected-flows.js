#!/usr/bin/env node
// Which E2E flows and suites a change to shared test code touches (ci.yml `plan`, "test the tests",
// TESTING.md). A PR that changes what flows share must run every flow that uses it, on both
// platforms, before it merges: #286 changed swipe-page.yaml, passed 06 once in the smoke set, and
// broke 06 on develop. (Once with a retry since Nov 16 2026; twice with no reruns before.)
//
//   git diff --name-only … | node .github/scripts/affected-flows.js
//   → {"flows":"all"} | {"flows":[".maestro/flows/06-offline.yaml", …]} | {"flows":[]},
//     plus "ios": [the flows for iOS] and "scenarios": true|false
//
// - run.sh, .maestro/config.yaml, e2e.yml, ci.yml: every flow on Android. On iOS, the smoke set (02 04
//   05 06) and the flows the change's other test files touch: macOS runners are five at a time, and
//   every iOS flow, twice, took four of them for up to three hours (#627, Nov 16 2026). Every iOS flow
//   still runs on develop's nightly run and on PRs into main.
// - a subflow or a script under .maestro: every flow that uses it, through other subflows too
//   (runFlow / runScript / file: references, followed from each flow).
// - a flow itself: that flow.
// - the E2E job lists (scripts/e2e/jobs.json): the flows whose job it changed, comparing the base's file
//   (E2E_JOBS_BEFORE, a path) with this one; every flow, as for e2e.yml, when there is no file to compare.
//   A flow's job is what that job runs, in order, so a flow moved from one job to another runs both jobs'
//   flows. The lists were in e2e.yml until Nov 16 2026, and splitting a long flow into a file of its own
//   ran every flow (#663).
// - the scenario harness, its Jest config or scripts/emulators.sh: the scenario suite (run twice).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FLOWS = '.maestro/flows';
const EVERY_FLOW = ['.maestro/run.sh', '.maestro/config.yaml', '.github/workflows/e2e.yml', '.github/workflows/ci.yml'];
const JOBS = 'scripts/e2e/jobs.json';
const SCENARIO_CODE = [/^tests\/scenarios\/harness\//, /^tests\/scenarios\/jest\.config\.js$/, /^scripts\/emulators\.sh$/];
// The smoke set (ci.yml, e2e.yml): what a workflow change runs on iOS.
const SMOKE = /^\.maestro\/flows\/0[2456]-[^/]*\.yaml$/;
const REF = /(?:\bfile:\s*|\brunFlow:\s*|\brunScript:\s*)["']?([^\s"'#{}]+\.(?:ya?ml|js))/g;

/** Every file a flow uses, itself included, following references (paths relative to the repo). */
function closure(flow, root = ROOT) {
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    let text;
    try {
      text = fs.readFileSync(path.join(root, rel), 'utf8');
    } catch {
      return;
    }
    if (!rel.endsWith('.yaml') && !rel.endsWith('.yml')) return;
    for (const m of text.matchAll(REF)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
  };
  visit(flow);
  return seen;
}

/** A shell glob of the kind the job lists use (`*`, `?`, `[…]`) as a regular expression. */
function globRegex(glob) {
  const body = glob
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${body}$`);
}

/** Each flow's job in a jobs file, per set ("full .maestro/flows/02-….yaml" → the job's flows, in order). */
function jobsOf(jobs, flows) {
  const out = new Map();
  for (const [set, list] of Object.entries(jobs || {})) {
    if (!Array.isArray(list)) continue;
    for (const job of list) {
      const run = String((job && job.flows) || '')
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((glob) => flows.filter((f) => globRegex(glob).test(f)));
      for (const f of run) out.set(`${set} ${f}`, run.join(' '));
    }
  }
  return out;
}

/** The flows whose job differs between two jobs files. */
function jobChanges(before, after, flows) {
  const a = jobsOf(before, flows);
  const b = jobsOf(after, flows);
  const moved = new Set();
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(key) !== b.get(key)) moved.add(key.slice(key.indexOf(' ') + 1));
  }
  return flows.filter((f) => moved.has(f));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * @param {string[]} changed the change's files
 * @param {string} root the checkout (this change's files)
 * @param {object} [jobsBefore] the base's scripts/e2e/jobs.json, parsed; without it a change to the file runs every flow
 */
function affected(changed, root = ROOT, jobsBefore = undefined) {
  const files = changed.map((f) => f.trim()).filter(Boolean);
  const scenarios = files.some((f) => SCENARIO_CODE.some((re) => re.test(f)));
  const flows = fs
    .readdirSync(path.join(root, FLOWS))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => `${FLOWS}/${f}`);
  const shared = files.filter((f) => f.startsWith('.maestro/') && !EVERY_FLOW.includes(f));
  let everyFlow = files.some((f) => EVERY_FLOW.includes(f));
  let moved = [];
  if (files.includes(JOBS)) {
    const after = readJson(path.join(root, JOBS));
    if (jobsBefore && after) moved = jobChanges(jobsBefore, after, flows);
    else everyFlow = true;
  }
  const hit = flows.filter((flow) => {
    if (moved.includes(flow)) return true;
    const uses = closure(flow, root);
    return shared.some((f) => uses.has(f));
  });
  if (everyFlow) {
    return { flows: 'all', ios: flows.filter((f) => SMOKE.test(f) || hit.includes(f)), scenarios };
  }
  return { flows: hit, ios: hit, scenarios };
}

if (require.main === module) {
  const input = fs.readFileSync(0, 'utf8').split('\n');
  const before = process.env.E2E_JOBS_BEFORE ? readJson(process.env.E2E_JOBS_BEFORE) : undefined;
  console.log(JSON.stringify(affected(input, ROOT, before)));
}

module.exports = { affected, closure, globRegex, jobChanges };
