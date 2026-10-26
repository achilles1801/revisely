// Verifies a Firebase Auth ID token (the app's signed-in user) without any
// dependency: RS256 against Google's published keys, then the claims Firebase
// documents (aud, iss, exp, iat, auth_time, sub).
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Clock skew allowed between Google and Cloudflare, in seconds. */
const SKEW = 60;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export class AuthError extends Error {}

let keys: { byKid: Map<string, CryptoKey>; expires: number; fetchedAt: number } | null = null;

/** For tests: forget the cached keys. */
export function resetKeyCache(): void {
  keys = null;
}

async function signingKey(kid: string, now: number, fetchImpl: typeof fetch): Promise<CryptoKey> {
  const stale = !keys || keys.expires <= now;
  // Google rotates keys; an unknown kid refetches, but at most once a minute
  // (tokens with made-up kids must not make every request fetch the keys).
  const unknown = keys != null && !keys.byKid.has(kid) && now - keys.fetchedAt >= 60;
  if (stale || unknown) {
    const res = await fetchImpl(JWKS_URL);
    if (!res.ok) throw new Error(`Google keys: ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const byKid = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'RSA' || !jwk.kid) continue;
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
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
    keys = { byKid, expires: now + Math.min(maxAge, 6 * 3600), fetchedAt: now };
  }
  const key = keys!.byKid.get(kid);
  if (!key) throw new AuthError('Unknown signing key');
  return key;
}

function base64UrlBytes(part: string): Uint8Array<ArrayBuffer> {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlBytes(part))) as Record<string, unknown>;
  } catch {
    throw new AuthError('Malformed token');
  }
}

/**
 * The signed-in user's id if `token` is a valid ID token for `projectId`;
 * throws AuthError otherwise. `now` is in seconds.
 */
export async function verifyIdToken(
  token: string,
  projectId: string,
  now: number = Math.floor(Date.now() / 1000),
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token');
  const header = decodeJson(parts[0]);
  const claims = decodeJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new AuthError('Unexpected token header');

  const key = await signingKey(header.kid, now, fetchImpl);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlBytes(parts[2]), signed);
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
