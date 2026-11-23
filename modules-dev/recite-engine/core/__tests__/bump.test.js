/**
 * @jest-environment node
 */
// core/bump.js with a stand-in for `gh`: a zip reaches the releases repository, and the lock, only if it is the one the
// private CI built.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BUMP = path.join(__dirname, '..', 'bump.js');
let dir;
let zip;
let sha;

// The fake gh: `release download` copies from $FAKE/<repo>/, `view` reads its notes, `create` stores the zip there.
const FAKE_GH = `#!/bin/sh
cmd="$1 $2"; tag="$3"; shift 3
repo=""; dest=""; file=""; json=""
while [ $# -gt 0 ]; do case "$1" in
  --repo) repo="$2"; shift 2;; --dir) dest="$2"; shift 2;; --pattern) shift 2;; --json) json=1; shift 2;; -q) shift 2;;
  --title|--notes) shift 2;; *) file="$1"; shift;; esac; done
d="$FAKE/$(echo "$repo" | tr / _)"
echo "$cmd $repo" >> "$FAKE/calls"
case "$cmd" in
  "release download") [ -f "$d/asset.zip" ] || exit 1; cp "$d/asset.zip" "$dest/recite-core-0.2.0.zip";;
  "release view") [ -f "$d/asset.zip" ] || exit 1; [ -n "$json" ] && cat "$d/notes"; exit 0;;
  "release create") mkdir -p "$d"; cp "$file" "$d/asset.zip";;
esac
`;

function bump(version = '0.2.0') {
  return spawnSync(process.execPath, [BUMP, version], {
    encoding: 'utf8',
    env: {
      PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`,
      FAKE: path.join(dir, 'fake'),
      RECITE_CORE_LOCK: path.join(dir, 'lock'),
      RECITE_CORE_HEADER: path.join(dir, 'header.h'),
    },
  });
}
const source = path.join('fake', 'achilles1801_revisely-internal');
const target = path.join('fake', 'achilles1801_revisely-engine-releases');
const lock = () => JSON.parse(fs.readFileSync(path.join(dir, 'lock'), 'utf8'));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-bump-'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'gh'), FAKE_GH, { mode: 0o755 });
  fs.mkdirSync(path.join(dir, source), { recursive: true });
  const pkg = path.join(dir, 'pkg');
  fs.mkdirSync(path.join(pkg, 'include'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'VERSION'), JSON.stringify({ version: '0.2.0', commit: 'abcdef123', target: 'recite_core', abi: 3 }));
  fs.writeFileSync(path.join(pkg, 'include', 'recite_core.h'), '/* new header */');
  spawnSync('zip', ['-q', '-r', path.join(dir, source, 'asset.zip'), '.'], { cwd: pkg });
  zip = fs.readFileSync(path.join(dir, source, 'asset.zip'));
  sha = crypto.createHash('sha256').update(zip).digest('hex');
  fs.writeFileSync(path.join(dir, source, 'notes'), `Compiled libraries. sha256 of recite-core-0.2.0.zip: ${sha}`);
  fs.writeFileSync(path.join(dir, 'header.h'), '/* old header */');
  fs.writeFileSync(path.join(dir, 'lock'), JSON.stringify({ repo: 'achilles1801/revisely-engine-releases', version: '0.1.0', tag: 'recite-core-v0.1.0', asset: 'recite-core-0.1.0.zip', sha256: 'b'.repeat(64), abi: 1 }));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('core/bump.js', () => {
  it("copies the zip CI built to the releases repository and writes that hash in the lock", () => {
    const r = bump();
    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(dir, target, 'asset.zip')).equals(zip)).toBe(true);
    expect(lock()).toEqual({
      repo: 'achilles1801/revisely-engine-releases',
      version: '0.2.0',
      tag: 'recite-core-v0.2.0',
      asset: 'recite-core-0.2.0.zip',
      sha256: sha,
      abi: 3,
    });
    expect(fs.readFileSync(path.join(dir, 'header.h'), 'utf8')).toBe('/* new header */');
  });

  it('refuses a zip that is not the one its CI published, and copies nothing', () => {
    fs.writeFileSync(path.join(dir, source, 'notes'), `sha256 of recite-core-0.2.0.zip: ${'c'.repeat(64)}`);
    const r = bump();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('its CI published');
    expect(fs.existsSync(path.join(dir, target))).toBe(false);
    expect(lock().version).toBe('0.1.0');
  });

  it('refuses a release with no published hash', () => {
    fs.writeFileSync(path.join(dir, source, 'notes'), 'no hash here');
    const r = bump();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('publishes no sha256');
    expect(lock().version).toBe('0.1.0');
  });

  it('refuses when the releases repository already holds a different zip for that tag', () => {
    fs.mkdirSync(path.join(dir, target), { recursive: true });
    fs.writeFileSync(path.join(dir, target, 'asset.zip'), 'another zip');
    fs.writeFileSync(path.join(dir, target, 'notes'), 'x');
    const r = bump();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('holds a different');
    expect(lock().version).toBe('0.1.0');
  });

  it('run again on the same version changes nothing', () => {
    expect(bump().status).toBe(0);
    const first = fs.readFileSync(path.join(dir, 'lock'), 'utf8');
    expect(bump().status).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'lock'), 'utf8')).toBe(first);
  });
});
