#!/usr/bin/env node
// Empties the Firestore and Auth emulators: what a run of the suite starts from. CI runs the suite
// twice on one set of emulators when a PR changes the harness (scenarios.yml, TESTING.md), and the
// second run found the first's data: the day's Revo spend (coachLedgerDay) put Revo to rest
// halfway through REVO-26 (#328's run 42586241564). So every run after the first starts here.
// Storage keeps its files: each account's are under its own new uid.
//   node tests/scenarios/harness/clearEmulators.js   (inside emulators.sh exec, which sets the hosts)
const PROJECT = 'demo-revisely';

async function clear(name, host, path) {
  if (!host) throw new Error(`${name}: no emulator host in the environment (run inside scripts/emulators.sh exec)`);
  const res = await fetch(`http://${host}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${name}: the emulator answered ${res.status} ${await res.text()}`);
  console.log(`${name} emulator emptied`);
}

(async () => {
  await clear('Firestore', process.env.FIRESTORE_EMULATOR_HOST, `/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
  await clear('Auth', process.env.FIREBASE_AUTH_EMULATOR_HOST, `/emulator/v1/projects/${PROJECT}/accounts`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
