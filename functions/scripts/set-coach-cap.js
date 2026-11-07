/**
 * The monthly hard cap, in dollars, for the Ask coach and Revo together (they share one
 * ledger, coachLedger/{YYYY-MM}). Stored in config/coach.monthlyCapUsd, which only the
 * functions read; they pick a change up within a minute, with no deploy. Without it the cap
 * is MONTHLY_CAP_USD (functions/src/coach/handler.ts, $10). At most $1,000.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/set-coach-cap.js 200
 *   ... node scripts/set-coach-cap.js --show     # the cap and this month's spend
 *   ... node scripts/set-coach-cap.js --clear    # back to the default
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
    const cap = (await ref.get()).get('monthlyCapUsd');
    const month = new Date().toISOString().slice(0, 7);
    const spent = (await db.doc(`coachLedger/${month}`).get()).get('spendUsd') ?? 0;
    console.log(`Cap: $${typeof cap === 'number' ? cap : `${DEFAULT} (default)`}. Spent in ${month}: $${Number(spent).toFixed(4)}.`);
    return;
  }
  if (arg === '--clear') {
    await ref.set({ monthlyCapUsd: admin.firestore.FieldValue.delete() }, { merge: true });
    console.log(`Cap back to the default ($${DEFAULT}).`);
    return;
  }
  const value = Number(arg);
  if (!Number.isFinite(value) || value < 0 || value > MAX) {
    console.error(`Usage: node scripts/set-coach-cap.js <dollars, 0 to ${MAX}> | --show | --clear`);
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
