/**
 * testerReset.ts's reading and writing, with firebase-admin. Everything here is
 * scoped to the uid it's given (users/<uid>, recordings/<uid>/, adminResets/<uid>,
 * backups/tester-resets/<uid>/); testerReset.ts only ever passes the caller's.
 *
 * The backup is Storage, admin only (storage.rules closes backups/):
 *   backups/tester-resets/<uid>/<time>/firestore.json  every document, types kept
 *     (as reset-account.js writes it, so restore-account.js can read it back)
 *   backups/tester-resets/<uid>/<time>/storage.json    the recordings' files
 *   backups/tester-resets/<uid>/<time>/files/<name>    copies of them (copied in
 *     Storage, MD5 checked)
 */
import type { DocumentReference as DocRef, Firestore } from 'firebase-admin/firestore';
import { DocumentReference, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { BackupSummary, PAGE_NUMBERS, ResetError, ResetLog, ResetStore, claimReset, freshPage } from './testerReset';
import { deleteRevoAnswers } from './revo/admin';

/** The parts of a Storage bucket used here (firebase-admin's Bucket has them all). */
export interface BucketLike {
  getFiles(query: { prefix: string }): Promise<[FileLike[], ...unknown[]]>;
  file(name: string): FileLike;
}
export interface FileLike {
  name: string;
  metadata: { md5Hash?: string; size?: string | number; contentType?: string; metadata?: unknown; updated?: string };
  save(data: string | Buffer, options?: { contentType?: string; resumable?: boolean }): Promise<unknown>;
  download(): Promise<[Buffer, ...unknown[]]>;
  copy(destination: string): Promise<unknown>;
  getMetadata(): Promise<[FileLike['metadata'], ...unknown[]]>;
  delete(): Promise<unknown>;
}

/** Firestore values as JSON, with their types (reset-account.js's encode). */
export function encode(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { __type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { __type: 'ref', path: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __type: 'bytes', base64: Buffer.from(v as Uint8Array).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = encode(x);
  return out;
}

/** Every document under ref, depth first, including those under documents that exist only as parents. */
async function walk(ref: DocRef, docs: { path: string; data: unknown }[]): Promise<void> {
  for (const col of await ref.listCollections()) {
    for (const d of await col.listDocuments()) {
      const snap = await d.get();
      if (snap.exists) docs.push({ path: d.path, data: encode(snap.data()) });
      await walk(d, docs);
    }
  }
}

export function adminResetStore(db: Firestore, bucket: BucketLike): ResetStore {
  const userRef = (uid: string) => db.doc(`users/${uid}`);
  const logRef = (uid: string) => db.doc(`adminResets/${uid}`);
  const recordingPrefix = (uid: string) => `recordings/${uid}/`;

  return {
    now() {
      const stamp = Timestamp.now();
      const ms = stamp.toMillis();
      return { stamp, ms, iso: new Date(ms).toISOString() };
    },

    async readUser(uid) {
      const snap = await userRef(uid).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },

    async claim(uid, nowMs, kind = 'reset') {
      await db.runTransaction(async (tx) => {
        const ref = logRef(uid);
        const doc = ((await tx.get(ref)).data() as (ResetLog & { scenario?: ResetLog }) | undefined) ?? null;
        // A scenario load keeps its own counts, in `scenario`.
        const log = kind === 'scenario' ? doc?.scenario ?? null : doc;
        const result = claimReset(log, nowMs, kind);
        if (!result.ok) throw new ResetError('resource-exhausted', result.reason);
        const write = kind === 'scenario' ? { scenario: result.next } : result.next;
        tx.set(ref, { ...write, updatedAt: Timestamp.fromMillis(nowMs) }, { merge: true });
      });
    },

    async backup(uid, stampIso): Promise<BackupSummary> {
      const dir = `backups/tester-resets/${uid}/${stampIso.replace(/[:.]/g, '-')}`;
      const ref = userRef(uid);
      const docs: { path: string; data: unknown }[] = [];
      const userSnap = await ref.get();
      if (userSnap.exists) docs.push({ path: ref.path, data: encode(userSnap.data()) });
      await walk(ref, docs);
      const body = JSON.stringify({ uid, exportedAt: stampIso, reason: 'tester reset (resetMyData or loadTestScenario)', docs });
      await bucket.file(`${dir}/firestore.json`).save(body, { contentType: 'application/json', resumable: false });

      const [files] = await bucket.getFiles({ prefix: recordingPrefix(uid) });
      const listing = [];
      for (const f of files) {
        const dest = `${dir}/files/${f.name}`;
        await f.copy(dest);
        const [copied] = await bucket.file(dest).getMetadata();
        if (f.metadata.md5Hash && copied.md5Hash !== f.metadata.md5Hash) {
          throw new Error(`The copy of ${f.name} doesn't match it.`);
        }
        listing.push({
          name: f.name,
          size: Number(f.metadata.size ?? 0),
          md5Hash: f.metadata.md5Hash ?? null,
          contentType: f.metadata.contentType ?? null,
          metadata: f.metadata.metadata ?? null,
          updated: f.metadata.updated ?? null,
        });
      }
      await bucket
        .file(`${dir}/storage.json`)
        .save(JSON.stringify(listing), { contentType: 'application/json', resumable: false });

      // Read it back before anything is changed.
      const [raw] = await bucket.file(`${dir}/firestore.json`).download();
      const back = JSON.parse(raw.toString('utf8')) as { docs: { path: string }[] };
      if (back.docs.length !== docs.length || new Set(back.docs.map((d) => d.path)).size !== docs.length) {
        throw new Error(`The backup holds ${back.docs.length} documents, expected ${docs.length}.`);
      }
      return { location: dir, docs: docs.length, files: listing.length };
    },

    async replaceUser(uid, user) {
      await userRef(uid).set(user);
    },

    async resetPages(uid, now) {
      const pages = userRef(uid).collection('pages');
      const before = await pages.listDocuments();
      for (let start = 0; start < PAGE_NUMBERS.length; start += 450) {
        const batch = db.batch();
        for (const n of PAGE_NUMBERS.slice(start, start + 450)) batch.set(pages.doc(String(n)), freshPage(n, now));
        await batch.commit();
      }
      const valid = new Set(PAGE_NUMBERS.map(String));
      for (const d of before) if (!valid.has(d.id)) await d.delete();
      return PAGE_NUMBERS.length;
    },

    async deleteHistory(uid) {
      const ref = userRef(uid);
      const counts: Record<string, number> = {};
      for (const col of await ref.listCollections()) {
        if (col.id === 'pages' || col.id === 'recordings') continue;
        counts[col.id] = (await col.get()).size;
        await db.recursiveDelete(col);
      }
      // The daily log's notes, wherever they are (a day can hold notes without
      // a day document), found by uid as account deletion finds them.
      let notes = 0;
      for (;;) {
        const snap = await db.collectionGroup('entries').where('uid', '==', uid).limit(400).get();
        if (snap.empty) break;
        const batch = db.batch();
        for (const d of snap.docs) if (d.ref.path.startsWith(`${ref.path}/`)) batch.delete(d.ref);
        await batch.commit();
        notes += snap.size;
        if (snap.docs.every((d) => !d.ref.path.startsWith(`${ref.path}/`))) break;
      }
      if (notes) counts.journalNotes = notes;
      // Revo's chats and memory went with the subcollections above; its cached answers are
      // top-level. Its daily count (revoUsage) stays, so a reset can't refill the day.
      const answers = await deleteRevoAnswers(db, uid);
      if (answers) counts.revoAnswers = answers;
      return counts;
    },

    async tombstoneRecordings(uid, now) {
      const recs = await userRef(uid).collection('recordings').get();
      let n = 0;
      for (const d of recs.docs) {
        if (d.data().deletedAt !== undefined) continue;
        await d.ref.set({ deletedAt: now });
        n++;
      }
      return n;
    },

    async deleteRecordingFiles(uid) {
      const [files] = await bucket.getFiles({ prefix: recordingPrefix(uid) });
      for (const f of files) await f.delete();
      return files.length;
    },

    async finish(uid, nowMs, kind = 'reset') {
      const done = kind === 'scenario' ? { scenario: { lastDoneAt: nowMs } } : { lastDoneAt: nowMs };
      await logRef(uid).set({ ...done, updatedAt: Timestamp.fromMillis(nowMs) }, { merge: true });
    },
  };
}
