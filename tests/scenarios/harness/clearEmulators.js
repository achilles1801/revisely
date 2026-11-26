#!/usr/bin/env node
// Empties the Firestore, Auth and Storage emulators: what a run of the suite starts from. CI runs the
// suite twice on one set of emulators when a PR changes the harness (scenarios.yml, TESTING.md), and
// the second run found the first's data: the day's Revo spend (coachLedgerDay) put Revo to rest
// halfway through REVO-26 (#328's run 42586241564). So every run after the first starts here.
//
// Storage too (Nov 26 2026), so the second run starts as the first does. That did NOT end what it was
// added for: loading a test scenario is still slower in the second run (30–91 s against 3–14 s in run
// 45794919902, after this change; 39–128 s before it), and grows within the first run too, so what
// builds up isn't the emulators' data. Past the app's 70 s for a callable REVO-26 can hang until its
// 15 minutes run out (runs 45782607100, 45770868685). Files that load no test scenario run at the same
// speed in both runs. Cause not found yet.
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
