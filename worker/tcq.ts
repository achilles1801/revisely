// The Clear Quran® (English) for the app, fetched from The Clear Quran API with
// our key, which never leaves the worker.
//
// GET /api/tcq/windows/:sura::ayah — the block of verses that holds a verse:
//   up to 30 verses of one surah, aligned (1–30, 31–60, …), the most the API
//   returns per request. One request to The Clear Quran serves the whole block,
//   so moving between verses costs nothing, and the block is cached here.
// GET /api/tcq/verses/:sura::ayah — one verse (builds that predate blocks),
//   served from the same block.
//
// - Only for signed-in users of the app (a Firebase ID token): the text is
//   licensed to Revisely, and the free plan has 10,000 requests a month.
// - The key: TCQ_API_KEY_LIVE for the App Store app and TestFlight
//   (X-Revisely-Channel: production, preview). The Clear Quran documents one
//   base URL, and it refuses sandbox keys ("cannot be used against the
//   production API"), so TCQ_API_KEY_SANDBOX is used only by development builds
//   and only once TCQ_API_BASE_SANDBOX names a sandbox host (empty now: dev
//   builds use the live key too). See tcqEnvironment().
// - The text goes back exactly as the API returns it (`text_english`).
// - Blocks are kept in this data centre's cache for TCQ_EDGE_CACHE_SECONDS
//   (short; 0 turns it off); the app keeps them in memory for one launch.
// - Requests that reach The Clear Quran count against daily budgets, for
//   everyone and per user (worker/budget.ts), so the plan can't be spent.
// - If The Clear Quran refuses the range query, single verses are fetched
//   instead (and for the next 10 minutes), so the text keeps coming, slower.
// - Every answer has a Server-Timing header (sign-in, cache, budget, The Clear
//   Quran), for measuring where time goes.
// - Errors come back as { error: { code, message } } with a status the app
//   maps to "Couldn't load translation" + retry. Never another translation.

import { AuthError, verifyIdToken } from './auth';
import { checkBudget } from './budget';

export interface TcqEnv {
  FIREBASE_PROJECT_ID: string;
  TCQ_API_BASE_LIVE: string;
  /** A sandbox host for development builds; empty or unset: none (live key). */
  TCQ_API_BASE_SANDBOX?: string;
  TCQ_EDGE_CACHE_SECONDS?: string;
  TCQ_API_KEY_LIVE?: string;
  TCQ_API_KEY_SANDBOX?: string;
  /** Per-user limit (wrangler.jsonc "ratelimits"); optional. */
  TCQ_USER_LIMIT?: RateLimit;
  /** Daily budgets (worker/budget.ts); optional. */
  TCQ_BUDGET?: DurableObjectNamespace;
  TCQ_DAILY_LIMIT_LIVE?: string;
  TCQ_DAILY_LIMIT_SANDBOX?: string;
  TCQ_USER_DAILY_LIMIT?: string;
}

const int = (value: string | undefined, fallback: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Never log a key, even if an error message repeats it. */
export function redactKeys(text: string): string {
  return text.replace(/tcq_[a-z]{3}_[a-z]{3}_[A-Za-z0-9_-]*/g, 'tcq_[redacted]');
}

/** Verses per surah (Hafs), to refuse impossible verses before they cost a request. */
export const VERSE_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77,
  227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36,
  25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/** The most verses The Clear Quran returns per request (more is a 400). */
export const WINDOW = 30;

export interface VerseWindow {
  sura: number;
  from: number;
  to: number;
}

/** The aligned block of verses holding sura:ayah (2:45 → 2:31–60; 112:2 → 112:1–4). */
export function windowOf(sura: number, ayah: number): VerseWindow {
  const from = Math.floor((ayah - 1) / WINDOW) * WINDOW + 1;
  return { sura, from, to: Math.min(from + WINDOW - 1, VERSE_COUNTS[sura - 1]) };
}

const PATH = /^\/api\/tcq\/(verses|windows)\/(\d{1,3}):(\d{1,3})$/;
const UPSTREAM_TIMEOUT_MS = 10_000;
/** After The Clear Quran refuses the range query, single verses for this long. */
const RANGE_RETRY_AFTER_MS = 10 * 60_000;

export interface TcqRoute {
  kind: 'verse' | 'window';
  sura: number;
  ayah: number;
}

/** What a path asks for, if it names a real verse. */
export function route(pathname: string): TcqRoute | null {
  const m = PATH.exec(pathname);
  if (!m) return null;
  const sura = Number(m[2]);
  const ayah = Number(m[3]);
  if (sura < 1 || sura > 114 || ayah < 1 || ayah > VERSE_COUNTS[sura - 1]) return null;
  return { kind: m[1] === 'windows' ? 'window' : 'verse', sura, ayah };
}

/** "2:255" if the path asks for one real verse, else null. */
export function verseKey(pathname: string): string | null {
  const r = route(pathname);
  return r && r.kind === 'verse' ? `${r.sura}:${r.ayah}` : null;
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'NOT_CONFIGURED'
  | 'UPSTREAM_ERROR'
  | 'METHOD_NOT_ALLOWED';

export function errorResponse(status: number, code: ErrorCode, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function ok(body: unknown, cached: boolean, timing: Timing) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Cache': cached ? 'HIT' : 'MISS',
      'Server-Timing': timing.header(),
    },
  });
}

