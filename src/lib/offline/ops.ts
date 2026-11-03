// The changes the app makes to an account, as kept in the outbox until the
// server has them. Each one is plain JSON (times in milliseconds) and gives the
// same result when applied twice: values are absolute, page lists merge as
// sets, and a session's minutes are "at least" a number. Replaying the change
// at the head of the queue (the app closed after the server took it but before
// it was crossed off) changes nothing.
//
// The same pure functions show a pending change on the phone (overlay) and
// apply it on the server (sync.ts, inside a transaction for sessions), so what
// the user sees is what the server ends up with.

import type { FirestorePage, FirestoreSession, FirestoreUser, PageStatus, WeaknessRating } from '../../types/firestore';
import { tsFromMillis } from './codec';
import { mergeAhead } from '../aheadCredit';

/** The `ahead` field only where there is credit: a session without it writes as before. */
const aheadField = (ahead: Record<string, number[]> | undefined) =>
  ahead && Object.keys(ahead).length > 0 ? { ahead } : {};

/** User document fields: absolute values; "notifications.enabled" style keys for nested ones. */
export type UserFields = Record<string, unknown>;

export interface PageFields {
  pageNumber: number;
  status?: PageStatus;
  dateMemorized?: number | null;
  lastRevisedAt?: number | null;
  weaknessRating?: WeaknessRating;
  totalRevisionCount?: number;
  skipCount?: number;
}

export interface WeaknessChange {
  pageNumber: number;
  newRating: number;
  /** When the rating was given (ms): with the page, it identifies the change. */
  changedAt: number;
}

export type OutboxOp =
  | { kind: 'user'; fields: UserFields }
  | { kind: 'pages'; pages: PageFields[] }
  | {
      kind: 'session.add';
      date: string;
      assignedPages: number[];
      pagesRevised: number[];
      pagesSkipped: number[];
      weaknessUpdates: WeaknessChange[];
      /** The session's minutes once this is in, as this phone sees it. */
      durationAtLeast: number;
      /**
       * The minutes this change adds. The server adds them to what it has
       * (another phone's minutes count too), unless it already has
       * `durationAtLeast`: then this change is in already (sent twice).
       */
      durationAdd?: number;
      /** Pages of this change credited to a later day (lib/aheadCredit): day → pages. */
      ahead?: Record<string, number[]>;
    }
  | {
      kind: 'session.edit';
      id: string;
      addRevised: number[];
      removeRevised: number[];
      pagesSkipped: number[];
      durationMinutes: number | null;
      weaknessUpdates: WeaknessChange[];
      /** The session's whole `ahead` map after the edit (absent: unchanged). */
      ahead?: Record<string, number[]>;
    }
  | { kind: 'session.delete'; id: string }
  | {
      kind: 'reading.add';
      id: string;
      session: {
        date: string;
        startedAt: number;
        endedAt: number;
        durationSeconds: number;
        mode: 'stopwatch' | 'countUp' | 'countDown';
        targetSeconds: number | null;
        pages: number[];
        pagesVisited: number[];
      };
    }
  | { kind: 'reading.pages'; id: string; pages: number[] }
  | { kind: 'reading.delete'; id: string }
  | {
      kind: 'journal.save';
      entry: {
        date: string;
        memorization: string;
        memorizationMinutes: number | null;
        revision: string;
        revisionMinutes: number | null;
        notes: string;
      };
      isNew: boolean;
    }
  | { kind: 'journal.delete'; date: string }
  | { kind: 'usage'; seconds: number };

export interface OutboxEntry {
  id: string;
  op: OutboxOp;
  /** When it was made (ms): also a new session's createdAt. */
  at: number;
  /** Refusals by the server so far (it is dropped after a few). */
  failures?: number;
}

// ============================================================================
// USER
// ============================================================================

export function overlayUser(user: FirestoreUser | null, fields: UserFields): FirestoreUser | null {
  if (!user) return user;
  const next: Record<string, unknown> = { ...user };
  for (const [key, value] of Object.entries(fields)) {
    const dot = key.indexOf('.');
    if (dot < 0) {
      next[key] = value;
    } else {
      const head = key.slice(0, dot);
      const parent = (next[head] as Record<string, unknown> | undefined) ?? {};
      next[head] = { ...parent, [key.slice(dot + 1)]: value };
    }
  }
  return next as unknown as FirestoreUser;
}

// ============================================================================
// PAGES
// ============================================================================

