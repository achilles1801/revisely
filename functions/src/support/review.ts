/**
 * Reviewing Open Door applications: the one place decisions are made, for Revisely Console (the callable
 * adminConsole, console/handler.ts) and functions/scripts/support-applications.js, so the two can't drift.
 *
 * A decision is one transaction over the application, the account's entitlements and its audit entry:
 *   approve  grants.support {until: null unless given} and premium worked out again; the answers deleted
 *   decline  applyAgainFrom = 30 days; the answers deleted
 *   revoke   grants.support removed, premium worked out again; the application `revoked`, applyAgainFrom = 30 days
 *
 *   supportDecisions/<requestId>  { uid, action, at, by, note, until, application, applyAgainFrom }   closed to clients
 *
 * The request id is made once per decision by the caller (the page, or the script), so a retry or a double click finds
 * its own entry and returns it instead of deciding twice. The audit entry holds who decided, when, and the reviewer's
 * internal note; never the applicant's answers, and the note lives only here (the applicant can read their own
 * application, never this). A later notifier ("you've been approved") hangs off this collection's new documents.
 */
import { randomBytes } from 'crypto';
import type { DocumentData, DocumentReference, DocumentSnapshot, Firestore, Query } from 'firebase-admin/firestore';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { applicationFrom, applicationTo, entitlementsFrom, entitlementsTo } from './admin';
import {
  APPLICATION_STATUSES,
  Application,
  ApplicationStatus,
  Entitlements,
  Grant,
  REPLY_WITHIN_DAYS,
  SupportError,
  decide,
  revoke,
} from './logic';

export const DECISIONS = 'supportDecisions';
export const REVIEW_NOTE_MAX = 280;
export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 100;
export const HISTORY_MAX = 25;
const DAY_MS = 86_400_000;

export const REVIEW_ACTIONS = ['approve', 'decline', 'revoke'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface Reviewer {
  uid: string | null;
  email: string | null;
  role: string | null;
  via: 'console' | 'script';
}

/** One decision as the audit log keeps it. Times in ms. */
export interface Decision {
  id: string;
  uid: string;
  action: ReviewAction;
  at: number;
  by: Reviewer;
  note: string | null;
  /** approve: the grant's end; null = no end date (and for the other actions) */
  until: number | null;
  /** which of the account's applications (1st, 2nd…); null for a grant made without one */
  application: number | null;
  /** decline and revoke: when the account may apply again */
  applyAgainFrom: number | null;
}

export interface ReviewInput {
  uid: string;
  action: ReviewAction;
  by: Reviewer;
  requestId: string;
  note?: unknown;
  until?: number | null;
}

export const REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function newRequestId(): string {
  return randomBytes(18).toString('base64url');
}

/** The reviewer's note: one line, trimmed, at most REVIEW_NOTE_MAX characters (refused, never cut). */
export function cleanReviewNote(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new SupportError('invalid-argument', 'The note must be text.');
  const text = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B\u2028\u2029\uFEFF]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!text) return null;
  if (Array.from(text).length > REVIEW_NOTE_MAX) throw new SupportError('invalid-argument', `Keep the note under ${REVIEW_NOTE_MAX} characters.`);
  return text;
}

// ---------------------------------------------------------------------------------------------------------------
// The step itself, without Firestore

export type ReviewStep =
  | { kind: 'already'; decision: Decision }
  | { kind: 'write'; decision: Decision; app: Application; ent?: ReturnType<typeof decide>['ent'] };

/**
 * What a decision does to what's stored. `existing` is the audit entry with this request id, if any: the same
 * decision returns it (a retry); anything else under that id is refused.
 */
export function reviewStep(
  current: { app: Application | null; ent: Entitlements | null; existing: Decision | null },
  input: ReviewInput,
  now: number,
): ReviewStep {
  if (!REQUEST_ID.test(input.requestId)) throw new SupportError('invalid-argument', 'Bad request id.');
  if (!(REVIEW_ACTIONS as readonly string[]).includes(input.action)) throw new SupportError('invalid-argument', 'Unknown decision.');
  if (current.existing) {
    if (current.existing.uid === input.uid && current.existing.action === input.action) return { kind: 'already', decision: current.existing };
    throw new SupportError('invalid-argument', 'That request id belongs to another decision.');
  }
  const note = cleanReviewNote(input.note);
  if (input.until != null && input.action !== 'approve') throw new SupportError('invalid-argument', 'Only an approval takes an end date.');
  const out =
    input.action === 'revoke'
      ? revoke(current.app, current.ent, now)
      : decide(current.app, current.ent, input.action === 'approve' ? { approve: true, until: input.until ?? null } : { approve: false }, now);
  const decision: Decision = {
    id: input.requestId,
    uid: input.uid,
    action: input.action,
    at: now,
    by: input.by,
    note,
    until: input.action === 'approve' ? (input.until ?? null) : null,
    application: current.app ? current.app.count : null,
    applyAgainFrom: out.app.applyAgainFrom,
  };
  return { kind: 'write', decision, app: out.app, ent: out.ent };
}

