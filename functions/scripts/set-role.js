/**
 * Revisely Console roles (functions/src/console/roles.ts): give an account a role, take it away, or see who has one.
 * Each change is recorded in the console's audit log (consoleAudit, closed to clients), by this script and the key it
 * ran with. Who holds which role lives only in Firebase Auth and that log, never in the repository.
 *
 *   owner     everything, managing roles included
 *   admin     everything but managing roles
 *   reviewer  Open Door: the queue and decisions (no revoking, metrics, Revo conversations or audit log)
 *   dev       metrics and app health (no applicants' answers, conversations or decisions)
 *
 * Run from functions/ after `npm run build`, with the project's key (revisely-dev-admin.json for dev):
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/set-role.js <email|uid> <role>
 *   ... node scripts/set-role.js <email|uid> none     # takes the role away (works at its next call)
 *   ... node scripts/set-role.js <email|uid> --show   # the account's role and claims
 *   ... node scripts/set-role.js --list               # every account with a role
 *   ... node scripts/set-role.js --roles              # what each role may do
 *
 * The last owner can't be taken away or demoted (give another account owner first).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON (revisely-dev-admin.json for dev).');
  process.exit(1);
}
const LIB = path.join(__dirname, '..', 'lib', 'console');
if (!fs.existsSync(path.join(LIB, 'staff.js'))) {
  console.error('ERROR: Build the functions first: npm run build');
  process.exit(1);
}
const { ROLES, GRANTS, PERMISSIONS, ROLE_NAMES, roleOf } = require(path.join(LIB, 'roles.js'));
const { setRole, staff } = require(path.join(LIB, 'staff.js'));

admin.initializeApp();
const KEY = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const BY = { uid: null, email: KEY.client_email ?? null, via: 'script' };

async function account(who) {
  if (!who) throw new Error('Name the account: an email or a uid.');
  return who.includes('@') ? admin.auth().getUserByEmail(who) : admin.auth().getUser(who);
}

async function main() {
  const [who, what] = process.argv.slice(2);
  console.log(`Project: ${KEY.project_id}`);
  if (who === '--roles') {
    for (const role of ROLES) {
      console.log(`\n${ROLE_NAMES[role]} (${role})`);
      for (const p of GRANTS[role]) console.log(`  ${p.padEnd(20)} ${PERMISSIONS[p]}`);
    }
    return;
  }
  if (who === '--list') {
    const list = await staff(admin.auth());
    if (!list.length) console.log('Nobody has a role.');
    for (const s of list) console.log(`${s.role.padEnd(9)} ${s.email ?? '(no email)'}  ${s.uid}`);
    return;
  }
  const user = await account(who);
  if (what === '--show') {
    const role = roleOf(user.customClaims);
    console.log(`${user.email ?? '(no email)'}  ${user.uid}`);
    console.log(`  role: ${role ?? 'none'}${user.customClaims?.admin === true && !user.customClaims?.role ? ' (from the old admin claim)' : ''}`);
    console.log(`  claims: ${JSON.stringify(user.customClaims ?? {})}`);
    return;
  }
  if (what !== 'none' && !ROLES.includes(what)) throw new Error(`Usage: set-role.js <email|uid> <${ROLES.join('|')}|none|--show>`);
  const to = what === 'none' ? null : what;
  const from = roleOf(user.customClaims);
  if (from === 'owner' && to !== 'owner') {
    const owners = (await staff(admin.auth())).filter((s) => s.role === 'owner');
    if (owners.length <= 1) throw new Error('This is the last owner. Give another account owner first.');
  }
  const change = await setRole(admin.auth(), admin.firestore(), user.uid, to, BY);
  if (!change) {
    console.log(`${user.email ?? user.uid} already has ${to ?? 'no role'}. Nothing changed.`);
    return;
  }
  console.log(`✓ ${user.email ?? user.uid}: ${change.from ?? 'no role'} → ${change.to ?? 'no role'}. Recorded in the audit log.`);
  if (to) console.log('  They see it when the console next loads (sign out and in if it was open).');
}

main().then(
  () => admin.app().delete().then(() => process.exit(0)),
  (err) => {
    console.error(err.message || err);
    admin.app().delete().then(() => process.exit(1), () => process.exit(1));
  },
);