/** The Firestore fields for one page change (times as Timestamps). */
export function pageUpdateData(p: PageFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.status !== undefined) out.status = p.status;
  if (p.dateMemorized !== undefined) out.dateMemorized = tsFromMillis(p.dateMemorized);
  if (p.lastRevisedAt !== undefined) out.lastRevisedAt = tsFromMillis(p.lastRevisedAt);
  if (p.weaknessRating !== undefined) out.weaknessRating = p.weaknessRating;
  if (p.totalRevisionCount !== undefined) out.totalRevisionCount = p.totalRevisionCount;
  if (p.skipCount !== undefined) out.skipCount = p.skipCount;
  return out;
}

export function overlayPages(pages: FirestorePage[], changes: PageFields[]): FirestorePage[] {
  if (changes.length === 0) return pages;
  const byNumber = new Map(changes.map((c) => [c.pageNumber, c] as const));
  return pages.map((p) => {
    const c = byNumber.get(p.pageNumber);
    return c ? ({ ...p, ...pageUpdateData(c) } as FirestorePage) : p;
  });
}

// ============================================================================
// SESSIONS
// ============================================================================

/** Rules: 0–100. A stale session can have no assigned pages, or more revised than assigned. */
export function safePercent(revised: number, total: number): number {
  if (!total || total <= 0) return revised > 0 ? 100 : 0;
  const pct = (revised / total) * 100;
  if (!Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(100, pct));
}

const union = (a: number[], b: number[]) => [...a, ...b.filter((p) => !a.includes(p))];

const weaknessKey = (w: { pageNumber: number; newRating: number; changedAt: unknown }) =>
  `${w.pageNumber}:${w.newRating}:${
    typeof w.changedAt === 'number' ? w.changedAt : (w.changedAt as { toMillis?: () => number })?.toMillis?.()
  }`;

function weaknessDocs(changes: WeaknessChange[]): FirestoreSession['weaknessUpdates'] {
  return changes.map((w) => ({
    pageNumber: w.pageNumber,
    previousRating: 4 as WeaknessRating,
    newRating: w.newRating as WeaknessRating,
    changedAt: tsFromMillis(w.changedAt),
  }));
}

type SessionAdd = Extract<OutboxOp, { kind: 'session.add' }>;

/** The session's minutes with `op`'s added once (see durationAdd). */
function addedMinutes(current: number, op: SessionAdd): number {
  if (op.durationAdd === undefined) return Math.max(current, op.durationAtLeast);
  return current >= op.durationAtLeast ? current : current + op.durationAdd;
}
type SessionEdit = Extract<OutboxOp, { kind: 'session.edit' }>;

/** How many of `list` are in `revised`. */
function countOf(list: readonly number[], revised: readonly number[]): number {
  const set = new Set(revised);
  return list.filter((p) => set.has(p)).length;
}

/**
 * A day's session with `op` merged in: what addLog has always written (revised
 * pages joined, assigned pages only grow, a completed session stays completed),
 * made repeatable: the same op on its own result changes nothing.
 */
export function mergeSessionAdd(existing: FirestoreSession | null, op: SessionAdd, at: number): FirestoreSession {
  const newWeakness = weaknessDocs(op.weaknessUpdates);
  if (existing) {
    const pagesRevised = union(existing.pagesRevised ?? [], op.pagesRevised);
    const pagesSkipped = op.pagesSkipped.filter((p) => !pagesRevised.includes(p));
    const seen = new Set((existing.weaknessUpdates ?? []).map(weaknessKey));
    const weaknessUpdates = [
      ...(existing.weaknessUpdates ?? []),
      ...newWeakness.filter((w) => !seen.has(weaknessKey(w))),
    ];
    // Pages carried into the day after the session started join its
    // assignment, so tomorrow's carry-over and completion see them.
    const existingAssigned = existing.assignedPages ?? [];
    const added = op.assignedPages.filter((p) => !existingAssigned.includes(p));
    const assignedPages = [...existingAssigned, ...added];
    const totalAssignedPages =
      (added.length > 0 ? assignedPages.length : existing.totalAssignedPages) || pagesRevised.length;
    // Pages revised ahead are in pagesRevised too: only this day's own pages count here.
    const revisedHere = countOf(assignedPages, pagesRevised);
    const completed = existing.state === 'COMPLETED' || revisedHere >= totalAssignedPages;
    return {
      ...existing,
      assignedPages,
      totalAssignedPages,
      pagesRevised,
      pagesSkipped,
      weaknessUpdates,
      ...(existing.ahead !== undefined || op.ahead ? aheadField(mergeAhead(existing.ahead, op.ahead)) : {}),
      durationMinutes: Math.max(1, addedMinutes(existing.durationMinutes ?? 0, op)),
      // The rules forbid going back from completed.
      state: completed ? 'COMPLETED' : 'IN_PROGRESS',
      completionPercentage: safePercent(revisedHere, totalAssignedPages),
    };
  }
  // A new session. Prefer the caller's assignedPages (the day's assignment)
  // over revised+skipped: intermediate saves don't fill skipped and would
  // otherwise make a session that "forgets" pending pages.
  const fallback = [...op.pagesRevised, ...op.pagesSkipped];
  const assignedPages =
    op.assignedPages.length > 0 ? op.assignedPages : fallback.length > 0 ? fallback : op.pagesRevised;
  const created = tsFromMillis(at);
  const base: FirestoreSession = {
    id: op.date,
    date: op.date,
    state: 'NOT_STARTED',
    createdAt: created,
    updatedAt: created,
    completedAt: null,
    durationMinutes: null,
    assignedPages,
    totalAssignedPages: assignedPages.length,
    pagesRevised: [],
    pagesSkipped: [],
    weaknessUpdates: [],
    completionPercentage: 0,
  };
  if (op.pagesRevised.length === 0) return base;
  const total = base.totalAssignedPages || op.pagesRevised.length;
  const revisedHere = countOf(assignedPages, op.pagesRevised);
  return {
    ...base,
    pagesRevised: [...new Set(op.pagesRevised)],
    pagesSkipped: op.pagesSkipped,
    ...aheadField(mergeAhead(undefined, op.ahead)),
    durationMinutes: Math.max(1, op.durationAtLeast || 1),
    state: revisedHere >= total ? 'COMPLETED' : 'IN_PROGRESS',
    completionPercentage: safePercent(revisedHere, total),
    weaknessUpdates: newWeakness,
  };
}