/** Server-Timing entries: how long each step took, in milliseconds. */
class Timing {
  private readonly parts: string[] = [];
  async time<T>(name: string, run: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await run();
    } finally {
      this.parts.push(`${name};dur=${Date.now() - start}`);
    }
  }
  add(part: string) {
    this.parts.push(part);
  }
  header() {
    return this.parts.join(', ');
  }
}

export interface TcqVerse {
  verse_key: string;
  text: string;
}

type Outcome =
  | { ok: true; verses: TcqVerse[]; from: number; to: number; cached: boolean }
  | {
      ok: false;
      status: number;
      code: ErrorCode;
      message: string;
      headers?: Record<string, string>;
      /** The Clear Quran turned the query itself down: single verses may still work. */
      unsupported?: boolean;
    };

/**
 * Which key a request uses. The App Store app (`production`) and TestFlight (`preview`) use the
 * live key. Anything else (development builds) uses the sandbox key only if a sandbox host is
 * configured, since sandbox keys are refused at the documented base URL; otherwise the live key
 * too. The header is the app's word, not a guarantee: the sign-in and the daily budgets are what
 * protect the plan, on every route.
 */
export function tcqEnvironment(channel: string | null, sandboxBase?: string): 'live' | 'sandbox' {
  if (channel === 'production' || channel === 'preview') return 'live';
  return sandboxBase?.trim() ? 'sandbox' : 'live';
}

/** The verses of `win`, each with its text, if `body` holds exactly them; else null. */
export function parseWindow(body: unknown, win: VerseWindow): TcqVerse[] | null {
  const b = body as { success?: unknown; data?: unknown } | null;
  if (!b || b.success !== true || !Array.isArray(b.data)) return null;
  const texts = new Map<number, string>();
  for (const item of b.data as { verse_key?: unknown; text_english?: unknown }[]) {
    const m = typeof item?.verse_key === 'string' ? /^(\d+):(\d+)$/.exec(item.verse_key) : null;
    if (!m || Number(m[1]) !== win.sura) return null;
    const n = Number(m[2]);
    if (n < win.from || n > win.to || typeof item.text_english !== 'string' || item.text_english.length === 0) return null;
    texts.set(n, item.text_english);
  }
  const verses: TcqVerse[] = [];
  for (let n = win.from; n <= win.to; n++) {
    const text = texts.get(n);
    if (text === undefined) return null;
    verses.push({ verse_key: `${win.sura}:${n}`, text });
  }
  return verses;
}

/** A cached block, if the entry holds all of it. */
async function readCached(cache: Cache, key: Request, win: VerseWindow): Promise<TcqVerse[] | null> {
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const stored = ((await hit.json()) as { verses?: unknown }).verses;
    if (!Array.isArray(stored)) return null;
    const data = stored.map((v: { verse_key?: unknown; text?: unknown } | null) => ({ verse_key: v?.verse_key, text_english: v?.text }));
    return parseWindow({ success: true, data }, win);
  } catch (err) {
    console.warn('tcq: unreadable cache entry; fetching', err);
    return null;
  }
}

