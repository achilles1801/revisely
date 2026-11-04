// The owner's account reset (functions/scripts/reset-account.js `reset`), run
// against the emulators as the script runs it, in its own Node process with
// firebase-admin. Storage isn't emulated in the scenarios: no files to delete.
// Usage (harness/admin.ts): node adminReset.js <email>
const path = require('path');

const functions = path.resolve(__dirname, '../../../functions');
const admin = require(path.join(functions, 'node_modules/firebase-admin'));
const { reset } = require(path.join(functions, 'scripts/reset-account.js'));

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Only against the emulators (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(2);
}
admin.initializeApp({ projectId: 'demo-revisely' });

(async () => {
  const user = await admin.auth().getUserByEmail(process.argv[2]);
  const noFiles = { getFiles: async () => [[]] };
  console.log(JSON.stringify(await reset(admin.firestore(), noFiles, user)));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