/** An edited session (Activity, Home's edit sheet, unchecking pages in a session). Null if it's gone. */
export function applySessionEdit(existing: FirestoreSession | null, op: SessionEdit): FirestoreSession | null {
  if (!existing) return null;
  const remove = new Set(op.removeRevised);
  const pagesRevised = union(existing.pagesRevised ?? [], op.addRevised).filter((p) => !remove.has(p));
  return {
    ...existing,
    pagesRevised,
    pagesSkipped: op.pagesSkipped,
    ...(op.ahead !== undefined ? { ahead: op.ahead } : {}),
    // The rules take minutes above 0, or none.
    durationMinutes: op.durationMinutes != null && op.durationMinutes > 0 ? op.durationMinutes : null,
    weaknessUpdates: weaknessDocs(op.weaknessUpdates),
  };
}

/** The fields a session update may change (firestore.rules sessionMutableFields), minus updatedAt. */
export function sessionUpdateData(s: FirestoreSession): Record<string, unknown> {
  return {
    state: s.state,
    pagesRevised: s.pagesRevised,
    pagesSkipped: s.pagesSkipped,
    weaknessUpdates: s.weaknessUpdates,
    durationMinutes: s.durationMinutes,
    completionPercentage: s.completionPercentage,
    assignedPages: s.assignedPages,
    totalAssignedPages: s.totalAssignedPages,
    ...(s.ahead !== undefined ? { ahead: s.ahead } : {}),
  };
}

const byDateDesc = (a: FirestoreSession, b: FirestoreSession) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Sessions as they will be once these changes are in (newest first). */
export function overlaySessions(sessions: FirestoreSession[], entries: OutboxEntry[]): FirestoreSession[] {
  let list = sessions;
  for (const e of entries) {
    const op = e.op;
    if (op.kind === 'session.add') {
      const existing = list.find((s) => s.id === op.date) ?? null;
      const merged = mergeSessionAdd(existing, op, e.at);
      list = existing ? list.map((s) => (s.id === op.date ? merged : s)) : [...list, merged].sort(byDateDesc);
    } else if (op.kind === 'session.edit') {
      const existing = list.find((s) => s.id === op.id) ?? null;
      const edited = applySessionEdit(existing, op);
      if (edited) list = list.map((s) => (s.id === op.id ? edited : s));
    } else if (op.kind === 'session.delete') {
      list = list.filter((s) => s.id !== op.id);
    }
  }
  return list;
}

/** The account as it will be once these changes are in. */
export function overlayAccount(
  base: { user: FirestoreUser | null; pages: FirestorePage[]; sessions: FirestoreSession[] },
  entries: OutboxEntry[],
): { user: FirestoreUser | null; pages: FirestorePage[]; sessions: FirestoreSession[] } {
  if (entries.length === 0) return base;
  let user = base.user;
  let pages = base.pages;
  for (const e of entries) {
    if (e.op.kind === 'user') user = overlayUser(user, e.op.fields);
    else if (e.op.kind === 'pages') pages = overlayPages(pages, e.op.pages);
  }
  return { user, pages, sessions: overlaySessions(base.sessions, entries) };
}
