/**
 * Both environments' metrics in one console (Majd, Nov 14 2026: "console should have both dev and production metrics";
 * he chose one console with a switch). The console signs in to one project; that project's server fetches the other
 * project's numbers from its `consoleMetrics` endpoint, proving who it is with a Google-signed ID token for its own
 * service account (from the metadata server; no key anywhere).
 *
 * What crosses: the Overview's aggregate numbers only (crash rates, Revo usage and spend, downloads, functions), with
 * account ids cut to 8 characters. Never conversations, answers or anything a person wrote: Revo conversations of an
 * environment open only in that environment's own console.
 *
 * Who may read whom is this file's METRICS_READERS: production answers revisely-dev's server and nobody else.
 */
import { createPublicKey, verify, JsonWebKey } from 'crypto';

export type EnvId = 'prod' | 'dev';

export interface Environment {
  env: EnvId;
  label: string;
  /** the service account its functions run as (each project's default compute account) */
  runtimeServiceAccount: string;
}

export const ENVIRONMENTS: Record<string, Environment> = {
  'revision-buddy-3a398': { env: 'prod', label: 'Production', runtimeServiceAccount: '169239488140-compute@developer.gserviceaccount.com' },
  'revisely-dev': { env: 'dev', label: 'Dev', runtimeServiceAccount: '433792838929-compute@developer.gserviceaccount.com' },
};

/** project → the projects whose servers may read its metrics. */
export const METRICS_READERS: Record<string, string[]> = {
  'revision-buddy-3a398': ['revisely-dev'],
};

export const PEER_ENDPOINT = 'consoleMetrics';

export function endpointUrl(project: string): string {
  return `https://us-central1-${project}.cloudfunctions.net/${PEER_ENDPOINT}`;
}

/** The environments this project's console can show, its own first, then the ones it may read (production first). */
export function metricsEnvironments(project: string): { env: EnvId; label: string; project: string; here: boolean }[] {
  const out: { env: EnvId; label: string; project: string; here: boolean }[] = [];
  const own = ENVIRONMENTS[project];
  if (own) out.push({ env: own.env, label: own.label, project, here: true });
  for (const [target, readers] of Object.entries(METRICS_READERS)) {
    const e = ENVIRONMENTS[target];
    if (e && target !== project && readers.includes(project)) out.push({ env: e.env, label: e.label, project: target, here: false });
  }
  return out.sort((a, b) => (a.env === b.env ? 0 : a.env === 'prod' ? -1 : 1));
}

/** The service accounts allowed to call this project's endpoint. */
export function allowedCallers(project: string): string[] {
  return (METRICS_READERS[project] ?? []).map((p) => ENVIRONMENTS[p]?.runtimeServiceAccount).filter((s): s is string => !!s);
}

// ---------------------------------------------------------------------------------------------------------------
// Google-signed ID tokens (the caller's service account, from its metadata server)

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const LEEWAY = 60;

export class PeerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
/** The token names a key the cached set doesn't have: fetch the keys again. */
export class UnknownKeyError extends PeerError {
  constructor() {
    super(401, 'unknown signing key');
  }
}

export interface Jwks {
  keys: (JsonWebKey & { kid?: string })[];
}

function part(segment: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  } catch {
    // below
  }
  throw new PeerError(401, 'malformed token');
}

/** The caller's service account, once the token's signature, issuer, audience, time and account check out. */
export function verifyPeerToken(token: string, jwks: Jwks, audience: string, allowed: string[], now = Date.now() / 1000): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new PeerError(401, 'malformed token');
  const [h, p, s] = parts;
  const header = part(h);
  if (header.alg !== 'RS256') throw new PeerError(401, 'unexpected algorithm');
  const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new UnknownKeyError();
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw new PeerError(401, 'bad signature');
  const c = part(p);
  if (!GOOGLE_ISSUERS.has(String(c.iss))) throw new PeerError(401, 'wrong issuer');
  const auds = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!auds.includes(audience)) throw new PeerError(401, 'wrong audience');
  if (typeof c.exp !== 'number' || c.exp < now - LEEWAY) throw new PeerError(401, 'expired');
  if (typeof c.iat === 'number' && c.iat > now + LEEWAY) throw new PeerError(401, 'issued in the future');
  if (c.email_verified !== true || typeof c.email !== 'string') throw new PeerError(403, 'no verified account');
  if (!allowed.includes(c.email)) throw new PeerError(403, 'this account may not read these metrics');
  return c.email;
}

// ---------------------------------------------------------------------------------------------------------------
// What crosses

/** The metrics as another project may see them: account ids cut to 8 characters (enough to tell rows apart). */
export function forPeer<T>(metrics: T): T {
  const cut = (uid: unknown) => (typeof uid === 'string' ? uid.slice(0, 8) : uid);
  const walk = (v: unknown, key?: string): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[k] = walk(x, k);
      return o;
    }
    return key === 'uid' ? cut(v) : v;
  };
  return walk(metrics) as T;
}
