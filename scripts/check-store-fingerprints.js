#!/usr/bin/env node
// The store app's fingerprints (iOS and Android, CLAUDE.md "Runtime version is a fingerprint") don't move by accident.
// A merge into develop that moves one makes Preview build a new store binary by itself and submit it to TestFlight and
// Play internal, and every later native change builds again. While a native release is being prepared (1.0.5's
// on-device Recite, Nov 23 2026), native work is linked into Revisely Dev only, and the store app's runtime moves once,
// in the release owner's PR.
//
// So CI's Fast checks compare the store fingerprints with scripts/store-fingerprints.json. A PR that means to move them
// updates that file in the same PR (`node scripts/check-store-fingerprints.js --write`), so the move is in the diff.
//
// The hashes here are computed with no environment (no .env, no EAS environment, no APP_VARIANT), so they are the same on
// a laptop and on the runner. They are not the runtime versions CI publishes to, which load the EAS production
// environment: those are in the release checklist. Only "did it move" matters here.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'store-fingerprints.json');
const PLATFORMS = ['ios', 'android'];

/** One platform's store fingerprint, with a clean environment: no .env (app.config.js's dotenv reads /dev/null, Expo's own loader is off), no APP_VARIANT. */
function storeFingerprint(platform) {
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, DOTENV_CONFIG_PATH: '/dev/null', EXPO_NO_DOTENV: '1' };
  const out = execFileSync('npx', ['expo-updates', 'fingerprint:generate', '--platform', platform], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = out.split('\n').find((l) => l.startsWith('{'));
  if (!line) throw new Error(`No fingerprint JSON for ${platform}`);
  return JSON.parse(line).hash;
}

/** The platforms whose fingerprint differs from the expected one. */
function moved(expected, actual) {
  return PLATFORMS.filter((p) => expected[p] !== actual[p]);
}

function main(args) {
  const actual = Object.fromEntries(PLATFORMS.map((p) => [p, storeFingerprint(p)]));
  if (args.includes('--write')) {
    const prev = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    fs.writeFileSync(FILE, JSON.stringify({ ...prev, ...actual }, null, 2) + '\n');
    console.log(`Wrote ${path.relative(ROOT, FILE)}: ios ${actual.ios}, android ${actual.android}`);
    return 0;
  }
  const expected = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const changed = moved(expected, actual);
  for (const p of PLATFORMS) console.log(`${p}: ${actual[p]}${changed.includes(p) ? ` (expected ${expected[p]})` : ''}`);
  if (changed.length === 0) {
    console.log("The store app's fingerprints didn't move.");
    return 0;
  }
  console.log(
    [
      '',
      `::error title=Store fingerprint moved::This change moves the store app's ${changed.join(' and ')} fingerprint.`,
      'Merged into develop, it makes Preview build a new store binary and submit it to TestFlight and Play internal.',
      'Native work for an unreleased feature goes into Revisely Dev only (CLAUDE.md "Runtime version is a fingerprint").',
      "If this PR is meant to move the store app's runtime (the release owner's native PR), run",
      '  node scripts/check-store-fingerprints.js --write',
      'and commit scripts/store-fingerprints.json with it.',
    ].join('\n'),
  );
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { moved, PLATFORMS };
