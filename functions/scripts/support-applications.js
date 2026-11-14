/**
 * The support program's applications ("Apply for support" in the app, /apply/ on the website): see them, approve
 * or decline. Approval gives the account Revisely Premium for free (entitlements/<uid>, source "support", no end date
 * unless --until). A decision deletes the person's answers; only the outcome stays. The rules are in
 * functions/src/support/logic.ts, which this script runs from lib/ (run `npm run build` first).
 *
 * Applications are people's own words about their circumstances. They are Majd's to read.
 *
 * Run from the functions/ directory, with the dev project's key while the program is on revisely-dev:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json
 *   node scripts/support-applications.js                      # pending applications, oldest first
 *   node scripts/support-applications.js --all                # every application and its outcome
 *   node scripts/support-applications.js show <email|uid>     # one account: application and Premium
 *   node scripts/support-applications.js approve <email|uid> [--until 2027-11-14]
 *   node scripts/support-applications.js decline <email|uid>  # they may apply again after 30 days
 *   node scripts/support-applications.js revoke <email|uid>   # takes the support grant back
 * For testing (revisely-dev only):
 *   node scripts/support-applications.js link <email|uid>     # a 30-minute link to the page, as the app gets
 *   node scripts/support-applications.js clear <email|uid> --yes   # application, Premium, links, limits: all gone
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON (revisely-dev-admin.json for dev).');
  process.exit(1);
}
const LIB = path.join(__dirname, '..', 'lib', 'support');
if (!fs.existsSync(path.join(LIB, 'admin.js'))) {
  console.error('ERROR: Build the functions first: npm run build');
  process.exit(1);
}
const { decideApplication, revokeGrant, deleteSupportData, adminSupportStore, applicationFrom, entitlementsFrom } = require(path.join(LIB, 'admin.js'));
const { handleSupportLink } = require(path.join(LIB, 'handler.js'));
const { SUPPORT_PAGES, SupportError, hasPremium } = require(path.join(LIB, 'logic.js'));

admin.initializeApp();
const db = admin.firestore();
const PROJECT = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id;
const PROTECTED_EMAILS = ['applereview@revisely.app'];

const day = (ms) => (ms == null ? '—' : new Date(ms).toISOString().slice(0, 10));
const HEARD = { store: 'App Store or Play search', friend: 'friend or family', teacher: 'teacher or mosque', social: 'social media', other: 'other' };
const AMOUNT = { lt1: 'less than 1 juz', '1to5': '1–5 juz', '6to10': '6–10 juz', '11to20': '11–20 juz', '21to29': '21–29 juz', all: 'the whole Quran' };
const MEMORIZING = { yes: 'yes', revising: 'revising', not_yet: 'not yet' };

async function account(who) {
  if (!who) throw new Error('Name the account: an email or a uid.');
  const user = who.includes('@') ? await admin.auth().getUserByEmail(who) : await admin.auth().getUser(who);
  return user;
}

function printAnswers(a) {
  if (!a) return;
  const certs = [a.cantAfford && 'can’t afford Premium', a.noPayment && 'no payment method that works'].filter(Boolean).join('; ');
  console.log(`    applies: ${certs}`);
  const extra = [
    a.heard && `heard via ${HEARD[a.heard] ?? a.heard}`,
    a.country && `country ${a.country}`,
    a.memorizing && `memorizing: ${MEMORIZING[a.memorizing] ?? a.memorizing}`,
    a.amount && `memorized: ${AMOUNT[a.amount] ?? a.amount}`,
    a.teacher != null && `teacher: ${a.teacher ? 'yes' : 'no'}`,
  ].filter(Boolean);
  if (extra.length) console.log(`    ${extra.join(' · ')}`);
  if (a.note) console.log(`    note: ${a.note.replace(/\n/g, '\n          ')}`);
}

async function list(all) {
  const snap = all ? await db.collection('supportApplications').get() : await db.collection('supportApplications').where('status', '==', 'pending').get();
  const rows = snap.docs.map((d) => ({ uid: d.id, app: applicationFrom(d.data()) })).filter((r) => r.app);
  rows.sort((a, b) => a.app.createdAt - b.app.createdAt);
  if (!rows.length) {
    console.log(all ? 'No applications.' : 'No pending applications.');
    return;
  }
  for (const { uid, app } of rows) {
    const user = await admin.auth().getUser(uid).catch(() => null);
    const decided = app.status === 'pending' ? `reply by ${day(app.createdAt + 7 * 86400000)}` : `${app.status} ${day(app.decidedAt)}`;
    console.log(`\n${day(app.createdAt)}  ${user?.email ?? '(no sign-in)'}  ${uid}`);
    console.log(`    ${app.status} · ${decided} · application ${app.count} · from the ${app.via === 'web' ? 'website' : 'app'}`);
    printAnswers(app.answers);
  }
  console.log(`\n${rows.length} ${all ? 'application(s)' : 'pending'}. Approve: approve <email>. Decline: decline <email>.`);
}

async function show(who) {
  const user = await account(who);
  const [app, ent] = await Promise.all([db.doc(`supportApplications/${user.uid}`).get(), db.doc(`entitlements/${user.uid}`).get()]);
  const a = applicationFrom(app.data());
  const e = entitlementsFrom(ent.data());
  console.log(`${user.email ?? '(no email)'}  ${user.uid}`);
  if (a) {
    console.log(`  application: ${a.status}, applied ${day(a.createdAt)}${a.decidedAt ? `, decided ${day(a.decidedAt)}` : ''}${a.applyAgainFrom ? `, may apply again ${day(a.applyAgainFrom)}` : ''} (#${a.count})`);
    printAnswers(a.answers);
  } else console.log('  application: none');
  const p = e?.premium;
  console.log(`  premium: ${hasPremium(p, Date.now()) ? `yes, from ${p.source}${p.until ? ` until ${day(p.until)}` : ', no end date'}` : 'no'}`);
  for (const [source, g] of Object.entries(e?.grants ?? {})) console.log(`    grant ${source}: since ${day(g.grantedAt)}, ${g.until ? `until ${day(g.until)}` : 'no end date'}`);
}

function devOnly(what) {
  if (PROJECT !== 'revisely-dev') {
    console.error(`${what} is for testing on revisely-dev only (this key is ${PROJECT}).`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const [cmd, who] = args;
  console.log(`Project: ${PROJECT}`);
  if (!cmd || cmd === '--list') return list(false);
  if (cmd === '--all') return list(true);
  if (cmd === 'show') return show(who);
  const user = await account(who);
  if (PROTECTED_EMAILS.includes((user.email ?? '').toLowerCase())) throw new Error('Leave the App Review account alone.');
  if (cmd === 'approve') {
    const untilArg = flag('--until');
    let until = null;
    if (untilArg) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(untilArg)) throw new Error('--until takes a date: 2027-11-14');
      until = Date.parse(`${untilArg}T23:59:59Z`);
    }
    await decideApplication(db, user.uid, { approve: true, until });
    console.log(`✓ Approved: ${user.email} has Premium ${until ? `until ${untilArg}` : 'with no end date'}. Their answers are deleted.`);
  } else if (cmd === 'decline') {
    const app = await decideApplication(db, user.uid, { approve: false });
    console.log(`✓ Declined: ${user.email} may apply again from ${day(app.applyAgainFrom)}. Their answers are deleted.`);
  } else if (cmd === 'revoke') {
    const left = await revokeGrant(db, user.uid, 'support');
    console.log(`✓ Support grant taken back from ${user.email}. Premium now: ${left ? `from ${left.source}` : 'none'}.`);
  } else if (cmd === 'link') {
    devOnly('link');
    const { url, expiresAt } = await handleSupportLink({ auth: { uid: user.uid } }, adminSupportStore(db, async () => null), SUPPORT_PAGES[PROJECT]);
    console.log(`Link for ${user.email} (until ${new Date(expiresAt).toISOString()}):\n${url}`);
  } else if (cmd === 'clear') {
    devOnly('clear');
    if (!args.includes('--yes')) throw new Error(`This deletes ${user.email}'s application, Premium, links and limits. Add --yes.`);
    await deleteSupportData(db, user.uid);
    console.log(`✓ Cleared ${user.email}: no application, no Premium.`);
  } else {
    throw new Error(`Unknown command ${cmd}. See the top of this file.`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof SupportError ? err.message : err.message || err);
    process.exit(1);
  },
);
