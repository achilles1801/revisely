/**
 * Both environments' metrics in one console (Majd, Nov 14 2026: "console should have both dev and production metrics";
 * he chose one console with a switch). The console signs in to one project; that project's server fetches the other
 * project's numbers from its `consoleMetrics` endpoint, proving who it is with a Google-signed ID token for its own
 * service account (from the metadata server; no key anywhere).
 *
 * What crosses (Majd, Nov 14 2026: one console, metrics.revisely.app to be retired):
 * - `metrics`: the Overview's numbers (crash rates, Revo usage and spend, downloads, functions).
 * - `revo`: one account's Revo conversations and memory, as the old console showed them. This also needs the signed-in
 *   staff member's own Firebase ID token from the caller's project, whose role must allow revo.conversations: the
 *   caller's server alone can't read anyone's conversations. The target still applies its own conversations lock
 *   (config/admin.conversations) and logs each read with the staff account (`<project>/<uid>`).
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

export function projectOfServiceAccount(email: string): string | null {
  return Object.entries(ENVIRONMENTS).find(([, e]) => e.runtimeServiceAccount === email)?.[0] ?? null;
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

/** A token's claims once its RS256 signature checks out against the key set. */
function signedClaims(token: unknown, jwks: Jwks): Record<string, unknown> {
  if (typeof token !== 'string') throw new PeerError(401, 'malformed token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new PeerError(401, 'malformed token');
  const [h, p, s] = parts;
  const header = part(h);
  if (header.alg !== 'RS256') throw new PeerError(401, 'unexpected algorithm');
  const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new UnknownKeyError();
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) throw new PeerError(401, 'bad signature');
  return part(p);
}

function checkTimes(c: Record<string, unknown>, now: number): void {
  if (typeof c.exp !== 'number' || c.exp < now - LEEWAY) throw new PeerError(401, 'expired');
  if (typeof c.iat === 'number' && c.iat > now + LEEWAY) throw new PeerError(401, 'issued in the future');
}

/** The caller's service account, once the token's signature, issuer, audience, time and account check out. */
export function verifyPeerToken(token: string, jwks: Jwks, audience: string, allowed: string[], now = Date.now() / 1000): string {
  const c = signedClaims(token, jwks);
  if (!GOOGLE_ISSUERS.has(String(c.iss))) throw new PeerError(401, 'wrong issuer');
  const auds = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!auds.includes(audience)) throw new PeerError(401, 'wrong audience');
  checkTimes(c, now);
  if (c.email_verified !== true || typeof c.email !== 'string') throw new PeerError(403, 'no verified account');
  if (!allowed.includes(c.email)) throw new PeerError(403, 'this account may not read these metrics');
  return c.email;
}

/** Firebase Auth's signing keys (ID tokens of every project). */
export const STAFF_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** A Firebase ID token of `project` (the staff member signed in to the console there): its uid and claims. */
export function verifyStaffToken(token: unknown, jwks: Jwks, project: string, now = Date.now() / 1000): { uid: string; claims: Record<string, unknown> } {
  const c = signedClaims(token, jwks);
  if (c.iss !== `https://securetoken.google.com/${project}`) throw new PeerError(401, 'staff sign-in from another project');
  if (c.aud !== project) throw new PeerError(401, 'staff sign-in for another project');
  checkTimes(c, now);
  if (typeof c.auth_time === 'number' && c.auth_time > now + LEEWAY) throw new PeerError(401, 'signed in in the future');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw new PeerError(401, 'no account in the staff sign-in');
  return { uid: c.sub, claims: c };
}

// ---------------------------------------------------------------------------------------------------------------
// The endpoint's body, once the caller's service account checked out

export interface PeerDeps<M, R> {
  metrics(refresh: boolean): Promise<M>;
  /** adminRevo's handler, for the staff member named by their own token */
  revo(staff: { uid: string; token: Record<string, unknown> }, data: { uid?: unknown; chatId?: unknown }): Promise<R>;
  staffJwks(fresh?: boolean): Promise<Jwks>;
  now(): number;
}

export async function handlePeer<M, R>(body: unknown, callerProject: string, deps: PeerDeps<M, R>): Promise<M | R> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const action = b.action ?? 'metrics';
  if (action === 'metrics') return deps.metrics(b.refresh === true);
  if (action !== 'revo') throw new PeerError(400, 'unknown action');
  let staff: { uid: string; claims: Record<string, unknown> };
  try {
    staff = verifyStaffToken(b.staffToken, await deps.staffJwks(), callerProject, deps.now() / 1000);
  } catch (err) {
    if (!(err instanceof UnknownKeyError)) throw err;
    staff = verifyStaffToken(b.staffToken, await deps.staffJwks(true), callerProject, deps.now() / 1000);
  }
  return deps.revo({ uid: `${callerProject}/${staff.uid}`, token: staff.claims }, { uid: b.uid, chatId: b.chatId });
}
