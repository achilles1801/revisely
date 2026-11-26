import { onCall, onRequest, HttpsError, type CallableResponse } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { failure } from './failure';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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
import type { StreamEvents } from './coach/stream';
import { adminRevoStore, deleteRevoData } from './revo/admin';
import { RevoError, type RevoStreamChunk, handleClear, handleDayInReview, handleRevoAsk, handleSetOptions } from './revo/handler';
import { inTestEmulator, recordedAnthropic, testNow } from './emulator';
import { asTafsirPage, cachedLoader } from './revo/tafsir/pages';
import type { TafsirAnswer } from './revo/tafsir/reply';
import { AdminError, TOTALS_AUDIENCE, consoleOrigins, handleAdminMetrics, handleAdminRevo, handleMetricsTotals, metricsFor, requireAdmin } from './metrics/admin';
import type { Metrics } from './metrics/aggregate';
import {
  ENVIRONMENTS,
  GOOGLE_JWKS_URL,
  Jwks as PeerJwks,
  PeerError,
  UnknownKeyError as PeerKeyError,
  STAFF_JWKS_URL,
  allowedCallers,
  endpointUrl,
  handlePeer,
  metricsEnvironments,
  projectOfServiceAccount,
  verifyPeerToken,
} from './console/peer';
import { adminRevoStore as adminConsoleRevoStore, adminTotalsStore, collector } from './metrics/adminStore';
import { SUPPORT_ORIGINS, SUPPORT_PAGES, SupportError } from './support/logic';
import { handleDevPremium, handleSupportApplication, handleSupportLink } from './support/handler';
import { adminSupportStore, deleteSupportData } from './support/admin';
import { AccountInfo, consoleErrorOf, handleAdminConsole } from './console/handler';
import { StaffCaller, roleOf } from './console/roles';
import { earlyAccessOn, grantEarlyAccess } from './support/early';
import { PackError, handleRecitePack } from './recitePack/handler';
import { adminPackDeps } from './recitePack/admin';

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
 * 10. The support program's and Premium's documents (application, entitlements,
 *     link codes, limits)
 * 11. users/{uid} — user profile doc
 * 12. Firebase Auth user
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
    // The account's picture and anything else under its own folder (storage.rules: users/<uid>/profile/).
    await getStorage().bucket().deleteFiles({ prefix: `users/${uid}/` });
    // The takes "Help improve mistake detection" kept (RECITE-26): the checker writes them under recite-tests/<uid>/ of
    // this same default bucket (its BUCKET), out of every client's reach (storage.rules).
    await getStorage().bucket().deleteFiles({ prefix: `recite-tests/${uid}/` });

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
    // Recite's memory: each take's marks and the words cleared by hand (lib/reciteMemory).
    await deleteSubcollection('reciteTakes');

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
    await deleteSupportData(adminDb, uid);

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
    logger.error(failure('resetMyData', err));
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
    logger.error(failure('loadTestScenario', err));
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
        logger.error(failure('playBuildAvailable', err));
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
      logger.error(failure('askCoach', err));
      throw new HttpsError('internal', 'The coach is unavailable. Try again.');
    }
  },
);

export const setCoachOptIn = onCall({ enforceAppCheck: true, maxInstances: 2 }, async (request) => {
  try {
    return await handleSetOptIn(request.auth, request.data, coachDeps(request));
  } catch (err) {
    if (err instanceof CoachError) throw new HttpsError(err.code, err.message);
    logger.error(failure('setCoachOptIn', err));
    throw new HttpsError('internal', 'The setting did not save. Try again.');
  }
});

/**
 * Revo, the in-app assistant (the accounts config/app.revo opens it to, once turned on): 20 new
 * questions an account a revision day, the Ask coach's monthly cap and key, and a daily share of
 * the month. See functions/src/revo/.
 */
/**
 * Revo's copy of the tafsirs (revo/tafsir/pages.ts): the default bucket's tafsir/v1/p<page>.json, kept by the instance.
 * In the test emulator, the pages in test-recordings/tafsir (page 379) stand in for Storage.
 */
