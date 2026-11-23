/**
 * Let an account read the on-device bench's files on the dev backend (Storage models/recite/: v7 for the phone,
 * Revisely Dev's Settings → Testing → On-device model, BEHAVIOUR.md ONDEV-1), or stop it. Revisely Dev is open to
 * anyone with its TestFlight link, so signing in isn't enough: storage.rules reads this custom claim
 * (`onDeviceBench`), which only the admin SDK can set. Other claims on the account are kept.
 *
 * Dev only. Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json \
 *     node scripts/set-bench-access.js you@example.com          # on
 *   ... node scripts/set-bench-access.js you@example.com --off   # off
 *   ... node scripts/set-bench-access.js --list                  # who has it
 *
 * The app sees it at its next token refresh (the bench screen forces one before it reads its list).
 */
const fs = require('fs');
const admin = require('firebase-admin');

const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!key) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to the dev project service account JSON path.');
  process.exit(1);
}
const project = JSON.parse(fs.readFileSync(key, 'utf8')).project_id;
if (project !== 'revisely-dev') {
  console.error(`The bench's files live on the dev backend only; this key is for ${project}.`);
  process.exit(1);
}
admin.initializeApp();

async function main() {
  const [arg, flag] = process.argv.slice(2);
  if (arg === '--list') {
    let token;
    let any = false;
    do {
      const page = await admin.auth().listUsers(1000, token);
      for (const u of page.users) {
        if (u.customClaims?.onDeviceBench === true) {
          console.log(`${u.uid}  ${u.email ?? '(no email)'}`);
          any = true;
        }
      }
      token = page.pageToken;
    } while (token);
    if (!any) console.log('No account has bench access.');
    return;
  }
  if (!arg || (flag && flag !== '--off')) {
    console.error('Usage: node scripts/set-bench-access.js <email> [--off] | --list');
    process.exit(1);
  }
  const user = await admin.auth().getUserByEmail(arg);
  const claims = { ...(user.customClaims ?? {}) };
  const on = flag !== '--off';
  if (on) claims.onDeviceBench = true;
  else delete claims.onDeviceBench;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`✓ ${arg} (${user.uid}) ${on ? 'can now read the bench files' : 'can no longer read the bench files'}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
