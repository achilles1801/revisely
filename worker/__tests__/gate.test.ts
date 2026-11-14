/**
 * @jest-environment node
 */
// The sign-in gate in front of dev.revisely.app (worker/gate.ts): who gets in, what stays open, the cookie.
import worker from '../index';
import { resetKeyCache } from '../auth';
import { GATE_CLAIM, GATE_COOKIE, gate, isOpen } from '../gate';

const PROJECT = 'revisely-dev';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const NOW = 1_794_700_000;

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
beforeEach(() => resetKeyCache());

const b64url = (s: string | Uint8Array) => Buffer.from(s).toString('base64url');

async function token(claims: Record<string, unknown> = {}) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: 'key-1', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'majd', email: 'someone@example.com', iat: NOW - 60, exp: NOW + 3000, auth_time: NOW - 600, ...claims }),
  );
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signer.privateKey, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(sig)}`;
}

const keys = (async (input: RequestInfo | URL) => {
  if (String(input) === JWKS_URL) return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }] }), { headers: { 'Cache-Control': 'max-age=20000' } });
  return new Response('not found', { status: 404 });
}) as typeof fetch;

const ENV = { DEV_GATE: '1', FIREBASE_PROJECT_ID: PROJECT };
const deps = { now: NOW, fetch: keys };
const page = (path: string, cookie?: string) =>
  new Request(`https://dev.revisely.app${path}`, cookie ? { headers: { Cookie: `other=1; ${GATE_COOKIE}=${cookie}` } } : {});
const post = (path: string, body: unknown, origin = 'https://dev.revisely.app') =>
  new Request(`https://dev.revisely.app${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('the dev site gate', () => {
  it('shows the gate page to anyone without the cookie, on every page', async () => {
    for (const path of ['/', '/apply/', '/premium/', '/account/', '/assets/site.css', '/privacy/']) {
      const res = await gate(page(path), ENV, deps);
      expect(res?.status).toBe(401);
      expect(res?.headers.get('Content-Type')).toContain('text/html');
      expect(await res?.text()).toContain('Revisely Dev');
    }
  });

  it('leaves the API, the web config, robots.txt and the gate page’s logo open', async () => {
    for (const path of ['/api/tcq/policy', '/api/tcq/windows/2:255', '/__/firebase/init.json', '/robots.txt', '/favicon.svg', '/assets/img/logo-dark.svg']) {
      expect(await gate(page(path), ENV, deps)).toBeNull();
    }
    expect(isOpen('/apiary/')).toBe(false);
    expect(isOpen('/assets/img/logo-light.svg.html')).toBe(false);
  });

  it('lets in an account with the devSite claim', async () => {
    expect(await gate(page('/apply/', await token({ [GATE_CLAIM]: true })), ENV, deps)).toBeNull();
  });

  it('turns away a signed-in account without the claim, an expired token, another project’s token and junk', async () => {
    const cases = [
      await token(),
      await token({ [GATE_CLAIM]: 'true' }),
      await token({ [GATE_CLAIM]: true, exp: NOW - 3600 }),
      await token({ [GATE_CLAIM]: true, aud: 'revision-buddy-3a398', iss: 'https://securetoken.google.com/revision-buddy-3a398' }),
      'not-a-token',
    ];
    for (const t of cases) expect((await gate(page('/', t), ENV, deps))?.status).toBe(401);
  });

  it('keeps an allowed token in a secure cookie for as long as it lasts', async () => {
    const t = await token({ [GATE_CLAIM]: true, exp: NOW + 1800 });
    const res = await gate(post('/__gate/session', { token: t }), ENV, deps);
    expect(res?.status).toBe(204);
    const cookie = res?.headers.get('Set-Cookie') ?? '';
    expect(cookie).toBe(`${GATE_COOKIE}=${t}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=1800`);
  });

  it('refuses a session for an account without the claim, a bad token, another site, or a GET', async () => {
    const no = await gate(post('/__gate/session', { token: await token() }), ENV, deps);
    expect(no?.status).toBe(403);
    expect(await no?.json()).toEqual({ error: 'not_allowed', email: 'someone@example.com' });
    expect(no?.headers.get('Set-Cookie')).toBeNull();
    expect((await gate(post('/__gate/session', { token: 'junk' }), ENV, deps))?.status).toBe(401);
    expect((await gate(post('/__gate/session', { token: await token({ [GATE_CLAIM]: true }) }, 'https://evil.example'), ENV, deps))?.status).toBe(403);
    expect((await gate(page('/__gate/session'), ENV, deps))?.status).toBe(405);
  });

  it('many requests at once on a new isolate all get in: they wait for the one fetch of Google’s keys', async () => {
    let calls = 0;
    const slowKeys = (async (input: RequestInfo | URL) => {
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      return keys(input);
    }) as typeof fetch;
    const t = await token({ [GATE_CLAIM]: true });
    const results = await Promise.all(['/', '/assets/site.css', '/assets/site-i18n.js', '/assets/apply.js', '/premium/'].map((p) => gate(page(p, t), ENV, { now: NOW, fetch: slowKeys })));
    expect(results).toEqual([null, null, null, null, null]);
    expect(calls).toBe(1);
  });

  it('signing out clears the cookie', async () => {
    const res = await gate(post('/__gate/signout', {}), ENV, deps);
    expect(res?.status).toBe(204);
    expect(res?.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('the worker gates only where DEV_GATE is set, and keeps noindex on the gate page', async () => {
    const assets = { fetch: jest.fn(async () => new Response('page')) };
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const prod = await worker.fetch(page('/'), { FIREBASE_PROJECT_ID: 'revision-buddy-3a398', ASSETS: assets } as never, ctx);
    expect(await prod.text()).toBe('page');
    const dev = await worker.fetch(page('/'), { ...ENV, NOINDEX: '1', ASSETS: assets } as never, ctx);
    expect(dev.status).toBe(401);
    expect(dev.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});
