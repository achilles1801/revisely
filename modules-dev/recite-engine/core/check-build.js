#!/usr/bin/env node
// After a build whose fetch step brought the engine: is it really in the finished app? (on-device-plan.md §14.7.) A build
// that fetched it but linked the stub would look fine and quietly send every take to the server.
//
//   node core/check-build.js android path/to/app.aab
//   node core/check-build.js ios path/to/app.ipa
//
// Android: the native library of each ABI the release carries. iOS: the app's executable and its frameworks. Each must
// hold the engine's version string ("recite-core …"), and none the stub's message.
'use strict';

const { spawnSync } = require('child_process');

const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
const ENGINE = Buffer.from('recite-core ');
const STUB = Buffer.from('this build has no on-device engine');
const MAX = 1 << 30;

function entries(file) {
  const r = spawnSync('unzip', ['-Z1', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`can't read ${file}`);
  return r.stdout.split('\n').filter(Boolean);
}

function read(file, entry) {
  // unzip treats [ ] * ? in a name as a pattern: escape them.
  const r = spawnSync('unzip', ['-p', file, entry.replace(/([[\]*?\\])/g, '\\$1')], { maxBuffer: MAX });
  if (r.status !== 0) throw new Error(`can't read ${entry}`);
  return r.stdout;
}

function checkAndroid(file) {
  const names = entries(file);
  const problems = [];
  for (const abi of ABIS) {
    const entry = names.find((n) => n === `base/lib/${abi}/libreciteengine.so` || n === `lib/${abi}/libreciteengine.so`);
    if (!entry) {
      problems.push(`${abi}: no libreciteengine.so`);
      continue;
    }
    const lib = read(file, entry);
    if (lib.includes(STUB)) problems.push(`${abi}: linked the stub`);
    else if (!lib.includes(ENGINE)) problems.push(`${abi}: no engine in it`);
  }
  return problems;
}

function checkIos(file) {
  const names = entries(file);
  const app = names.map((n) => /^Payload\/([^/]+)\.app\/$/.exec(n) || /^Payload\/([^/]+)\.app\//.exec(n)).find(Boolean);
  if (!app) return ['no app in the archive'];
  const root = `Payload/${app[1]}.app`;
  const binaries = [`${root}/${app[1]}`];
  for (const n of names) {
    const m = new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/Frameworks/([^/]+)\\.framework/([^/]+)$`).exec(n);
    if (m && m[1] === m[2]) binaries.push(n);
  }
  if (!names.includes(binaries[0])) return [`no executable at ${binaries[0]}`];
  let engine = false;
  for (const b of binaries) {
    const bytes = read(file, b);
    if (bytes.includes(STUB)) return [`${b}: linked the stub`];
    engine = engine || bytes.includes(ENGINE);
  }
  return engine ? [] : ['no engine in the executable or its frameworks'];
}

function main() {
  const [platform, file] = process.argv.slice(2);
  if (!['ios', 'android'].includes(platform) || !file) throw new Error('usage: check-build.js ios|android FILE');
  const problems = platform === 'ios' ? checkIos(file) : checkAndroid(file);
  if (problems.length) throw new Error(`the build fetched the engine but doesn't carry it: ${problems.join('; ')}`);
  console.log('recite-core: the engine is in the build');
}

try {
  main();
} catch (e) {
  console.error(`recite-core: ${e.message}`);
  process.exit(1);
}
