/**
 * Open Door's applications ("Apply for support" in the app, /apply/ on the website): see them, approve or decline.
 * Revisely Console (admin/, Open Door) does the same from a browser; both decide through
 * functions/src/support/review.ts, so a decision here is exactly the console's, audit entry included (by "the review
 * script"). Approval gives the account Revisely Premium for free (entitlements/<uid>, source "support", no end date
 * unless --until). A decision deletes the person's answers; only the outcome stays. Revoking takes the grant back and,
 * like a decline, the account may apply again after 30 days. This script runs the functions' code from lib/
 * (run `npm run build` first).
 *
 * Applications are people's own words about their circumstances. They are Majd's to read.
 *
 * Run from the functions/ directory, with the dev project's key while the program is on revisely-dev:
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json
 *   node scripts/support-applications.js                      # pending applications, oldest first
 *   node scripts/support-applications.js --all                # every application and its outcome
 *   node scripts/support-applications.js show <email|uid>     # one account: application and Premium
 *   node scripts/support-applications.js approve <email|uid> [--until 2027-11-14] [--note "…"]
 *   node scripts/support-applications.js decline <email|uid> [--note "…"]   # they may apply again after 30 days
 *   node scripts/support-applications.js revoke <email|uid> --note "why"    # takes the support grant back (30 days)
 * For testing (revisely-dev only):
 *   node scripts/support-applications.js link <email|uid>     # a 30-minute link to the page, as the app gets
 *   node scripts/support-applications.js premium <email|uid> on|off   # Premium from "dev", as Get Premium gives it
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
const { setGrant, deleteSupportData, adminSupportStore } = require(path.join(LIB, 'admin.js'));
const { review, newRequestId, queuePage, accountReview } = require(path.join(LIB, 'review.js'));
const { handleSupportLink } = require(path.join(LIB, 'handler.js'));
const { SUPPORT_PAGES, SupportError, hasPremium } = require(path.join(LIB, 'logic.js'));

admin.initializeApp();
const db = admin.firestore();
const KEY = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const PROJECT = KEY.project_id;
// The audit log names the script and the key it ran with (a service account, never a person's password).
const BY = { uid: null, email: KEY.client_email ?? null, role: null, via: 'script' };
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
  const rows = [];
  let cursor = null;
  do {
    const page = await queuePage(db, { filter: all ? 'all' : 'pending', limit: 100, cursor });
    rows.push(...page.rows);
    cursor = page.next;
  } while (cursor);
  if (!rows.length) {
    console.log(all ? 'No applications.' : 'No pending applications.');
    return;
  }
  for (const row of rows) {
    const { app } = await accountReview(db, row.uid);
    if (!app) continue;
    const user = await admin.auth().getUser(row.uid).catch(() => null);
    const decided = app.status === 'pending' ? `reply by ${day(app.createdAt + 7 * 86400000)}` : `${app.status} ${day(app.decidedAt)}`;
    console.log(`\n${day(app.createdAt)}  ${user?.email ?? '(no sign-in)'}  ${row.uid}`);
    console.log(`    ${app.status} · ${decided} · application ${app.count} · from the ${app.via === 'web' ? 'website' : 'app'}`);
    printAnswers(app.answers);
  }
  console.log(`\n${rows.length} ${all ? 'application(s)' : 'pending'}. Approve: approve <email>. Decline: decline <email>.`);
}

async function show(who) {
  const user = await account(who);
  const { app: a, ent: e, history } = await accountReview(db, user.uid);
  console.log(`${user.email ?? '(no email)'}  ${user.uid}`);
  if (a) {
    console.log(`  application: ${a.status}, applied ${day(a.createdAt)}${a.decidedAt ? `, decided ${day(a.decidedAt)}` : ''}${a.applyAgainFrom ? `, may apply again ${day(a.applyAgainFrom)}` : ''} (#${a.count})`);
    printAnswers(a.answers);
  } else console.log('  application: none');
  const p = e?.premium;
  console.log(`  premium: ${hasPremium(p, Date.now()) ? `yes, from ${p.source}${p.until ? ` until ${day(p.until)}` : ', no end date'}` : 'no'}`);
  for (const [source, g] of Object.entries(e?.grants ?? {})) console.log(`    grant ${source}: since ${day(g.grantedAt)}, ${g.until ? `until ${day(g.until)}` : 'no end date'}`);
  for (const d of history) console.log(`  ${day(d.at)} ${d.action} by ${d.by.via === 'script' ? 'the review script' : d.by.email}${d.note ? ` · note: ${d.note}` : ''}`);
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
    await review(db, { uid: user.uid, action: 'approve', by: BY, requestId: newRequestId(), note: flag('--note'), until });
    console.log(`✓ Approved: ${user.email} has Premium ${until ? `until ${untilArg}` : 'with no end date'}. Their answers are deleted.`);
  } else if (cmd === 'decline') {
    const out = await review(db, { uid: user.uid, action: 'decline', by: BY, requestId: newRequestId(), note: flag('--note') });
    console.log(`✓ Declined: ${user.email} may apply again from ${day(out.decision.applyAgainFrom)}. Their answers are deleted.`);
  } else if (cmd === 'revoke') {
    const note = flag('--note');
    if (!note) throw new Error('Say why: revoke <email|uid> --note "…"');
    const out = await review(db, { uid: user.uid, action: 'revoke', by: BY, requestId: newRequestId(), note });
    console.log(`✓ Support grant taken back from ${user.email} (may apply again from ${day(out.decision.applyAgainFrom)}). Premium now: ${out.premium ? `from ${out.premium.source}` : 'none'}.`);
  } else if (cmd === 'link') {
    devOnly('link');
    const { url, expiresAt } = await handleSupportLink({ auth: { uid: user.uid } }, adminSupportStore(db, async () => null), SUPPORT_PAGES[PROJECT]);
    console.log(`Link for ${user.email} (until ${new Date(expiresAt).toISOString()}):\n${url}`);
  } else if (cmd === 'premium') {
    devOnly('premium');
    const on = args[2];
    if (on !== 'on' && on !== 'off') throw new Error('premium <email|uid> on|off');
    const now = Date.now();
    const p = await setGrant(db, user.uid, 'dev', on === 'on' ? { source: 'dev', grantedAt: now, until: null } : null);
    console.log(`✓ ${user.email}: dev grant ${on}. Premium now: ${hasPremium(p, now) ? `yes, from ${p.source}` : 'no'}.`);
  } else if (cmd === 'clear') {
    devOnly('clear');
    if (!args.includes('--yes')) throw new Error(`This deletes ${user.email}'s application, Premium, links and limits. Add --yes.`);
    await deleteSupportData(db, user.uid);
    console.log(`✓ Cleared ${user.email}: no application, no Premium.`);
  } else {
    throw new Error(`Unknown command ${cmd}. See the top of this file.`);
  }
}

// Let the SDK finish (a refused decision rolls its transaction back) before exiting: exiting at once can leave the
// documents locked, and the next command then fails with "Too much contention".
main().then(
  () => admin.app().delete().then(() => process.exit(0)),
  (err) => {
    console.error(err instanceof SupportError ? err.message : err.message || err);
    admin.app().delete().then(() => process.exit(1), () => process.exit(1));
  },
);
