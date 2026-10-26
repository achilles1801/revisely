// GET /api/tcq/verses/:sura::ayah — one verse of The Clear Quran® (English),
// fetched from The Clear Quran API with our key, which never leaves the worker.
//
// - Only for signed-in users of the app (a Firebase ID token): the text is
//   licensed to Revisely, and the free plan has 10,000 requests a month.
// - The key: TCQ_API_KEY_LIVE for the App Store app (X-Revisely-Channel:
//   production), TCQ_API_KEY_SANDBOX for everything else (TestFlight, dev).
// - The text goes back exactly as the API returns it (`text_english`).
// - Successful answers are kept in this data centre's cache for
//   TCQ_EDGE_CACHE_SECONDS (short; 0 turns it off); the app keeps nothing.
// - Errors come back as { error: { code, message } } with a status the app
//   maps to "Couldn't load translation" + retry. Never another translation.

import { AuthError, verifyIdToken } from './auth';

export interface TcqEnv {
  FIREBASE_PROJECT_ID: string;
  TCQ_API_BASE_LIVE: string;
  TCQ_API_BASE_SANDBOX: string;
  TCQ_EDGE_CACHE_SECONDS?: string;
  TCQ_API_KEY_LIVE?: string;
  TCQ_API_KEY_SANDBOX?: string;
  /** Per-user limit (wrangler.jsonc "ratelimits"); optional. */
  TCQ_USER_LIMIT?: RateLimit;
}

/** Verses per surah (Hafs), to refuse impossible verses before they cost a request. */
export const VERSE_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77,
  227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36,
  25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

const PATH = /^\/api\/tcq\/verses\/(\d{1,3}):(\d{1,3})$/;
const UPSTREAM_TIMEOUT_MS = 8000;

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_ERROR'
  | 'METHOD_NOT_ALLOWED';

export function errorResponse(status: number, code: ErrorCode, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function verseResponse(verseKey: string, text: string, cached: boolean) {
  return new Response(JSON.stringify({ verse_key: verseKey, text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Cache': cached ? 'HIT' : 'MISS' },
  });
}

/** "2:255" if it names a real verse, else null. */
export function verseKey(pathname: string): string | null {
  const m = PATH.exec(pathname);
  if (!m) return null;
  const sura = Number(m[1]);
  const ayah = Number(m[2]);
  if (sura < 1 || sura > 114 || ayah < 1 || ayah > VERSE_COUNTS[sura - 1]) return null;
  return `${sura}:${ayah}`;
}

/** Which key a request uses: the App Store app's channel gets the live key. */
export function tcqEnvironment(channel: string | null): 'live' | 'sandbox' {
  return channel === 'production' ? 'live' : 'sandbox';
}

export async function handleTcq(
  request: Request,
  env: TcqEnv,
  ctx: ExecutionContext,
  deps: { fetch: typeof fetch; cache: Cache | null; now?: number } = {
    fetch: (input, init) => fetch(input, init),
    cache: typeof caches !== 'undefined' ? caches.default : null,
  },
): Promise<Response> {
  if (request.method !== 'GET') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'GET only', { Allow: 'GET' });
  const key = verseKey(new URL(request.url).pathname);
  if (!key) return errorResponse(400, 'BAD_REQUEST', 'Expected /api/tcq/verses/<surah>:<verse> for a real verse');

  // Signed-in users of the app only.
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to load this translation');
  let uid: string;
  try {
    uid = await verifyIdToken(token, env.FIREBASE_PROJECT_ID, deps.now, deps.fetch);
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to load this translation');
    console.error('tcq: could not check the sign-in', err);
    return errorResponse(503, 'UPSTREAM_ERROR', 'Could not check your sign-in; try again');
  }
  if (env.TCQ_USER_LIMIT && !(await env.TCQ_USER_LIMIT.limit({ key: uid })).success) {
    return errorResponse(429, 'RATE_LIMITED', 'Too many requests; try again in a minute', { 'Retry-After': '60' });
  }

  const which = tcqEnvironment(request.headers.get('X-Revisely-Channel'));
  const apiKey = which === 'live' ? env.TCQ_API_KEY_LIVE : env.TCQ_API_KEY_SANDBOX;
  const base = which === 'live' ? env.TCQ_API_BASE_LIVE : env.TCQ_API_BASE_SANDBOX;
  if (!apiKey || !base) {
    console.error(`tcq: no ${which} key or base URL configured`);
    return errorResponse(503, 'NOT_CONFIGURED', 'This translation is not available right now');
  }

  const ttl = Math.max(0, Math.floor(Number(env.TCQ_EDGE_CACHE_SECONDS ?? '0')) || 0);
  // Keyed by environment and verse only: no user, no token.
  const cacheKey = new Request(`${new URL(request.url).origin}/__cache/tcq/${which}/verses/${key}`);
  if (ttl > 0 && deps.cache) {
    const hit = await deps.cache.match(cacheKey);
    if (hit) {
      const body = (await hit.json()) as { text: string };
      return verseResponse(key, body.text, true);
    }
  }

  let upstream: Response;
  try {
    upstream = await deps.fetch(`${base.replace(/\/+$/, '')}/verses/${key}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('tcq: request failed', err);
    return errorResponse(502, 'UPSTREAM_ERROR', 'Could not reach The Clear Quran; try again');
  }

  const warning = upstream.headers.get('X-Agreement-Warning');
  if (warning) console.warn(`tcq: agreement warning: ${warning}`);

  if (upstream.status === 404) return errorResponse(404, 'NOT_FOUND', 'Verse not found');
  if (upstream.status === 429) {
    const retry = upstream.headers.get('Retry-After') ?? '60';
    console.warn(`tcq: rate limited (${which}), retry after ${retry}`);
    return errorResponse(429, 'RATE_LIMITED', 'The Clear Quran is busy; try again shortly', { 'Retry-After': retry });
  }
  if (!upstream.ok) {
    // 401/403 mean our key (revoked, wrong environment, unsigned agreement); 5xx theirs.
    console.error(`tcq: ${which} answered ${upstream.status}: ${(await upstream.text()).slice(0, 300)}`);
    return errorResponse(502, 'UPSTREAM_ERROR', 'The Clear Quran could not answer; try again');
  }

  let text: unknown;
  try {
    const body = (await upstream.json()) as { success?: boolean; data?: { verse_key?: string; text_english?: unknown } };
    if (body.success !== true || (body.data?.verse_key != null && body.data.verse_key !== key)) throw new Error('shape');
    text = body.data?.text_english;
  } catch {
    text = undefined;
  }
  if (typeof text !== 'string' || text.length === 0) {
    console.error(`tcq: unexpected answer for ${key}`);
    return errorResponse(502, 'UPSTREAM_ERROR', 'The Clear Quran sent an unexpected answer');
  }

  if (ttl > 0 && deps.cache) {
    const stored = new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    });
    ctx.waitUntil(deps.cache.put(cacheKey, stored));
  }
  return verseResponse(key, text, false);
}
