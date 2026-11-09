/**
 * The monthly hard cap, in dollars, for the Ask coach and Revo together (they share one
 * ledger, coachLedger/{YYYY-MM}). Stored in config/coach.monthlyCapUsd, which only the
 * functions read; they pick a change up within a minute, with no deploy. Without it the cap
 * is MONTHLY_CAP_USD (functions/src/coach/handler.ts, $10). At most $1,000.
 *
 * One UTC day may spend on Revo a tenth of the monthly cap, unless config/coach.dailyCapUsd sets
 * another (0 to the monthly cap): past it Revo rests until the next UTC day, so a burst can't use up
 * the month (REVO-4).
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-coach-cap.js 200
 *   ... node scripts/set-coach-cap.js --show          # the caps, this month's and today's spend
 *   ... node scripts/set-coach-cap.js --daily 25      # one UTC day's cap
 *   ... node scripts/set-coach-cap.js --daily-clear   # back to a tenth of the month
 *   ... node scripts/set-coach-cap.js --clear         # the monthly cap back to the default
 */
const admin = require('firebase-admin');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}
admin.initializeApp();
const db = admin.firestore();
const DEFAULT = 10;
const MAX = 1000;

async function main() {
  const arg = process.argv[2];
  const ref = db.doc('config/coach');
  if (arg === '--show' || arg === undefined) {
    const doc = await ref.get();
    const cap = doc.get('monthlyCapUsd');
    const monthly = typeof cap === 'number' ? cap : DEFAULT;
    const daily = doc.get('dailyCapUsd');
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const spent = (await db.doc(`coachLedger/${month}`).get()).get('spendUsd') ?? 0;
    const spentToday = (await db.doc(`coachLedgerDay/${today}`).get()).get('spendUsd') ?? 0;
    const dailyShown = typeof daily === 'number' && daily >= 0 && daily <= monthly ? daily : `${Math.round(monthly * 10) / 100} (a tenth of the month)`;
    console.log(`Cap: $${typeof cap === 'number' ? cap : `${DEFAULT} (default)`}. Spent in ${month}: $${Number(spent).toFixed(4)}.`);
    console.log(`Daily cap (Revo): $${dailyShown}. Spent today (UTC): $${Number(spentToday).toFixed(4)}.`);
    return;
  }
  if (arg === '--daily-clear') {
    await ref.set({ dailyCapUsd: admin.firestore.FieldValue.delete() }, { merge: true });
    console.log('Daily cap back to a tenth of the monthly cap.');
    return;
  }
  if (arg === '--daily') {
    const value = Number(process.argv[3]);
    const cap = (await ref.get()).get('monthlyCapUsd');
    const monthly = typeof cap === 'number' ? cap : DEFAULT;
    if (!Number.isFinite(value) || value < 0 || value > monthly) {
      console.error(`Usage: node scripts/set-coach-cap.js --daily <dollars, 0 to the monthly cap ($${monthly})>`);
      process.exit(1);
    }
    await ref.set({ dailyCapUsd: value, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log(`Daily cap set to $${value} (applies within a minute).`);
    return;
  }
  if (arg === '--clear') {
    await ref.set({ monthlyCapUsd: admin.firestore.FieldValue.delete() }, { merge: true });
    console.log(`Cap back to the default ($${DEFAULT}).`);
    return;
  }
  const value = Number(arg);
  if (!Number.isFinite(value) || value < 0 || value > MAX) {
    console.error(`Usage: node scripts/set-coach-cap.js <dollars, 0 to ${MAX}> | --daily <dollars> | --daily-clear | --show | --clear`);
    process.exit(1);
  }
  await ref.set({ monthlyCapUsd: value, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log(`Cap set to $${value} a month (applies within a minute).`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err.message);
    process.exit(1);
  },
);
