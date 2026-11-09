// A Read item (Activity spec section 2): one per timed reading session, linked to it.
// Written beside the session (dual write, C2) with the same fields the backfill uses,
// so a session and its item always agree.

export interface ReadItem {
  id: string;
  uid: string;
  day: string;
  occurredAt: number;
  source: 'auto';
  pages: number[];
  minutes: number | null;
  recordings: string[];
  readingSessionId: string;
}

const MAX_MINUTES = 1440;

export function readItemFor(
  id: string,
  uid: string,
  session: { date: string; startedAt: number; durationSeconds: number; pages: number[] },
): ReadItem {
  const minutes = Number.isFinite(session.durationSeconds / 60)
    ? Math.min(MAX_MINUTES, Math.max(0, Math.round(session.durationSeconds / 60)))
    : null;
  return {
    id,
    uid,
    day: session.date,
    occurredAt: session.startedAt,
    source: 'auto',
    pages: [...session.pages],
    minutes,
    recordings: [],
    readingSessionId: id,
  };
}
