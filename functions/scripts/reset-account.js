/**
 * Reset one account's data, so it starts again as a new user: onboarding, no
 * progress, no history, no recordings. The sign-in (Firebase Auth) stays, and
 * so does `previewTester`. Nothing of any other account is read or changed.
 *
 * Everything is backed up first, and checked, before anything is changed:
 *   <out>/<uid>-<date>/firestore.json   every document (types kept: restore-account.js)
 *   <out>/<uid>-<date>/storage.json     the recordings' files and their metadata
 *   <out>/<uid>-<date>/storage/…        the files themselves (MD5 checked)
 *
 * Then:
 *   1. users/<uid> is replaced in place by what sign-up writes (createUser in
 *      src/services/firestoreService.ts), plus `previewTester` if it was set and
 *      `dataResetAt`. Replaced, never deleted: an open app would create it
 *      again itself, without previewTester (clients can't write it).
 *   2. The 604 pages are overwritten with sign-up's defaults (initializeAllPages),
 *      never missing in between, for the same reason.
 *   3. Every other subcollection (sessions, journal, readingSessions, stats, …)
 *      is deleted, except recordings:
 *   4. each recording's record becomes a tombstone ({deletedAt}), as deleting a
 *      recording in the app does, so a phone that still has the audio keeps it
 *      local-only instead of uploading it again; tombstones already there stay.
 *   5. The files under recordings/<uid>/ in Storage are deleted.
 *
 * `dataResetAt` tells phones that what they hold for the account (the copy and
 * the outbox, lib/offline) is from before the reset: AppProvider drops both.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/reset-account.js <email>                # what it would do, no writes
 *   ... node scripts/reset-account.js <email> --yes        # back up, then reset
 *   ... node scripts/reset-account.js <email> --check      # does it still look new?
 * Options: --out <dir> (default ~/secrets/backups), --bucket <name>
 * (default <project>.firebasestorage.app).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const admin = require('firebase-admin');
const { Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');

const TOTAL_PAGES = 604;
const PROTECTED = ['applereview@revisely.app'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Firestore values as JSON, with their types (restore-account.js reads them back).

function encode(v) {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __type: 'ref', path: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = encode(x);
  return out;
}

/** Every document under ref (depth first), including ones that exist only as parents. */
async function walk(ref, docs) {
  for (const col of await ref.listCollections()) {
    for (const d of await col.listDocuments()) {
      const snap = await d.get();
      if (snap.exists) docs.push({ path: d.path, data: encode(snap.data()) });
      await walk(d, docs);
    }
  }
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('base64');
}

// ---------------------------------------------------------------------------

async function findAccount(email) {
  const want = email.toLowerCase();
  const matches = [];
  let token;
  do {
    const page = await admin.auth().listUsers(1000, token);
    for (const u of page.users) {
      const emails = [u.email, ...u.providerData.map((p) => p.email)].filter(Boolean).map((e) => e.toLowerCase());
      if (emails.includes(want)) matches.push(u);
    }
    token = page.pageToken;
  } while (token);
  const byEmail = await admin.auth().getUserByEmail(email).catch(() => null);
  if (matches.length !== 1 || !byEmail || byEmail.uid !== matches[0].uid) {
    throw new Error(`Expected exactly one sign-in for ${email}; found ${matches.length}. Nothing changed.`);
  }
  return byEmail;
}

async function summary(db, bucket, uid) {
  const userRef = db.doc(`users/${uid}`);
  const counts = {};
  for (const col of await userRef.listCollections()) counts[col.id] = (await col.get()).size;
  const [files] = await bucket.getFiles({ prefix: `recordings/${uid}/` });
  return { counts, files };
}

