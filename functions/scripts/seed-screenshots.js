/**
 * Seed the store-screenshots account (screenshots@revisely.app) with a believable hifz for the App Store
 * and Google Play previews. Rewritten for 1.0.4 (Nov 2026): the new Activity reads revision, memorization
 * and read items and the daily log, which the 1.0.2 seed never wrote.
 *
 * Every date is relative to the day it runs, in the simulator's zone (SCREENSHOT_TZ, default
 * America/Chicago, the Mac's), so run it on the day of the capture:
 *
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     SCREENSHOT_EMAIL=screenshots@revisely.app node scripts/seed-screenshots.js
 *
 * The account:
 *   - "Asiyah" (a demo name, not a person), Indigo, Smart Tracking on, recording backup off;
 *   - Juz 1–3 and 28–30 memorized: 124 pages, about a fifth of the Quran; Juz 3 memorized over the last
 *     five weeks (Activity's "+ pages memorized");
 *   - one juz a day (juz mode), anchored so today is Juz 28: Home opens on "Starts at Al-Mujadila",
 *     not started;
 *   - 104 days of revision before today, an item and its session each day: dawn sessions with a few at
 *     night, a missed Saturday most weeks (Revo's "which days do I miss?"), a few partial days,
 *     Al-Hashr 17–24 (pp. 548–549) and Al-Baqarah 246–252 (pp. 40–41) rated weak;
 *   - readings (Al-Kahf on Fridays, Al-Mulk at night) and a handful of notes in the daily log.
 *
 * It first deletes the account's own history (sessions, items, the log, reading sessions, Revo's
 * conversations and memory), after writing it to SCREENSHOT_BACKUP (a JSON file) if that is set. It
 * never touches another account: it refuses any email but the one given, and refuses the App Review
 * account. previewTester is set apart, with set-preview-tester.js (Revo and the 1.0.4 features are
 * testers-only until the release).
 */

const fs = require('fs');
const admin = require('firebase-admin');

const EMAIL = process.env.SCREENSHOT_EMAIL;
const TZ = process.env.SCREENSHOT_TZ || 'America/Chicago';
const DRY = process.argv.includes('--dry');
if (!EMAIL) {
  console.error('ERROR: Set SCREENSHOT_EMAIL (screenshots@revisely.app).');
  process.exit(1);
}
if (EMAIL.toLowerCase() === 'applereview@revisely.app') {
  console.error('ERROR: That is the App Review account. Use seed-reviewer.js for it.');
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const Timestamp = admin.firestore.Timestamp;

// ── Days and times in the simulator's zone ──────────────────────────────────
function partsIn(ms) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return p;
}
const TODAY = (() => {
  const p = partsIn(Date.now());
  return `${p.year}-${p.month}-${p.day}`;
})();
/** The day `n` days before today (YYYY-MM-DD). */
function day(n) {
  const [y, m, d] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}
function weekday(dayId) {
  const [y, m, d] = dayId.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sunday … 6 Saturday
}
/** `hour`:`minute` on `dayId` in TZ, as epoch ms. */
function local(dayId, hour, minute = 0) {
  const [y, m, d] = dayId.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 3; i++) {
    const p = partsIn(guess);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += Date.UTC(y, m - 1, d, hour, minute) - seen;
  }
  return guess;
}
const ts = (ms) => Timestamp.fromMillis(ms);
function range(a, b) {
  const out = [];
  for (let p = a; p <= b; p++) out.push(p);
  return out;
}

