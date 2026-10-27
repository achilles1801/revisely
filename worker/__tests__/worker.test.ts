/**
 * @jest-environment node
 */
// The worker's /api/tcq route: sign-in check, key choice, exact text, caching,
// and every way The Clear Quran API can fail.

import worker from '../index';
import { resetKeyCache, verifyIdToken } from '../auth';
import { handleTcq, redactKeys, tcqEnvironment, TcqEnv, VERSE_COUNTS, verseKey } from '../tcq';
import { secondsToMidnight, spend, TcqBudget } from '../budget';
import { getSurahDisplay } from '../../src/lib/quranData';

const PROJECT = 'revision-buddy-3a398';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const NOW = 1_793_000_000;

let signer: CryptoKeyPair;
let jwk: JsonWebKey;

beforeAll(async () => {
  signer = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey('jwk', signer.publicKey);
});

beforeEach(() => {
  resetKeyCache();
  // The worker logs failures for `wrangler tail`; expected here.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === 'string' ? bytes : bytes).toString('base64url');

async function token(claims: Record<string, unknown> = {}, kid = 'key-1', key = signer.privateKey) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: PROJECT,
      iss: `https://securetoken.google.com/${PROJECT}`,
      sub: 'user-123',
      iat: NOW - 100,
      exp: NOW + 3000,
      auth_time: NOW - 1000,
      ...claims,
    }),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`)),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

const ENV: TcqEnv = {
  FIREBASE_PROJECT_ID: PROJECT,
  TCQ_API_BASE_LIVE: 'https://api.theclearquran.org',
  TCQ_API_BASE_SANDBOX: 'https://sandbox.example',
  TCQ_EDGE_CACHE_SECONDS: '3600',
  TCQ_API_KEY_LIVE: 'tcq_eng_liv_TEST',
  TCQ_API_KEY_SANDBOX: 'tcq_eng_sbx_TEST',
};

// The text as The Clear Quran shows it: brackets and a footnote marker, kept as is.
const TEXT = 'Allah! There is no god ˹worthy of worship˺ except Him,<footnote id="57" number="1"></footnote> the Ever-Living';

function upstreamOk(key = '2:255', text: unknown = TEXT) {
  return new Response(JSON.stringify({ success: true, data: { verse_key: key, text_english: text, text_uthmani: 'x' } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fetch that serves Google's keys and hands everything else to `api`. */
function fakeFetch(api: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === JWKS_URL) {
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }), {
        headers: { 'Cache-Control': 'public, max-age=20000' },
      });
    }
    calls.push({ url, init });
    return api(url, init);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: jest.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: jest.fn(async (req: Request, res: Response) => void store.set(req.url, res)),
  } as unknown as Cache & { store: Map<string, Response> };
}

const ctx = () => {
  const waits: Promise<unknown>[] = [];
  return { waits, waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException() {} };
};

async function call(
  path: string,
  { auth, channel, env = ENV, api = () => upstreamOk(), cache = memoryCache(), method = 'GET' }: {
    auth?: string | null;
    channel?: string;
    env?: TcqEnv;
    api?: (url: string, init?: RequestInit) => Response | Promise<Response>;
    cache?: ReturnType<typeof memoryCache> | null;
    method?: string;
  } = {},
) {
  const headers: Record<string, string> = {};
  const t = auth === undefined ? await token() : auth;
  if (t) headers.Authorization = `Bearer ${t}`;
  if (channel) headers['X-Revisely-Channel'] = channel;
  const f = fakeFetch(api);
  const c = ctx();
  const res = await handleTcq(new Request(`https://revisely.app${path}`, { method, headers }), env, c, {
    fetch: f.fn,
    cache,
    now: NOW,
  });
  await Promise.all(c.waits);
  return { res, body: (await res.json()) as any, upstream: f.calls, cache };
}