const tafsirPages = cachedLoader(async (page) => {
  if (inTestEmulator()) {
    const file = join(__dirname, '..', 'test-recordings', 'tafsir', `p${page}.json`);
    return asTafsirPage(JSON.parse(readFileSync(file, 'utf8')), page);
  }
  const [bytes] = await getStorage().bucket().file(`tafsir/v1/p${page}.json`).download();
  return asTafsirPage(JSON.parse(bytes.toString('utf8')), page);
});

/** "What's happening here?" answered ahead for a page (revo/tafsir/ahead.ts); null when there is none. Kept by the instance. */
const aheadAnswers = new Map<number, Promise<TafsirAnswer | null>>();
function tafsirAhead(page: number): Promise<TafsirAnswer | null> {
  if (!aheadAnswers.has(page)) {
    const read = async (): Promise<TafsirAnswer | null> => {
      if (inTestEmulator()) {
        const file = join(__dirname, '..', 'test-recordings', 'tafsir', 'answers', `p${page}.json`);
        return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as TafsirAnswer) : null;
      }
      const file = getStorage().bucket().file(`tafsir/answers/v1/p${page}.json`);
      const [exists] = await file.exists();
      if (!exists) return null;
      const [bytes] = await file.download();
      return JSON.parse(bytes.toString('utf8')) as TafsirAnswer;
    };
    aheadAnswers.set(page, read().catch(() => null));
  }
  return aheadAnswers.get(page)!;
}

/** Revo's dependencies; with the callable's response when the phone asked for the answer as it is written. */
function revoDeps(caller: CallerRequest & { acceptsStreaming?: boolean }, response?: CallableResponse<RevoStreamChunk>) {
  return {
    store: adminRevoStore(adminDb),
    tafsirPages,
    tafsirAhead,
    call: (request: Parameters<typeof callCoach>[0], stream?: StreamEvents) =>
      callCoach(request, { apiKey: ANTHROPIC_COACH_KEY.value(), fetch: anthropicFor(caller.auth?.uid), ...(stream ? { onStream: stream } : {}) }),
    ...(caller.acceptsStreaming && response
      ? {
          stream: (chunk: RevoStreamChunk) => {
            // A chunk the phone didn't take (it went away) changes nothing: the answer is still kept.
            void response.sendChunk(chunk).catch(() => undefined);
          },
        }
      : {}),
    now: clockOf(caller.rawRequest),
    // Each line names the account (its pseudonymous uid), so the metrics collector can add up use and
    // cost per account (scripts/metrics). Logs are kept 30 days; never the question, answer or notes.
    log: (entry: Record<string, unknown>) => logger.info('revo', { ...entry, uid: caller.auth?.uid }),
  };
}

// Each call waits on the model for seconds, one call per instance: 3 instances served only 3 people
// at once, and a 4th waited or was turned away. 30 is for Revo open to everyone (REVO-37); idle
// instances cost nothing.
const REVO_CALL_OPTIONS = { enforceAppCheck: true, secrets: [ANTHROPIC_COACH_KEY], timeoutSeconds: 90, memory: '256MiB' as const, maxInstances: 30 };

/** A RevoError as the app sees it; anything else is logged (no content) and answered as internal. */
function revoFailure(name: string, err: unknown, message: string): HttpsError {
  if (err instanceof RevoError) return new HttpsError(err.code, err.message, err.details);
  logger.error(failure(name, err));
  return new HttpsError('internal', message);
}

