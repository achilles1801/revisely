/**
 * Seed the App Store reviewer's account with realistic memorization data
 * so they land on a populated dashboard instead of an empty new-user state.
 *
 * Prereqs:
 *   1. The reviewer's auth account already exists (we sign them up manually
 *      with email applereview@revisely.app).
 *   2. You have a Firebase service account JSON. Generate one from
 *      Firebase Console → Project Settings → Service Accounts →
 *      "Generate new private key". Save it OUTSIDE the repo (e.g. ~/secrets/).
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/seed-reviewer.js
 *
 * Optionally override the reviewer email:
 *   REVIEWER_EMAIL=other@example.com node scripts/seed-reviewer.js
 *
 * Idempotent: re-running overwrites all seeded docs cleanly.
 */

const admin = require('firebase-admin');

const EMAIL = process.env.REVIEWER_EMAIL || 'applereview@revisely.app';

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  console.error('  See header comment in this file for details.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const NOW = new Date();
const DAILY_CAPACITY = 20;
const SESSION_COUNT = 7;

// Realistic hifz profile: Fatiha + the last 6 juz memorized, early Baqarah in progress.
const MEMORIZED_PAGES = [1, ...range(440, 604)]; // 166 pages
const LEARNING_PAGES = range(2, 50);             // 49 pages
const MEMORIZED_SET = new Set(MEMORIZED_PAGES);
const LEARNING_SET = new Set(LEARNING_PAGES);
const SORTED_MEMORIZED = [...MEMORIZED_PAGES].sort((a, b) => a - b);

const SCHEDULE_ANCHOR = daysAgo(14);

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function daysAgo(n) {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function ts(d) {
  return admin.firestore.Timestamp.fromDate(d);
}

// Sliding window over sorted memorized pages, advancing DAILY_CAPACITY per day.
function sliceForDayOffset(offset) {
  const n = SORTED_MEMORIZED.length;
  const start = (((offset * DAILY_CAPACITY) % n) + n) % n;
  const out = [];
  const take = Math.min(DAILY_CAPACITY, n);
  for (let i = 0; i < take; i++) out.push(SORTED_MEMORIZED[(start + i) % n]);
  return out;
}

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
  } catch (err) {
    console.error(`ERROR: No auth user found for ${EMAIL}.`);
    console.error('  Sign up the reviewer account in the app first, then re-run.');
    process.exit(1);
  }
  const uid = user.uid;
  console.log(`✓ Found user ${uid} (${EMAIL})`);

  // Build sessions for the last SESSION_COUNT consecutive days, ending yesterday.
  const sessions = [];
  for (let i = 0; i < SESSION_COUNT; i++) {
    const sessionDate = daysAgo(SESSION_COUNT - i); // day -7 ... -1
    const sessionDateYmd = ymd(sessionDate);
    const dayOffset = 14 - (SESSION_COUNT - i);     // 7 ... 13 days since anchor

    const assignedPages = sliceForDayOffset(dayOffset);
    const skipN = i === 2 ? 1 : 0;                  // skip 1 page on one session
    const pagesRevised = assignedPages.slice(0, assignedPages.length - skipN);
    const pagesSkipped = assignedPages.slice(assignedPages.length - skipN);

    const weaknessUpdates = pagesRevised.slice(0, 2 + (i % 2)).map((pn, idx) => ({
      pageNumber: pn,
      previousRating: 4,
      newRating: ((idx + i) % 5) + 1,
      changedAt: ts(sessionDate),
    }));

    const completedAt = new Date(sessionDate);
    completedAt.setUTCHours(19, 30 + i, 0, 0);

    sessions.push({
      ref: db.doc(`users/${uid}/sessions/${sessionDateYmd}`),
      data: {
        id: sessionDateYmd,
        date: sessionDateYmd,
        state: 'COMPLETED',
        createdAt: ts(sessionDate),
        updatedAt: ts(completedAt),
        completedAt: ts(completedAt),
        durationMinutes: 25 + ((i * 7) % 18),
        assignedPages,
        totalAssignedPages: assignedPages.length,
        pagesRevised,
        pagesSkipped,
        weaknessUpdates,
        completionPercentage: Math.round((pagesRevised.length / assignedPages.length) * 100),
      },
    });
  }

  // Derive per-page state from session history so the data is internally consistent.
  const ratingsByPage = new Map();
  const lastRevisedByPage = new Map();
  const revisionCountByPage = new Map();
  const skipCountByPage = new Map();
  for (const s of sessions) {
    for (const w of s.data.weaknessUpdates) ratingsByPage.set(w.pageNumber, w.newRating);
    for (const p of s.data.pagesRevised) {
      lastRevisedByPage.set(p, s.data.completedAt.toDate());
      revisionCountByPage.set(p, (revisionCountByPage.get(p) || 0) + 1);
    }
    for (const p of s.data.pagesSkipped) {
      skipCountByPage.set(p, (skipCountByPage.get(p) || 0) + 1);
    }
  }

  // Write all 604 page docs. (Pages not in MEMORIZED/LEARNING get status not_memorized.)
  let batch = db.batch();
  let ops = 0;
  for (let p = 1; p <= 604; p++) {
    const isMem = MEMORIZED_SET.has(p);
    const isLearn = LEARNING_SET.has(p);

    const status = isMem ? 'memorized' : isLearn ? 'learning' : 'not_memorized';
    const rating = ratingsByPage.get(p) ?? (isMem ? 2 + (p % 4) : isLearn ? 1 + (p % 3) : 4);
    const lastRev = lastRevisedByPage.get(p) ?? (isMem ? daysAgo(8 + (p % 7)) : null);
    const revCount = (revisionCountByPage.get(p) || 0) + (isMem ? 3 + (p % 5) : isLearn ? 1 + (p % 3) : 0);
    const skips = skipCountByPage.get(p) || 0;
    const dateMem = isMem ? ts(daysAgo(60 + (p % 90))) : null;

    batch.set(db.doc(`users/${uid}/pages/${p}`), {
      pageNumber: p,
      status,
      dateMemorized: dateMem,
      lastRevisedAt: lastRev ? ts(lastRev) : null,
      weaknessRating: rating,
      totalRevisionCount: revCount,
      skipCount: skips,
      updatedAt: ts(NOW),
    });
    ops++;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  console.log(`✓ Wrote 604 page docs (${MEMORIZED_PAGES.length} memorized, ${LEARNING_PAGES.length} learning)`);

  // Write sessions.
  const sBatch = db.batch();
  for (const s of sessions) sBatch.set(s.ref, s.data);
  await sBatch.commit();
  console.log(`✓ Wrote ${sessions.length} session logs (${ymd(daysAgo(SESSION_COUNT))} → ${ymd(daysAgo(1))})`);

  // Write the user doc.
  const totalPagesRevised = sessions.reduce((sum, s) => sum + s.data.pagesRevised.length, 0);
  await db.doc(`users/${uid}`).set({
    uid,
    displayName: 'App Review',
    email: EMAIL,
    photoURL: null,
    createdAt: ts(daysAgo(45)),
    updatedAt: ts(NOW),
    lastActiveAt: ts(NOW),

    dailyPageCapacity: DAILY_CAPACITY,
    scheduleMode: 'pages',
    smartTrackingEnabled: true,
    hasSeenSmartTrackingPreview: true,

    theme: 'system',
    notifications: { enabled: true, reminderTime: '08:00' },

    currentMemorizationJuz: 2,
    currentMemorizationPage: 50,
    currentKhatamPage: 1,
    customPlan: null,

    streak: SESSION_COUNT,
    lastRevisionDate: ymd(daysAgo(1)),
    totalMemorizedPages: MEMORIZED_PAGES.length,
    totalLearningPages: LEARNING_PAGES.length,
    totalSessionsCompleted: SESSION_COUNT,
    totalPagesRevisedAllTime: totalPagesRevised,

    onboardingComplete: true,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    scheduleAnchorDate: SCHEDULE_ANCHOR.toISOString(),
  });
  console.log(`✓ Wrote user doc (onboardingComplete=true, streak=${SESSION_COUNT}, ${MEMORIZED_PAGES.length} memorized)`);

  console.log(`\nDone. ${EMAIL} can sign in and will land on a populated dashboard.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
