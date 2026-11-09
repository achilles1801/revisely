// The Ask coach's weekly digest line (C6): the week's coachLedgerDay documents, for the digest
// workflow (.github/workflows/stats-digest.yml). The workflow proves who it is with its GitHub
// Actions OIDC token (the same check as the Play endpoint, playAvailable.ts), so no Firestore
// credential is stored in GitHub. Only stats-digest.yml in this repository, run from main, may
// read, and only the counts: no user, no question, no answer.

import { CallerError, GithubClaims, REPOSITORY, REPOSITORY_ID } from './playAvailable';

/** The `audience` stats-digest.yml asks GitHub for. */
export const DIGEST_AUDIENCE = 'revisely-coach-digest';
export const DIGEST_WORKFLOW_REF = `${REPOSITORY}/.github/workflows/stats-digest.yml@refs/heads/main`;
const DIGEST_EVENTS = new Set(['schedule', 'workflow_dispatch']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A week, and nothing wider: the digest asks for seven days. */
const MAX_SPAN_DAYS = 7;

/** Only stats-digest.yml in this repository, on main, scheduled or run by hand. */
export function checkDigestCaller(claims: GithubClaims): void {
  if (String(claims.repository_id) !== REPOSITORY_ID || claims.repository !== REPOSITORY) {
    throw new CallerError('another repository');
  }
  if (claims.job_workflow_ref !== DIGEST_WORKFLOW_REF) throw new CallerError('not stats-digest.yml on main');
  if (!DIGEST_EVENTS.has(claims.event_name ?? '')) throw new CallerError(`event ${claims.event_name ?? '(none)'}`);
}

/** The week asked for: two days (YYYY-MM-DD), start not after end, at most seven days apart. */
export function parseWeek(query: Record<string, unknown>): { start: string; end: string } {
  const start = String(query.start ?? '');
  const end = String(query.end ?? '');
  if (!DAY.test(start) || !DAY.test(end)) throw new CallerError('start and end must be YYYY-MM-DD');
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) throw new CallerError('end must not be before start');
  if ((b - a) / 86_400_000 >= MAX_SPAN_DAYS) throw new CallerError('at most seven days');
  return { start, end };
}

const COUNTS = ['calls', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'spendUsd'] as const;

/** One day's ledger, with only its counts (never anything else a document might hold). */
export function ledgerDayCounts(doc: Record<string, unknown>): Record<string, number | string> {
  const out: Record<string, number | string> = { day: String(doc.day ?? '') };
  for (const k of COUNTS) out[k] = typeof doc[k] === 'number' && Number.isFinite(doc[k] as number) ? (doc[k] as number) : 0;
  return out;
}
