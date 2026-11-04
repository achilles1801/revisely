// What phones are told about Google Play's internal testing track (config/app
// `testing.android`, read by src/lib/updates/storeUpdates.ts), from the one
// place that knows when a build lands there: android-build.yml's `available`
// job. That job proves who it is with a GitHub Actions OIDC token, so no
// Firestore credential is stored in GitHub. Only this repository's
// android-build.yml, run for develop or a release branch, may write, and only
// a newer version code, so a replayed token can't move phones backwards.
// Pure parts here (tested in __tests__/playAvailable.test.ts); the endpoint is
// in index.ts.

import { createPublicKey, verify, JsonWebKey } from 'crypto';

export const GITHUB_ISSUER = 'https://token.actions.githubusercontent.com';
export const GITHUB_JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;
/** The `audience` android-build.yml asks GitHub for. */
export const AUDIENCE = 'revisely-play-available';
/** achilles1801/revisely, by id: a renamed or recreated repository has another. */
export const REPOSITORY_ID = '1125602870';
export const REPOSITORY = 'achilles1801/revisely';
export const WORKFLOW = `${REPOSITORY}/.github/workflows/android-build.yml`;
const ALLOWED_REF = /^refs\/heads\/(develop|release\/[A-Za-z0-9._-]+)$/;
const ALLOWED_EVENTS = new Set(['push', 'workflow_dispatch']);
const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;
/** Clock drift allowed on exp/nbf/iat, in seconds. */
const LEEWAY = 60;

export class CallerError extends Error {}
export class BuildError extends Error {}
/** The token names a key the cached key set doesn't have: fetch it again. */
export class UnknownKeyError extends CallerError {}

export interface Jwks {
  keys: (JsonWebKey & { kid?: string })[];
}

export interface GithubClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  repository?: string;
  repository_id?: string;
  ref?: string;
  job_workflow_ref?: string;
  event_name?: string;
  run_id?: string;
  [claim: string]: unknown;
}

function json(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  } catch {
    // below
  }
  throw new CallerError('malformed token');
}

/** A GitHub Actions OIDC token's claims, once its signature, issuer, audience and times check out. */
export function verifyGithubToken(token: string, jwks: Jwks, audience: string, now = Date.now() / 1000): GithubClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new CallerError('malformed token');
  const [h, p, s] = parts;
  const header = json(h);
  if (header.alg !== 'RS256') throw new CallerError('unexpected algorithm');
  const jwk = jwks.keys.find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new UnknownKeyError('unknown signing key');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) {
    throw new CallerError('bad signature');
  }
  const claims = json(p) as GithubClaims;
  if (claims.iss !== GITHUB_ISSUER) throw new CallerError('wrong issuer');
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(audience)) throw new CallerError('wrong audience');
  if (typeof claims.exp !== 'number' || claims.exp < now - LEEWAY) throw new CallerError('expired');
  if (typeof claims.nbf === 'number' && claims.nbf > now + LEEWAY) throw new CallerError('not valid yet');
  if (typeof claims.iat === 'number' && claims.iat > now + LEEWAY) throw new CallerError('issued in the future');
  return claims;
}

/** Only android-build.yml in this repository, for develop or a release branch, pushed or run by hand. */
export function checkCaller(claims: GithubClaims): void {
  if (String(claims.repository_id) !== REPOSITORY_ID || claims.repository !== REPOSITORY) {
    throw new CallerError('another repository');
  }
  const ref = claims.ref ?? '';
  if (!ALLOWED_REF.test(ref)) throw new CallerError(`ref ${ref || '(none)'} is not develop or a release branch`);
  if (claims.job_workflow_ref !== `${WORKFLOW}@${ref}`) throw new CallerError('not android-build.yml');
  if (!ALLOWED_EVENTS.has(claims.event_name ?? '')) throw new CallerError(`event ${claims.event_name ?? '(none)'}`);
}

export interface PlayBuild {
  version: string;
  code: number;
}

/** The request body: what the internal testing track holds (scripts/play.js latest internal --json). */
export function parseBuild(body: unknown): PlayBuild {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.track !== 'internal') throw new BuildError('track must be internal');
  if (typeof b.version !== 'string' || !VERSION.test(b.version)) throw new BuildError('version must look like 1.0.4');
  const code = b.code;
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 1 || code > 2_100_000_000) {
    throw new BuildError('code must be a version code');
  }
  return { version: b.version, code };
}

/** What to write, or null when config/app already has this build or a later one. */
export function nextTesting(current: unknown, build: PlayBuild): PlayBuild | null {
  const c = current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  return typeof c.code === 'number' && c.code >= build.code ? null : build;
}
