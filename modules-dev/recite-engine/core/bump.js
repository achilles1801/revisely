#!/usr/bin/env node
// Moves the app to a released version of the engine (on-device-plan.md §14):
//
//   node modules-dev/recite-engine/core/bump.js 0.2.0
//
// Reads the release recite-core-v<version> of the private repository with the laptop's `gh` sign-in, and writes
// recite-core.lock (version, asset, sha256, ABI) and include/recite_core.h from it. If the lock's "repo" is a
// releases-only repository, the zip is copied there first, so the builds' token never needs the source repository.
// A new lock is a native change for Revisely Dev (its fingerprint counts this folder), once.
'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCE = 'achilles1801/revisely-internal';
const LOCK = path.join(__dirname, 'recite-core.lock');
const HEADER = path.join(__dirname, 'include', 'recite_core.h');

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
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    const x = path.join(tmp, 'x');
    if (spawnSync('unzip', ['-q', zip, '-d', x]).status !== 0) throw new Error('the zip would not unpack');
    const info = JSON.parse(fs.readFileSync(path.join(x, 'VERSION'), 'utf8'));
    if (info.version !== version) throw new Error(`the zip says it is ${info.version}`);

    if (lock.repo !== SOURCE && !gh(['release', 'view', tag, '--repo', lock.repo], true).ok) {
      const made = gh(['release', 'create', tag, zip, '--repo', lock.repo, '--title', `recite-core ${version}`,
        '--notes', `Compiled libraries for the app's builds. sha256 of ${asset}: ${sha256}`]);
      if (!made.ok) throw new Error(`can't create the release on ${lock.repo}`);
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