const VERB: Record<ReviewAction, string> = { approve: 'Approved', decline: 'Declined', revoke: 'Revoked' };

/** A refusal that names the decision that came first ("Already approved by … on 14 Nov 2026"). */
export function refusalAfter(err: SupportError, latest: Decision | null): SupportError {
  if (!latest || err.code !== 'failed-precondition') return err;
  const who = latest.by.via === 'script' ? 'the review script' : (latest.by.email ?? 'a reviewer');
  const when = new Date(latest.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return new SupportError('failed-precondition', `${err.message} ${VERB[latest.action]} by ${who} on ${when}.`);
}

// ---------------------------------------------------------------------------------------------------------------
// Firestore

const ms = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);
const ts = (v: number | null | undefined): Timestamp | null => (v == null ? null : Timestamp.fromMillis(v));

export function decisionFrom(id: string, d: DocumentData | undefined): Decision | null {
  if (!d || typeof d.uid !== 'string' || !(REVIEW_ACTIONS as readonly string[]).includes(d.action)) return null;
  const by = (d.by ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: d.uid,
    action: d.action,
    at: ms(d.at) ?? 0,
    by: {
      uid: typeof by.uid === 'string' ? by.uid : null,
      email: typeof by.email === 'string' ? by.email : null,
      role: typeof by.role === 'string' ? by.role : null,
      via: by.via === 'script' ? 'script' : 'console',
    },
    note: typeof d.note === 'string' ? d.note : null,
    until: ms(d.until),
    application: typeof d.application === 'number' ? d.application : null,
    applyAgainFrom: ms(d.applyAgainFrom),
  };
}

function decisionTo(d: Decision): DocumentData {
  return {
    uid: d.uid,
    action: d.action,
    at: ts(d.at),
    by: d.by,
    note: d.note,
    until: ts(d.until),
    application: d.application,
    applyAgainFrom: ts(d.applyAgainFrom),
  };
}

export interface ReviewResult {
  decision: Decision;
  status: ApplicationStatus;
  /** the account's Premium after the decision */
  premium: Grant | null;
  /** true: this request id had already been decided (a retry); nothing was written */
  already: boolean;
}

async function latestDecision(db: Firestore, uid: string): Promise<Decision | null> {
  const snap = await db.collection(DECISIONS).where('uid', '==', uid).orderBy('at', 'desc').limit(1).get();
  const doc = snap.docs[0];
  return doc ? decisionFrom(doc.id, doc.data()) : null;
}

/** Approve, decline or revoke, as one transaction with its audit entry. */
export async function review(db: Firestore, input: ReviewInput, now: number = Date.now()): Promise<ReviewResult> {
  const appRef = db.doc(`supportApplications/${input.uid}`);
  const entRef = db.doc(`entitlements/${input.uid}`);
  if (!REQUEST_ID.test(input.requestId)) throw new SupportError('invalid-argument', 'Bad request id.');
  const decRef = db.doc(`${DECISIONS}/${input.requestId}`);
  const read = async (get: (ref: DocumentReference) => Promise<DocumentSnapshot>) => {
    const [app, ent, dec] = await Promise.all([get(appRef), get(entRef), get(decRef)]);
    return { app: applicationFrom(app.data()), ent: entitlementsFrom(ent.data()), existing: decisionFrom(dec.id, dec.data()) };
  };
  const already = async (decision: Decision): Promise<ReviewResult> => {
    const { app, ent } = await read((ref) => ref.get());
    return { decision, status: app?.status ?? 'approved', premium: ent?.premium ?? null, already: true };
  };
  // Refuse before any transaction: a transaction that only reads and then throws keeps its locks for about two
  // minutes, and the next decision on the account fails with "Too much contention" meanwhile.
  try {
    const first = reviewStep(await read((ref) => ref.get()), input, now);
    if (first.kind === 'already') return already(first.decision);
  } catch (err) {
    if (err instanceof SupportError) throw refusalAfter(err, await latestDecision(db, input.uid));
    throw err;
  }
  const step = await db.runTransaction(async (tx) => {
    const s = reviewStep(await read((ref) => tx.get(ref)), input, now);
    if (s.kind === 'write') {
      // set, not merge: the answers must go.
      tx.set(appRef, applicationTo(input.uid, s.app));
      if (s.ent) tx.set(entRef, entitlementsTo(s.ent));
      tx.create(decRef, decisionTo(s.decision));
    }
    return s;
  });
  if (step.kind === 'already') return already(step.decision);
  return { decision: step.decision, status: step.app.status, premium: step.ent ? step.ent.premium : null, already: false };
}

