// e2e.yml builds the iOS app once a run (job ios-build) before the iOS jobs, which restore it: a release
// PR's first run had no kept build, each iOS job built its own (26 minutes of its 90), and two ran out
// (#496's run 42727081470). The jobs only find the build if both look under the same key.

const fs = require('fs');
const path = require('path');

const workflow = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'e2e.yml'), 'utf8');

/** A top-level job's text, from `  <name>:` to the next job. */
function job(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  if (start < 0) throw new Error(`e2e.yml has no job ${name}`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const KEY = /key: (e2e-ios-\$\{\{ steps\.fp\.outputs\.hash \}\}-.+)$/m;

it('builds the native app once, before the iOS jobs, which wait for it', () => {
  expect(job('ios')).toMatch(/needs: \[changes, ios-build\]/);
  expect(job('ios')).toMatch(/needs\.ios-build\.result == 'success'/);
  expect(job('ios-build')).toMatch(/lookup-only: true/);
  expect(job('e2e')).toMatch(/needs: \[changes, ios-build, ios, android\]/);
});

it('keeps the build under the key the iOS jobs restore', () => {
  const built = job('ios-build').match(KEY);
  const restored = job('ios').match(KEY);
  expect(built && restored).toBeTruthy();
  expect(built[1]).toBe(restored[1]);
});
