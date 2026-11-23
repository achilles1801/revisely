#!/usr/bin/env node
// Brings recite-core's compiled library into a native build (on-device-plan.md §14; Majd, Nov 23 2026: "Keep the checker
// code in your private repo and pull it into the app at build time—do not commit it directly to a public repository").
// The podspec and build.gradle run it:
//
//   node core/fetch.js ios|android OUT
//
// With a token it downloads the version in recite-core.lock from the private releases repository (compiled zips and
// nothing else), checks the zip's sha256 and the header, and puts the platform's library in OUT. Without one, OUT gets
// the stub, which says "not available", and the app uses the server path: CI, E2E, forks and claude-fix never hold it.
// The token: RECITE_CORE_TOKEN, or on a laptop (not CI) the `gh` sign-in. A token that is there but fails, or a zip that
// doesn't match the lock, fails the build: a release must never quietly ship the stub.
//
// On the runners the token never sits beside the build's third-party install scripts. A step of its own, before
// `npm ci`, runs this with the token into a folder outside the project; `eas build` then runs with
// RECITE_CORE_PREFETCHED naming that folder and no token, and the podspec's and Gradle's run of this script copies it.
//
// The token goes to the GitHub API alone: the asset's address is built here rather than taken from a response, and the
// storage host it redirects to is called without it.
//
// stdout is one JSON line: {"mode":"engine","version":…} or {"mode":"stub","why":…}. The token is never printed.
'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CORE = __dirname;
const ABIS = ['arm64-v8a', 'armeabi-v7a', 'x86_64'];
const UA = 'revisely-build';

/** The API's address. Tests point it at a local server; nothing else can move it, since the token goes there. */
function apiBase() {
  const asked = process.env.RECITE_CORE_API;
  return asked && /^http:\/\/127\.0\.0\.1:\d+$/.test(asked) ? asked : 'https://api.github.com';
}

function readLock() {
  return JSON.parse(fs.readFileSync(process.env.RECITE_CORE_LOCK || path.join(CORE, 'recite-core.lock'), 'utf8'));
}

/** { token, from } or null. */
function findToken() {
  const env = (process.env.RECITE_CORE_TOKEN || '').trim();
  if (env) return { token: env, from: 'env' };
  if (process.env.CI) return null;
  const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const token = gh.status === 0 ? (gh.stdout || '').trim() : '';
  return token ? { token, from: 'gh' } : null;
}

class Refused extends Error {
  constructor(status, what) {
    super(`${what}: HTTP ${status}`);
    this.status = status;
  }
}

/** A request to the API: the only one that carries the token. It follows no redirect by itself. */
async function github(url, token, accept) {
  if (!url.startsWith(`${apiBase()}/`)) throw new Error('refusing to send the token anywhere but the GitHub API');
  return fetch(url, {
    redirect: 'manual',
    headers: { Authorization: `Bearer ${token}`, Accept: accept, 'User-Agent': UA, 'X-GitHub-Api-Version': '2022-11-28' },
  });
}

/** A redirect's target must be HTTPS (or the tests' local server), and is called without the token. */
function storageUrl(to, from) {
  const url = new URL(to, from);
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1') throw new Error('the asset redirected to an insecure address');
  return url.href;
}

/** The release asset's bytes. The token goes to the API only, never to the storage host it redirects to. */
async function download(lock, token) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(lock.repo || '')) throw new Error('the lock names no repository');
  const repo = `${apiBase()}/repos/${lock.repo}/releases`;
  const rel = await github(`${repo}/tags/${encodeURIComponent(lock.tag)}`, token, 'application/vnd.github+json');
  if (!rel.ok) throw new Refused(rel.status, `release ${lock.tag}`);
  // GitHub says when a fine-grained token expires: the date for RECITE_CORE_EXPIRES (the health report's reminder).
  const expires = rel.headers.get('github-authentication-token-expiration');
  if (expires && /^[\d\- :+A-Z]{10,40}$/.test(expires)) console.error(`recite-core: the token expires ${expires}`);
  const asset = ((await rel.json()).assets || []).find((a) => a.name === lock.asset);
  if (!asset || !Number.isInteger(asset.id)) throw new Error(`release ${lock.tag} has no asset ${lock.asset}`);
  const assetUrl = `${repo}/assets/${asset.id}`;
  let res = await github(assetUrl, token, 'application/octet-stream');
  if (res.status >= 300 && res.status < 400) {
    const to = res.headers.get('location');
    if (!to) throw new Error('the asset redirected nowhere');
    res = await fetch(storageUrl(to, assetUrl), { headers: { 'User-Agent': UA } });
  }
  if (!res.ok) throw new Refused(res.status, `asset ${lock.asset}`);
  return Buffer.from(await res.arrayBuffer());
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

/** What every build gets beside the library: the header and the small C file that reports which engine is linked. */
function placeCommon(out) {
  copyDir(path.join(CORE, 'include'), path.join(out, 'include'));
  copyDir(path.join(CORE, 'glue'), path.join(out, 'glue'));
}

