/**
 * @jest-environment node
 */
// core/fetch.js against a stand-in for GitHub's API and the storage host it redirects to: the private engine reaches a
// build only with the token and only if it matches the lock; without the token the build gets the stub; and the token
// goes to the API alone and never into a log.
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CORE = path.join(__dirname, '..');
const FETCH = path.join(CORE, 'fetch.js');
const TOKEN = 'github_pat_TESTTOKEN0123456789';
const HEADER = fs.readFileSync(path.join(CORE, 'include', 'recite_core.h'));

let dir;
let api;
let storage;
let seen; // every request: { host: 'api' | 'storage', url, auth }
let zipBytes;
let answer; // what the API does to the release lookup: 200 by default

function makeZip({ version = '0.1.0', abi = 1, header = HEADER } = {}) {
  const pkg = path.join(dir, `pkg-${crypto.randomBytes(3).toString('hex')}`);
  const put = (p, body) => {
    fs.mkdirSync(path.dirname(path.join(pkg, p)), { recursive: true });
    fs.writeFileSync(path.join(pkg, p), body);
  };
  put('VERSION', JSON.stringify({ version, commit: 'abc', target: 'recite_core_replay', abi }));
  put('include/recite_core.h', header);
  put('ios/ReciteCore.xcframework/Info.plist', 'plist');
  put('ios/ReciteCore.xcframework/ios-arm64/librecite_core.a', 'ios-lib');
  for (const a of ['arm64-v8a', 'armeabi-v7a', 'x86_64']) put(`android/${a}/librecite_core.a`, `lib-${a}`);
  const zip = `${pkg}.zip`;
  const r = spawnSync('zip', ['-q', '-r', zip, '.'], { cwd: pkg });
  if (r.status !== 0) throw new Error('zip failed');
  return fs.readFileSync(zip);
}

function writeLock(over = {}) {
  const lock = {
    repo: 'owner/private',
    version: '0.1.0',
    tag: 'recite-core-v0.1.0',
    asset: 'recite-core-0.1.0.zip',
    sha256: crypto.createHash('sha256').update(zipBytes).digest('hex'),
    abi: 1,
    ...over,
  };
  const file = path.join(dir, 'recite-core.lock');
  fs.writeFileSync(file, JSON.stringify(lock));
  return file;
}

const listen = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
const portOf = (server) => server.address().port;

function run(platform, out, env = {}) {
  return new Promise((resolve) => {
    const clean = { PATH: process.env.PATH, HOME: dir, CI: '1', RECITE_CORE_API: `http://127.0.0.1:${portOf(api)}`, RECITE_CORE_LOCK: path.join(dir, 'recite-core.lock'), ...env };
    const child = spawn(process.execPath, [FETCH, platform, out], { env: clean });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null }));
  });
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-fetch-'));
  seen = [];
  answer = 200;
  zipBytes = makeZip();
  storage = await listen((req, res) => {
    seen.push({ host: 'storage', url: req.url, auth: req.headers.authorization });
    res.end(zipBytes);
  });
  api = await listen((req, res) => {
    seen.push({ host: 'api', url: req.url, auth: req.headers.authorization });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.statusCode = 401;
      return res.end('{}');
    }
    if (req.url.includes('/releases/tags/')) {
      res.setHeader('GitHub-Authentication-Token-Expiration', '2027-11-23 07:10:00 UTC');
      res.statusCode = answer;
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({
          // The address in the response points elsewhere on purpose: fetch.js builds its own, so the token can't follow it.
          assets: [{ id: 7, name: 'recite-core-0.1.0.zip', url: `http://127.0.0.1:${portOf(storage)}/not-the-api` }],
        }),
      );
    }
    res.statusCode = 302;
    res.setHeader('Location', `http://127.0.0.1:${portOf(storage)}/signed?x=1`);
    res.end();
  });
  writeLock();
});

