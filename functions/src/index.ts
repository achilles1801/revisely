import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
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
import { ScenarioResult, handleLoadTestScenario } from './testScenarios';
import { adminScenarioWriter } from './testScenariosAdmin';
import { defineSecret } from 'firebase-functions/params';
import { checkDigestCaller, DIGEST_AUDIENCE, ledgerDayCounts, parseWeek } from './coachDigest';
import { adminCoachStore } from './coach/admin';
import { CoachError, handleAskCoach, handleSetOptIn } from './coach/handler';
import { callCoach } from './coach/call';
import { adminRevoStore, deleteRevoData } from './revo/admin';
import { RevoError, handleClear, handleDayInReview, handleRevoAsk, handleSetOptions } from './revo/handler';
import { inTestEmulator, recordedAnthropic, testNow } from './emulator';
import { AdminError, TOTALS_AUDIENCE, handleAdminMetrics, handleAdminRevo, handleMetricsTotals } from './metrics/admin';
import { adminRevoStore as adminConsoleRevoStore, adminTotalsStore, collector } from './metrics/adminStore';

setGlobalOptions({ region: 'us-central1', maxInstances: 3 });

if (getApps().length === 0) {
  initializeApp();
}
const adminDb = getFirestore();

// The Firebase emulator with a demo project (the scenario tests and E2E; emulator.ts): Anthropic
// answers with recorded real replies, and a request's clock may follow the caller's test clock.
// Deployed, both are off and these are the real fetch and the real clock.
const testing = inTestEmulator();
const anthropicFor = (uid: string | undefined) => (testing ? recordedAnthropic(adminDb, uid) : undefined);

/**
 * The clock for one request: the real one, or (test emulator) the caller's test time, which stands
 * for the request (a scenario's clock stands still, so a server clock running on from it would put
 * the server ahead of the phone).
 */
function clockOf(raw: { headers?: Record<string, string | string[] | undefined> } | undefined): () => Date {
  const at = testNow(raw?.headers);
  if (at == null) return () => new Date();
  return () => new Date(at);
}

/** The reset's store, on the request's clock. */
function resetStoreFor(raw: { headers?: Record<string, string | string[] | undefined> } | undefined, bucket: ReturnType<ReturnType<typeof getStorage>['bucket']>) {
  const store = adminResetStore(adminDb, bucket);
  if (testNow(raw?.headers) != null) {
    const now = clockOf(raw);
    store.now = () => {
      const ms = now().getTime();
      return { stamp: Timestamp.fromMillis(ms), ms, iso: new Date(ms).toISOString() };
    };
  }
  return store;
}

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
 *  9. The Ask coach's and Revo's documents (Revo's chats with their messages,
 *     memory, cached answers and daily count)
 * 10. users/{uid} — user profile doc
 * 11. Firebase Auth user
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

    // The Ask coach's documents: top-level, keyed by uid (functions/src/coach/admin.ts).
    for (const col of ['coachAnswers', 'coachUsage'] as const) {
      while (true) {
        const snap = await adminDb.collection(col).where('uid', '==', uid).limit(400).get();
        if (snap.empty) break;
        const batch = adminDb.batch();
        for (const doc of snap.docs) batch.delete(doc.ref);
        await batch.commit();
      }
    }
    await adminDb.doc(`coachSettings/${uid}`).delete();
    // Revo's: chats (with every messages subcollection), memory, cached answers, the daily count.
    await deleteRevoData(adminDb, uid, { usage: true });

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
      store: resetStoreFor(request.rawRequest, getStorage().bucket()),
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

/**
 * Settings → Testing → Load test scenario (testers only): the caller's account is
 * reset as resetMyData does it (the same backup first), then filled with the
 * chosen scenario. Who may and the order: testScenarios.ts. App Check is required.
 */
