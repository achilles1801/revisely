#!/usr/bin/env node
// Empties the Firestore, Auth and Storage emulators: what a run of the suite starts from. CI runs the
// suite twice on one set of emulators when a PR changes the harness (scenarios.yml, TESTING.md), and
// the second run found the first's data: the day's Revo spend (coachLedgerDay) put Revo to rest
// halfway through REVO-26 (#328's run 42586241564). So every run after the first starts here.
//
// Storage too (Nov 26 2026). Each account's files are under its own new uid, but the emulator lists
// a prefix by going through every file it holds, so the first run's files (a backup and seeded
// recordings per test scenario loaded) slowed every listing in the second. loadTestScenario took
// 39–128 s there against 3–13 s in the first run; past the app's 70 s for a callable, REVO-26 hung
// until its 15 minutes ran out (runs 45782607100 and 45770868685). Files that load no test scenario
// ran at the same speed in both runs.
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