describe('which verses', () => {
  it('accepts real verses only', () => {
    expect(verseKey('/api/tcq/verses/2:255')).toBe('2:255');
    expect(verseKey('/api/tcq/verses/2:286')).toBe('2:286');
    expect(verseKey('/api/tcq/verses/2:287')).toBeNull();
    expect(verseKey('/api/tcq/verses/115:1')).toBeNull();
    expect(verseKey('/api/tcq/verses/1:0')).toBeNull();
    expect(verseKey('/api/tcq/verses/1:1/x')).toBeNull();
    expect(verseKey('/api/tcq/verses/abc')).toBeNull();
  });

  it("has the app's verse counts (6,236 verses)", () => {
    expect(VERSE_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
    VERSE_COUNTS.forEach((n, i) => expect(getSurahDisplay(i + 1)?.ayahCount).toBe(n));
  });

  it('a bad verse costs no request', async () => {
    const { res, body, upstream } = await call('/api/tcq/verses/2:999');
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(upstream).toHaveLength(0);
  });
});

describe('sign-in', () => {
  it('refuses requests without a token, or with a forged, expired or foreign one', async () => {
    const other = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    const cases = [
      null,
      'not-a-jwt',
      await token({}, 'key-1', other.privateKey), // signed by someone else
      await token({ exp: NOW - 120 }),
      await token({ aud: 'another-project' }),
      await token({ iss: 'https://securetoken.google.com/another-project' }),
      await token({ sub: '' }),
      await token({}, 'unknown-kid'),
    ];
    for (const auth of cases) {
      const { res, body, upstream } = await call('/api/tcq/verses/2:255', { auth });
      expect(res.status).toBe(401);
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(upstream).toHaveLength(0);
    }
  });

  it('accepts a valid ID token', async () => {
    await expect(verifyIdToken(await token(), PROJECT, NOW, fakeFetch(() => upstreamOk()).fn)).resolves.toBe('user-123');
  });

  it('a per-user limit answers 429 before calling The Clear Quran', async () => {
    const limit = jest.fn(async () => ({ success: false }));
    const { res, body, upstream } = await call('/api/tcq/verses/2:255', { env: { ...ENV, TCQ_USER_LIMIT: { limit } } });
    expect(limit).toHaveBeenCalledWith({ key: 'user-123' });
    expect(res.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(upstream).toHaveLength(0);
  });
});

describe('The Clear Quran API', () => {
  it('the App Store app and TestFlight use the live key; dev the sandbox one only with a sandbox host', async () => {
    expect(tcqEnvironment('production')).toBe('live');
    expect(tcqEnvironment('preview')).toBe('live');
    expect(tcqEnvironment('preview', 'https://sandbox.example')).toBe('live');
    // Sandbox keys are refused at the documented base URL: without a sandbox host, dev uses live.
    expect(tcqEnvironment('development')).toBe('live');
    expect(tcqEnvironment(null, '')).toBe('live');
    expect(tcqEnvironment('development', '  ')).toBe('live');
    expect(tcqEnvironment('development', 'https://sandbox.example')).toBe('sandbox');

    const live = await call('/api/tcq/verses/2:255', { channel: 'production' });
    expect(live.upstream[0].url).toBe('https://api.theclearquran.org/verses/2:255');
    expect((live.upstream[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tcq_eng_liv_TEST');

    const preview = await call('/api/tcq/verses/2:255', { channel: 'preview' });
    expect(preview.upstream[0].url).toBe('https://api.theclearquran.org/verses/2:255');
    expect((preview.upstream[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tcq_eng_liv_TEST');

    const dev = await call('/api/tcq/verses/2:255', { channel: 'development' });
    expect(dev.upstream[0].url).toBe('https://sandbox.example/verses/2:255');
    expect((dev.upstream[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tcq_eng_sbx_TEST');

    // As configured today (no sandbox host): dev builds use the live key too.
    const devNow = await call('/api/tcq/verses/2:255', {
      channel: 'development',
      env: { ...ENV, TCQ_API_BASE_SANDBOX: '' },
    });
    expect(devNow.upstream[0].url).toBe('https://api.theclearquran.org/verses/2:255');
    expect((devNow.upstream[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tcq_eng_liv_TEST');
  });

  it('returns the text exactly as given, and never the key', async () => {
    const { res, body } = await call('/api/tcq/verses/2:255', { channel: 'production' });
    expect(res.status).toBe(200);
    expect(body).toEqual({ verse_key: '2:255', text: TEXT });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const raw = JSON.stringify(body) + JSON.stringify([...res.headers]);
    expect(raw).not.toContain('tcq_eng_');
  });

  it('without the key for that channel: 503, no request', async () => {
    const { res, body, upstream } = await call('/api/tcq/verses/2:255', {
      channel: 'production',
      env: { ...ENV, TCQ_API_KEY_LIVE: undefined },
    });
    expect(res.status).toBe(503);
    expect(body.error.code).toBe('NOT_CONFIGURED');
    expect(upstream).toHaveLength(0);
  });

  it.each([
    ['rate limited', () => new Response('{}', { status: 429, headers: { 'Retry-After': '30' } }), 429, 'RATE_LIMITED'],
    ['no such verse', () => new Response('{}', { status: 404 }), 404, 'NOT_FOUND'],
    ['our key refused', () => new Response('{"success":false}', { status: 401 }), 502, 'UPSTREAM_ERROR'],
    ['their server error', () => new Response('oops', { status: 500 }), 502, 'UPSTREAM_ERROR'],
    ['endpoint disabled', () => new Response('{}', { status: 503 }), 502, 'UPSTREAM_ERROR'],
    ['not JSON', () => new Response('<html>', { status: 200 }), 502, 'UPSTREAM_ERROR'],
    ['success: false', () => new Response('{"success":false}', { status: 200 }), 502, 'UPSTREAM_ERROR'],
    ['another verse', () => upstreamOk('2:256'), 502, 'UPSTREAM_ERROR'],
    ['no text', () => upstreamOk('2:255', ''), 502, 'UPSTREAM_ERROR'],
    [
      'unreachable',
      () => {
        throw new TypeError('network down');
      },
      502,
      'UPSTREAM_ERROR',
    ],
  ])('%s: %d %s, nothing cached', async (_name, api, status, code) => {
    const { res, body, cache } = await call('/api/tcq/verses/2:255', { api: api as () => Response });
    expect(res.status).toBe(status);
    expect(body.error.code).toBe(code);
    expect(body.text).toBeUndefined();
    expect(cache!.store.size).toBe(0);
    if (status === 429) expect(res.headers.get('Retry-After')).toBe('30');
  });
});

describe('edge cache', () => {
  it('keeps a verse for TCQ_EDGE_CACHE_SECONDS, per environment, keyed without user or token', async () => {
    const cache = memoryCache();
    const first = await call('/api/tcq/verses/2:255', { cache, channel: 'production' });
    expect(first.res.headers.get('X-Cache')).toBe('MISS');
    expect([...cache.store.keys()]).toEqual(['https://revisely.app/__cache/tcq/live/verses/2:255']);
    expect(cache.store.get('https://revisely.app/__cache/tcq/live/verses/2:255')!.headers.get('Cache-Control')).toBe(
      'public, max-age=3600',
    );

    const second = await call('/api/tcq/verses/2:255', { cache, channel: 'production' });
    expect(second.upstream).toHaveLength(0);
    expect(second.res.headers.get('X-Cache')).toBe('HIT');
    expect(second.body).toEqual({ verse_key: '2:255', text: TEXT });

    // TestFlight shares the live entry; the sandbox (dev, with a sandbox host) doesn't read it.
    const preview = await call('/api/tcq/verses/2:255', { cache, channel: 'preview' });
    expect(preview.upstream).toHaveLength(0);
    const sandbox = await call('/api/tcq/verses/2:255', { cache, channel: 'development' });
    expect(sandbox.upstream).toHaveLength(1);
  });

  it('still checks the sign-in before answering from the cache', async () => {
    const cache = memoryCache();
    await call('/api/tcq/verses/2:255', { cache });
    const { res } = await call('/api/tcq/verses/2:255', { cache, auth: null });
    expect(res.status).toBe(401);
  });

  it('0 turns it off', async () => {
    const cache = memoryCache();
    await call('/api/tcq/verses/2:255', { cache, env: { ...ENV, TCQ_EDGE_CACHE_SECONDS: '0' } });
    expect(cache.store.size).toBe(0);
  });
});

describe('routing', () => {
  const env = { ...ENV, ASSETS: { fetch: jest.fn(async () => new Response('page')) } };

  it('serves the site from the assets and unknown /api paths as 404', async () => {
    const c = ctx();
    const page = await worker.fetch(new Request('https://revisely.app/privacy/'), env, c);
    expect(await page.text()).toBe('page');
    const missing = await worker.fetch(new Request('https://revisely.app/api/other'), env, c);
    expect(missing.status).toBe(404);
  });

  it('refuses anything but GET', async () => {
    const { res } = await call('/api/tcq/verses/2:255', { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('sign-in: odd tokens are refused with 401, never a server error', () => {
  const enc = (o: unknown) => b64url(JSON.stringify(o));
  it.each([
    ['alg none', async () => `${enc({ alg: 'none', kid: 'key-1' })}.${(await token()).split('.')[1]}.`],
    ['alg HS256', async () => `${enc({ alg: 'HS256', kid: 'key-1' })}.${(await token()).split('.')[1]}.c2ln`],
    ['no kid', async () => `${enc({ alg: 'RS256' })}.${(await token()).split('.')[1]}.c2ln`],
    ['signature "A"', async () => (await token()).replace(/\.[^.]+$/, '.A')],
    ['signature "@@@@"', async () => (await token()).replace(/\.[^.]+$/, '.@@@@')],
    ['header null', async () => `${enc(null)}.${(await token()).split('.')[1]}.c2ln`],
    ['claims an array', async () => `${(await token()).split('.')[0]}.${enc([1])}.c2ln`],
    ['issued in the future', async () => token({ iat: NOW + 600 })],
    ['signed in in the future', async () => token({ auth_time: NOW + 600 })],
    ['no auth_time', async () => token({ auth_time: undefined })],
  ])('%s', async (_name, make) => {
    const { res, upstream } = await call('/api/tcq/verses/2:255', { auth: await make() });
    expect(res.status).toBe(401);
    expect(upstream).toHaveLength(0);
  });
});

describe("Google's keys", () => {
  async function keyPair() {
    return (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
  }

  it('a rotated key is picked up, but unknown kids refetch at most once a minute', async () => {
    const second = await keyPair();
    const secondJwk = await crypto.subtle.exportKey('jwk', second.publicKey);
    let published = [{ ...jwk, kid: 'key-1' }];
    const fetches: string[] = [];
    const f = (async (url: string) => {
      fetches.push(String(url));
      return new Response(JSON.stringify({ keys: published }), { headers: { 'Cache-Control': 'max-age=20000' } });
    }) as unknown as typeof fetch;
    await verifyIdToken(await token(), PROJECT, NOW, f);
    expect(fetches).toHaveLength(1);
    const rotated = await token({}, 'key-2', second.privateKey);
    // Not published yet: refused, and within the minute no more fetches however many tries.
    await expect(verifyIdToken(rotated, PROJECT, NOW + 10, f)).rejects.toThrow('Unknown signing key');
    expect(fetches).toHaveLength(1);
    published = [...published, { ...secondJwk, kid: 'key-2' }];
    await expect(verifyIdToken(rotated, PROJECT, NOW + 30, f)).rejects.toThrow('Unknown signing key');
    expect(fetches).toHaveLength(1);
    // A minute on, it is fetched and accepted.
    await expect(verifyIdToken(rotated, PROJECT, NOW + 61, f)).resolves.toBe('user-123');
    expect(fetches).toHaveLength(2);
  });

  it('if a refresh fails, the keys it had keep working', async () => {
    let up = true;
    const f = (async () =>
      up
        ? new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1' }] }), { headers: { 'Cache-Control': 'max-age=100' } })
        : new Response('down', { status: 503 })) as unknown as typeof fetch;
    await verifyIdToken(await token(), PROJECT, NOW, f);
    up = false;
    // The keys are past their max-age and Google is down: the old ones still verify.
    await expect(verifyIdToken(await token(), PROJECT, NOW + 200, f)).resolves.toBe('user-123');
  });

  it("with no keys at all and Google unreachable: 503 (not the user's fault), then no hammering", async () => {
    const f = jest.fn(async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const res = await handleTcq(
      new Request('https://revisely.app/api/tcq/verses/1:1', { headers: { Authorization: `Bearer ${await token()}` } }),
      ENV,
      ctx(),
      { fetch: f, cache: null, now: NOW },
    );
    expect(res.status).toBe(503);
    await handleTcq(
      new Request('https://revisely.app/api/tcq/verses/1:1', { headers: { Authorization: `Bearer ${await token()}` } }),
      ENV,
      ctx(),
      { fetch: f, cache: null, now: NOW + 5 },
    );
    expect(f).toHaveBeenCalledTimes(1);
  });
});

function fakeBudget() {
  const store = new Map<string, unknown>();
  const storage = {
    get: async (k: string) => store.get(k),
    put: async (k: string, v: unknown) => void store.set(k, v),
    deleteAll: async () => store.clear(),
  };
  const object = new TcqBudget({ storage } as unknown as DurableObjectState);
  const ns = {
    idFromName: () => ({}),
    get: () => ({ fetch: (url: string, init?: RequestInit) => object.fetch(new Request(url, init)) }),
  } as unknown as DurableObjectNamespace;
  return { store, ns, storage };
}

describe('daily budgets', () => {
  const limits = { liveDaily: 3, sandboxDaily: 1, userDaily: 2 };

  it('counts per user and for everyone, per key, and resets at midnight UTC', async () => {
    const { storage } = fakeBudget();
    const day1 = Date.UTC(2026, 9, 26, 12) / 1000;
    const go = (uid: string, env: 'live' | 'sandbox', now = day1) => spend(storage as never, { uid, env, now, limits });
    expect(await go('a', 'live')).toEqual({ ok: true });
    expect(await go('a', 'live')).toEqual({ ok: true });
    expect(await go('a', 'live')).toEqual({ ok: false, scope: 'user', retryAfter: 12 * 3600 });
    expect(await go('b', 'live')).toEqual({ ok: true }); // 3 of 3 for everyone
    expect(await go('c', 'live')).toMatchObject({ ok: false, scope: 'everyone' });
    expect(await go('c', 'sandbox')).toEqual({ ok: true }); // the sandbox key has its own count
    // The next day starts again.
    expect(await go('a', 'live', day1 + 86_400)).toEqual({ ok: true });
    expect(secondsToMidnight(Date.UTC(2026, 9, 26, 23, 59, 30) / 1000)).toBe(30);
  });

  it('a spent budget answers 429 DAILY_LIMIT until midnight, and costs no request', async () => {
    const { ns } = fakeBudget();
    const env = { ...ENV, TCQ_BUDGET: ns, TCQ_DAILY_LIMIT_LIVE: '1', TCQ_USER_DAILY_LIMIT: '10' };
    const first = await call('/api/tcq/verses/2:255', { env, channel: 'production', cache: null });
    expect(first.res.status).toBe(200);
    const second = await call('/api/tcq/verses/2:256', { env, channel: 'production', cache: null });
    expect(second.res.status).toBe(429);
    expect(second.body.error.code).toBe('DAILY_LIMIT');
    expect(Number(second.res.headers.get('Retry-After'))).toBe(secondsToMidnight(NOW));
    expect(second.upstream).toHaveLength(0);
  });

  it('answers from the cache cost nothing', async () => {
    const { ns, store } = fakeBudget();
    const env = { ...ENV, TCQ_BUDGET: ns };
    const cache = memoryCache();
    await call('/api/tcq/verses/2:255', { env, cache, channel: 'production' });
    await call('/api/tcq/verses/2:255', { env, cache, channel: 'production' });
    expect(store.get('all:live')).toBe(1);
  });

  it('if the budget can’t be reached, the request goes through (logged)', async () => {
    const broken = { idFromName: () => ({}), get: () => ({ fetch: async () => { throw new Error('DO down'); } }) };
    const { res } = await call('/api/tcq/verses/2:255', { env: { ...ENV, TCQ_BUDGET: broken as never } });
    expect(res.status).toBe(200);
  });
});

describe('robustness', () => {
  it('a rate limiter that fails lets the request through', async () => {
    const limit = jest.fn(async () => { throw new Error('limiter down'); });
    const { res } = await call('/api/tcq/verses/2:255', { env: { ...ENV, TCQ_USER_LIMIT: { limit } } });
    expect(res.status).toBe(200);
  });

  it('an unreadable cache entry is fetched again', async () => {
    const cache = memoryCache();
    cache.store.set('https://revisely.app/__cache/tcq/sandbox/verses/2:255', new Response('not json'));
    const { res, upstream } = await call('/api/tcq/verses/2:255', { cache });
    expect(res.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });

  it('an upstream timeout is a 502', async () => {
    const { res, body } = await call('/api/tcq/verses/2:255', {
      api: () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });
    expect(res.status).toBe(502);
    expect(body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('never logs a key', () => {
    expect(redactKeys('bad key tcq_eng_liv_AbC123-x_y given')).toBe('bad key tcq_[redacted] given');
    expect(redactKeys('tcq_eng_sbx_zzz')).toBe('tcq_[redacted]');
  });

  it('anything unexpected is a JSON 500, never Cloudflare’s HTML error page', async () => {
    const broken = {
      url: 'https://revisely.app/api/tcq/verses/1:1',
      get method(): string {
        throw new Error('boom');
      },
    } as unknown as Request;
    const res = await worker.fetch(broken, { ...ENV, ASSETS: { fetch: jest.fn() } }, ctx());
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
