/**
 * "Reset my data" for testers (Settings, previewTester accounts only): the
 * caller's own account starts again as new, as functions/scripts/reset-account.js
 * does it from a laptop. Kept free of firebase-admin so the rules of it can be
 * tested on their own; testerResetAdmin.ts does the reading and writing.
 *
 * Who may: a signed-in caller with App Check (the callable enforces both), whose
 * user document says `previewTester: true` (read on the server; clients can't
 * write that field), with `confirm: 'RESET'`. Only the caller's uid is ever
 * touched; nothing in the payload names an account.
 *
 * How often: one finished reset per RESET_GAP_MS, and RESET_ATTEMPTS_PER_DAY
 * attempts a day (UTC), kept in adminResets/<uid> (closed to clients).
 *
 * Order: back up everything, read the backup back, and only then change
 * anything. A failed backup changes nothing. A reset that fails half way can be
 * run again: each step writes the end state, whatever it found.
 */

export const RESET_CONFIRM = 'RESET';
export const RESET_GAP_MS = 10 * 60_000;
export const RESET_ATTEMPTS_PER_DAY = 10;
const TOTAL_PAGES = 604;
/** Never reset these, tester or not (App Review signs in with it). */
const PROTECTED_EMAILS = ['applereview@revisely.app'];

/** The callable's options (index.ts): App Check is required, as for account deletion. */
export const RESET_CALL_OPTIONS = {
  enforceAppCheck: true,
  timeoutSeconds: 300,
  memory: '512MiB' as const,
  maxInstances: 2,
};

export type ResetErrorCode =
  | 'unauthenticated'
  | 'failed-precondition'
  | 'invalid-argument'
  | 'permission-denied'
  | 'resource-exhausted'
  | 'internal';