let rangeRefusedAt = -Infinity;

/** For tests: forget that the range query was refused. */
export function resetRangeState(): void {
  rangeRefusedAt = -Infinity;
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
  const asked = route(new URL(request.url).pathname);
  if (!asked) {
    return errorResponse(400, 'BAD_REQUEST', 'Expected /api/tcq/verses/<surah>:<verse> or /api/tcq/windows/<surah>:<verse>');
  }
  const timing = new Timing();

  // Signed-in users of the app only.
  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to load this translation');
  let uid: string;
  try {
    uid = await timing.time('auth', () => verifyIdToken(token, env.FIREBASE_PROJECT_ID, deps.now, deps.fetch));
  } catch (err) {
    if (err instanceof AuthError) return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to load this translation');
    console.error('tcq: could not check the sign-in', err);
    return errorResponse(503, 'UPSTREAM_ERROR', 'Could not check your sign-in; try again');
  }
  if (env.TCQ_USER_LIMIT) {
    let allowed = true;
    try {
      allowed = (await env.TCQ_USER_LIMIT.limit({ key: uid })).success;
    } catch (err) {
      console.error('tcq: rate limiter unavailable', err);
    }
    if (!allowed) {
      return errorResponse(429, 'RATE_LIMITED', 'Too many requests; try again in a minute', { 'Retry-After': '60' });
    }
  }

  const which = tcqEnvironment(request.headers.get('X-Revisely-Channel'), env.TCQ_API_BASE_SANDBOX);
  const apiKey = which === 'live' ? env.TCQ_API_KEY_LIVE : env.TCQ_API_KEY_SANDBOX;
  const base = (which === 'live' ? env.TCQ_API_BASE_LIVE : env.TCQ_API_BASE_SANDBOX)?.replace(/\/+$/, '');
  if (!apiKey || !base) {
    console.error(`tcq: no ${which} key or base URL configured`);
    return errorResponse(503, 'NOT_CONFIGURED', 'This translation is not available right now');
  }

  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const ttl = Math.max(0, Math.floor(Number(env.TCQ_EDGE_CACHE_SECONDS ?? '0')) || 0);
  const cache = ttl > 0 ? deps.cache : null;
  const origin = new URL(request.url).origin;

  /** One request to The Clear Quran, if the budgets allow it. */
  const upstream = async (label: string, url: string, read: (body: unknown) => TcqVerse[] | null, win: VerseWindow): Promise<Outcome> => {
    const budget = await timing.time('budget', () =>
      checkBudget(env.TCQ_BUDGET, {
        uid,
        env: which,
        now,
        limits: {
          liveDaily: int(env.TCQ_DAILY_LIMIT_LIVE, 300),
          sandboxDaily: int(env.TCQ_DAILY_LIMIT_SANDBOX, 100),
          userDaily: int(env.TCQ_USER_DAILY_LIMIT, 150),
        },
      }),
    );
    if (!budget.ok) {
      console.warn(`tcq: daily ${budget.scope === 'user' ? 'per-user' : which} budget spent`);
      return {
        ok: false,
        status: 429,
        code: 'DAILY_LIMIT',
        message: budget.scope === 'user' ? 'Daily limit reached for your account' : 'Daily limit reached',
        headers: { 'Retry-After': String(budget.retryAfter) },
      };
    }

    const start = Date.now();
    let res: Response;
    try {
      res = await timing.time(label, () =>
        deps.fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        }),
      );
    } catch (err) {
      console.error('tcq: request failed', err);
      return { ok: false, status: 502, code: 'UPSTREAM_ERROR', message: 'Could not reach The Clear Quran; try again' };
    }
    const server = Number.parseFloat(res.headers.get('X-Response-Time') ?? '');
    if (Number.isFinite(server)) timing.add(`tcq-server;dur=${server}`);
    const warning = res.headers.get('X-Agreement-Warning');
    if (warning) console.warn(`tcq: agreement warning: ${warning}`);

    if (res.status === 429) {
      const retry = res.headers.get('Retry-After') ?? '60';
      console.warn(`tcq: rate limited (${which}), retry after ${retry}`);
      return { ok: false, status: 429, code: 'RATE_LIMITED', message: 'The Clear Quran is busy; try again shortly', headers: { 'Retry-After': retry } };
    }
    // Refusing the query itself (not our key, not their outage): another form may still work.
    const refused = [400, 403, 404, 405, 501, 503].includes(res.status);
    if (!res.ok) {
      // 401/403 mean our key (revoked, wrong environment, unsigned agreement); 5xx theirs.
      const detail = await res.text().catch(() => '');
      console.error(`tcq: ${which} answered ${res.status} to ${label}: ${redactKeys(detail.slice(0, 300))}`);
      if (res.status === 404) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Verse not found', unsupported: true };
      return { ok: false, status: 502, code: 'UPSTREAM_ERROR', message: 'The Clear Quran could not answer; try again', unsupported: refused };
    }
    const verses = read(await res.json().catch(() => null));
    if (!verses) {
      console.error(`tcq: unexpected answer to ${label} for ${win.sura}:${win.from}-${win.to}`);
      return { ok: false, status: 502, code: 'UPSTREAM_ERROR', message: 'The Clear Quran sent an unexpected answer', unsupported: true };
    }
    console.log(`tcq: ${label} ${win.sura}:${win.from}-${win.to} (${which}) in ${Date.now() - start} ms`);
    return { ok: true, verses, from: win.from, to: win.to, cached: false };
  };

  const remember = (key: Request, verses: TcqVerse[]) => {
    if (!cache) return;
    const stored = new Response(JSON.stringify({ verses }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` },
    });
    ctx.waitUntil(cache.put(key, stored));
  };

  const key = `${asked.sura}:${asked.ayah}`;
  let result: Outcome | null = null;

  // The block, from this data centre's cache or in one request.
  const win = windowOf(asked.sura, asked.ayah);
  const winKey = new Request(`${origin}/__cache/tcq/${which}/windows/${win.sura}:${win.from}-${win.to}`);
  const cachedWin = cache ? await timing.time('cache', () => readCached(cache, winKey, win)) : null;
  if (cachedWin) {
    result = { ok: true, verses: cachedWin, from: win.from, to: win.to, cached: true };
  } else if (Date.now() - rangeRefusedAt >= RANGE_RETRY_AFTER_MS) {
    const limit = win.to - win.from + 1;
    result = await upstream(
      'tcq-window',
      `${base}/verses?surah=${win.sura}&from_verse=${win.from}&to_verse=${win.to}&limit=${limit}`,
      (body) => parseWindow(body, win),
      win,
    );
    if (result.ok) remember(winKey, result.verses);
    else if (result.unsupported) {
      rangeRefusedAt = Date.now();
      console.warn('tcq: the range query was refused; single verses for 10 minutes');
    }
  }

  // Single verses: when the range query isn't available.
  if (!result || (!result.ok && result.unsupported)) {
    const one: VerseWindow = { sura: asked.sura, from: asked.ayah, to: asked.ayah };
    const oneKey = new Request(`${origin}/__cache/tcq/${which}/windows/${key}-${asked.ayah}`);
    const cachedOne = cache ? await timing.time('cache', () => readCached(cache, oneKey, one)) : null;
    if (cachedOne) {
      result = { ok: true, verses: cachedOne, from: asked.ayah, to: asked.ayah, cached: true };
    } else {
      result = await upstream(
        'tcq-verse',
        `${base}/verses/${key}`,
        (body) => {
          const b = body as { success?: unknown; data?: { verse_key?: unknown; text_english?: unknown } } | null;
          if (!b || b.success !== true || (b.data?.verse_key != null && b.data.verse_key !== key)) return null;
          return parseWindow({ success: true, data: [{ verse_key: key, text_english: b.data?.text_english }] }, one);
        },
        one,
      );
      if (result.ok) remember(oneKey, result.verses);
    }
  }

  if (!result.ok) {
    return errorResponse(result.status, result.code, result.message, { ...result.headers, 'Server-Timing': timing.header() });
  }
  if (asked.kind === 'window') {
    return ok({ surah: asked.sura, from: result.from, to: result.to, verses: result.verses }, result.cached, timing);
  }
  const verse = result.verses.find((v) => v.verse_key === key)!;
  return ok({ verse_key: key, text: verse.text }, result.cached, timing);
}
