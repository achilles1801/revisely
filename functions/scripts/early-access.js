#!/usr/bin/env node
/**
 * Premium early access for accounts set up before the switch (src/support/early.ts, BEHAVIOUR.md PREM-1): every
 * account with a user document gets the grant `early` (Premium with no end date) unless it has it already. Grants
 * already given are never changed. New accounts get it from the function earlyAccessOnSignUp while
 * config/app.earlyAccess is on (scripts/set-app-config.js --early-access on).
 *
 * Run from functions/, after `npm run build` (it uses lib/):
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/early-access.js          # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/early-access.js --yes    # grant
 * Production (revision-buddy-3a398) also needs --production, and runs only on Majd's word.
 *
 * --testers: only accounts with previewTester (the release's rehearsal: Premium for testers before everyone). The grant
 * is the same `early` grant, for life, so a tester given it in the rehearsal keeps it.
 *
 * Prints counts only: no emails or account ids.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PRODUCTION = 'revision-buddy-3a398';
const LIB = path.join(__dirname, '..', 'lib', 'support');

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
for (const a of args) if (!['--yes', '--production', '--testers'].includes(a)) fail(`unknown option ${a}`);
const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!creds || !fs.existsSync(creds)) fail('Set GOOGLE_APPLICATION_CREDENTIALS to the project\'s service account JSON.');
if (!fs.existsSync(path.join(LIB, 'early.js'))) fail('Run `npm run build` first (lib/support/early.js is missing).');
const project = JSON.parse(fs.readFileSync(creds, 'utf8')).project_id;
const write = args.has('--yes');
if (write && project === PRODUCTION && !args.has('--production')) {
  fail(`${PRODUCTION} is production: add --production as well (only on Majd's word).`);
}

const { grantEarlyAccess, earlyAccessOn } = require(path.join(LIB, 'early.js'));
const { entitlementsFrom } = require(path.join(LIB, 'admin.js'));

admin.initializeApp();
const db = admin.firestore();

async function main() {
  const switchOn = earlyAccessOn((await db.doc('config/app').get()).data());
  // Accounts set up in the app: user documents that exist (ids only); with --testers, previewTester accounts only.
  const testersOnly = args.has('--testers');
  const query = testersOnly ? db.collection('users').where('previewTester', '==', true) : db.collection('users');
  const users = (await query.select().get()).docs.map((d) => d.id);
  const missing = [];
  for (let i = 0; i < users.length; i += 300) {
    const refs = users.slice(i, i + 300).map((uid) => db.doc(`entitlements/${uid}`));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, j) => {
      if (!entitlementsFrom(s.data())?.grants?.early) missing.push(users[i + j]);
    });
  }
  console.log(`Project ${project}. config/app.earlyAccess is ${switchOn ? 'on' : 'off'} (new accounts ${switchOn ? 'get' : "don't get"} it).`);
  console.log(
    `${users.length} ${testersOnly ? 'tester accounts' : 'accounts'}; ${users.length - missing.length} already have early access; ${missing.length} to grant.`,
  );
  if (!write) {
    console.log('Dry run: nothing written. Add --yes to grant.');
    return;
  }
  let granted = 0;
  let failed = 0;
  const now = Date.now();
  // A few at a time: each is one small transaction.
  for (let i = 0; i < missing.length; i += 10) {
    const results = await Promise.allSettled(missing.slice(i, i + 10).map((uid) => grantEarlyAccess(db, uid, now)));
    for (const r of results) {
      if (r.status === 'fulfilled') granted += r.value ? 1 : 0;
      else failed++;
    }
  }
  console.log(`Granted ${granted}${failed ? `; ${failed} failed (run it again: it skips what's done)` : ''}.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => fail(err.message ?? String(err)));
