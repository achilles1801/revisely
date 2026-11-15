import { generateKeyPairSync, sign, JsonWebKey } from 'crypto';
import { AdminError, clearMetricsCache, handleAdminMetrics, MetricsDeps } from '../metrics/admin';
import type { Metrics } from '../metrics/aggregate';
import { allowedCallers, endpointUrl, forPeer, Jwks, metricsEnvironments, PeerError, UnknownKeyError, verifyPeerToken } from '../console/peer';

const DEV_SA = '433792838929-compute@developer.gserviceaccount.com';
const PROD_SA = '169239488140-compute@developer.gserviceaccount.com';
const AUD = endpointUrl('revision-buddy-3a398');
const NOW = 1_800_000_000;

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWKS: Jwks = { keys: [{ ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: 'k1', alg: 'RS256', use: 'sig' }] };

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: 'k1', typ: 'JWT' }): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b(header)}.${b(claims)}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
const good = { iss: 'https://accounts.google.com', aud: AUD, exp: NOW + 600, iat: NOW, email: DEV_SA, email_verified: true, sub: '1' };

function status(run: () => unknown): number | 'ok' {
  try {
    run();
    return 'ok';
  } catch (err) {
    if (err instanceof PeerError) return err.status;
    throw err;
  }
}

describe('who may read whose metrics', () => {
  it('production answers revisely-dev’s server only; dev answers nobody', () => {
    expect(allowedCallers('revision-buddy-3a398')).toEqual([DEV_SA]);
    expect(allowedCallers('revisely-dev')).toEqual([]);
    expect(allowedCallers('demo-revisely')).toEqual([]);
  });

  it('the dev console shows Production first, then its own Dev; production shows only itself', () => {
    expect(metricsEnvironments('revisely-dev')).toEqual([
      { env: 'prod', label: 'Production', project: 'revision-buddy-3a398', here: false },
      { env: 'dev', label: 'Dev', project: 'revisely-dev', here: true },
    ]);
    expect(metricsEnvironments('revision-buddy-3a398')).toEqual([{ env: 'prod', label: 'Production', project: 'revision-buddy-3a398', here: true }]);
    expect(metricsEnvironments('demo-revisely')).toEqual([]);
  });
});

describe('the caller’s Google ID token', () => {
  it('accepts revisely-dev’s service account for this URL', () => {
    expect(verifyPeerToken(token(good), JWKS, AUD, [DEV_SA], NOW)).toBe(DEV_SA);
    expect(verifyPeerToken(token({ ...good, iss: 'accounts.google.com' }), JWKS, AUD, [DEV_SA], NOW)).toBe(DEV_SA);
  });

  it('refuses another account, another audience, another issuer, an expired or unverified token', () => {
    expect(status(() => verifyPeerToken(token({ ...good, email: PROD_SA }), JWKS, AUD, [DEV_SA], NOW))).toBe(403);
    expect(status(() => verifyPeerToken(token({ ...good, email: 'someone@gmail.com' }), JWKS, AUD, [DEV_SA], NOW))).toBe(403);
    expect(status(() => verifyPeerToken(token({ ...good, email_verified: false }), JWKS, AUD, [DEV_SA], NOW))).toBe(403);
    expect(status(() => verifyPeerToken(token({ ...good, aud: endpointUrl('revisely-dev') }), JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken(token({ ...good, iss: 'https://securetoken.google.com/revisely-dev' }), JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken(token({ ...good, exp: NOW - 120 }), JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken(token(good), JWKS, AUD, [], NOW))).toBe(403);
  });

  it('refuses a forged signature, another algorithm, garbage; an unknown key asks for the keys again', () => {
    const t = token(good);
    const forged = t.slice(0, t.lastIndexOf('.') + 1) + Buffer.from('x'.repeat(256)).toString('base64url');
    expect(status(() => verifyPeerToken(forged, JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken(token(good, { alg: 'none', kid: 'k1' }), JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken('not.a.token', JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(status(() => verifyPeerToken('', JWKS, AUD, [DEV_SA], NOW))).toBe(401);
    expect(() => verifyPeerToken(token(good, { alg: 'RS256', kid: 'k2' }), JWKS, AUD, [DEV_SA], NOW)).toThrow(UnknownKeyError);
  });
});

describe('what crosses to the other project', () => {
  it('account ids are cut to 8 characters wherever they are; numbers stay', () => {
    const m = { revo: { '24h': { accounts: [{ uid: 'jeahMBUF18eV6uY8kVG1HSfddwg1', q: 3 }] } }, look: [{ uid: 'abcdefghijklmnop', text: 'x' }, { text: 'no uid' }], total: 5 };
    expect(forPeer(m)).toEqual({ revo: { '24h': { accounts: [{ uid: 'jeahMBUF', q: 3 }] } }, look: [{ uid: 'abcdefgh', text: 'x' }, { text: 'no uid' }], total: 5 });
  });
});

describe('adminMetrics with an environment', () => {
  const owner = { uid: 'owner1', token: { role: 'owner' } };
  const fake = { generatedAt: 'x' } as unknown as Metrics;
  const deps = (over: Partial<MetricsDeps> = {}): MetricsDeps => ({
    collect: async () => ({ sources: {} }) as never,
    now: () => 1,
    log: () => undefined,
    here: 'dev',
    ...over,
  });
  beforeEach(() => clearMetricsCache());

  it('another environment is asked of that project, its own is read here', async () => {
    const peer = jest.fn(async () => fake);
    expect(await handleAdminMetrics(owner, { env: 'prod', refresh: true }, deps({ peer }))).toBe(fake);
    expect(peer).toHaveBeenCalledWith('prod', true);
    const collect = jest.fn(async () => ({ sources: {} }) as never);
    await handleAdminMetrics(owner, { env: 'dev' }, deps({ peer, collect }));
    expect(collect).toHaveBeenCalled();
    expect(peer).toHaveBeenCalledTimes(1);
  });

  it('refuses an environment it has no way to read, and still needs the role first', async () => {
    await expect(handleAdminMetrics(owner, { env: 'prod' }, deps())).rejects.toBeInstanceOf(AdminError);
    const peer = jest.fn(async () => fake);
    await expect(handleAdminMetrics({ uid: 'x', token: { role: 'reviewer' } }, { env: 'prod' }, deps({ peer }))).rejects.toThrow('Your role doesn’t allow this.');
    expect(peer).not.toHaveBeenCalled();
  });
});
