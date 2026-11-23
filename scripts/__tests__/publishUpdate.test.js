// .github/scripts/publish-update.sh: Revisely Dev gets a commit at its merge and again after the tests, so an older
// commit can arrive after a newer one, and must never replace it. A real git history, and a stand-in `eas` that answers
// `update:list` from LATEST_<PLATFORM> and logs what it was asked to publish.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, '.github/scripts/publish-update.sh');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const FAKE_EAS = `#!/bin/sh
if [ "$1" = update:list ]; then
  platform=""; prev=""
  for a in "$@"; do [ "$prev" = --platform ] && platform=$a; prev=$a; done
  case "$platform" in ios) m=$LATEST_IOS ;; *) m=$LATEST_ANDROID ;; esac
  [ "$m" = FAIL ] && exit 1
  jq -n --arg m "$m" 'if $m == "" then {currentPage: []} else {currentPage: [{message: $m}]} end'
  exit 0
fi
printf '%s\\n' "$*" >> "$EAS_LOG"
`;

describe('publish-update.sh', () => {
  let dir;
  let bin;
  let log;
  let older;
  let newer;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-update-'));
    bin = path.join(dir, 'bin');
    log = path.join(dir, 'eas.log');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'eas'), FAKE_EAS, { mode: 0o755 });
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(path.join(repo, '.github/scripts'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, '.github/scripts/app-hash.sh'), path.join(repo, '.github/scripts/app-hash.sh'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    for (const n of ['older', 'newer']) {
      fs.writeFileSync(path.join(repo, 'file.txt'), n);
      git(repo, 'add', '-A');
      git(repo, 'commit', '-q', '-m', n);
    }
    newer = git(repo, 'rev-parse', 'HEAD');
    older = git(repo, 'rev-parse', 'HEAD~1');
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  function run(at, channel, env, mode) {
    const repo = path.join(dir, 'repo');
    git(repo, 'checkout', '-q', at);
    fs.rmSync(log, { force: true });
    const args = [SCRIPT, channel, channel === 'dev' ? 'development' : 'production', ...(mode ? [mode] : [])];
    const stdout = execFileSync('sh', args, {
      cwd: repo,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        EAS_LOG: log,
        MESSAGE: 'Merge pull request #1\nbody',
        PLATFORM: 'all',
        DEV_IOS_RUNTIME: 'ios-runtime',
        DEV_ANDROID_RUNTIME: 'android-runtime',
        LATEST_IOS: '',
        LATEST_ANDROID: '',
        ...env,
      },
    });
    return { stdout, published: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  }
  const stamp = (sha) => `Merge [commit ${sha}] [app abc]`;

  it('leaves dev alone when it already has a newer commit on both platforms', () => {
    const r = run(older, 'dev', { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(newer) });
    expect(r.published).toBe('');
    expect(r.stdout).toContain('Nothing to publish');
  });

  it('leaves dev alone when it already has this very commit', () => {
    expect(run(newer, 'dev', { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(newer) }).published).toBe('');
  });

  it('publishes a newer commit over an older one, stamped with its commit', () => {
    const { published } = run(newer, 'dev', { LATEST_IOS: stamp(older), LATEST_ANDROID: stamp(older) });
    expect(published).toContain('--channel dev');
    expect(published).toContain('--platform all');
    expect(published).toContain(`Merge pull request #1 [commit ${newer}] [app `);
  });

  it('publishes only the platform that lacks it', () => {
    const { published } = run(newer, 'dev', { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(older) });
    expect(published).toContain('--platform android');
  });

  it('publishes when it can’t tell: nothing there, an unstamped update, a failed list, an unknown commit, no runtime', () => {
    for (const env of [
      {},
      { LATEST_IOS: 'an old update [app abc]', LATEST_ANDROID: 'an old update [app abc]' },
      { LATEST_IOS: 'FAIL', LATEST_ANDROID: 'FAIL' },
      { LATEST_IOS: stamp('0'.repeat(40)), LATEST_ANDROID: stamp('0'.repeat(40)) },
      { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(newer), DEV_IOS_RUNTIME: '', DEV_ANDROID_RUNTIME: '' },
    ]) {
      expect(run(older, 'dev', env).published).toContain('--platform all');
    }
  });

  it('check says what is needed and publishes nothing', () => {
    const none = run(older, 'dev', { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(newer) }, 'check');
    expect(none.stdout).toContain('needed=false');
    expect(none.published).toBe('');
    const some = run(newer, 'dev', { LATEST_IOS: stamp(older), LATEST_ANDROID: stamp(newer) }, 'check');
    expect(some.stdout).toContain('needed=true');
    expect(some.published).toBe('');
  });

  it('a dry run publishes nothing', () => {
    const r = run(newer, 'dev', { DRY_RUN: 'true' });
    expect(r.published).toBe('');
    expect(r.stdout).toContain(`Dry run: would publish ${newer} to dev (all)`);
  });

  it('preview always publishes, its message ending in the app hash (what Promote looks for), with no commit stamp', () => {
    const { published } = run(older, 'preview', { LATEST_IOS: stamp(newer), LATEST_ANDROID: stamp(newer) });
    expect(published).toContain('--channel preview');
    expect(published).toContain('--environment production');
    expect(published).toMatch(/--message Merge pull request #1 \[app [0-9a-f]{40}\] --non-interactive/);
    expect(published).not.toContain('[commit');
  });
});