export class ResetError extends Error {
  constructor(
    readonly code: ResetErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** What adminResets/<uid> holds. */
export interface ResetLog {
  /** UTC day of `attempts`. */
  day?: string;
  attempts?: number;
  /** When the last reset finished (ms). */
  lastDoneAt?: number | null;
}

/** Whether a reset may start now, and the log to write if so. */
export function claimReset(log: ResetLog | null, nowMs: number): { ok: true; next: ResetLog } | { ok: false; reason: string } {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const last = log?.lastDoneAt ?? null;
  if (last != null && nowMs - last < RESET_GAP_MS) {
    const minutes = Math.ceil((RESET_GAP_MS - (nowMs - last)) / 60_000);
    return { ok: false, reason: `You reset less than 10 minutes ago. Try again in ${minutes} min.` };
  }
  const attempts = log?.day === day ? (log.attempts ?? 0) : 0;
  if (attempts >= RESET_ATTEMPTS_PER_DAY) {
    return { ok: false, reason: `That's ${RESET_ATTEMPTS_PER_DAY} resets today. Try again tomorrow (UTC).` };
  }
  return { ok: true, next: { day, attempts: attempts + 1, lastDoneAt: last } };
}

export interface AuthInfo {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

/**
 * What sign-up writes (createUser in src/services/firestoreService.ts), plus
 * `previewTester` (kept: the caller is one) and `dataResetAt`, which tells
 * phones that what they hold is from before the reset (src/lib/offline/reset.ts).
 * The same as reset-account.js's freshUser.
 */
export function freshUser(auth: AuthInfo, now: unknown, nowIso: string): Record<string, unknown> {
  return {
    uid: auth.uid,
    displayName: auth.displayName ?? null,
    email: auth.email ?? null,
    photoURL: auth.photoURL ?? null,
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
    scheduleAnchorDate: nowIso,
    previewTester: true,
    dataResetAt: now,
  };
}

/** A page as sign-up writes it (initializeAllPages). */
export function freshPage(pageNumber: number, now: unknown): Record<string, unknown> {
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

export const PAGE_NUMBERS = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

export interface BackupSummary {
  /** Where the backup is (admin only). */
  location: string;
  docs: number;
  files: number;
}

/**
 * The reading and writing, all of it for one account (testerResetAdmin.ts with
 * firebase-admin; an in-memory one in the tests). Each call names the uid.
 */
export interface ResetStore {
  /** A Timestamp for `now` (what Firestore stores) and the same as ISO text. */
  now(): { stamp: unknown; ms: number; iso: string };
  readUser(uid: string): Promise<Record<string, unknown> | null>;
  /** Applies claimReset in a transaction on adminResets/<uid>; throws ResetError when refused. */
  claim(uid: string, nowMs: number): Promise<void>;
  /** Every document and recording file of the account, copied to the backup and read back. */
  backup(uid: string, stampIso: string): Promise<BackupSummary>;
  /** users/<uid> replaced by `user` (never deleted: an open app would make one without previewTester). */
  replaceUser(uid: string, user: Record<string, unknown>): Promise<void>;
  /** The 604 pages written as new (never missing in between); stray page documents deleted. */
  resetPages(uid: string, now: unknown): Promise<number>;
  /**
   * Every subcollection but pages and recordings deleted (sessions, journal and
   * its notes, readingSessions, stats, revisions, memorizations, reads, …).
   * Returns how many documents each held.
   */
  deleteHistory(uid: string): Promise<Record<string, number>>;
  /** Each live recording record becomes a tombstone ({deletedAt}); returns how many. */
  tombstoneRecordings(uid: string, now: unknown): Promise<number>;
  /** The files under recordings/<uid>/ in Storage deleted; returns how many. */
  deleteRecordingFiles(uid: string): Promise<number>;
  /** The reset finished: adminResets/<uid>.lastDoneAt. */
  finish(uid: string, nowMs: number): Promise<void>;
}

export interface ResetResult {
  ok: true;
  backup: BackupSummary;
  pages: number;
  deleted: Record<string, number>;
  recordings: number;
  files: number;
}

/** The reset itself, for `uid` only, once the caller is known to be signed in with App Check. */
export async function resetTesterAccount(
  store: ResetStore,
  auth: AuthInfo,
  data: unknown,
): Promise<ResetResult> {
  const uid = auth.uid;
  if (!uid) throw new ResetError('unauthenticated', 'Must be signed in.');
  const confirm = (data as { confirm?: unknown } | null | undefined)?.confirm;
  if (confirm !== RESET_CONFIRM) throw new ResetError('invalid-argument', 'Type RESET to confirm.');
  if (auth.email && PROTECTED_EMAILS.includes(auth.email.toLowerCase())) {
    throw new ResetError('permission-denied', 'This account cannot be reset.');
  }
  const user = await store.readUser(uid);
  if (!user || user.previewTester !== true) {
    throw new ResetError('permission-denied', 'Reset my data is for testers only.');
  }

  const now = store.now();
  await store.claim(uid, now.ms);

  let backup: BackupSummary;
  try {
    backup = await store.backup(uid, now.iso);
  } catch (err) {
    throw new ResetError('internal', `The backup failed, so nothing was changed. ${(err as Error).message ?? ''}`.trim());
  }

  await store.replaceUser(uid, freshUser(auth, now.stamp, now.iso));
  const pages = await store.resetPages(uid, now.stamp);
  const deleted = await store.deleteHistory(uid);
  const recordings = await store.tombstoneRecordings(uid, now.stamp);
  const files = await store.deleteRecordingFiles(uid);
  await store.finish(uid, now.ms);
  return { ok: true, backup, pages, deleted, recordings, files };
}

/** What the callable passes in (a CallableRequest's parts this needs). */
export interface ResetRequest {
  auth?: { uid: string; token?: { email?: string; name?: string; picture?: string } } | null;
  app?: unknown;
  data?: unknown;
}

/**
 * The callable's handler. App Check is enforced by the callable's options too;
 * this checks again, so a missing token can never reach the reset.
 */
export async function handleResetMyData(
  request: ResetRequest,
  deps: { store: ResetStore; authUser: (uid: string) => Promise<AuthInfo> },
): Promise<ResetResult> {
  if (!request.auth?.uid) throw new ResetError('unauthenticated', 'Must be signed in.');
  if (!request.app) throw new ResetError('failed-precondition', 'App Check is required.');
  const auth = await deps.authUser(request.auth.uid);
  if (auth.uid !== request.auth.uid) throw new ResetError('internal', 'Account mismatch.');
  return resetTesterAccount(deps.store, auth, request.data);
}
