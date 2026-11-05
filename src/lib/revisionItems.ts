// Activity's Revised items, written beside each revision session (dual write,
// Activity spec sections 2, 6 and 7). A session writes one item for its day and
// one for each day its pages were revised ahead of (credited to that day). The
// ids come from the session, so writing the same session again changes nothing.
// Activity still reads the session; these items are only written until the
// backfill and the switch to reading them.

import type { FirestoreSession } from '../types/firestore';

type Timestamp = FirestoreSession['createdAt'];

export interface RevisionItem {
  id: string;
  uid: string;
  day: string;
  occurredAt: number;
  countsFor: string;
  source: 'session';
  pages: number[];
  skipped: number[];
  ratings?: Record<string, number>;
  assigned: number[];
  minutes: number | null;
  recordings: string[];
}

/** The item id for a session's own day, or for the pages it revised ahead of `countsFor`. */
export function revisionItemId(day: string, countsFor?: string): string {
  return countsFor && countsFor !== day ? `${day}-ahead-${countsFor}` : day;
}

const MAX_MINUTES = 1440;

function minutesOf(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(MAX_MINUTES, Math.max(0, Math.round(value)));
}

function millisOf(ts: Timestamp | undefined): number {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
}

/**
 * The Revised items of a session as it stands after a change. Pages revised
 * ahead (`session.ahead`) leave the day's own item and go to their own item,
 * counted for the later day. Ratings are the weakness changes of the session.
 */
export function revisionItemsFor(session: FirestoreSession, uid: string): RevisionItem[] {
  const day = session.date;
  const occurredAt = millisOf(session.createdAt);
  const ahead = session.ahead ?? {};
  const aheadPages = new Set(Object.values(ahead).flat());
  const ratings: Record<string, number> = {};
  for (const w of session.weaknessUpdates ?? []) ratings[String(w.pageNumber)] = w.newRating;

  const own: RevisionItem = {
    id: revisionItemId(day),
    uid,
    day,
    occurredAt,
    countsFor: day,
    source: 'session',
    pages: (session.pagesRevised ?? []).filter((p) => !aheadPages.has(p)),
    skipped: session.pagesSkipped ?? [],
    assigned: session.assignedPages ?? [],
    minutes: minutesOf(session.durationMinutes),
    recordings: [],
    ...(Object.keys(ratings).length > 0 ? { ratings } : {}),
  };

  const credited = Object.entries(ahead)
    .filter(([, pages]) => pages.length > 0)
    .map(([countsFor, pages]): RevisionItem => ({
      id: revisionItemId(day, countsFor),
      uid,
      day,
      occurredAt,
      countsFor,
      source: 'session',
      pages: [...pages],
      skipped: [],
      assigned: [],
      minutes: null,
      recordings: [],
    }));

  return [own, ...credited];
}
