// Adds revision history to the demo account screenshots@revisely.app for the
// website clips. Additive only: never overwrites a session it didn't write.
// Every doc carries seed: 'website-clips'. `--remove` deletes exactly those.
const admin = require(process.env.ADMIN_PATH);
admin.initializeApp();
const MARK = 'website-clips';
const EMAIL = 'screenshots@revisely.app';
const T = (d) => admin.firestore.Timestamp.fromDate(d);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// Memorized cycle, like the screenshot seed: 440–604, newest first from 502 down.
const CYCLE = range(440, 604);
function pagesEnding(last, n) {
  const i = CYCLE.indexOf(last);
  return range(0, n - 1).map((k) => CYCLE[(i - n + 1 + k + CYCLE.length) % CYCLE.length]);
}
(async () => {
  const uid = (await admin.auth().getUserByEmail(EMAIL)).uid;
  const db = admin.firestore();
  const col = db.collection(`users/${uid}/sessions`);
  if (process.argv.includes('--remove')) {
    const snap = await col.where('seed', '==', MARK).get();
    for (const d of snap.docs) await d.ref.delete();
    console.log('removed', snap.size);
    return;
  }
  // [day, pages assigned, pages revised, minutes]; days not listed stay empty.
  const plan = [
    ['2026-10-03', 20, 20, 34], ['2026-10-04', 20, 20, 29], ['2026-10-05', 20, 12, 18],
    ['2026-10-06', 20, 20, 38], ['2026-10-07', 20, 20, 31], ['2026-10-08', 40, 40, 66],
    ['2026-10-10', 20, 20, 27], ['2026-10-11', 20, 20, 33], ['2026-10-12', 20, 20, 30],
    ['2026-10-13', 20, 8, 12], ['2026-10-14', 20, 20, 36], ['2026-10-15', 40, 40, 71],
    ['2026-10-16', 20, 20, 32], ['2026-10-17', 20, 20, 28], ['2026-10-18', 20, 20, 35],
    ['2026-10-20', 20, 20, 30], ['2026-10-21', 20, 20, 33], ['2026-10-22', 40, 40, 64],
    ['2026-10-23', 20, 20, 29], ['2026-10-24', 20, 20, 31], ['2026-10-25', 20, 20, 34],
    ['2026-10-26', 20, 14, 22, 'IN_PROGRESS'],
  ];
  // Assignments run backwards from yesterday's 503–522 (today is 523–542).
  let last = 522;
  const docs = [];
  for (let i = plan.length - 1; i >= 0; i--) {
    const [day, n, done, minutes, state = 'COMPLETED'] = plan[i];
    const assigned = pagesEnding(last, n);
    last = CYCLE[(CYCLE.indexOf(assigned[0]) - 1 + CYCLE.length) % CYCLE.length];
    const revised = assigned.slice(0, done);
    const at = new Date(`${day}T19:${String(10 + (i * 7) % 45).padStart(2, '0')}:00Z`);
    docs.push({ day, data: {
      id: day, date: day, state, seed: MARK,
      createdAt: T(new Date(at.getTime() - minutes * 60000)), updatedAt: T(at),
      completedAt: state === 'COMPLETED' ? T(at) : null,
      durationMinutes: minutes, assignedPages: assigned, totalAssignedPages: n,
      pagesRevised: revised,
      pagesSkipped: state === 'COMPLETED' ? assigned.slice(done) : [],
      weaknessUpdates: [],
      completionPercentage: Math.round((done / n) * 100),
    } });
  }
  let wrote = 0, kept = 0;
  for (const { day, data } of docs) {
    const ref = col.doc(day);
    const cur = await ref.get();
    if (cur.exists && cur.get('seed') !== MARK) { kept++; continue; }
    await ref.set(data);
    wrote++;
  }
  console.log('wrote', wrote, 'kept existing', kept, '| Oct 26:', docs[0].data.assignedPages[0] + '–' + docs[0].data.assignedPages.at(-1));
})();
