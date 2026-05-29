/**
 * Seed an account with maximally photogenic data for App Store screenshots.
 *
 * Differences from seed-reviewer.js:
 *  - 30-day streak (vs 7) — three weeks of habit-formation looks impressive
 *  - Wider weakness-rating distribution (1-5 spread evenly) so Insights tab
 *    has lots of colored badges instead of looking uniform
 *  - More aggressive memorization profile (~210 pages, ~7 juz)
 *  - Today's session NOT created — dashboard shows "Start revision" CTA
 *    with full assignment visible (best hero shot)
 *
 * Prereq: create a dedicated auth account first (e.g. screenshots@revisely.app)
 * either in the Firebase Console or by signing up in the app. Then:
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     SCREENSHOT_EMAIL=screenshots@revisely.app \
 *     node scripts/seed-screenshots.js
 *
 * Idempotent: re-running overwrites cleanly.
 */

const admin = require('firebase-admin');

const EMAIL = process.env.SCREENSHOT_EMAIL;
if (!EMAIL) {
  console.error('ERROR: Set SCREENSHOT_EMAIL to the target account email.');
  console.error('  Recommended: create a dedicated account like screenshots@revisely.app');
  console.error('  so this does not overwrite the reviewer account or your real data.');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

const NOW = new Date();
const DAILY_CAPACITY = 20;
const SESSION_COUNT = 30; // 30-day streak

// Photogenic hifz profile: Fatiha + Yasin onwards (~7 juz) + Al-Mulk.
const MEMORIZED_PAGES = [1, ...range(440, 604), 562, 563, 564];
// dedupe in case of overlap with 440-604
const MEMORIZED_SET = new Set(MEMORIZED_PAGES);
const MEMORIZED_UNIQUE = [...MEMORIZED_SET].sort((a, b) => a - b);

// Learning: pages 2-30 (early Baqarah, in-progress)
const LEARNING_PAGES = range(2, 30);
const LEARNING_SET = new Set(LEARNING_PAGES);

const SCHEDULE_ANCHOR = daysAgo(SESSION_COUNT);

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

function sliceForDayOffset(offset) {
  const n = MEMORIZED_UNIQUE.length;
  const start = (((offset * DAILY_CAPACITY) % n) + n) % n;
  const out = [];
  const take = Math.min(DAILY_CAPACITY, n);
  for (let i = 0; i < take; i++) out.push(MEMORIZED_UNIQUE[(start + i) % n]);
  return out;
}

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
  } catch (err) {
    console.error(`ERROR: No auth user found for ${EMAIL}.`);
    console.error('  Create the account first (Firebase Console or sign up in the app).');
    process.exit(1);
  }
  const uid = user.uid;
  console.log(`✓ Found user ${uid} (${EMAIL})`);

  // Build SESSION_COUNT consecutive daily sessions, ending yesterday.
  const sessions = [];
  for (let i = 0; i < SESSION_COUNT; i++) {
    const sessionDate = daysAgo(SESSION_COUNT - i);
    const dateYmd = ymd(sessionDate);
    const dayOffset = SESSION_COUNT - (SESSION_COUNT - i); // 0..29

    const assignedPages = sliceForDayOffset(dayOffset);
    const skipN = (i % 7 === 3) ? 1 : 0; // occasional skip for realism
    const pagesRevised = assignedPages.slice(0, assignedPages.length - skipN);
    const pagesSkipped = assignedPages.slice(assignedPages.length - skipN);

    const weaknessUpdates = pagesRevised
      .slice(0, 3 + (i % 3))
      .map((pn, idx) => ({
        pageNumber: pn,
        previousRating: 4,
        newRating: ((idx + i * 3) % 5) + 1, // spread 1-5
        changedAt: ts(sessionDate),
      }));

    const completedAt = new Date(sessionDate);
    completedAt.setUTCHours(20, 15 + (i % 30), 0, 0);

    sessions.push({
      ref: db.doc(`users/${uid}/sessions/${dateYmd}`),
      data: {
        id: dateYmd,
        date: dateYmd,
        state: 'COMPLETED',
        createdAt: ts(sessionDate),
        updatedAt: ts(completedAt),
        completedAt: ts(completedAt),
        durationMinutes: 22 + ((i * 11) % 25),
        assignedPages,
        totalAssignedPages: assignedPages.length,
        pagesRevised,
        pagesSkipped,
        weaknessUpdates,
        completionPercentage: Math.round((pagesRevised.length / assignedPages.length) * 100),
      },
    });
  }

  // Derive per-page state from session history.
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

  // Force a wide rating spread on memorized pages that didn't get a rating
  // through sessions — so Insights has colorful badges.
  for (const p of MEMORIZED_UNIQUE) {
    if (!ratingsByPage.has(p)) {
      ratingsByPage.set(p, ((p * 37) % 5) + 1);
    }
  }

  let batch = db.batch();
  let ops = 0;
  for (let p = 1; p <= 604; p++) {
    const isMem = MEMORIZED_SET.has(p);
    const isLearn = LEARNING_SET.has(p);

    const status = isMem ? 'memorized' : isLearn ? 'learning' : 'not_memorized';
    const rating = ratingsByPage.get(p) ?? (isLearn ? 2 : 4);
    const lastRev = lastRevisedByPage.get(p) ?? (isMem ? daysAgo(5 + (p % 14)) : null);
    const revCount = (revisionCountByPage.get(p) || 0) + (isMem ? 6 + (p % 9) : isLearn ? 2 + (p % 4) : 0);
    const skips = skipCountByPage.get(p) || 0;
    const dateMem = isMem ? ts(daysAgo(80 + (p % 120))) : null;

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
  console.log(`✓ Wrote 604 page docs (${MEMORIZED_UNIQUE.length} memorized, ${LEARNING_PAGES.length} learning)`);

  const sBatch = db.batch();
  for (const s of sessions) sBatch.set(s.ref, s.data);
  await sBatch.commit();
  console.log(`✓ Wrote ${sessions.length} session logs (${ymd(daysAgo(SESSION_COUNT))} → ${ymd(daysAgo(1))})`);

  const totalPagesRevised = sessions.reduce((sum, s) => sum + s.data.pagesRevised.length, 0);
  await db.doc(`users/${uid}`).set({
    uid,
    displayName: 'Screenshots',
    email: EMAIL,
    photoURL: null,
    createdAt: ts(daysAgo(120)),
    updatedAt: ts(NOW),
    lastActiveAt: ts(NOW),

    dailyPageCapacity: DAILY_CAPACITY,
    scheduleMode: 'pages',
    smartTrackingEnabled: true,
    hasSeenSmartTrackingPreview: true,

    theme: 'system',
    notifications: { enabled: true, reminderTime: '08:00' },

    currentMemorizationJuz: 1,
    currentMemorizationPage: 30,
    currentKhatamPage: 1,
    customPlan: null,

    streak: SESSION_COUNT,
    lastRevisionDate: ymd(daysAgo(1)),
    totalMemorizedPages: MEMORIZED_UNIQUE.length,
    totalLearningPages: LEARNING_PAGES.length,
    totalSessionsCompleted: SESSION_COUNT,
    totalPagesRevisedAllTime: totalPagesRevised,

    onboardingComplete: true,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    scheduleAnchorDate: SCHEDULE_ANCHOR.toISOString(),
  });
  console.log(`✓ Wrote user doc (streak=${SESSION_COUNT}, ${MEMORIZED_UNIQUE.length} memorized, ${totalPagesRevised} total revisions)`);

  console.log(`\nDone. Sign in to ${EMAIL} on the simulator and take screenshots.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
