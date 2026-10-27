// Verifies a Firebase Auth ID token (the app's signed-in user) without any
// dependency: RS256 against Google's published keys, then the claims Firebase
// documents (aud, iss, exp, iat, auth_time, sub).
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Clock skew allowed between Google and Cloudflare, in seconds. */
const SKEW = 60;
/** At most one fetch of Google's keys a minute, however many requests need them. */
const REFETCH_AFTER = 60;
const FETCH_TIMEOUT_MS = 5000;

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

/** The token is not a valid sign-in: answer 401. */
export class AuthError extends Error {}

let keys: { byKid: Map<string, CryptoKey>; expires: number } | null = null;
let lastFetch = -Infinity;

/** For tests: forget the cached keys. */
export function resetKeyCache(): void {
  keys = null;
  lastFetch = -Infinity;
}

async function fetchKeys(now: number, fetchImpl: typeof fetch): Promise<void> {
  lastFetch = now;
  const res = await fetchImpl(JWKS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Google keys: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const byKid = new Map<string, CryptoKey>();
  for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
    if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string' || !jwk.n || !jwk.e) continue;
    byKid.set(
      jwk.kid,
      await crypto.subtle.importKey(
        'jwk',
        { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    );
  }
  if (byKid.size === 0) throw new Error('Google keys: none');
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  keys = { byKid, expires: now + Math.min(maxAge, 6 * 3600) };
}

async function signingKey(kid: string, now: number, fetchImpl: typeof fetch): Promise<CryptoKey> {
  const stale = !keys || keys.expires <= now;
  // Google rotates keys: an unknown kid refetches too. Either way at most once a
  // minute, so tokens with made-up kids can't make every request fetch.
  const wanted = stale || !keys!.byKid.has(kid);
  if (wanted && now - lastFetch >= REFETCH_AFTER) {
    try {
      await fetchKeys(now, fetchImpl);
    } catch (err) {
      // Keep using the keys we have (Google publishes them well ahead of use).
      if (!keys) throw err;
      console.warn('auth: could not refresh Google keys; using the previous ones', err);
    }
  }
  if (!keys) throw new Error('Google keys: unavailable');
  const key = keys.byKid.get(kid);
  if (!key) throw new AuthError('Unknown signing key');
  return key;
}

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new AuthError('Malformed token');
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new AuthError('Malformed token');
  }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeObject(part: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(base64UrlBytes(part)));
  } catch {
    throw new AuthError('Malformed token');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('Malformed token');
  return value as Record<string, unknown>;
}

/**
 * The signed-in user's id if `token` is a valid ID token for `projectId`;
 * throws AuthError otherwise (and a plain Error only if Google's keys can't be
 * had at all). `now` is in seconds.
 */
export async function verifyIdToken(
  token: string,
  projectId: string,
  now: number = Math.floor(Date.now() / 1000),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new AuthError('Malformed token');
  const header = decodeObject(parts[0]);
  const claims = decodeObject(parts[1]);
  const signature = base64UrlBytes(parts[2]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new AuthError('Unexpected token header');

  const key = await signingKey(header.kid, now, fetchImpl);
  let valid = false;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) throw new AuthError('Bad signature');

  const num = (k: string) => (typeof claims[k] === 'number' ? (claims[k] as number) : NaN);
  if (claims.aud !== projectId) throw new AuthError('Wrong audience');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new AuthError('Wrong issuer');
  if (!(num('exp') > now - SKEW)) throw new AuthError('Expired');
  if (!(num('iat') <= now + SKEW)) throw new AuthError('Issued in the future');
  if (!(num('auth_time') <= now + SKEW)) throw new AuthError('Signed in in the future');
  const sub = claims.sub;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) throw new AuthError('No user');
  return sub;
}
