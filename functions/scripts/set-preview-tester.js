/**
 * Mark an account as a preview tester, or stop it being one. A tester's
 * TestFlight installs follow the `preview` update channel (every merge to
 * develop); everyone else, including App Review, follows `production`
 * (src/lib/updateChannel.ts). Clients can't write this field (Firestore rules
 * allow only listed fields), so only this script sets it.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/set-preview-tester.js you@example.com          # on
 *   ... node scripts/set-preview-tester.js you@example.com --off   # off
 *   ... node scripts/set-preview-tester.js --list                  # who is one
 *
 * The app picks it up the next time it loads the account; the preview update
 * runs from the cold start after that.
 */
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}
admin.initializeApp();
const db = admin.firestore();

async function main() {
  const [arg, flag] = process.argv.slice(2);
  if (arg === '--list') {
    const snap = await db.collection('users').where('previewTester', '==', true).get();
    for (const doc of snap.docs) {
      const u = await admin.auth().getUser(doc.id).catch(() => null);
      console.log(`${doc.id}  ${u?.email ?? '(no auth account)'}`);
    }
    if (snap.empty) console.log('No preview testers.');
    return;
  }
  if (!arg || (flag && flag !== '--off')) {
    console.error('Usage: node scripts/set-preview-tester.js <email> [--off] | --list');
    process.exit(1);
  }
  if (arg.toLowerCase() === 'applereview@revisely.app') {
    console.error('The App Review account must stay on production.');
    process.exit(1);
  }
  const user = await admin.auth().getUserByEmail(arg);
  const ref = db.collection('users').doc(user.uid);
  if (!(await ref.get()).exists) {
    console.error(`${arg} has no user document (sign in to the app once first).`);
    process.exit(1);
  }
  const on = flag !== '--off';
  await ref.update({ previewTester: on ? true : admin.firestore.FieldValue.delete() });
  console.log(`✓ ${arg} (${user.uid}) ${on ? 'is now a preview tester' : 'is no longer a preview tester'}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
