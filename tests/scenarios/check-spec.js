#!/usr/bin/env node
// BEHAVIOUR.md and its tests agree:
// - every rule (**ID.** in BEHAVIOUR.md) is named by at least one test, as [ID];
// - every [ID] a test names is a rule;
// - every it.failing is a KNOWN BUG (its title says so), and every rule in the
//   Known bugs table exists.
// With --pr <base>, a bug-fix PR (branch fix/…, hotfix/… or claude/issue-…, or a
// title starting with "Fix") must change a scenario or property test, unless it
// carries the `no-scenario` label (PR_LABELS, comma-separated).
// No dependencies; run from anywhere: node tests/scenarios/check-spec.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const SPEC = path.join(ROOT, 'BEHAVIOUR.md');
const TEST_DIRS = [path.join(__dirname, 'scenarios'), path.join(__dirname, 'properties')];
// Test files, and the modules beside them that define tests (scenarios/dayWeeks.ts).
const TEST_FILE = /\.tsx?$/;
const TAG = /\[((?:ONBOARD|DAY|SCHED|SESS|AHEAD|CARRY|JUMP|SYNC|RESET|LOG|REC|SET|AUDIO|ACT|COACH|REVO|ACCOUNT)-\d+)\]/g;

const problems = [];

const spec = fs.readFileSync(SPEC, 'utf8');
const rules = new Set([...spec.matchAll(/^- \*\*([A-Z]+-\d+)\.\*\*/gm)].map((m) => m[1]));
if (rules.size === 0) problems.push('BEHAVIOUR.md lists no rules (lines like "- **DAY-1.** …")');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return TEST_FILE.test(e.name) ? [p] : [];
  });
}

const tested = new Map();
for (const file of TEST_DIRS.flatMap(walk)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const m of text.matchAll(TAG)) {
    if (!rules.has(m[1])) problems.push(`${rel} names [${m[1]}], which BEHAVIOUR.md doesn't have`);
    tested.set(m[1], (tested.get(m[1]) ?? 0) + 1);
  }
  // it.failing('…' / test.failing(`…`: a known bug, and said so.
  for (const m of text.matchAll(/\b(?:it|test)\.failing\(\s*(['"`])(.*?)\1/g)) {
    if (!m[2].startsWith('KNOWN BUG')) problems.push(`${rel}: it.failing "${m[2].slice(0, 60)}…" must start with "KNOWN BUG"`);
  }
}
for (const rule of rules) if (!tested.has(rule)) problems.push(`${rule} has no test (name it as [${rule}] in a scenario or property test)`);

const knownBugs = spec.split(/^## Known bugs/m)[1] ?? '';
for (const m of knownBugs.matchAll(/^\| ([A-Z]+-\d+(?:, [A-Z]+-\d+)*) \|/gm)) {
  for (const id of m[1].split(', ')) if (!rules.has(id)) problems.push(`Known bugs names ${id}, which isn't a rule`);
}

// A bug fix adds a scenario.
const prIndex = process.argv.indexOf('--pr');
if (prIndex !== -1) {
  const base = process.argv[prIndex + 1];
  const branch = process.env.PR_BRANCH ?? '';
  const title = process.env.PR_TITLE ?? '';
  const labels = (process.env.PR_LABELS ?? '').split(',').map((l) => l.trim());
  const isFix = /^(fix|hotfix)\//.test(branch) || /^claude\/issue-/.test(branch) || /^fix\b/i.test(title);
  if (isFix && !labels.includes('no-scenario')) {
    const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const touchesApp = changed.some((f) => f.startsWith('src/'));
    const addsTest = changed.some((f) => /^tests\/scenarios\/(scenarios|properties)\/.*\.(scenario|property)\.tsx?$/.test(f));
    if (touchesApp && !addsTest) {
      problems.push(
        'This is a bug fix (by its branch or title) but adds no scenario. Add one under tests/scenarios/scenarios/ that fails without the fix and names the rule it keeps (BEHAVIOUR.md). If no scenario can reach it, add the `no-scenario` label and say why in the PR.',
      );
    }
  }
}

if (problems.length > 0) {
  console.error(`BEHAVIOUR.md and the tests disagree:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`BEHAVIOUR.md: ${rules.size} rules, each with a test (${[...tested.values()].reduce((a, b) => a + b, 0)} references).`);
