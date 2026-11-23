/**
 * @jest-environment node
 */
// RECITE_CORE_TOKEN reads the private engine's release. Only Revisely Dev's native builds may hold it (on-device-plan.md
// §14): not E2E, not claude-fix, not the store app's build, nothing that runs on a pull request.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const read = (f) => fs.readFileSync(path.join(WORKFLOWS, f), 'utf8');
const files = fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

describe('RECITE_CORE_TOKEN', () => {
  it('is named only by the two native build workflows', () => {
    expect(files.filter((f) => read(f).includes('RECITE_CORE_TOKEN')).sort()).toEqual(['android-build.yml', 'ios-build.yml']);
  });

  it.each([
    ['ios-build.yml', '--platform ios'],
    ['android-build.yml', '--platform android'],
  ])('%s gives it to Revisely Dev\'s build step alone', (file, platform) => {
    const text = read(file);
    const uses = text.split('\n').filter((l) => l.includes('secrets.RECITE_CORE_TOKEN'));
    expect(uses).toEqual([
      "          RECITE_CORE_TOKEN: ${{ inputs.variant == 'dev' && secrets.RECITE_CORE_TOKEN || '' }}",
    ]);
    // In the env of the `eas build --local` step: the next command after it is the build.
    const after = text.slice(text.indexOf(uses[0]) + uses[0].length).split('\n').find((l) => l.trim());
    expect(after).toContain(`run: eas build --local --profile "$PROFILE" ${platform}`);
    // Never job-wide or workflow-wide, and optional, so a build without it makes the stub.
    expect(text).toMatch(/RECITE_CORE_TOKEN:\n\s+required: false/);
  });

  it('the workflows that call those builds run them only from pushes or by hand', () => {
    for (const f of files) {
      const text = read(f);
      if (!/uses: \.\/\.github\/workflows\/(ios|android)-build\.yml/.test(text)) continue;
      expect([f, /^\s*pull_request(_target)?:/m.test(text)]).toEqual([f, false]);
    }
  });

  it("claude-fix refuses a patch to the fetch or the files that run it, and E2E's builds hold no secrets", () => {
    const fix = read('claude-fix.yml');
    expect(fix).toContain("'^modules-dev/recite-engine/(core/|ios/ReciteEngine\\.podspec$|android/(build\\.gradle|CMakeLists\\.txt)$)'");
    expect(read('e2e.yml')).not.toMatch(/secrets\.[A-Z_]*(TOKEN|CORE)/);
  });

  it('the fetched files are out of git and out of the fingerprint; the lock is in both', () => {
    expect(fs.readFileSync(path.join(ROOT, 'modules-dev/recite-engine/ios/.gitignore'), 'utf8')).toContain('core-bin/');
    expect(fs.readFileSync(path.join(ROOT, 'modules-dev/recite-engine/android/.gitignore'), 'utf8')).toContain('build/');
    expect(fs.readFileSync(path.join(ROOT, 'fingerprint.config.js'), 'utf8')).toContain("'modules-dev/recite-engine/ios/core-bin/**/*'");
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'modules-dev/recite-engine/core/recite-core.lock'), 'utf8'));
    expect(lock.repo).toMatch(/^achilles1801\//);
    expect(Object.keys(lock).sort()).toEqual(['abi', 'asset', 'repo', 'sha256', 'tag', 'version']);
  });

  it('no engine source or library is committed beside the glue', () => {
    const core = path.join(ROOT, 'modules-dev/recite-engine/core');
    const all = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.relative(core, path.join(d, e.name)))));
    walk(core);
    expect(all.filter((f) => /\.(a|so|zip|xcframework|cc|cpp|hpp)$/.test(f))).toEqual([]);
    expect(all.filter((f) => f.endsWith('.c')).sort()).toEqual(['glue/recite_core_info.c', 'stub/recite_core_stub.c']);
  });
});
