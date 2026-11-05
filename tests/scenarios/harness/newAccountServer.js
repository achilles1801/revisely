// A new account as the server holds it part way through sign-up, against the
// emulators, with firebase-admin in its own Node process (as adminReset.js).
// Sign-up writes the user document, then the 604 pages in two batches (1–450,
// 451–604, firestoreService.initializeAllPages); this stops after any page, and
// lands the rest later, so a scenario can act while the second batch is in flight.
// Usage (harness/admin.ts):
//   node newAccountServer.js create <email> <password> <lastPage>   → {"uid": …}
//   node newAccountServer.js add-pages <email> <from> <to>
//   node newAccountServer.js memorized <email>                       → {"pages": [...]}
//   node newAccountServer.js mark <email> <page>                     (marks a page memorized)
//   node newAccountServer.js count <email>                           → {"pages": n}
const path = require('path');

const functions = path.resolve(__dirname, '../../../functions');
const admin = require(path.join(functions, 'node_modules/firebase-admin'));

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Only against the emulators (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(2);
}
admin.initializeApp({ projectId: 'demo-revisely' });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

// As firestoreService.initializeAllPages writes each page.
function newPage(pageNumber, now) {
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

async function writePages(uid, from, to) {
  const now = Timestamp.now();
  const batch = db.batch();
  for (let p = from; p <= to; p++) batch.set(db.doc(`users/${uid}/pages/${p}`), newPage(p, now));
  await batch.commit();
}

(async () => {
  const [cmd, email, a, b] = process.argv.slice(2);
  if (cmd === 'create') {
    const user = await admin.auth().createUser({ email, password: a, displayName: 'Scenario' });
    const now = Timestamp.now();
    // As firestoreService.createUser writes it.
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid,
      displayName: 'Scenario',
      email,
      photoURL: null,
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
      scheduleAnchorDate: new Date().toISOString(),
    });
    await writePages(user.uid, 1, Number(b));
    console.log(JSON.stringify({ uid: user.uid }));
  } else if (cmd === 'add-pages') {
    const user = await admin.auth().getUserByEmail(email);
    await writePages(user.uid, Number(a), Number(b));
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === 'mark') {
    const user = await admin.auth().getUserByEmail(email);
    await db.doc(`users/${user.uid}/pages/${a}`).update({ status: 'memorized', dateMemorized: new Date().toISOString() });
    console.log(JSON.stringify({ ok: true }));
  } else if (cmd === 'count') {
    const user = await admin.auth().getUserByEmail(email);
    const snap = await db.collection(`users/${user.uid}/pages`).get();
    console.log(JSON.stringify({ pages: snap.size }));
  } else if (cmd === 'memorized') {
    const user = await admin.auth().getUserByEmail(email);
    const snap = await db.collection(`users/${user.uid}/pages`).where('status', '==', 'memorized').get();
    console.log(JSON.stringify({ pages: snap.docs.map((d) => d.get('pageNumber')).sort((x, y) => x - y) }));
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
