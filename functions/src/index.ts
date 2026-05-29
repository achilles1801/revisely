import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

setGlobalOptions({ region: 'us-central1', maxInstances: 3 });

if (getApps().length === 0) {
  initializeApp();
}
const adminDb = getFirestore();

/**
 * Delete the caller's account and all their data.
 * Required by Apple App Store guideline 5.1.1(v).
 *
 * Deletes (in order):
 *  1. users/{uid}/pages/* — page progress docs
 *  2. users/{uid}/sessions/* — session docs
 *  3. users/{uid}/_quota/* — legacy rate-limit counter docs (if any)
 *  4. users/{uid} — user profile doc
 *  5. Firebase Auth user
 *
 * Requires App Check to prevent abuse: an attacker with a stolen ID token
 * could otherwise use this to delete arbitrary accounts they happen to control.
 */
export const deleteUserAccount = onCall(
  { timeoutSeconds: 60, enforceAppCheck: true },
  async (request): Promise<{ ok: true }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;

    const userRef = adminDb.doc(`users/${uid}`);

    async function deleteSubcollection(name: string) {
      while (true) {
        const snap = await userRef.collection(name).limit(400).get();
        if (snap.empty) return;
        const batch = adminDb.batch();
        for (const doc of snap.docs) batch.delete(doc.ref);
        await batch.commit();
      }
    }

    await deleteSubcollection('pages');
    await deleteSubcollection('sessions');
    await deleteSubcollection('_quota');

    await userRef.delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      throw new HttpsError(
        'internal',
        `User data deleted but auth deletion failed: ${(err as Error).message}`,
      );
    }

    return { ok: true };
  },
);
