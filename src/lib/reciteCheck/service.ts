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

/** Wake the service while the user gets ready (it sleeps when unused; waking takes a few seconds). */
export function warmUpReciteCheck(deps: Pick<CheckDeps, 'fetch'> = defaults): void {
  deps.fetch(`${RECITE_CHECK_URL}/health`).catch(() => undefined);
}

export const FAILURE_TEXT: Record<CheckFailure, string> = {
  offline: 'Couldn’t reach the checker. Check your connection and try again.',
  sign_in: 'Sign in again to check your recitation.',
  testers_only: 'The recitation check is for testers.',
  limit: 'That’s a lot of checks for one hour. Try again a little later.',
  too_short: 'That was too short to check. Recite at least a few words.',
  server: 'The checker couldn’t check this recording. Try again.',
};