// ---------------------------------------------------------------------------------------------------------------
// Reading: the queue, counts, one account, the audit log

export type QueueFilter = ApplicationStatus | 'all';
export const QUEUE_FILTERS: readonly QueueFilter[] = [...APPLICATION_STATUSES, 'all'];

export interface QueueRow {
  uid: string;
  status: ApplicationStatus;
  createdAt: number;
  decidedAt: number | null;
  applyAgainFrom: number | null;
  count: number;
  via: 'app' | 'web';
  /** pending only (the answers go with the decision) */
  cantAfford?: boolean;
  noPayment?: boolean;
  country?: string;
}

/** Pending: oldest first (the queue). Decided: most recently decided first. All: newest application first. */
export function queueOrder(filter: QueueFilter): { field: 'createdAt' | 'decidedAt'; dir: 'asc' | 'desc' } {
  if (filter === 'pending') return { field: 'createdAt', dir: 'asc' };
  if (filter === 'all') return { field: 'createdAt', dir: 'desc' };
  return { field: 'decidedAt', dir: 'desc' };
}

export function encodeCursor(at: number, uid: string): string {
  return Buffer.from(JSON.stringify([at, uid])).toString('base64url');
}

export function decodeCursor(raw: unknown): { at: number; uid: string } | null {
  if (raw == null || raw === '') return null;
  try {
    if (typeof raw !== 'string' || raw.length > 200) throw new Error();
    const [at, uid] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof at !== 'number' || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error();
    return { at, uid };
  } catch {
    throw new SupportError('invalid-argument', 'Bad page cursor.');
  }
}

export function queueRow(uid: string, app: Application): QueueRow {
  const row: QueueRow = {
    uid,
    status: app.status,
    createdAt: app.createdAt,
    decidedAt: app.decidedAt,
    applyAgainFrom: app.applyAgainFrom,
    count: app.count,
    via: app.via,
  };
  if (app.status === 'pending' && app.answers) {
    row.cantAfford = app.answers.cantAfford === true;
    row.noPayment = app.answers.noPayment === true;
    if (typeof app.answers.country === 'string') row.country = app.answers.country;
  }
  return row;
}

/** One page of the queue, `limit` rows after `cursor`. */
export async function queuePage(
  db: Firestore,
  opts: { filter: QueueFilter; limit?: number; cursor?: unknown },
): Promise<{ rows: QueueRow[]; next: string | null }> {
  if (!QUEUE_FILTERS.includes(opts.filter)) throw new SupportError('invalid-argument', 'Unknown filter.');
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(opts.limit ?? PAGE_DEFAULT)));
  const { field, dir } = queueOrder(opts.filter);
  let q: Query = db.collection('supportApplications');
  if (opts.filter !== 'all') q = q.where('status', '==', opts.filter);
  q = q.orderBy(field, dir).orderBy(FieldPath.documentId(), dir);
  const after = decodeCursor(opts.cursor);
  if (after) q = q.startAfter(Timestamp.fromMillis(after.at), after.uid);
  const snap = await q.limit(limit + 1).get();
  const rows: QueueRow[] = [];
  for (const doc of snap.docs.slice(0, limit)) {
    const app = applicationFrom(doc.data());
    if (app) rows.push(queueRow(doc.id, app));
  }
  const last = snap.docs[limit - 1];
  const lastAt = last ? ms(last.get(field)) : null;
  return { rows, next: snap.docs.length > limit && last && lastAt != null ? encodeCursor(lastAt, last.id) : null };
}

