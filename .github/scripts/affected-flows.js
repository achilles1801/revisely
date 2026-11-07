#!/usr/bin/env node
// Which E2E flows and suites a change to shared test code touches (ci.yml `plan`, "test the tests",
// TESTING.md). A PR that changes what flows share must run every flow that uses it, on both
// platforms, twice, before it merges: #286 changed swipe-page.yaml, passed 06 once in the smoke set,
// and broke 06 on develop.
//
//   git diff --name-only … | node .github/scripts/affected-flows.js
//   → {"flows":"all"} | {"flows":[".maestro/flows/06-offline.yaml", …]} | {"flows":[]}, plus "scenarios": true|false
//
// - run.sh, .maestro/config.yaml, e2e.yml, ci.yml: every flow.
// - a subflow or a script under .maestro: every flow that uses it, through other subflows too
//   (runFlow / runScript / file: references, followed from each flow).
// - a flow itself: that flow.
// - the scenario harness, its Jest config or scripts/emulators.sh: the scenario suite (run twice).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FLOWS = '.maestro/flows';
const EVERY_FLOW = ['.maestro/run.sh', '.maestro/config.yaml', '.github/workflows/e2e.yml', '.github/workflows/ci.yml'];
const SCENARIO_CODE = [/^tests\/scenarios\/harness\//, /^tests\/scenarios\/jest\.config\.js$/, /^scripts\/emulators\.sh$/];
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

function affected(changed, root = ROOT) {
  const files = changed.map((f) => f.trim()).filter(Boolean);
  const scenarios = files.some((f) => SCENARIO_CODE.some((re) => re.test(f)));
  if (files.some((f) => EVERY_FLOW.includes(f))) return { flows: 'all', scenarios };
  const flows = fs
    .readdirSync(path.join(root, FLOWS))
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => `${FLOWS}/${f}`);
  const shared = files.filter((f) => f.startsWith('.maestro/'));
  const hit = flows.filter((flow) => {
    const uses = closure(flow, root);
    return shared.some((f) => uses.has(f));
  });
  return { flows: hit, scenarios };
}

if (require.main === module) {
  const input = fs.readFileSync(0, 'utf8').split('\n');
  console.log(JSON.stringify(affected(input)));
}

module.exports = { affected, closure };
