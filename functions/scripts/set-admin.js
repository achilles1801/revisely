/**
 * Console access is now a role (Nov 14 2026): use scripts/set-role.js (owner, admin, reviewer, dev), which records
 * each change in the audit log. The old claim this script gave, `admin: true`, still counts as owner until
 * set-role.js replaces it, and this script can still take it away or show an account's claims:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-admin.js <uid> --off
 *   ... node scripts/set-admin.js <uid> --show
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
  if (flag !== '--off') throw new Error('Roles replaced this: node scripts/set-role.js <email|uid> owner');
  delete claims.admin;
  await admin.auth().setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  console.log(`✓ ${user.email ?? user.uid} (${user.uid}) no longer has the old admin claim.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
