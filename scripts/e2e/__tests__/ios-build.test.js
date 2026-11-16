// e2e.yml builds the iOS app once a run (job ios-build) before the iOS jobs, which restore it: a release
// PR's first run had no kept build, each iOS job built its own (26 minutes of its 90), and two ran out
// (#496's run 42727081470). The jobs only find the build if both look under the same key. With one iOS
// job there is no ios-build: it was a second wait in the macOS queue, and the one job builds the app itself.

const { execFileSync } = require('child_process');

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

it('has no ios-build for one iOS job, which runs without it and builds the app itself', () => {
  expect(job('ios-build')).toMatch(/if: .*needs\.changes\.outputs\.ios_one != 'true'/);
  expect(job('ios')).toMatch(/!cancelled\(\)/);
  expect(job('ios')).toMatch(/needs\.ios-build\.result == 'skipped' && needs\.changes\.outputs\.ios_one == 'true'/);
  // The one job's own build steps, when the build isn't kept.
  expect(job('ios')).toMatch(/- name: Build the E2E app \(native\)\n\s+if: steps\.cache\.outputs\.cache-hit != 'true'/);
  // The E2E check doesn't wait for an ios-build that wasn't planned.
  expect(job('e2e')).toMatch(/\[ "\$IOS_ONE" = true \] && build_planned=false/);
});

it('says one iOS job when the shards hold one', () => {
  const step = job('changes').match(/ios_one=false; if \[ "\$\(jq length <<<"\$ios"\)" = 1 \]; then ios_one=true; fi/);
  expect(step).toBeTruthy();
  const one = (ios) => execFileSync('bash', ['-c', `ios='${ios}'; ${step[0]}; echo $ios_one`], { encoding: 'utf8' }).trim();
  expect(one('[{"name":"changed: 18","flows":"x"}]')).toBe('true');
  expect(one('[{"name":"a","flows":"x"},{"name":"b","flows":"y"}]')).toBe('false');
  expect(one('[]')).toBe('false');
});

it('keeps the build under the key the iOS jobs restore', () => {
  const built = job('ios-build').match(KEY);
  const restored = job('ios').match(KEY);
  expect(built && restored).toBeTruthy();
  expect(built[1]).toBe(restored[1]);
});
