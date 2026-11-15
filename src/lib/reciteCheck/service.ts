import { getAuth } from 'firebase/auth';
import { currentRelease } from '../releaseInfo';
import type { VerseKey } from '../verses';
import { CheckResult, parseCheckResult } from './result';
import type { ReciteCheckSettings } from './settings';

/** The recitation check service on revisely-dev (Cloud Run, us-east1; scripts/recite-check). */
export const RECITE_CHECK_URL = 'https://recite-check-433792838929.us-east1.run.app';
/** The service takes at most 4 minutes. */
export const MAX_SECONDS = 240;

export type CheckFailure = 'offline' | 'sign_in' | 'testers_only' | 'limit' | 'too_short' | 'server';

export class CheckError extends Error {
  constructor(public readonly reason: CheckFailure) {
    super(reason);
  }
}

export interface CheckDeps {
  token: () => Promise<string | null>;
  fetch: typeof fetch;
}

const defaults: CheckDeps = {
  token: async () => (await getAuth().currentUser?.getIdToken()) ?? null,
  fetch: (input, init) => fetch(input, init),
};

/** The query string the service reads (README.md "The request"). */
export function checkQuery(from: VerseKey, to: VerseKey | null, s: ReciteCheckSettings): string {
  const q: Record<string, string> = {
    s: String(from.sura),
    a: String(from.ayah),
    mon: String(s.munfasil),
    mot: String(s.muttasil),
    aar: String(s.aared),
    letters: s.letters ? '1' : '0',
    keep: s.keep ? '1' : '0',
  };
  if (to) {
    q.s2 = String(to.sura);
    q.a2 = String(to.ayah);
  }
  return Object.entries(q)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Send a recording (a WAV of 16 kHz mono PCM) to be checked against the passage from `from`. */
export async function checkRecitation(
  wav: Uint8Array,
  from: VerseKey,
  to: VerseKey | null,
  settings: ReciteCheckSettings,
  deps: CheckDeps = defaults,
): Promise<CheckResult> {
  const token = await deps.token();
  if (!token) throw new CheckError('sign_in');
  const r = currentRelease();
  let res: Response;
  try {
    res = await deps.fetch(`${RECITE_CHECK_URL}/check?${checkQuery(from, to, settings)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'audio/wav',
        'X-Revisely-App': `${r.version ?? '?'} (${r.build ?? '?'}) ${r.channel ?? 'dev'} ${r.updateShort ?? 'embedded'}`,
      },
      body: wav as unknown as BodyInit,
    });
  } catch {
    throw new CheckError('offline');
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const reason = (body as { error?: string; detail?: string } | null)?.error;
    if (reason === 'sign_in' || reason === 'testers_only' || reason === 'limit') throw new CheckError(reason);
    if ((body as { detail?: string } | null)?.detail === 'too short') throw new CheckError('too_short');
    throw new CheckError('server');
  }
  const parsed = parseCheckResult(body);
  if (!parsed) throw new CheckError('server');
  return parsed;
}

/**
 * "Not a mistake", or taking it back, once a take has its final answer (the connection has gone): `POST /dismiss` or
 * `POST /undismiss` with the take and the mark's id, kept next to the take as a label for the lab (kept takes only).
 * A checker without `/undismiss` answers 404, and nothing wrong is stored. Best effort: a failure isn't shown. `when`
 * is the tap's time (ms): the two can arrive out of order (Undo while the dismiss is on its way), and the lab orders
 * a mark's labels by it, the latest winning (recite-server, Nov 15 2026).
 */
export async function sendLabel(
  what: 'dismiss' | 'undismiss',
  take: string,
  id: string,
  when: number,
  deps: CheckDeps = defaults,
): Promise<boolean> {
  try {
    const token = await deps.token();
    if (!token) return false;
    const res = await deps.fetch(`${RECITE_CHECK_URL}/${what}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ take, id, when }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** recite-check-pair: Recite and Words & harakat without letters, two takes an instance (lib/reciteLive/socket). */
export const RECITE_CHECK_PAIR_URL = 'https://recite-check-pair-433792838929.us-east1.run.app';

/** Wake both services while the user gets ready (they sleep when unused; waking takes a few seconds). */
export function warmUpReciteCheck(deps: Pick<CheckDeps, 'fetch'> = defaults): void {
  for (const base of [RECITE_CHECK_URL, RECITE_CHECK_PAIR_URL]) deps.fetch(`${base}/health`).catch(() => undefined);
}

export const FAILURE_TEXT: Record<CheckFailure, string> = {
  offline: 'Couldn’t reach the checker. Check your connection and try again.',
  sign_in: 'Sign in again to check your recitation.',
  testers_only: 'The recitation check is for testers.',
  limit: 'That’s a lot of checks for one hour. Try again a little later.',
  too_short: 'That was too short to check. Recite at least a few words.',
  server: 'The checker couldn’t check this recording. Try again.',
};
