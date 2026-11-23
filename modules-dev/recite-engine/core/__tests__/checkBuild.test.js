/**
 * @jest-environment node
 */
// core/check-build.js: a build whose fetch step brought the engine must really carry it.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHECK = path.join(__dirname, '..', 'check-build.js');
const ENGINE = 'xx recite-core replay 0.1.0 xx';
const STUB = 'xx stub this build has no on-device engine xx';
let dir;

function archive(name, files) {
  const root = path.join(dir, `${name}-files`);
  for (const [p, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), body);
  }
  const out = path.join(dir, name);
  if (spawnSync('zip', ['-q', '-r', out, '.'], { cwd: root }).status !== 0) throw new Error('zip failed');
  return out;
}
const check = (platform, file) => spawnSync(process.execPath, [CHECK, platform, file], { encoding: 'utf8' });
const aab = (bodies) =>
  archive('app.aab', Object.fromEntries(Object.entries(bodies).map(([abi, b]) => [`base/lib/${abi}/libreciteengine.so`, b])));

beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-check-'))));
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('core/check-build.js', () => {
  it('passes an Android bundle with the engine in every ABI the release carries (x86 may be the stub)', () => {
    const r = check('android', aab({ 'arm64-v8a': ENGINE, 'armeabi-v7a': ENGINE, x86_64: ENGINE, x86: STUB }));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('the engine is in the build');
  });

  it('fails an Android bundle that linked the stub, or lost an ABI', () => {
    let r = check('android', aab({ 'arm64-v8a': STUB, 'armeabi-v7a': ENGINE, x86_64: ENGINE }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('arm64-v8a: linked the stub');
    fs.rmSync(path.join(dir, 'app.aab'));
    fs.rmSync(path.join(dir, 'app.aab-files'), { recursive: true });
    r = check('android', aab({ 'arm64-v8a': ENGINE, x86_64: ENGINE }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('armeabi-v7a: no libreciteengine.so');
  });

  it('passes an iOS archive with the engine in the executable or a framework', () => {
    expect(check('ios', archive('a.ipa', { 'Payload/Revisely Dev.app/Revisely Dev': ENGINE })).status).toBe(0);
    const inFramework = archive('b.ipa', {
      'Payload/App.app/App': 'nothing',
      'Payload/App.app/Frameworks/ReciteEngine.framework/ReciteEngine': ENGINE,
    });
    expect(check('ios', inFramework).status).toBe(0);
  });

  it('fails an iOS archive with the stub or no engine', () => {
    const stub = check('ios', archive('a.ipa', { 'Payload/App.app/App': STUB }));
    expect(stub.status).toBe(1);
    expect(stub.stderr).toContain('linked the stub');
    const none = check('ios', archive('b.ipa', { 'Payload/App.app/App': 'nothing' }));
    expect(none.status).toBe(1);
    expect(none.stderr).toContain('no engine');
  });
});
