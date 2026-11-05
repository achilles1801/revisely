import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  AUDIENCE,
  BuildError,
  CallerError,
  GITHUB_JWKS_URL,
  Jwks,
  UnknownKeyError,
  checkCaller,
  nextTesting,
  parseBuild,
  verifyGithubToken,
} from './playAvailable';
import { RESET_CALL_OPTIONS, ResetError, ResetResult, handleResetMyData } from './testerReset';
import { adminResetStore } from './testerResetAdmin';

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
 *  1. Storage recordings/{uid}/ — the audio of backed-up recordings. First, so
 *     that if it fails nothing else is gone yet and a retry starts over.
 *  2. users/{uid}/pages/* — page progress docs
 *  3. users/{uid}/sessions/* — session docs
 *  4. users/{uid}/journal/* — daily journal entries, and their notes
 *     (journal/{day}/entries/*, found by uid: a day can have notes and no day doc)
 *  5. users/{uid}/readingSessions/* — reading timer sessions
 *  6. users/{uid}/stats/* — app usage totals
 *  7. users/{uid}/_quota/* — legacy rate-limit counter docs (if any)
 *  8. users/{uid}/recordings/* — the records of backed-up recordings
 *  9. users/{uid} — user profile doc
 * 10. Firebase Auth user
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

    // The default bucket (from FIREBASE_CONFIG). The slash keeps it to this account.
    await getStorage().bucket().deleteFiles({ prefix: `recordings/${uid}/` });

    await deleteSubcollection('pages');
    await deleteSubcollection('sessions');
    // Notes first, found across every day by uid: a day can hold notes without
    // a day document, so deleting the day documents alone would leave them.
    while (true) {
      const notes = await adminDb.collectionGroup('entries').where('uid', '==', uid).limit(400).get();
      if (notes.empty) break;
      const batch = adminDb.batch();
      for (const doc of notes.docs) batch.delete(doc.ref);
      await batch.commit();
    }
    await deleteSubcollection('journal');
    await deleteSubcollection('readingSessions');
    await deleteSubcollection('stats');
    await deleteSubcollection('_quota');
    await deleteSubcollection('recordings');

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

/**
 * "Reset my data" (Settings, testers only): the caller's account starts again
 * as new, after a backup only an admin can read. Who may, how often and in what
 * order: testerReset.ts. App Check is required.
 */
export const resetMyData = onCall(RESET_CALL_OPTIONS, async (request): Promise<ResetResult> => {
  try {
    const result = await handleResetMyData(request, {
      store: adminResetStore(adminDb, getStorage().bucket()),
      authUser: async (uid) => {
        const u = await getAuth().getUser(uid);
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, photoURL: u.photoURL ?? null };
      },
    });
    logger.info('Tester reset', { backup: result.backup, deleted: result.deleted, files: result.files });
    return result;
  } catch (err) {
    if (err instanceof ResetError) throw new HttpsError(err.code, err.message);
    logger.error('resetMyData failed', err);
    throw new HttpsError('internal', 'The reset did not finish. Try again; anything already reset stays reset.');
  }
});

let jwks: { value: Jwks; at: number } | null = null;

/** GitHub's signing keys, kept for an hour (again at once for a key it doesn't have). */
async function githubJwks(fresh = false): Promise<Jwks> {
  if (!fresh && jwks && Date.now() - jwks.at < 3_600_000) return jwks.value;
  const res = await fetch(GITHUB_JWKS_URL);
  if (!res.ok) throw new Error(`GitHub's keys answered ${res.status}`);
  const value = (await res.json()) as Jwks;
  if (!Array.isArray(value?.keys)) throw new Error("GitHub's keys are not a key set");
  jwks = { value, at: Date.now() };
  return value;
}

/**
 * A build is on Google Play's internal testing track: tell phones (config/app
 * `testing.android`, offered to previewTester accounts on Android). Called only
 * by android-build.yml's `available` job, with its GitHub OIDC token; see
 * playAvailable.ts for who may call and what is written.
 */
export const playBuildAvailable = onRequest(
  { invoker: 'public', maxInstances: 1, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' });
      return;
    }
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    try {
      let claims;
      try {
        claims = verifyGithubToken(token, await githubJwks(), AUDIENCE);
      } catch (err) {
        if (!(err instanceof UnknownKeyError)) throw err;
        claims = verifyGithubToken(token, await githubJwks(true), AUDIENCE);
      }
      checkCaller(claims);
      const build = parseBuild(req.body);
      const ref = adminDb.doc('config/app');
      const result = await adminDb.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).get('testing.android');
        const next = nextTesting(current, build);
        if (!next) return { changed: false, testing: { version: current.version, code: current.code } };
        tx.set(
          ref,
          { testing: { android: { ...next, at: FieldValue.serverTimestamp(), run: String(claims.run_id ?? '') } } },
          { merge: true },
        );
        return { changed: true, testing: next };
      });
      logger.info('Play internal testing build', { ...result, ref: claims.ref, run: claims.run_id });
      res.json(result);
    } catch (err) {
      if (err instanceof CallerError) {
        res.status(403).json({ error: err.message });
      } else if (err instanceof BuildError) {
        res.status(400).json({ error: err.message });
      } else {
        logger.error('playBuildAvailable failed', err);
        res.status(500).json({ error: 'internal' });
      }
    }
  },
);
