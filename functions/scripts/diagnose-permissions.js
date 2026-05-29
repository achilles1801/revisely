/**
 * Diagnostic: confirm whether the service account can write to Firestore
 * at all, by attempting a single write to a path with no rule complications.
 *
 * Run: GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *        node scripts/diagnose-permissions.js
 */

const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();

(async () => {
  console.log('Project ID seen by SDK:', admin.app().options.projectId || '(inferred)');
  console.log('Service account email:', require(process.env.GOOGLE_APPLICATION_CREDENTIALS.replace(/^~/, process.env.HOME)).client_email);
  console.log('---');

  // Test 1: simplest possible write, top-level collection, no rules complications
  try {
    await db.doc('_diagnostic/probe').set({ at: Date.now(), test: 'permission-check' });
    console.log('✓ Test 1 PASSED: wrote to _diagnostic/probe');
    await db.doc('_diagnostic/probe').delete();
  } catch (e) {
    console.error('✗ Test 1 FAILED:', e.code, '-', e.message);
    console.error('  → IAM problem. The service account cannot write to Firestore at all.');
    process.exit(1);
  }

  // Test 2: write to the actual reviewer path that the seed script uses
  try {
    const auth = admin.auth();
    const user = await auth.getUserByEmail(process.env.REVIEWER_EMAIL || 'applereview@revisely.app');
    await db.doc(`users/${user.uid}/_diagnostic/probe`).set({ at: Date.now() });
    console.log('✓ Test 2 PASSED: wrote to users/<reviewer-uid>/_diagnostic/probe');
    await db.doc(`users/${user.uid}/_diagnostic/probe`).delete();
  } catch (e) {
    console.error('✗ Test 2 FAILED:', e.code, '-', e.message);
    console.error('  → Something path-specific is blocking writes to the reviewer subtree.');
    process.exit(1);
  }

  console.log('\nAll diagnostics passed. The seed script should work now — re-run it.');
})().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