export const loadTestScenario = onCall(RESET_CALL_OPTIONS, async (request): Promise<ScenarioResult> => {
  try {
    const bucket = getStorage().bucket();
    const result = await handleLoadTestScenario(request, {
      store: resetStoreFor(request.rawRequest, bucket),
      writer: adminScenarioWriter(adminDb, bucket),
      authUser: async (uid) => {
        const u = await getAuth().getUser(uid);
        return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, photoURL: u.photoURL ?? null };
      },
    });
    logger.info('Test scenario loaded', { scenario: result.scenario, backup: result.backup, seeded: result.seeded });
    return result;
  } catch (err) {
    if (err instanceof ResetError) throw new HttpsError(err.code, err.message);
    logger.error('loadTestScenario failed', err);
    throw new HttpsError('internal', 'The scenario did not finish loading. Try again (the account was backed up first).');
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

/**
 * The Ask coach (C6, previewTester accounts that opted in): one answer per insight and revision
 * day, at most 5 new answers a user a day, and a monthly cap in dollars. The key is the
 * ANTHROPIC_COACH_KEY secret; it never reaches the app. See functions/src/coach/.
 */
const ANTHROPIC_COACH_KEY = defineSecret('ANTHROPIC_COACH_KEY');

type CallerRequest = { auth?: { uid: string }; rawRequest?: { headers?: Record<string, string | string[] | undefined> } };

function coachDeps(caller: CallerRequest) {
  return {
    store: adminCoachStore(adminDb),
    call: (request: Parameters<typeof callCoach>[0]) =>
      callCoach(request, { apiKey: ANTHROPIC_COACH_KEY.value(), fetch: anthropicFor(caller.auth?.uid) }),
    now: clockOf(caller.rawRequest),
    log: (entry: Record<string, unknown>) => logger.info('coach', entry),
  };
}

export const askCoach = onCall(
  { enforceAppCheck: true, secrets: [ANTHROPIC_COACH_KEY], timeoutSeconds: 90, memory: '256MiB', maxInstances: 2 },
  async (request) => {
    try {
      return await handleAskCoach(request.auth, request.data, coachDeps(request));
    } catch (err) {
      if (err instanceof CoachError) throw new HttpsError(err.code, err.message);
      logger.error('askCoach failed', err);
      throw new HttpsError('internal', 'The coach is unavailable. Try again.');
    }
  },
);

export const setCoachOptIn = onCall({ enforceAppCheck: true, maxInstances: 2 }, async (request) => {
  try {
    return await handleSetOptIn(request.auth, request.data, coachDeps(request));
  } catch (err) {
    if (err instanceof CoachError) throw new HttpsError(err.code, err.message);
    logger.error('setCoachOptIn failed', err);
    throw new HttpsError('internal', 'The setting did not save. Try again.');
  }
});

/**
 * Revo, the in-app assistant (the accounts config/app.revo opens it to, once turned on): 20 new
 * questions an account a revision day, the Ask coach's monthly cap and key, and a daily share of
 * the month. See functions/src/revo/.
 */
function revoDeps(caller: CallerRequest) {
  return {
    store: adminRevoStore(adminDb),
    call: (request: Parameters<typeof callCoach>[0]) =>
      callCoach(request, { apiKey: ANTHROPIC_COACH_KEY.value(), fetch: anthropicFor(caller.auth?.uid) }),
    now: clockOf(caller.rawRequest),
    log: (entry: Record<string, unknown>) => logger.info('revo', entry),
  };
}

// Each call waits on the model for seconds, one call per instance: 3 instances served only 3 people
// at once, and a 4th waited or was turned away. 30 is for Revo open to everyone (REVO-37); idle
// instances cost nothing.
const REVO_CALL_OPTIONS = { enforceAppCheck: true, secrets: [ANTHROPIC_COACH_KEY], timeoutSeconds: 90, memory: '256MiB' as const, maxInstances: 30 };

/** A RevoError as the app sees it; anything else is logged (no content) and answered as internal. */
function revoFailure(name: string, err: unknown, message: string): HttpsError {
  if (err instanceof RevoError) return new HttpsError(err.code, err.message, err.details);
  logger.error(`${name} failed`, err);
  return new HttpsError('internal', message);
}

export const revoAsk = onCall(REVO_CALL_OPTIONS, async (request) => {
  try {
    return await handleRevoAsk(request.auth, request.data, revoDeps(request));
  } catch (err) {
    throw revoFailure('revoAsk', err, 'Revo is unavailable. Try again.');
  }
});

export const revoDayInReview = onCall(REVO_CALL_OPTIONS, async (request) => {
  try {
    return await handleDayInReview(request.auth, request.data, revoDeps(request));
  } catch (err) {
    throw revoFailure('revoDayInReview', err, 'Revo is unavailable. Try again.');
  }
});

export const revoSetOptions = onCall({ enforceAppCheck: true, timeoutSeconds: 60, maxInstances: 3 }, async (request) => {
  try {
    return await handleSetOptions(request.auth, request.data, revoDeps(request));
  } catch (err) {
    throw revoFailure('revoSetOptions', err, 'The setting did not save. Try again.');
  }
});

export const revoClear = onCall({ enforceAppCheck: true, timeoutSeconds: 60, maxInstances: 3 }, async (request) => {
  try {
    return await handleClear(request.auth, request.data, revoDeps(request));
  } catch (err) {
    throw revoFailure('revoClear', err, 'The delete did not finish. Try again.');
  }
});

/**
 * The Ask coach's ledger for one week, for the weekly digest (stats-digest.yml, via its GitHub OIDC
 * token): the coachLedgerDay counts, no user and no content. See coachDigest.ts for who may read.
 */
export const coachDigestDays = onRequest({ invoker: 'public', maxInstances: 1, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  try {
    let claims;
    try {
      claims = verifyGithubToken(token, await githubJwks(), DIGEST_AUDIENCE);
    } catch (err) {
      if (!(err instanceof UnknownKeyError)) throw err;
      claims = verifyGithubToken(token, await githubJwks(true), DIGEST_AUDIENCE);
    }
    checkDigestCaller(claims);
    const { start, end } = parseWeek(req.query as Record<string, unknown>);
    const snap = await adminDb.collection('coachLedgerDay').where('day', '>=', start).where('day', '<=', end).get();
    const days = snap.docs.map((d) => ledgerDayCounts(d.data() as Record<string, unknown>)).sort((a, b) => String(a.day).localeCompare(String(b.day)));
    logger.info('Coach digest read', { start, end, days: days.length, run: claims.run_id });
    res.json({ days });
  } catch (err) {
    if (err instanceof CallerError) {
      res.status(err.message.startsWith('start') || err.message.startsWith('end') || err.message.startsWith('at most') ? 400 : 403).json({ error: err.message });
    } else {
      logger.error('coachDigestDays failed', err);
      res.status(500).json({ error: 'internal' });
    }
  }
});

/**
 * The owner's metrics console (functions/src/metrics, scripts/metrics/README.md). The page is on Firebase
 * Hosting (admin/); only an account whose ID token carries `admin: true` (functions/scripts/set-admin.js)
 * gets anything back. No App Check: the page is a website, and the claim is the gate.
 */
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'revision-buddy-3a398';
const CONSOLE_ORIGINS = [`https://${PROJECT}.web.app`, `https://${PROJECT}.firebaseapp.com`];
const metricsCollector = collector(adminDb, PROJECT, { emulator: process.env.FUNCTIONS_EMULATOR === 'true' });
const adminLog = (entry: Record<string, unknown>) => logger.info('admin', entry);

function adminFailure(name: string, err: unknown): HttpsError {
  if (err instanceof AdminError) return new HttpsError(err.code, err.message);
  logger.error(`${name} failed`, err);
  return new HttpsError('internal', 'The console could not load that. Try again.');
}

export const adminMetrics = onCall({ cors: CONSOLE_ORIGINS, timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (request) => {
  try {
    return await handleAdminMetrics(request.auth, request.data, { collect: metricsCollector, now: () => Date.now(), log: adminLog });
  } catch (err) {
    throw adminFailure('adminMetrics', err);
  }
});

export const adminRevo = onCall({ cors: CONSOLE_ORIGINS, timeoutSeconds: 60, maxInstances: 2 }, async (request) => {
  try {
    return await handleAdminRevo(request.auth, request.data, { store: adminConsoleRevoStore(adminDb), log: adminLog });
  } catch (err) {
    throw adminFailure('adminRevo', err);
  }
});

/** The Metrics workflow's Sentry and App Store totals, every hour, with its GitHub OIDC token. */
export const metricsTotals = onRequest({ invoker: 'public', maxInstances: 1, timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  try {
    let claims;
    try {
      claims = verifyGithubToken(token, await githubJwks(), TOTALS_AUDIENCE);
    } catch (err) {
      if (!(err instanceof UnknownKeyError)) throw err;
      claims = verifyGithubToken(token, await githubJwks(true), TOTALS_AUDIENCE);
    }
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    res.json(await handleMetricsTotals(claims, raw, { store: adminTotalsStore(adminDb), collect: metricsCollector, now: () => Date.now(), log: adminLog }));
  } catch (err) {
    if (err instanceof CallerError) {
      res.status(/too large|JSON|object|missing/.test(err.message) ? 400 : 403).json({ error: err.message });
    } else {
      logger.error('metricsTotals failed', err);
      res.status(500).json({ error: 'internal' });
    }
  }
});