function placeStub(out) {
  fs.rmSync(out, { recursive: true, force: true });
  placeCommon(out);
  copyDir(path.join(CORE, 'stub'), path.join(out, 'stub'));
}

/** Unzips and checks a release, then puts this platform's library in OUT (replacing what was there). */
function placeEngine(zip, lock, platform, out) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-core-'));
  try {
    const file = path.join(tmp, 'core.zip');
    fs.writeFileSync(file, zip);
    const un = spawnSync('unzip', ['-q', file, '-d', path.join(tmp, 'x')], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (un.status !== 0) throw new Error('the zip would not unpack');
    const x = path.join(tmp, 'x');
    const version = JSON.parse(fs.readFileSync(path.join(x, 'VERSION'), 'utf8'));
    if (version.version !== lock.version) throw new Error(`the zip is ${version.version}, the lock says ${lock.version}`);
    if (version.abi !== lock.abi) throw new Error(`the zip's ABI is ${version.abi}, the lock says ${lock.abi}`);
    const theirs = fs.readFileSync(path.join(x, 'include', 'recite_core.h'));
    if (!theirs.equals(fs.readFileSync(path.join(CORE, 'include', 'recite_core.h')))) {
      throw new Error("the release's recite_core.h differs from core/include/recite_core.h");
    }
    fs.rmSync(out, { recursive: true, force: true });
    placeCommon(out);
    if (platform === 'ios') {
      copyDir(path.join(x, 'ios', 'ReciteCore.xcframework'), path.join(out, 'ReciteCore.xcframework'));
    } else {
      for (const abi of ABIS) {
        fs.mkdirSync(path.join(out, 'lib', abi), { recursive: true });
        fs.copyFileSync(path.join(x, 'android', abi, 'librecite_core.a'), path.join(out, 'lib', abi, 'librecite_core.a'));
      }
    }
    // Stub files for what the release doesn't carry: an ABI with no library (x86 on old emulators) links the stub.
    copyDir(path.join(CORE, 'stub'), path.join(out, 'stub'));
    fs.writeFileSync(path.join(out, '.fetched.json'), JSON.stringify({ sha256: lock.sha256, platform }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function alreadyHere(lock, platform, out) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(out, '.fetched.json'), 'utf8'));
    const lib = platform === 'ios' ? path.join(out, 'ReciteCore.xcframework') : path.join(out, 'lib', ABIS[0], 'librecite_core.a');
    return m.sha256 === lock.sha256 && m.platform === platform && fs.existsSync(lib);
  } catch {
    return false;
  }
}

async function main() {
  const [platform, outArg] = process.argv.slice(2);
  if (!['ios', 'android'].includes(platform) || !outArg) throw new Error('usage: fetch.js ios|android OUT');
  const out = path.resolve(outArg);
  const lock = readLock();
  const stub = (why) => {
    placeStub(out);
    console.error(`recite-core: stub (${why})`);
    return { mode: 'stub', why };
  };
  if (!lock.version) return stub('no version in the lock yet');
  // A runner's build: an earlier step fetched it, and this step holds no token.
  const prefetched = process.env.RECITE_CORE_PREFETCHED;
  if (prefetched) {
    const from = path.resolve(prefetched);
    if (!alreadyHere(lock, platform, from)) return stub('this build fetched no engine');
    if (from !== out) {
      fs.rmSync(out, { recursive: true, force: true });
      copyDir(from, out);
    }
    placeCommon(out);
    console.error(`recite-core: ${lock.version} (from this build's fetch step)`);
    return { mode: 'engine', version: lock.version };
  }
  const found = findToken();
  if (!found) return stub('no RECITE_CORE_TOKEN');
  if (alreadyHere(lock, platform, out)) {
    placeCommon(out);
    console.error(`recite-core: ${lock.version} (already here)`);
    return { mode: 'engine', version: lock.version };
  }
  let zip;
  try {
    zip = await download(lock, found.token);
  } catch (e) {
    // A laptop whose gh account can't see the private repository builds the stub, as a fork would.
    if (found.from === 'gh' && e instanceof Refused && [401, 403, 404].includes(e.status)) {
      return stub('this gh account has no access to the engine');
    }
    throw e;
  }
  const got = sha256(zip);
  if (got !== lock.sha256) throw new Error(`${lock.asset}'s sha256 is ${got}, the lock says ${lock.sha256}`);
  placeEngine(zip, lock, platform, out);
  console.error(`recite-core: ${lock.version} (fetched, sha256 checked)`);
  return { mode: 'engine', version: lock.version };
}

main().then(
  (r) => console.log(JSON.stringify(r)),
  (e) => {
    const token = (process.env.RECITE_CORE_TOKEN || '').trim();
    const text = String((e && e.message) || e);
    console.error(`recite-core: ${token ? text.split(token).join('***') : text}`);
    process.exit(1);
  },
);