export type StatusCounts = Record<QueueFilter, number>;

export async function statusCounts(db: Firestore): Promise<StatusCounts> {
  const col = db.collection('supportApplications');
  const [all, ...each] = await Promise.all([
    col.count().get(),
    ...APPLICATION_STATUSES.map((s) => col.where('status', '==', s).count().get()),
  ]);
  const out = { all: all.data().count } as StatusCounts;
  APPLICATION_STATUSES.forEach((s, i) => (out[s] = each[i].data().count));
  return out;
}

export interface Summary {
  counts: StatusCounts;
  /** the oldest pending application's createdAt */
  oldestPending: number | null;
  /** pending past the reply promise (REPLY_WITHIN_DAYS) */
  overdue: number;
  /** decisions in the last 7 days */
  week: { approve: number; decline: number; revoke: number };
}

export async function summary(db: Firestore, now: number = Date.now()): Promise<Summary> {
  const apps = db.collection('supportApplications');
  const weekAgo = Timestamp.fromMillis(now - 7 * DAY_MS);
  const dec = db.collection(DECISIONS);
  const [counts, oldest, overdue, approve, decline, revokeN] = await Promise.all([
    statusCounts(db),
    apps.where('status', '==', 'pending').orderBy('createdAt', 'asc').limit(1).get(),
    apps.where('status', '==', 'pending').where('createdAt', '<=', Timestamp.fromMillis(now - REPLY_WITHIN_DAYS * DAY_MS)).count().get(),
    dec.where('action', '==', 'approve').where('at', '>=', weekAgo).count().get(),
    dec.where('action', '==', 'decline').where('at', '>=', weekAgo).count().get(),
    dec.where('action', '==', 'revoke').where('at', '>=', weekAgo).count().get(),
  ]);
  return {
    counts,
    oldestPending: oldest.docs[0] ? ms(oldest.docs[0].get('createdAt')) : null,
    overdue: overdue.data().count,
    week: { approve: approve.data().count, decline: decline.data().count, revoke: revokeN.data().count },
  };
}

/** One account: its application (with the answers while pending), its Premium, and its decisions, newest first. */
export async function accountReview(
  db: Firestore,
  uid: string,
): Promise<{ app: Application | null; ent: Entitlements | null; history: Decision[] }> {
  const [app, ent, hist] = await Promise.all([
    db.doc(`supportApplications/${uid}`).get(),
    db.doc(`entitlements/${uid}`).get(),
    db.collection(DECISIONS).where('uid', '==', uid).orderBy('at', 'desc').limit(HISTORY_MAX).get(),
  ]);
  return {
    app: applicationFrom(app.data()),
    ent: entitlementsFrom(ent.data()),
    history: hist.docs.map((d) => decisionFrom(d.id, d.data())).filter((d): d is Decision => !!d),
  };
}

/** The latest decision of each account (the queue's "Approved by …"); 30 accounts per query. */
export async function latestDecisions(db: Firestore, uids: string[]): Promise<Map<string, Decision>> {
  const out = new Map<string, Decision>();
  const unique = [...new Set(uids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 30) chunks.push(unique.slice(i, i + 30));
  const snaps = await Promise.all(chunks.map((c) => db.collection(DECISIONS).where('uid', 'in', c).get()));
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const d = decisionFrom(doc.id, doc.data());
      if (d && (!out.has(d.uid) || out.get(d.uid)!.at < d.at)) out.set(d.uid, d);
    }
  }
  return out;
}

/** The audit log's decisions, newest first. */
export async function decisionsPage(db: Firestore, opts: { limit?: number; cursor?: unknown }): Promise<{ rows: Decision[]; next: string | null }> {
  const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(opts.limit ?? PAGE_DEFAULT)));
  let q: Query = db.collection(DECISIONS).orderBy('at', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const after = decodeCursor(opts.cursor);
  if (after) q = q.startAfter(Timestamp.fromMillis(after.at), after.uid);
  const snap = await q.limit(limit + 1).get();
  const rows = snap.docs
    .slice(0, limit)
    .map((d) => decisionFrom(d.id, d.data()))
    .filter((d): d is Decision => !!d);
  const last = rows[rows.length - 1];
  return { rows, next: snap.docs.length > limit && last ? encodeCursor(last.at, last.id) : null };
}