async function backup(db, bucket, uid, outRoot) {
  const date = new Date().toISOString().slice(0, 10);
  let dir = path.join(outRoot, `${uid}-${date}`);
  if (fs.existsSync(dir)) dir += `-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
  fs.mkdirSync(outRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(outRoot, 0o700);
  fs.mkdirSync(path.join(dir, 'storage'), { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);

  const userRef = db.doc(`users/${uid}`);
  const docs = [];
  const userSnap = await userRef.get();
  if (userSnap.exists) docs.push({ path: userRef.path, data: encode(userSnap.data()) });
  await walk(userRef, docs);
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 1), { mode: 0o600 });
  write('firestore.json', { uid, project: admin.app().options.projectId ?? null, exportedAt: new Date().toISOString(), docs });

  const [files] = await bucket.getFiles({ prefix: `recordings/${uid}/` });
  const listing = [];
  for (const f of files) {
    const dest = path.join(dir, 'storage', f.name);
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
    await f.download({ destination: dest });
    fs.chmodSync(dest, 0o600);
    const m = f.metadata;
    if (m.md5Hash && md5(dest) !== m.md5Hash) throw new Error(`Backup of ${f.name} doesn't match its MD5. Nothing changed.`);
    listing.push({ name: f.name, size: Number(m.size), md5Hash: m.md5Hash, contentType: m.contentType, metadata: m.metadata ?? null, updated: m.updated });
  }
  write('storage.json', listing);

  // Read it back: every document and file must be there before anything is changed.
  const back = JSON.parse(fs.readFileSync(path.join(dir, 'firestore.json'), 'utf8'));
  const { counts } = await summary(db, bucket, uid);
  const expected = Object.values(counts).reduce((s, n) => s + n, 0) + (userSnap.exists ? 1 : 0);
  const pathsBack = new Set(back.docs.map((d) => d.path));
  if (back.docs.length < expected || pathsBack.size !== back.docs.length) {
    throw new Error(`Backup holds ${back.docs.length} documents, expected ${expected}. Nothing changed.`);
  }
  for (const f of listing) {
    if (!fs.existsSync(path.join(dir, 'storage', f.name))) throw new Error(`Backup lacks ${f.name}. Nothing changed.`);
  }
  return { dir, docs: back.docs.length, files: listing.length, bytes: listing.reduce((s, f) => s + f.size, 0) };
}

/** What sign-up writes (createUser), plus what an admin keeps. */
function freshUser(authUser, old, now) {
  return {
    uid: authUser.uid,
    displayName: authUser.displayName ?? null,
    email: authUser.email ?? null,
    photoURL: authUser.photoURL ?? null,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    dailyPageCapacity: 20,
    smartTrackingEnabled: false,
    hasSeenSmartTrackingPreview: false,
    theme: 'system',
    notifications: { enabled: true, reminderTime: '08:00' },
    currentMemorizationJuz: null,
    currentMemorizationPage: null,
    currentKhatamPage: 1,
    customPlan: null,
    streak: 0,
    lastRevisionDate: null,
    totalMemorizedPages: 0,
    totalLearningPages: 0,
    totalSessionsCompleted: 0,
    totalPagesRevisedAllTime: 0,
    onboardingComplete: false,
    memorizedSurahs: [],
    fajrBoundaryEnabled: false,
    locationCoords: null,
    fajrCalculationMethod: 'NorthAmerica',
    scheduleAnchorDate: now.toDate().toISOString(),
    ...(old?.previewTester === true && { previewTester: true }),
    dataResetAt: now,
  };
}

function freshPage(pageNumber, now) {
  return {
    pageNumber,
    status: 'not_memorized',
    dateMemorized: null,
    lastRevisedAt: null,
    weaknessRating: 4,
    totalRevisionCount: 0,
    skipCount: 0,
    updatedAt: now,
  };
}

async function reset(db, bucket, authUser) {
  const uid = authUser.uid;
  const userRef = db.doc(`users/${uid}`);
  const now = Timestamp.now();
  const old = (await userRef.get()).data();
  const done = {};

  await userRef.set(freshUser(authUser, old, now));

  const pagesRef = userRef.collection('pages');
  const before = await pagesRef.listDocuments();
  const valid = new Set(Array.from({ length: TOTAL_PAGES }, (_, i) => String(i + 1)));
  for (let start = 1; start <= TOTAL_PAGES; start += 450) {
    const batch = db.batch();
    for (let n = start; n <= Math.min(start + 449, TOTAL_PAGES); n++) batch.set(pagesRef.doc(String(n)), freshPage(n, now));
    await batch.commit();
  }
  const stray = before.filter((d) => !valid.has(d.id));
  for (const d of stray) await d.delete();
  done.pages = `${TOTAL_PAGES} set to new${stray.length ? `, ${stray.length} stray deleted` : ''}`;

  for (const col of await userRef.listCollections()) {
    if (col.id === 'pages' || col.id === 'recordings') continue;
    done[col.id] = (await col.get()).size;
    await db.recursiveDelete(col);
  }

  const recs = await userRef.collection('recordings').get();
  let tombstoned = 0;
  for (const d of recs.docs) {
    if (d.data().deletedAt !== undefined) continue;
    await d.ref.set({ deletedAt: now });
    tombstoned++;
  }
  done.recordings = `${tombstoned} records → tombstones (${recs.size - tombstoned} already were)`;

  const [files] = await bucket.getFiles({ prefix: `recordings/${uid}/` });
  for (const f of files) await f.delete();
  done.storageFiles = files.length;
  return done;
}

