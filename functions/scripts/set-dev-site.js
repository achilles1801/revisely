/**
 * Who may open dev.revisely.app (the sign-in gate, worker/gate.ts): accounts of the dev project (revisely-dev) with
 * the custom claim `devSite: true`. Nothing about who is in lives in the repository; this script sets the claim.
 *
 * Run from the functions/ directory, with the dev project's key:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json
 *   node scripts/set-dev-site.js you@example.com          # let in
 *   node scripts/set-dev-site.js you@example.com --off    # take away
 *   node scripts/set-dev-site.js --list                   # who can
 * The account must exist in revisely-dev: sign in once (in Revisely Dev, or on the gate page, which then says the
 * account doesn't have access yet). The next sign-in on the gate page picks the change up (within an hour for a
 * session already open).
 */
const fs = require('fs');
const admin = require('firebase-admin');

const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!KEY) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to the dev project key (~/secrets/revisely-dev-admin.json).');
  process.exit(1);
}
const PROJECT = JSON.parse(fs.readFileSync(KEY, 'utf8')).project_id;
if (PROJECT !== 'revisely-dev') {
  console.error(`The dev site gate is for revisely-dev only (this key is ${PROJECT}).`);
  process.exit(1);
}
admin.initializeApp();
const CLAIM = 'devSite';

async function main() {
  const [who, flag] = process.argv.slice(2);
  if (who === '--list') {
    let token;
    let n = 0;
    do {
      const page = await admin.auth().listUsers(1000, token);
      for (const u of page.users) {
        if (u.customClaims && u.customClaims[CLAIM] === true) {
          console.log(`${u.uid}  ${u.email ?? '(no email)'}`);
          n++;
        }
      }
      token = page.pageToken;
    } while (token);
    if (!n) console.log('Nobody can open the dev site yet.');
    return;
  }
  if (!who || (flag && flag !== '--off')) {
    console.error('Usage: node scripts/set-dev-site.js <email|uid> [--off] | --list');
    process.exit(1);
  }
  const user = who.includes('@') ? await admin.auth().getUserByEmail(who) : await admin.auth().getUser(who);
  const claims = { ...(user.customClaims || {}) };
  if (flag === '--off') delete claims[CLAIM];
  else claims[CLAIM] = true;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`✓ ${user.email ?? user.uid} ${flag === '--off' ? 'can no longer open' : 'can now open'} dev.revisely.app`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err.message || err);
    process.exit(1);
  },
);
