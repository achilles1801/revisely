#!/usr/bin/env node
// Moves the app to a released version of the engine (on-device-plan.md §14):
//
//   node modules-dev/recite-engine/core/bump.js 0.2.0
//
// Reads the release recite-core-v<version> of the private source repository with the laptop's `gh` sign-in and checks the
// zip against the sha256 its CI published. It copies the zip to the releases repository named by the lock's "repo"
// (compiled zips and nothing else: the builds' token can read that repository and no other), checks the copy, and
// writes recite-core.lock (version, asset, sha256, ABI) and include/recite_core.h.
// A new lock is a native change for Revisely Dev (its fingerprint counts this folder), once.
'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCE = 'achilles1801/revisely-internal';
const LOCK = process.env.RECITE_CORE_LOCK || path.join(__dirname, 'recite-core.lock');
const HEADER = process.env.RECITE_CORE_HEADER || path.join(__dirname, 'include', 'recite_core.h');

function gh(args, quiet = false) {
  const r = spawnSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
  return { ok: r.status === 0, out: r.stdout || '' };
}

function main() {
  const version = process.argv[2];
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('usage: bump.js <x.y.z>');
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const tag = `recite-core-v${version}`;
  const asset = `recite-core-${version}.zip`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-core-bump-'));
  try {
    if (!gh(['release', 'download', tag, '--repo', SOURCE, '--pattern', asset, '--dir', tmp]).ok) {
      throw new Error(`can't download ${asset} from ${SOURCE}'s release ${tag}`);
    }
    const zip = path.join(tmp, asset);
    const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const sha256 = hash(zip);
    // The hash the private CI wrote when it built the zip.
    const notes = gh(['release', 'view', tag, '--repo', SOURCE, '--json', 'body', '-q', '.body']);
    const published = (/sha256 of \S+: ([0-9a-f]{64})/.exec(notes.out) || [])[1];
    if (!published) throw new Error(`${SOURCE}'s release ${tag} publishes no sha256`);
    if (published !== sha256) throw new Error(`${asset} is ${sha256}, but its CI published ${published}`);

    const x = path.join(tmp, 'x');
    if (spawnSync('unzip', ['-q', zip, '-d', x]).status !== 0) throw new Error('the zip would not unpack');
    const info = JSON.parse(fs.readFileSync(path.join(x, 'VERSION'), 'utf8'));
    if (info.version !== version) throw new Error(`the zip says it is ${info.version}`);

    if (lock.repo !== SOURCE) {
      if (!gh(['release', 'view', tag, '--repo', lock.repo], true).ok) {
        const made = gh(['release', 'create', tag, zip, '--repo', lock.repo, '--title', `recite-core ${version}`,
          '--notes', `Compiled libraries for the app's builds. sha256 of ${asset}: ${sha256}`]);
        if (!made.ok) throw new Error(`can't create the release on ${lock.repo}`);
      }
      // Whether just made or already there, what the builds will download must be this zip.
      const check = path.join(tmp, 'copy');
      fs.mkdirSync(check);
      if (!gh(['release', 'download', tag, '--repo', lock.repo, '--pattern', asset, '--dir', check]).ok) {
        throw new Error(`can't read ${asset} back from ${lock.repo}`);
      }
      const copied = hash(path.join(check, asset));
      if (copied !== sha256) throw new Error(`${lock.repo} holds a different ${asset} (${copied})`);
    }

    fs.copyFileSync(path.join(x, 'include', 'recite_core.h'), HEADER);
    const next = { repo: lock.repo, version, tag, asset, sha256, abi: info.abi };
    fs.writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`recite-core.lock: ${version} (${info.target}, ABI ${info.abi}, commit ${String(info.commit).slice(0, 8)}), sha256 ${sha256}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (e) {
  console.error(`bump.js: ${e.message}`);
  process.exit(1);
}