/** Problems that would mean the account isn't new (empty when it is). */
async function check(db, bucket, uid) {
  const userRef = db.doc(`users/${uid}`);
  const problems = [];
  const u = (await userRef.get()).data();
  if (!u) problems.push('no user document');
  else {
    if (u.onboardingComplete !== false) problems.push(`onboardingComplete is ${u.onboardingComplete}`);
    if (!u.dataResetAt) problems.push('no dataResetAt');
    if ((u.memorizedSurahs ?? []).length) problems.push(`${u.memorizedSurahs.length} memorized surahs`);
    if (u.streak) problems.push(`streak ${u.streak}`);
  }
  const pages = await userRef.collection('pages').get();
  const used = pages.docs.filter((d) => {
    const p = d.data();
    return p.status !== 'not_memorized' || p.totalRevisionCount || p.skipCount || p.lastRevisedAt || p.weaknessRating !== 4;
  });
  if (pages.size !== TOTAL_PAGES) problems.push(`${pages.size} pages`);
  if (used.length) problems.push(`${used.length} pages with progress`);
  for (const col of await userRef.listCollections()) {
    if (col.id === 'pages') continue;
    const snap = await col.get();
    const live = col.id === 'recordings' ? snap.docs.filter((d) => d.data().deletedAt === undefined) : snap.docs;
    if (live.length) problems.push(`${live.length} in ${col.id}`);
  }
  const [files] = await bucket.getFiles({ prefix: `recordings/${uid}/` });
  if (files.length) problems.push(`${files.length} recording files`);
  return { problems, previewTester: u?.previewTester === true };
}

async function main() {
  const email = process.argv[2];
  if (!email || email.startsWith('--')) {
    console.error('Usage: node scripts/reset-account.js <email> [--yes | --check] [--out <dir>] [--bucket <name>]');
    process.exit(1);
  }
  if (PROTECTED.includes(email.toLowerCase())) {
    console.error(`${email} is the App Review account; it must not be changed.`);
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
    process.exit(1);
  }
  let projectId = process.env.GCLOUD_PROJECT;
  if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    projectId = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id;
  }
  admin.initializeApp({ projectId, storageBucket: arg('--bucket') ?? `${projectId}.firebasestorage.app` });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const authUser = await findAccount(email);
  const uid = authUser.uid;
  console.log(`Account: ${uid} (${authUser.providerData.map((p) => p.providerId).join(', ')})`);

  if (process.argv.includes('--check')) {
    const { problems, previewTester } = await check(db, bucket, uid);
    console.log(problems.length ? `Not new: ${problems.join('; ')}` : '✓ Looks new (onboarding next, no progress, no history, no recordings)');
    console.log(`previewTester: ${previewTester}`);
    process.exit(problems.length ? 2 : 0);
  }

  const { counts, files } = await summary(db, bucket, uid);
  console.log('Holds:', JSON.stringify(counts), `| ${files.length} recording files`);
  if (!process.argv.includes('--yes')) {
    console.log('Dry run: nothing backed up or changed. Add --yes to back up and reset.');
    return;
  }

  const out = arg('--out') ?? path.join(os.homedir(), 'secrets', 'backups');
  const b = await backup(db, bucket, uid, out);
  console.log(`Backed up ${b.docs} documents and ${b.files} files (${(b.bytes / 1e6).toFixed(1)} MB) to ${b.dir}`);

  const done = await reset(db, bucket, authUser);
  console.log('Reset:', JSON.stringify(done));

  const { problems, previewTester } = await check(db, bucket, uid);
  console.log(problems.length ? `⚠ Not new after the reset: ${problems.join('; ')}` : '✓ Looks new');
  console.log(`previewTester: ${previewTester}`);
  if (problems.length) process.exit(2);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { encode, freshUser, freshPage, reset };
