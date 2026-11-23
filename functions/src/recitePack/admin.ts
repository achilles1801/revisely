/**
 * recitePack's reads, writes and signing (BEHAVIOUR.md ONDEV-2). The rules are handler.ts's. Everything here is
 * closed to clients in firestore.rules and storage.rules:
 *   recitePacks/current        the pack to give (handler.ts PackConfig)
 *   recitePackKeys/{packId}    { key: base64 of 32 bytes }
 *   recitePackLimits/{uid}     today's calls and device keys
 *   Storage packs/recite/…     the sealed parts, read only through the signed URLs this signs
 *
 * Signing a URL needs the functions' service account to hold Service Account Token Creator on itself
 * (iam.serviceAccounts.signBlob). revisely-dev has it; production has neither the role nor a pack.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import type { PackDeps, PackLimits } from './handler';

function parseLimits(raw: unknown): PackLimits | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { day, calls, keys } = raw as Record<string, unknown>;
  if (typeof day !== 'string' || typeof calls !== 'number' || !Array.isArray(keys)) return null;
  return { day, calls, keys: keys.filter((k): k is string => typeof k === 'string') };
}

export function adminPackDeps(db: Firestore, storage: Storage, now: () => number = Date.now): PackDeps {
  return {
    now,
    async config() {
      const snap = await db.doc('recitePacks/current').get();
      return snap.exists ? snap.data() : null;
    },
    async key(packId) {
      const snap = await db.doc(`recitePackKeys/${packId}`).get();
      const key = snap.get('key');
      return typeof key === 'string' ? Buffer.from(key, 'base64') : null;
    },
    async limits(uid, update) {
      const ref = db.doc(`recitePackLimits/${uid}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const { next, refused } = update(parseLimits(snap.data()));
        tx.set(ref, next);
        return refused;
      });
    },
    async signedUrl(path, expiresAt) {
      const [url] = await storage.bucket().file(path).getSignedUrl({ version: 'v4', action: 'read', expires: expiresAt });
      return url;
    },
  };
}
