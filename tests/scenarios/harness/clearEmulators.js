#!/usr/bin/env node
// Empties the Firestore, Auth and Storage emulators: what a run of the suite starts from. CI runs the
// suite twice on one set of emulators when a PR changes the harness (scenarios.yml, TESTING.md), and
// the second run found the first's data: the day's Revo spend (coachLedgerDay) put Revo to rest
// halfway through REVO-26 (#328's run 42586241564). So every run after the first starts here.
//
// Storage too, so the second run starts as the first does (Nov 26 2026).
//
// What emptying can't reset: the Firestore emulator's listCollections goes through every document it has
// held, deleted ones too (0.7 ms a call on a new emulator, 14 ms after one run of shard 1, still 14 ms after
// this script, 34 ms after the second run). The tester backup called it once per document, about 1,400 times
// a test scenario load, so a load took 30–128 s late in a run and REVO-26 hung past the app's 70 s for a
// callable (runs 45782607100, 45770868685). The backup reads an account with one query now
// (functions/src/testerResetAdmin.ts, documentsUnder).
//   node tests/scenarios/harness/clearEmulators.js   (inside emulators.sh exec, which sets the hosts)
const PROJECT = 'demo-revisely';

async function clear(name, host, path, method = 'DELETE') {
  if (!host) throw new Error(`${name}: no emulator host in the environment (run inside scripts/emulators.sh exec)`);
  const res = await fetch(`http://${host}${path}`, { method });
  if (!res.ok) throw new Error(`${name}: the emulator answered ${res.status} ${await res.text()}`);
  console.log(`${name} emulator emptied`);
}

(async () => {
  await clear('Firestore', process.env.FIRESTORE_EMULATOR_HOST, `/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  await clear('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST, `/emulator/v1/projects/${PROJECT}/accounts`);
  // Every file and upload; the rules stay loaded.
  await clear('Storage', process.env.FIREBASE_STORAGE_EMULATOR_HOST, '/internal/reset', 'POST');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