export const revoAsk = onCall(REVO_CALL_OPTIONS, async (request, response) => {
  try {
    return await handleRevoAsk(request.auth, request.data, revoDeps(request, response));
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
      logger.error(failure('coachDigestDays', err));
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
// The test emulator serves the console from localhost.
const CONSOLE_ORIGINS: (string | RegExp)[] = testing ? [...consoleOrigins(PROJECT), /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] : consoleOrigins(PROJECT);
const metricsCollector = collector(adminDb, PROJECT, { emulator: process.env.FUNCTIONS_EMULATOR === 'true' });
const adminLog = (entry: Record<string, unknown>) => logger.info('admin', entry);

function adminFailure(name: string, err: unknown): HttpsError {
  if (err instanceof AdminError) return new HttpsError(err.code, err.message);
  logger.error(failure(name, err));
  return new HttpsError('internal', 'The console could not load that. Try again.');
}

/**
 * The caller's account as the console sees it: its custom claims read live from Firebase Auth (not the ID token's
 * copy, which lasts an hour), so a role taken away with set-role.js stops working at the next call.
 */
async function staffClaims(auth: { uid: string } | undefined): Promise<{ uid: string; email: string | null; claims: Record<string, unknown> } | null> {
  if (!auth?.uid) return null;
  try {
    const user = await getAuth().getUser(auth.uid);
    if (user.disabled) return null;
    return { uid: user.uid, email: user.email ?? null, claims: (user.customClaims ?? {}) as Record<string, unknown> };
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return null;
    throw err;
  }
}

async function liveCaller(auth: { uid: string } | undefined) {
  const staff = await staffClaims(auth);
  return staff ? { uid: staff.uid, token: staff.claims } : undefined;
}

/**
 * The other environment's console data (console/peer.ts): asked of that project's consoleMetrics with a Google-signed
 * ID token for this project's own service account, from the metadata server. Its refusals come back as they were.
 */
async function peerCall<T>(env: string, body: Record<string, unknown>): Promise<T> {
  const target = metricsEnvironments(PROJECT).find((e) => !e.here && e.env === env);
  if (!target) throw new AdminError('invalid-argument', 'This console can’t show that environment.');
  const url = endpointUrl(target.project);
  let token: string;
  try {
    const r = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(url)}&format=full`,
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    if (!r.ok) throw new Error(`metadata server answered ${r.status}`);
    token = await r.text();
  } catch (err) {
    logger.warn(`peer call: no identity token: ${(err as Error).message}`);
    throw new AdminError('unavailable', `${target.label} can’t be asked from here.`);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  }).catch((err) => {
    logger.warn(`peer call: ${(err as Error).message}`);
    return null;
  });
  if (!res) throw new AdminError('unavailable', `${target.label} didn’t answer. Try again.`);
  const answer = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok || !answer) {
    const code = answer?.code;
    if (code === 'permission-denied' || code === 'not-found' || code === 'invalid-argument' || code === 'unauthenticated') {
      throw new AdminError(code, String(answer?.error ?? 'Refused.'));
    }
    logger.warn(`peer call: ${target.project} answered ${res.status}: ${String(answer?.error ?? '').slice(0, 200)}`);
    throw new AdminError('unavailable', `${target.label} didn’t answer (${res.status}). Try again.`);
  }
  return answer;
}

/** The caller's own Firebase ID token, as the callable received it (forwarded so the other project can check the person). */
function bearerOf(raw: { headers?: Record<string, string | string[] | undefined> } | undefined): string | null {
  const h = raw?.headers?.authorization;
  const v = Array.isArray(h) ? h[0] : h;
  return typeof v === 'string' && v.startsWith('Bearer ') ? v.slice(7).trim() : null;
}

export const adminMetrics = onCall({ cors: CONSOLE_ORIGINS, timeoutSeconds: 120, memory: '512MiB', maxInstances: 2 }, async (request) => {
  try {
    return await handleAdminMetrics(await liveCaller(request.auth), request.data, {
      collect: metricsCollector,
      now: () => Date.now(),
      log: adminLog,
      here: ENVIRONMENTS[PROJECT]?.env,
      peer: (env, refresh) => peerCall<Metrics>(env, { action: 'metrics', refresh }),
    });
  } catch (err) {
    throw adminFailure('adminMetrics', err);
  }
});

export const adminRevo = onCall({ cors: CONSOLE_ORIGINS, timeoutSeconds: 60, maxInstances: 2 }, async (request) => {
  try {
    const caller = await liveCaller(request.auth);
    const data = (request.data && typeof request.data === 'object' ? request.data : {}) as { uid?: unknown; chatId?: unknown; env?: unknown };
    // Another environment's account (console/peer.ts): this caller's live role first, then that project checks the
    // person again from their own ID token before it reads anything.
    if (data.env != null && data.env !== ENVIRONMENTS[PROJECT]?.env) {
      const reader = requireAdmin(caller, 'revo.conversations');
      const staffToken = bearerOf(request.rawRequest);
      if (typeof data.env !== 'string' || !staffToken) throw new AdminError('invalid-argument', 'This console can’t show that environment.');
      adminLog({ event: 'read-revo.peer', reader, env: data.env, account: data.uid });
      return await peerCall(data.env, { action: 'revo', uid: data.uid, chatId: data.chatId, staffToken });
    }
    return await handleAdminRevo(caller, request.data, { store: adminConsoleRevoStore(adminDb), log: adminLog });
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
      logger.error(failure('metricsTotals', err));
      res.status(500).json({ error: 'internal' });
    }
  }
});

const keyCache: Record<string, { value: PeerJwks; at: number }> = {};

/** A key set (Google's for service accounts, Firebase Auth's for ID tokens), kept for an hour (again at once on demand). */
async function keySet(url: string, fresh = false): Promise<PeerJwks> {
  const hit = keyCache[url];
  if (!fresh && hit && Date.now() - hit.at < 3_600_000) return hit.value;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`keys at ${url} answered ${res.status}`);
  const value = (await res.json()) as PeerJwks;
  if (!Array.isArray(value?.keys)) throw new Error(`keys at ${url} are not a key set`);
  keyCache[url] = { value, at: Date.now() };
  return value;
}

const PEER_STATUS: Record<string, number> = { unauthenticated: 401, 'permission-denied': 403, 'invalid-argument': 400, 'not-found': 404 };

/**
 * This project's console data for the other environment's console (console/peer.ts: production answers revisely-dev's
 * server only). The caller proves it is that project's service account with a Google-signed ID token for this URL.
 * `metrics`: the Overview's numbers. `revo`: one account's conversations, only with the staff member's own ID token
 * from the caller's project (role revo.conversations), under this project's conversations lock, each read logged.
 */
export const consoleMetrics = onRequest({ invoker: 'public', maxInstances: 2, timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  try {
    const allowed = allowedCallers(PROJECT);
    if (!allowed.length) throw new PeerError(403, 'this project shares its console data with nobody');
    let caller: string;
    try {
      caller = verifyPeerToken(token, await keySet(GOOGLE_JWKS_URL), endpointUrl(PROJECT), allowed);
    } catch (err) {
      if (!(err instanceof PeerKeyError)) throw err;
      caller = verifyPeerToken(token, await keySet(GOOGLE_JWKS_URL, true), endpointUrl(PROJECT), allowed);
    }
    const callerProject = projectOfServiceAccount(caller);
    if (!callerProject) throw new PeerError(403, 'unknown caller');
    const answer = await handlePeer(req.body, callerProject, {
      metrics: (refresh) => metricsFor(null, refresh, { collect: metricsCollector, now: () => Date.now(), log: adminLog }),
      revo: (staff, data) => handleAdminRevo(staff, data, { store: adminConsoleRevoStore(adminDb), log: adminLog }),
      staffJwks: (fresh) => keySet(STAFF_JWKS_URL, fresh),
      now: () => Date.now(),
    });
    adminLog({ event: 'console.shared', caller, action: (req.body as { action?: unknown } | undefined)?.action ?? 'metrics' });
    res.json(answer);
  } catch (err) {
    if (err instanceof PeerError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof AdminError) {
      res.status(PEER_STATUS[err.code] ?? 400).json({ error: err.message, code: err.code });
    } else {
      logger.error(`consoleMetrics failed: ${(err as Error).message}`);
      res.status(500).json({ error: 'internal' });
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
// The support program and Premium (support/logic.ts). The project id picks the program page: a project without one
// (production, until Majd moves it there) refuses links, so applications stay in revisely-dev.

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? '';
const DEV_PROJECT = PROJECT_ID === 'revisely-dev';

function supportStore() {
  return adminSupportStore(adminDb, async (uid) => {
    try {
      const u = await getAuth().getUser(uid);
      return { email: u.email ?? null, providers: u.providerData.map((p) => p.providerId) };
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found') return null;
      throw err;
    }
  });
}

async function supportCall<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof SupportError) throw new HttpsError(err.code, err.message);
    // The reason and the frames, never the request's data: it may hold someone's answers.
    logger.error(failure(name, err));
    throw new HttpsError('internal', 'Something went wrong. Try again in a minute.');
  }
}

/** "Can't afford it? Apply for support" in the app: a 30-minute link to the program page for this account. */
export const supportLink = onCall({ enforceAppCheck: true, maxInstances: 2, timeoutSeconds: 20 }, (request) =>
  supportCall('supportLink', () => handleSupportLink(request, supportStore(), SUPPORT_PAGES[PROJECT_ID])),
);

/**
 * The program page's calls: the account's state, or the application. Called from a browser, so App Check isn't
 * enforced here: a code from supportLink (made with App Check) or the caller's own sign-in names the account.
 */
export const supportApplication = onCall(
  { cors: SUPPORT_ORIGINS, enforceAppCheck: false, maxInstances: 2, timeoutSeconds: 20 },
  (request) => supportCall('supportApplication', () => handleSupportApplication(request, supportStore(), SUPPORT_PAGES[PROJECT_ID])),
);

/** Get Premium in the Revisely Dev app (no money): Premium from source "dev". revisely-dev only. */
export const devGrantPremium = onCall({ enforceAppCheck: true, maxInstances: 2, timeoutSeconds: 20 }, (request) =>
  supportCall('devGrantPremium', () => handleDevPremium(request, supportStore(), DEV_PROJECT || testing, true)),
);

/** Takes the "dev" grant (and early access's) back, so a tester can see Check locked again. revisely-dev only. */
export const devRevokePremium = onCall({ enforceAppCheck: true, maxInstances: 2, timeoutSeconds: 20 }, (request) =>
  supportCall('devRevokePremium', () => handleDevPremium(request, supportStore(), DEV_PROJECT || testing, false)),
);

// ---------------------------------------------------------------------------------------------------------------
// Revisely Console beyond the metrics (console/handler.ts): the caller's role, Open Door's queue and decisions, the
// audit log. Roles and permissions: console/roles.ts. App Check is checked per action (every action but `me`, which
// only says what the caller may see), so the page can show its no-access screen before App Check has a token.

function accountInfo(u: { uid: string; email?: string; providerData: { providerId: string }[]; metadata: { creationTime?: string; lastSignInTime?: string }; disabled: boolean }): AccountInfo {
  const email = u.email ?? null;
  return {
    uid: u.uid,
    exists: true,
    email,
    emailHidden: !!email && /@privaterelay\.appleid\.com$/i.test(email),
    providers: u.providerData.map((p) => p.providerId),
    createdAt: u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : null,
    lastSignInAt: u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : null,
    disabled: u.disabled,
  };
}

const missingAccount = (uid: string): AccountInfo => ({ uid, exists: false, email: null, emailHidden: false, providers: [], createdAt: null, lastSignInAt: null, disabled: false });

const consoleDeps = {
  db: adminDb,
  async accounts(uids: string[]) {
    const out = new Map<string, AccountInfo>();
    const unique = [...new Set(uids)];
    for (let i = 0; i < unique.length; i += 100) {
      const res = await getAuth().getUsers(unique.slice(i, i + 100).map((uid) => ({ uid })));
      for (const u of res.users) out.set(u.uid, accountInfo(u));
    }
    for (const uid of unique) if (!out.has(uid)) out.set(uid, missingAccount(uid));
    return out;
  },
  async accountByEmail(email: string) {
    try {
      return accountInfo(await getAuth().getUserByEmail(email));
    } catch (err) {
      if ((err as { code?: string }).code === 'auth/user-not-found' || (err as { code?: string }).code === 'auth/invalid-email') return null;
      throw err;
    }
  },
  async hasPlan(uid: string) {
    return (await adminDb.doc(`users/${uid}`).get()).exists;
  },
  programOpen: !!SUPPORT_PAGES[PROJECT_ID] || testing,
  project: PROJECT_ID,
  metricsEnvs: metricsEnvironments(PROJECT_ID).map(({ env, label, here }) => ({ env, label, here })),
  now: () => Date.now(),
  log: (entry: Record<string, unknown>) => logger.info('console', entry),
};

export const adminConsole = onCall({ cors: CONSOLE_ORIGINS, timeoutSeconds: 60, maxInstances: 3 }, async (request) => {
  try {
    const staff = await staffClaims(request.auth);
    const caller: StaffCaller | null = staff ? { uid: staff.uid, email: staff.email, role: roleOf(staff.claims) } : null;
    // The test emulator decodes App Check tokens without verifying them, and the console there has none.
    return await handleAdminConsole(caller, request.data, !!request.app || testing, consoleDeps);
  } catch (err) {
    const known = consoleErrorOf(err);
    if (known) throw new HttpsError(known.code, known.message);
    // Never the request's data: it may hold a note.
    logger.error('adminConsole failed', { message: (err as Error).message });
    throw new HttpsError('internal', 'The console could not do that. Try again.');
  }
});

/**
 * Premium early access (support/early.ts): an account set up while config/app.earlyAccess is on gets Premium with no
 * end date, kept for good. The user document is created once, when the app sets the account up; a grant already there
 * is never changed. With the switch off (production until Majd turns it on) this reads config/app and stops.
 */
export const earlyAccessOnSignUp = onDocumentCreated({ document: 'users/{uid}', maxInstances: 5, timeoutSeconds: 30 }, async (event) => {
  const uid = event.params.uid;
  const config = (await adminDb.doc('config/app').get()).data();
  if (!earlyAccessOn(config)) return;
  try {
    await grantEarlyAccess(adminDb, uid);
  } catch (err) {
    logger.error('early access: grant failed', { uid, err: String((err as Error)?.message ?? err) });
    throw err;
  }
});

/**
 * Premium for the caller now, while early access is on (PREM-1): marking mistakes' intro, for an account the sign-up
 * grant or the script hasn't reached. Off: refused, and nothing is written.
 */
export const claimEarlyAccess = onCall({ enforceAppCheck: true, maxInstances: 3, timeoutSeconds: 20 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (!earlyAccessOn((await adminDb.doc('config/app').get()).data())) {
    throw new HttpsError('failed-precondition', 'Premium isn’t in early access now.');
  }
  await grantEarlyAccess(adminDb, uid);
  return { premium: true };
});

/**
 * Recite's pack for the phone (Revisely Dev, BEHAVIOUR.md ONDEV-2): short-lived signed URLs for its sealed parts and
 * its key wrapped to the caller's device key. Who may and how often: recitePack/handler.ts. App Check is required.
 * Production has no pack (recitePacks/current), so it refuses there.
 */
export const recitePack = onCall({ enforceAppCheck: true, maxInstances: 5, timeoutSeconds: 30 }, async (request) => {
  try {
    return await handleRecitePack(
      { auth: request.auth ?? null, app: request.app ? { appId: request.app.appId } : null, data: request.data },
      adminPackDeps(adminDb, getStorage()),
    );
  } catch (err) {
    if (err instanceof PackError) throw new HttpsError(err.code, err.message);
    logger.error(failure('recitePack', err));
    throw new HttpsError('internal', 'The pack couldn’t be prepared. Try again later.');
  }
});
