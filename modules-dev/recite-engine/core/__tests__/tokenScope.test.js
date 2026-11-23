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
    ['ios-build.yml', 'ios'],
    ['android-build.yml', 'android'],
  ])('%s gives it to one step: Dev only, running our script alone, before any install', (file, platform) => {
    const text = read(file);
    const uses = text.split('\n').filter((l) => l.includes('secrets.RECITE_CORE_TOKEN'));
    expect(uses).toEqual(['          RECITE_CORE_TOKEN: ${{ secrets.RECITE_CORE_TOKEN }}']);
    const at = text.indexOf(uses[0]);
    const step = text.slice(text.lastIndexOf('- name:', at), text.indexOf('\n\n', at));
    expect(step).toBe(
      [
        '- name: Fetch the on-device engine',
        '        id: engine',
        "        if: ${{ inputs.variant == 'dev' }}",
        '        env:',
        '          RECITE_CORE_TOKEN: ${{ secrets.RECITE_CORE_TOKEN }}',
        '        run: |',
        `          got=$(node modules-dev/recite-engine/core/fetch.js ${platform} "$RUNNER_TEMP/recite-core")`,
        '          echo "mode=$(node -p \'JSON.parse(process.argv[1]).mode\' "$got")" >> "$GITHUB_OUTPUT"',
      ].join('\n'),
    );
    // Before anything third-party is installed.
    expect(at).toBeLessThan(text.indexOf('run: npm ci'));
    // The build step gets the folder, not the token.
    const build = text.slice(text.lastIndexOf('- name: eas build --local', text.indexOf('run: eas build --local')), text.indexOf('run: eas build --local'));
    expect(build).toContain("RECITE_CORE_PREFETCHED: ${{ inputs.variant == 'dev' && format('{0}/recite-core', runner.temp) || '' }}");
    expect(build).not.toContain('RECITE_CORE_TOKEN');
    expect(text).toMatch(/RECITE_CORE_TOKEN:\n\s+required: false/);
  });

  it('a build with the engine is checked, and never attached to the public repository as an artifact', () => {
    for (const [file, platform, output] of [['ios-build.yml', 'ios', 'revisely.ipa'], ['android-build.yml', 'android', 'revisely.aab']]) {
      const text = read(file);
      expect(text).toContain(`run: node modules-dev/recite-engine/core/check-build.js ${platform} "$RUNNER_TEMP/${output}"`);
      // Every upload of the built app is off when the engine is in it.
      for (const m of text.matchAll(/- uses: actions\/upload-artifact@[^\n]+\n([\s\S]*?)(?=\n\s*\n|\n\s*- )/g)) {
        if (m[1].includes(output)) expect(m[1]).toContain("if: ${{ steps.engine.outputs.mode != 'engine' }}");
      }
    }
    expect(read('android-build.yml')).toContain("if: ${{ steps.engine.outputs.mode != 'engine' }}");
  });

  it("the fetch needs nothing installed: only Node's own modules", () => {
    const src = fs.readFileSync(path.join(ROOT, 'modules-dev/recite-engine/core/fetch.js'), 'utf8');
    const required = [...src.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort();
    expect(required).toEqual(['child_process', 'crypto', 'fs', 'os', 'path']);
    const check = fs.readFileSync(path.join(ROOT, 'modules-dev/recite-engine/core/check-build.js'), 'utf8');
    expect([...check.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1])).toEqual(['child_process']);
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
    // A repository of compiled zips alone: the token must not be able to read the engine's source.
    expect(lock.repo).toBe('achilles1801/revisely-engine-releases');
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
