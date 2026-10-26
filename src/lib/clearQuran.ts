// The Clear Quran® (Dr. Mustafa Khattab) in English, one verse at a time.
//
// The app never holds the API key: it asks our worker (revisely.app/api/tcq,
// worker/tcq.ts), which calls The Clear Quran API. Each request carries the
// signed-in user's Firebase ID token (only Revisely users may use the licence)
// and the app's update channel (the App Store app uses the production key,
// TestFlight and development the sandbox one).
//
// The text is shown exactly as returned. It is kept in memory for this launch
// only, never written to the device. When it can't be loaded the caller shows
// "Couldn't load translation" with a retry: never another translation.

import { getAuth } from 'firebase/auth';
import { currentRelease } from './releaseInfo';

export const CLEAR_QURAN_API = 'https://revisely.app/api/tcq';
const TIMEOUT_MS = 15_000;
const KEEP = 300;

export type ClearQuranErrorCode =
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'NETWORK';

export class ClearQuranError extends Error {
  constructor(
    readonly code: ClearQuranErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClearQuranError';
  }
}

export interface ClearQuranDeps {
  /** The signed-in user's ID token (refreshed when `force`), or null if signed out. */
  token: (force: boolean) => Promise<string | null>;
  /** The update channel: production, preview, or null in development. */
  channel: () => string | null;
  fetch: typeof fetch;
}

const defaults: ClearQuranDeps = {
  token: async (force) => (await getAuth().currentUser?.getIdToken(force)) ?? null,
  channel: () => currentRelease().channel,
  fetch: (input, init) => fetch(input, init),
};

const memory = new Map<string, string>();

/** For tests. */
export function forgetClearQuranVerses(): void {
  memory.clear();
}

async function request(key: string, force: boolean, deps: ClearQuranDeps): Promise<Response> {
  const token = await deps.token(force).catch(() => null);
  if (!token) throw new ClearQuranError('UNAUTHENTICATED', 'Sign in to load this translation');
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return await deps.fetch(`${CLEAR_QURAN_API}/verses/${key}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Revisely-Channel': deps.channel() ?? 'development',
        Accept: 'application/json',
      },
      signal: abort.signal,
    });
  } catch {
    throw new ClearQuranError('NETWORK', "Couldn't reach the server");
  } finally {
    clearTimeout(timer);
  }
}

async function errorFor(res: Response): Promise<ClearQuranError> {
  const { status } = res;
  if (status === 401) return new ClearQuranError('UNAUTHENTICATED', 'Sign in to load this translation');
  if (status === 429) {
    // The worker's daily budgets (worker/budget.ts) say so; anything else is a short wait.
    const body = (await res.json().catch(() => null)) as { error?: { code?: unknown } } | null;
    if (body?.error?.code === 'DAILY_LIMIT') return new ClearQuranError('DAILY_LIMIT', 'Daily limit reached');
    return new ClearQuranError('RATE_LIMITED', 'Too many requests right now');
  }
  if (status === 404) return new ClearQuranError('NOT_FOUND', 'Verse not found');
  return new ClearQuranError('UNAVAILABLE', 'The translation is unavailable right now');
}

/** One verse's text, exactly as The Clear Quran API gives it. */
export async function getClearQuranVerse(sura: number, ayah: number, deps: ClearQuranDeps = defaults): Promise<string> {
  const key = `${sura}:${ayah}`;
  const known = memory.get(key);
  if (known !== undefined) return known;

  let res = await request(key, false, deps);
  // A token that expired in the background: refresh it once.
  if (res.status === 401) res = await request(key, true, deps);
  if (!res.ok) throw await errorFor(res);

  const body = (await res.json().catch(() => null)) as { verse_key?: unknown; text?: unknown } | null;
  if (!body || body.verse_key !== key || typeof body.text !== 'string' || body.text.length === 0) {
    throw new ClearQuranError('UNAVAILABLE', 'The translation is unavailable right now');
  }
  if (memory.size >= KEEP) memory.delete(memory.keys().next().value as string);
  memory.set(key, body.text);
  return body.text;
}

const TAG = /<footnote\s+id="(\d+)"\s+number="(\d+)">(?:(\d*)<\/footnote>)?/g;
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export type TextSegment = { text: string } | { footnote: string };

/**
 * How to show a verse's text. The Clear Quran marks its footnotes in the text
 * (`<footnote id="57" number="1">`, the website's format); those become the
 * footnote's number, raised. Nothing else changes: if the text holds any other
 * markup, it is shown exactly as given.
 */
export function clearQuranSegments(text: string): TextSegment[] {
  if (!text.includes('<')) return [{ text }];
  if (/[<>]/.test(text.replace(TAG, ''))) return [{ text }];
  const out: TextSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(TAG)) {
    const inner = m[3];
    if (inner && inner !== m[2]) return [{ text }];
    if (m.index! > at) out.push({ text: text.slice(at, m.index) });
    out.push({ footnote: [...m[2]].map((d) => SUPERSCRIPT[Number(d)]).join('') });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** What the verse sheet says when the text couldn't be loaded. */
export function clearQuranErrorHint(err: unknown): string {
  const code = err instanceof ClearQuranError ? err.code : 'NETWORK';
  switch (code) {
    case 'RATE_LIMITED':
      return 'Too many requests right now. Try again in a minute.';
    case 'DAILY_LIMIT':
      return 'The Clear Quran has reached its limit for today. Try again tomorrow.';
    case 'UNAUTHENTICATED':
      return 'Sign in again, then try again.';
    case 'NOT_FOUND':
      return "This verse isn't available.";
    case 'UNAVAILABLE':
      return 'The Clear Quran is unavailable right now. Try again shortly.';
    default:
      return 'Check your connection and try again.';
  }
}
