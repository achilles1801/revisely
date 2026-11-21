#!/usr/bin/env node
/**
 * Whether people stay: active accounts and day-1/7/30 retention by sign-up week, as counts only.
 * Read-only. The same reader and maths as the metrics console's Retention panel
 * (src/metrics/sources.ts readActivity, src/metrics/retention.ts), so build first.
 *
 *   cd functions && npm run build
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json node scripts/retention.js [--json]
 *
 * Left out: previewTester accounts, the App Review and screenshot accounts, and accounts with the
 * console's `admin` claim (the owner). Nothing about one account is printed: no uids, no emails.
 */
const admin = require('firebase-admin');
const { readActivity } = require('../lib/metrics/sources');
const { retention, lastFullDay, RETENTION_DAYS } = require('../lib/metrics/retention');

admin.initializeApp();

async function adminUids() {
  const out = new Set();
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    for (const u of page.users) if (u.customClaims && u.customClaims.admin === true) out.add(u.uid);
    token = page.pageToken;
  } while (token);
  return out;
}

const pct = (c) => (c ? `${c.n}/${c.of} (${Math.round((100 * c.n) / c.of)}%)` : '–');

(async () => {
  const [rows, owners] = await Promise.all([readActivity(admin.firestore()), adminUids()]);
  const left = { testers: 0, owner: 0, service: 0 };
  const people = [];
  for (const a of rows) {
    if (owners.has(a.uid)) left.owner += 1;
    else if (a.service) left.service += 1;
    else if (a.tester) left.testers += 1;
    else people.push({ signedUp: a.signedUp || '', firstDay: a.firstDay, onboarded: a.onboarded, days: a.days });
  }
  const r = retention(people, lastFullDay(Date.now()));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...r, left }, null, 2));
    process.exit(0);
  }
  console.log(`As of ${r.asOf} (last full UTC day). Left out: ${left.testers} testers, ${left.service} service, ${left.owner} owner.`);
  console.log(`Signed up since ${r.series.length ? '2026-10-01' : '?'}: ${r.accounts} (${r.onboarded} finished onboarding).`);
  console.log(`Active (every account): day ${r.active.day}, week ${r.active.week}, month ${r.active.month}.`);
  console.log('\nWeek ending   WAU  MAU');
  for (const p of r.series) console.log(`${p.end}  ${String(p.wau).padStart(4)} ${String(p.mau).padStart(4)}`);
  console.log(`\nSign-up week  Signed up  Onboarded  ${RETENTION_DAYS.map((n) => `Day ${n}`.padEnd(14)).join(' ')}  | on day N or later: ${RETENTION_DAYS.map((n) => `${n}+`).join(' / ')}`);
  for (const c of r.cohorts) {
    console.log(
      `${c.week}  ${String(c.signedUp).padStart(9)}  ${String(c.onboarded).padStart(9)}  ${RETENTION_DAYS.map((n) => pct(c.day[n]).padEnd(14)).join(' ')}  | ${RETENTION_DAYS.map((n) => pct(c.rolling[n])).join(' / ')}`,
    );
  }
  process.exit(0);
})().catch((err) => {
  console.error(String((err && err.message) || err));
  process.exit(1);
});
