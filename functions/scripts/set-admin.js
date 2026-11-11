/**
 * Give an account access to the owner's metrics console (adminMetrics, adminRevo), or take it away:
 * the custom claim `admin: true` on its Firebase Auth user. Nothing else reads the claim (no Firestore
 * or Storage rule does), so it opens the console and nothing more. By uid, since one email can have
 * several user documents after a reset.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-admin.js <uid>        # on
 *   ... node scripts/set-admin.js <uid> --off   # off
 *   ... node scripts/set-admin.js <uid> --show  # its claims
 *
 * The console sees the claim at its next sign-in, or within an hour (when the ID token refreshes).
 *
 * The console's conversation view stays locked until Firestore config/admin.conversations is true:
 *   ... node scripts/set-admin.js --conversations on|off
 * Turn it on only once the privacy policy's Revo section says Revisely's developer may read them.
 */
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}
admin.initializeApp();

async function main() {
  const [arg, flag] = process.argv.slice(2);
  if (arg === '--conversations') {
    if (flag !== 'on' && flag !== 'off') throw new Error('Usage: node scripts/set-admin.js --conversations on|off');
    await admin.firestore().doc('config/admin').set({ conversations: flag === 'on', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log(`✓ The console's conversation view is now ${flag === 'on' ? 'open' : 'locked'}.`);
    return;
  }
  if (!arg || !/^[A-Za-z0-9]{20,128}$/.test(arg) || (flag && !['--off', '--show'].includes(flag))) {
    throw new Error('Usage: node scripts/set-admin.js <uid> [--off|--show] | --conversations on|off');
  }
  const user = await admin.auth().getUser(arg);
  const claims = { ...(user.customClaims || {}) };
  if (flag === '--show') {
    console.log(`${user.uid}  ${user.email ?? '(no email)'}  claims: ${JSON.stringify(claims)}`);
    return;
  }
  if (flag === '--off') delete claims.admin;
  else claims.admin = true;
  await admin.auth().setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  console.log(`✓ ${user.email ?? user.uid} (${user.uid}) ${flag === '--off' ? 'no longer has' : 'now has'} the metrics console.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