afterEach(async () => {
  await new Promise((r) => api.close(r));
  await new Promise((r) => storage.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('core/fetch.js', () => {
  it('without the token, the stub: nothing is requested and no engine is there', async () => {
    const out = path.join(dir, 'out');
    const r = await run('ios', out);
    expect(r.code).toBe(0);
    expect(r.json).toEqual({ mode: 'stub', why: 'no RECITE_CORE_TOKEN' });
    expect(seen).toEqual([]);
    expect(fs.existsSync(path.join(out, 'stub', 'recite_core_stub.c'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'include', 'recite_core.h'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'glue', 'recite_core_info.c'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'ReciteCore.xcframework'))).toBe(false);
  });

  it('with no version in the lock, the stub even with a token', async () => {
    writeLock({ version: null, tag: null, asset: null, sha256: null });
    const r = await run('android', path.join(dir, 'out'), { RECITE_CORE_TOKEN: TOKEN });
    expect(r.code).toBe(0);
    expect(r.json.mode).toBe('stub');
    expect(seen).toEqual([]);
  });

  it('with the token, iOS gets the xcframework, and the token goes to the API alone', async () => {
    const out = path.join(dir, 'out');
    const r = await run('ios', out, { RECITE_CORE_TOKEN: TOKEN });
    expect(r.stderr).toContain('fetched');
    expect(r.stderr).toContain('the token expires 2027-11-23 07:10:00 UTC');
    expect(r.code).toBe(0);
    expect(r.json).toEqual({ mode: 'engine', version: '0.1.0' });
    expect(fs.readFileSync(path.join(out, 'ReciteCore.xcframework', 'ios-arm64', 'librecite_core.a'), 'utf8')).toBe('ios-lib');
    expect(fs.readFileSync(path.join(out, 'include', 'recite_core.h')).equals(HEADER)).toBe(true);
    expect(seen.map((s) => s.host)).toEqual(['api', 'api', 'storage']);
    expect(seen[0].url).toBe('/repos/owner/private/releases/tags/recite-core-v0.1.0');
    expect(seen[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(seen[1].url).toBe('/repos/owner/private/releases/assets/7');
    expect(seen[1].auth).toBe(`Bearer ${TOKEN}`);
    expect(seen[2].url).toContain('/signed');
    expect(seen[2].auth).toBeUndefined();
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
  });

  it('with the token, Android gets a library per ABI', async () => {
    const out = path.join(dir, 'out');
    const r = await run('android', out, { RECITE_CORE_TOKEN: TOKEN });
    expect(r.json.mode).toBe('engine');
    for (const a of ['arm64-v8a', 'armeabi-v7a', 'x86_64']) {
      expect(fs.readFileSync(path.join(out, 'lib', a, 'librecite_core.a'), 'utf8')).toBe(`lib-${a}`);
    }
    // An ABI the release doesn't carry links the stub.
    expect(fs.existsSync(path.join(out, 'stub', 'recite_core_stub.c'))).toBe(true);
  });

  it('a second run with the same lock downloads nothing', async () => {
    const out = path.join(dir, 'out');
    await run('ios', out, { RECITE_CORE_TOKEN: TOKEN });
    seen.length = 0;
    const r = await run('ios', out, { RECITE_CORE_TOKEN: TOKEN });
    expect(r.json.mode).toBe('engine');
    expect(seen).toEqual([]);
  });

  it('a build that loses the token drops the engine it had and goes back to the stub', async () => {
    const out = path.join(dir, 'out');
    await run('ios', out, { RECITE_CORE_TOKEN: TOKEN });
    const r = await run('ios', out);
    expect(r.json.mode).toBe('stub');
    expect(fs.existsSync(path.join(out, 'ReciteCore.xcframework'))).toBe(false);
  });

  it('a zip that does not match the lock fails the build, and leaves no engine', async () => {
    writeLock({ sha256: 'f'.repeat(64) });
    const out = path.join(dir, 'out');
    const r = await run('ios', out, { RECITE_CORE_TOKEN: TOKEN });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("sha256");
    expect(r.stdout).toBe('');
    expect(fs.existsSync(path.join(out, 'ReciteCore.xcframework'))).toBe(false);
  });

  it('a release whose header differs from the committed one fails the build', async () => {
    zipBytes = makeZip({ header: Buffer.from('/* another ABI */') });
    writeLock();
    const r = await run('android', path.join(dir, 'out'), { RECITE_CORE_TOKEN: TOKEN });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('recite_core.h');
  });

  it("a release of another version or ABI than the lock's fails the build", async () => {
    zipBytes = makeZip({ version: '0.2.0' });
    writeLock();
    expect((await run('ios', path.join(dir, 'a'), { RECITE_CORE_TOKEN: TOKEN })).code).toBe(1);
    zipBytes = makeZip({ abi: 2 });
    writeLock();
    expect((await run('ios', path.join(dir, 'b'), { RECITE_CORE_TOKEN: TOKEN })).code).toBe(1);
  });

  it('a token that is refused fails the build rather than quietly shipping the stub, and is never printed', async () => {
    const out = path.join(dir, 'out');
    const wrong = 'github_pat_WRONGTOKEN987654321';
    const r = await run('ios', out, { RECITE_CORE_TOKEN: wrong });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('401');
    expect(r.stdout + r.stderr).not.toContain(wrong);
    expect(fs.existsSync(path.join(out, 'stub'))).toBe(false);
  });

  it('a missing release fails the build', async () => {
    answer = 404;
    const r = await run('ios', path.join(dir, 'out'), { RECITE_CORE_TOKEN: TOKEN });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('404');
  });

  it("a runner's build step holds no token: it copies what the fetch step brought", async () => {
    const pre = path.join(dir, 'prefetched');
    const fetched = await run('android', pre, { RECITE_CORE_TOKEN: TOKEN });
    expect(fetched.json.mode).toBe('engine');
    seen.length = 0;
    const out = path.join(dir, 'in-the-build');
    const r = await run('android', out, { RECITE_CORE_PREFETCHED: pre });
    expect(r.code).toBe(0);
    expect(r.json).toEqual({ mode: 'engine', version: '0.1.0' });
    expect(seen).toEqual([]);
    expect(fs.readFileSync(path.join(out, 'lib', 'x86_64', 'librecite_core.a'), 'utf8')).toBe('lib-x86_64');
  });

  it('a build whose fetch step had no token, or fetched another version or platform, gets the stub', async () => {
    const none = path.join(dir, 'none');
    await run('ios', none); // the fetch step, with an empty secret
    let r = await run('ios', path.join(dir, 'a'), { RECITE_CORE_PREFETCHED: none });
    expect(r.json).toEqual({ mode: 'stub', why: 'this build fetched no engine' });

    const android = path.join(dir, 'android');
    await run('android', android, { RECITE_CORE_TOKEN: TOKEN });
    r = await run('ios', path.join(dir, 'b'), { RECITE_CORE_PREFETCHED: android });
    expect(r.json.mode).toBe('stub');

    const old = path.join(dir, 'old');
    await run('ios', old, { RECITE_CORE_TOKEN: TOKEN });
    writeLock({ sha256: 'a'.repeat(64) });
    r = await run('ios', path.join(dir, 'c'), { RECITE_CORE_PREFETCHED: old });
    expect(r.json.mode).toBe('stub');
    expect(fs.existsSync(path.join(dir, 'c', 'ReciteCore.xcframework'))).toBe(false);
  });

  it('refuses a redirect to a plain-http storage host', async () => {
    const src = fs.readFileSync(FETCH, 'utf8');
    expect(src).toContain("url.protocol !== 'https:' && url.hostname !== '127.0.0.1'");
  });

  it('a lock that names no valid repository sends nothing', async () => {
    writeLock({ repo: 'https://evil.example/x/y' });
    const r = await run('ios', path.join(dir, 'out'), { RECITE_CORE_TOKEN: TOKEN });
    expect(r.code).toBe(1);
    expect(seen).toEqual([]);
  });

  it('never sends the token anywhere but GitHub or a local test server', () => {
    const src = fs.readFileSync(FETCH, 'utf8');
    expect(src).toContain("/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/");
    expect(src).toContain("'https://api.github.com'");
  });
});