// ── The hifz ────────────────────────────────────────────────────────────────
const STARTS = [1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 202, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
const JUZ = {};
for (let j = 1; j <= 30; j++) JUZ[j] = range(STARTS[j - 1], j === 30 ? 604 : STARTS[j] - 1);
// Juz mode groups pages by juzKeyForPage (src/lib/algorithm.ts): a surah across two juz counts for the first,
// so a juz that starts mid-surah lends its first pages to the juz before. These six start on a surah (or inside
// Al-Baqarah, which is kept by page), so each key is exactly its juz (checked with juzKeyForPage, Nov 2026).
const MEMORIZED_JUZ = [1, 2, 3, 28, 29, 30];
const MEMORIZED = MEMORIZED_JUZ.flatMap((j) => JUZ[j]);
const MEMORIZED_SET = new Set(MEMORIZED);
const WEAK = [548, 549, 40, 41];
const MODERATE = [544, 551, 553, 559];
const TODAY_JUZ = 28; // starts at Al-Mujadila
const HISTORY_DAYS = 104;
// Juz mode cycles the memorized juz by days since the anchor: put Juz 28 on today.
const CYCLE = MEMORIZED_JUZ.length;
// Before the oldest seeded day, so every day seeded was scheduled.
const ANCHOR_DAYS_AGO = CYCLE * Math.ceil((HISTORY_DAYS + 1) / CYCLE) + MEMORIZED_JUZ.indexOf(TODAY_JUZ);
const juzOn = (n) => MEMORIZED_JUZ[(((ANCHOR_DAYS_AGO - n) % CYCLE) + CYCLE) % CYCLE];

// Missed: a Saturday most weeks, and one Tuesday. Partial: a few days cut short.
function missed(n) {
  if (n < 8) return false; // a clean last week: Home's streak, Activity's week
  const id = day(n);
  const wd = weekday(id);
  if (wd === 6 && Math.floor(n / 7) % 4 !== 1) return true;
  return n === 23;
}
const PARTIAL = { 19: 16, 38: 12, 61: 15, 80: 13 }; // none in the last two weeks: a part day ends the streak

async function wipe(uid, backupPath) {
  const userRef = db.doc(`users/${uid}`);
  const subs = ['sessions', 'revisions', 'memorizations', 'reads', 'readingSessions', 'journal', 'revoChats', 'revoMemory'];
  if (backupPath) {
    const dump = { user: (await userRef.get()).data() || null, at: new Date().toISOString() };
    for (const s of subs) {
      const snap = await userRef.collection(s).get();
      dump[s] = {};
      for (const d of snap.docs) {
        dump[s][d.id] = d.data();
        for (const sub of await d.ref.listCollections()) {
          const inner = await sub.get();
          dump[s][`${d.id}/${sub.id}`] = Object.fromEntries(inner.docs.map((x) => [x.id, x.data()]));
        }
      }
    }
    fs.writeFileSync(backupPath, JSON.stringify(dump, null, 1));
    console.log(`✓ Backed up the account's history to ${backupPath}`);
  }
  for (const s of subs) await db.recursiveDelete(userRef.collection(s));
  await db.doc(`revoUsage/${uid}`).delete().catch(() => {});
  console.log('✓ Cleared the account\'s history');
}

async function main() {
  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
  } catch (err) {
    console.error(`ERROR: No auth user found for ${EMAIL}.`);
    process.exit(1);
  }
  const uid = user.uid;
  console.log(`✓ Found ${EMAIL} (${uid}); today in ${TZ} is ${TODAY}, Juz ${juzOn(0)}`);
  if (!DRY) await wipe(uid, process.env.SCREENSHOT_BACKUP);

  const writes = []; // [path, data]
  const rating = new Map();
  const lastRevised = new Map();
  const revisedCount = new Map();
  const skippedCount = new Map();

  // Revision days, oldest first, so the last rating of a page wins.
  let streak = 0;
  let sessions = 0;
  let pagesRevisedAll = 0;
  for (let n = HISTORY_DAYS; n >= 1; n--) {
    if (missed(n)) continue;
    const id = day(n);
    const juz = juzOn(n);
    const assigned = JUZ[juz].filter((p) => MEMORIZED_SET.has(p));
    // At-Taghabun's pages skipped three times in the last 30 days, none in the streak (a skip breaks it).
    const skipped = juz === 28 && n % 3 === 0 && n >= 15 ? [556, 557] : [];
    const want = PARTIAL[n] ?? assigned.length;
    const revised = assigned.filter((p) => !skipped.includes(p)).slice(0, want);
    const night = n % 5 === 2;
    const start = night ? local(id, 21, 5) : local(id, 5, 20 + (n % 6) * 8);
    const minutes = Math.round(revised.length * (1.6 + ((n * 7) % 6) / 10));
    const updates = [];
    if (juz === 28 && n <= 40) for (const p of [548, 549]) updates.push({ pageNumber: p, previousRating: 3, newRating: 2, changedAt: ts(start + 60000) });
    if (juz === 28 && n <= 14) for (const p of MODERATE) updates.push({ pageNumber: p, previousRating: 4, newRating: 3, changedAt: ts(start + 60000) });
    if (juz === 2 && n > 30) for (const p of [40, 41]) updates.push({ pageNumber: p, previousRating: 3, newRating: 2, changedAt: ts(start + 60000) });
    for (const u of updates) rating.set(u.pageNumber, u.newRating);
    for (const p of revised) {
      lastRevised.set(p, start + minutes * 60000);
      revisedCount.set(p, (revisedCount.get(p) || 0) + 1);
    }
    for (const p of skipped) skippedCount.set(p, (skippedCount.get(p) || 0) + 1);
    writes.push([`users/${uid}/revisions/${id}`, {
      id, uid, day: id, occurredAt: start, countsFor: id, source: 'session',
      pages: revised, skipped, assigned, minutes, recordings: [],
    }]);
    const end = start + minutes * 60000;
    writes.push([`users/${uid}/sessions/${id}`, {
      id, date: id, state: 'completed', createdAt: ts(start), updatedAt: ts(end), completedAt: ts(end),
      durationMinutes: minutes, assignedPages: assigned, totalAssignedPages: assigned.length,
      pagesRevised: revised, pagesSkipped: skipped, weaknessUpdates: updates,
      completionPercentage: Math.round((revised.length / assigned.length) * 100),
    }]);
    sessions++;
    pagesRevisedAll += revised.length;
  }
  for (let n = 1; n <= HISTORY_DAYS && !missed(n); n++) streak++;

  // Memorizing: Juz 3 over the last five weeks, a page or two at a time; the rest months before.
  const memorizedOn = new Map();
  const recent = JUZ[3];
  let k = 0;
  for (let n = 35; n >= 2 && k < recent.length; n--) {
    if (weekday(day(n)) === 5 || n % 2 === 1) continue; // every other day, never Friday
    const pages = recent.slice(k, k + (n % 3 === 0 ? 2 : 1));
    if (n <= 4) pages.push(...recent.slice(k + pages.length)); // the last pages, the last sitting
    k += pages.length;
    const id = day(n);
    for (const p of pages) memorizedOn.set(p, local(id, 19, 30));
    writes.push([`users/${uid}/memorizations/${id}`, {
      id, uid, day: id, occurredAt: local(id, 19, 30), pages, source: 'manual', minutes: 20 + pages.length * 12, recordings: [],
    }]);
  }
  for (const p of recent.slice(k)) memorizedOn.set(p, local(day(2), 19, 30));
  // Before that, a year of memorizing (Insights' Memorization bars): Juz 30, 29 and 28 back to front, then
  // Al-Fatihah and Al-Baqarah, about nine pages a month, from twelve months ago to two months ago.
  const older = [...JUZ[30], ...JUZ[29], ...JUZ[28], ...JUZ[1], ...JUZ[2]];
  const MONTHS = 11;
  for (let mo = 0; mo < MONTHS; mo++) {
    const pages = older.slice(Math.round((mo * older.length) / MONTHS), Math.round(((mo + 1) * older.length) / MONTHS));
    const id = day(365 - mo * 30);
    for (const p of pages) memorizedOn.set(p, local(id, 19, 0));
    writes.push([`users/${uid}/memorizations/${id}`, {
      id, uid, day: id, occurredAt: local(id, 19, 0), pages, source: 'manual', minutes: null, recordings: [],
    }]);
  }

  // Reading: Al-Kahf on Fridays, Al-Mulk some nights.
  for (let n = 60; n >= 1; n--) {
    const id = day(n);
    const friday = weekday(id) === 5;
    const mulk = n % 4 === 1;
    if (!friday && !mulk) continue;
    const pages = friday ? range(293, 304) : range(562, 564);
    const at = friday ? local(id, 13, 10) : local(id, 22, 0);
    const minutes = friday ? 26 : 9;
    writes.push([`users/${uid}/reads/read-${id}`, { id: `read-${id}`, uid, day: id, occurredAt: at, pages, minutes, source: 'automatic', recordings: [] }]);
    writes.push([`users/${uid}/readingSessions/read-${id}`, {
      date: id, startedAt: ts(at), endedAt: ts(at + minutes * 60000), durationSeconds: minutes * 60, mode: 'stopwatch', targetSeconds: null,
      pages, pagesVisited: pages, createdAt: ts(at + minutes * 60000), updatedAt: ts(at + minutes * 60000),
    }]);
  }

  // Today, before the day's revision: a dawn sitting in the reader, Al-Mulk 1–26 (pp. 562–563) in 41 minutes, as the
  // reader saves one (REC-1/REC-2). Its recording is placed on the phone by scripts/store/place-demo-recording.sh.
  {
    const id = TODAY;
    const at = local(id, 5, 25);
    const sid = `store-sitting-${id}`;
    writes.push([`users/${uid}/reads/${sid}`, { id: sid, uid, day: id, occurredAt: at, source: 'auto', pages: [562, 563], minutes: 41, recordings: [], readingSessionId: sid }]);
    writes.push([`users/${uid}/readingSessions/${sid}`, {
      date: id, startedAt: ts(at), endedAt: ts(at + 41 * 60000), durationSeconds: 41 * 60, mode: 'stopwatch', targetSeconds: null,
      pages: [562, 563], pagesVisited: [562, 563], createdAt: ts(at + 41 * 60000), updatedAt: ts(at + 41 * 60000),
    }]);
  }

  // The daily log.
  const notes = [
    [1, 'Al-Hashr 17–24 keep slipping at the turn. Read them twice before Fajr.', 21, 40],
    [3, 'Revised at the masjid after Isha.', 21, 50],
    [6, 'Guests tonight. Picking up from Al-Mulk tomorrow.', 20, 20],
    [9, 'Al-Mulk felt smooth today, alhamdulillah.', 6, 30],
    [12, 'Two sittings for the new ayahs. One more pass tomorrow.', 19, 55],
    [16, "Recited An-Naba' to my teacher. Two small slips.", 18, 10],
    [20, 'Long day. Only half of Juz 29.', 22, 15],
    [27, 'First time through Al-Baqarah 253–286 without looking.', 20, 5],
  ];
  for (const [n, text, h, m] of notes) {
    const id = day(n);
    writes.push([`users/${uid}/journal/${id}/entries/note-${id}`, { id: `note-${id}`, uid, day: id, at: local(id, h, m), kind: 'note', text, minutes: null }]);
  }

  // Pages.
  for (let p = 1; p <= 604; p++) {
    const isMem = MEMORIZED_SET.has(p);
    const r = rating.get(p) ?? (isMem ? (WEAK.includes(p) ? 2 : MODERATE.includes(p) ? 3 : 4 + (p % 5 === 0 ? 1 : 0)) : 4);
    const last = lastRevised.get(p);
    const memAt = memorizedOn.get(p) ?? (isMem ? local(day(120 + (p % 200)), 12, 0) : null);
    writes.push([`users/${uid}/pages/${p}`, {
      pageNumber: p,
      status: isMem ? 'memorized' : 'not_memorized',
      dateMemorized: memAt ? ts(memAt) : null,
      lastRevisedAt: last ? ts(last) : null,
      weaknessRating: Math.min(5, r),
      totalRevisionCount: (revisedCount.get(p) || 0) + (isMem ? 4 + (p % 7) : 0),
      skipCount: skippedCount.get(p) || 0,
      updatedAt: ts(Date.now()),
    }]);
  }

  if (DRY) {
    console.log(`(dry run) would write ${writes.length} documents; ${sessions} revision days, streak ${streak}`);
    for (let n = 9; n >= 0; n--) console.log(`  ${day(n)} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(day(n))]} Juz ${juzOn(n)}${missed(n) ? ' (missed)' : ''}`);
    return;
  }
  // Firestore takes 500 writes a batch.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [path, data] of writes.slice(i, i + 400)) batch.set(db.doc(path), data);
    await batch.commit();
  }

  await db.doc(`users/${uid}`).set({
    uid,
    displayName: 'Asiyah',
    accent: 'indigo',
    recordingBackup: false,
    email: EMAIL,
    photoURL: null,
    createdAt: ts(local(day(400), 12, 0)),
    updatedAt: ts(Date.now()),
    lastActiveAt: ts(Date.now()),
    dailyPageCapacity: 20,
    scheduleMode: 'juz',
    dailyJuzCount: 1,
    smartTrackingEnabled: true,
    hasSeenSmartTrackingPreview: true,
    theme: 'system',
    notifications: { enabled: true, reminderTime: '08:00' },
    currentMemorizationJuz: 4,
    currentMemorizationPage: 62,
    currentKhatamPage: 1,
    customPlan: null,
    carryOver: null,
    scheduleShiftPages: 0,
    streak,
    lastRevisionDate: day(1),
    totalMemorizedPages: MEMORIZED.length,
    totalLearningPages: 0,
    totalSessionsCompleted: sessions,
    totalPagesRevisedAllTime: pagesRevisedAll,
    onboardingComplete: true,
    whatsNewSeen: 'all', // never the What's new walkthrough (src/lib/help/whatsNew.ts SEEN_ALL)
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    // The simulator's place (simctl location, Chicago): the widgets and prayer times name it.
    locationCoords: { latitude: 41.8781, longitude: -87.6298 },
    scheduleAnchorDate: new Date(local(day(ANCHOR_DAYS_AGO), 12, 0)).toISOString(),
  }, { merge: true });

  console.log(`✓ ${MEMORIZED.length} pages memorized, ${sessions} revision days (streak ${streak}), ${writes.length} documents`);
  console.log(`  Today (${TODAY}) is Juz ${juzOn(0)}, not started. Sign in to ${EMAIL} on the simulator.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
