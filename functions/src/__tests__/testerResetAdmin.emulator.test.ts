/**
 * The tester backup's read of an account against the Firestore emulator (testerResetAdmin.ts documentsUnder): one
 * query for every document under users/<uid>, at any depth and under parents that don't exist, the same documents
 * the old walk found. Skipped unless the emulators run:
 *   cd functions && bash ../scripts/emulators.sh exec auth,firestore demo-revisely 'npx jest --runInBand "\.emulator\.test"'
 * CI runs it that way (ci.yml, Fast checks). One file at a time: review.emulator.test empties the database.
 */
import { deleteApp, initializeApp, App } from 'firebase-admin/app';
import { Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { BucketLike, FileLike, adminResetStore, documentsUnder, walkDocuments } from '../testerResetAdmin';

const ON = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-revisely';
const run = ON ? describe : describe.skip;

/** A Storage bucket in memory: what backup() writes and reads back. */
function memoryBucket(): BucketLike & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  const file = (name: string): FileLike => ({
    name,
    metadata: {},
    async save(data) {
      files.set(name, Buffer.from(data));
    },
    async download() {
      const b = files.get(name);
      if (!b) throw new Error(`no ${name}`);
      return [b];
    },
    async copy(destination) {
      files.set(destination, files.get(name)!);
    },
    async getMetadata() {
      return [{}];
    },
    async delete() {
      files.delete(name);
    },
  });
  return { files, file, getFiles: async () => [[]] };
}

run('the backup reads every document of an account in one query', () => {
  let app: App;
  let db: Firestore;
  const uid = `backup-${Date.now()}`;
  const user = () => db.doc(`users/${uid}`);
  const at = Timestamp.fromMillis(Date.parse('2026-11-26T12:00:00Z'));

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT }, `backup-${uid}`);
    db = getFirestore(app);
    await user().set({ name: 'Backup', at });
    // More than a page of the query (500): an account's 604 pages.
    for (let start = 1; start <= 604; start += 450) {
      const batch = db.batch();
      for (let n = start; n < Math.min(605, start + 450); n++) batch.set(user().collection('pages').doc(String(n)), { n, at });
      await batch.commit();
    }
    // A day of the log with its document, and one with notes only (its document doesn't exist).
    await user().collection('journal').doc('2026-11-01').set({ day: '2026-11-01' });
    await user().collection('journal').doc('2026-11-01').collection('entries').doc('e1').set({ uid, text: 'one', at });
    await user().collection('journal').doc('2026-11-02').collection('entries').doc('e2').set({ uid, text: 'two' });
    await user().collection('revoChats').doc('c1').set({ title: 'Today' });
    await user().collection('revoChats').doc('c1').collection('messages').doc('m1').set({ text: 'hi', ref: user() });
    // Deeper, under two documents that don't exist.
    await db.doc(`users/${uid}/a/b/c/d/e/f`).set({ deep: true });
    // Accounts whose ids start with this one's: none of theirs is this account's.
    await db.doc(`users/${uid}0`).set({ name: 'Other' });
    await db.doc(`users/${uid}0/pages/1`).set({ n: 1 });
    await db.doc(`users/${uid}-z/pages/1`).set({ n: 1 });
  });

  afterAll(async () => {
    await deleteApp(app);
  });

  it('finds what the walk found, by one query', async () => {
    const { docs, via } = await documentsUnder(db, user());
    expect(via).toBe('query');
    const walked = await walkDocuments(user());
    const byPath = (list: { path: string; data: unknown }[]) => [...list].sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(byPath(docs)).toEqual(byPath(walked));
    expect(docs).toHaveLength(604 + 1 + 2 + 1 + 1 + 1);
    const paths = docs.map((d) => d.path);
    expect(paths).toContain(`users/${uid}/journal/2026-11-02/entries/e2`);
    expect(paths).toContain(`users/${uid}/a/b/c/d/e/f`);
    expect(paths).not.toContain(`users/${uid}`);
    expect(paths.some((p) => !p.startsWith(`users/${uid}/`))).toBe(false);
    // Types kept (reset-account.js's encoding).
    const m1 = docs.find((d) => d.path.endsWith('/messages/m1'))!.data as { ref: unknown };
    expect(m1.ref).toEqual({ __type: 'ref', path: `users/${uid}` });
    const page = docs.find((d) => d.path.endsWith('/pages/7'))!.data as { at: unknown };
    expect(page.at).toEqual({ __type: 'timestamp', seconds: at.seconds, nanoseconds: at.nanoseconds });
  });

  it('backup() stores the user document and everything under it, and reads it back', async () => {
    const bucket = memoryBucket();
    const store = adminResetStore(db, bucket);
    const summary = await store.backup(uid, '2026-11-26T12:00:00.000Z');
    expect(summary.docs).toBe(1 + 604 + 6);
    const saved = JSON.parse(bucket.files.get(`${summary.location}/firestore.json`)!.toString('utf8')) as { docs: { path: string }[] };
    expect(saved.docs[0].path).toBe(`users/${uid}`);
    expect(new Set(saved.docs.map((d) => d.path)).size).toBe(summary.docs);
  });
});
