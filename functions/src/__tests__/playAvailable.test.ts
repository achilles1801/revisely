import { generateKeyPairSync, sign, KeyObject } from 'crypto';
import {
  AUDIENCE,
  BuildError,
  CallerError,
  GITHUB_ISSUER,
  GithubClaims,
  Jwks,
  REPOSITORY,
  REPOSITORY_ID,
  UnknownKeyError,
  WORKFLOW,
  checkCaller,
  nextTesting,
  parseBuild,
  verifyGithubToken,
} from '../playAvailable';

const NOW = 1_800_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks: Jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', kty: 'RSA' }] };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token(claims: Partial<GithubClaims>, { kid = 'k1', alg = 'RS256', key = privateKey }: { kid?: string; alg?: string; key?: KeyObject } = {}) {
  const unsigned = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
}

/** The claims android-build.yml's job gets, called from preview.yml on develop. */
function claims(over: Partial<GithubClaims> = {}): GithubClaims {
  return {
    iss: GITHUB_ISSUER,
    aud: AUDIENCE,
    exp: NOW + 300,
    nbf: NOW - 5,
    iat: NOW - 5,
    repository: REPOSITORY,
    repository_id: REPOSITORY_ID,
    ref: 'refs/heads/develop',
    job_workflow_ref: `${WORKFLOW}@refs/heads/develop`,
    workflow_ref: `${REPOSITORY}/.github/workflows/preview.yml@refs/heads/develop`,
    event_name: 'push',
    run_id: '123',
    ...over,
  };
}

describe('verifyGithubToken', () => {
  it("accepts GitHub's signed token for this audience", () => {
    expect(verifyGithubToken(token(claims()), jwks, AUDIENCE, NOW).ref).toBe('refs/heads/develop');
  });

  it('refuses another key, a tampered body, another algorithm or a malformed token', () => {
    expect(() => verifyGithubToken(token(claims(), { key: other.privateKey }), jwks, AUDIENCE, NOW)).toThrow('bad signature');
    const [h, , s] = token(claims()).split('.');
    expect(() => verifyGithubToken(`${h}.${b64(claims({ ref: 'refs/heads/main' }))}.${s}`, jwks, AUDIENCE, NOW)).toThrow('bad signature');
    expect(() => verifyGithubToken(token(claims(), { alg: 'none' }), jwks, AUDIENCE, NOW)).toThrow('unexpected algorithm');
    expect(() => verifyGithubToken('abc', jwks, AUDIENCE, NOW)).toThrow(CallerError);
    expect(() => verifyGithubToken('a.b.c', jwks, AUDIENCE, NOW)).toThrow('malformed token');
  });

  it('an unknown key id asks for the key set again', () => {
    expect(() => verifyGithubToken(token(claims(), { kid: 'k2' }), jwks, AUDIENCE, NOW)).toThrow(UnknownKeyError);
  });

  it('refuses another issuer, audience, or an expired or future token', () => {
    expect(() => verifyGithubToken(token(claims({ iss: 'https://evil.example' })), jwks, AUDIENCE, NOW)).toThrow('wrong issuer');
    expect(() => verifyGithubToken(token(claims({ aud: 'sts.amazonaws.com' })), jwks, AUDIENCE, NOW)).toThrow('wrong audience');
    expect(() => verifyGithubToken(token(claims({ exp: NOW - 120 })), jwks, AUDIENCE, NOW)).toThrow('expired');
    expect(() => verifyGithubToken(token(claims({ nbf: NOW + 600 })), jwks, AUDIENCE, NOW)).toThrow('not valid yet');
  });
});

describe('checkCaller', () => {
  it('lets android-build.yml in for develop and release branches, pushed or run by hand', () => {
    expect(() => checkCaller(claims())).not.toThrow();
    const release = { ref: 'refs/heads/release/1.0.4', job_workflow_ref: `${WORKFLOW}@refs/heads/release/1.0.4` };
    expect(() => checkCaller(claims({ ...release, event_name: 'workflow_dispatch' }))).not.toThrow();
  });

  it('refuses other repositories, workflows, branches and events', () => {
    expect(() => checkCaller(claims({ repository_id: '1' }))).toThrow('another repository');
    expect(() => checkCaller(claims({ repository: 'someone/revisely' }))).toThrow('another repository');
    expect(() => checkCaller(claims({ job_workflow_ref: `${REPOSITORY}/.github/workflows/ci.yml@refs/heads/develop` }))).toThrow(
      'not android-build.yml',
    );
    // A workflow file of the same name from another branch's copy.
    expect(() => checkCaller(claims({ job_workflow_ref: `${WORKFLOW}@refs/heads/feature/x` }))).toThrow('not android-build.yml');
    for (const ref of ['refs/heads/main', 'refs/heads/feature/x', 'refs/pull/9/merge', 'refs/tags/v1']) {
      expect(() => checkCaller(claims({ ref, job_workflow_ref: `${WORKFLOW}@${ref}` }))).toThrow('is not develop or a release branch');
    }
    expect(() => checkCaller(claims({ event_name: 'pull_request' }))).toThrow('event pull_request');
  });
});

describe('parseBuild and nextTesting', () => {
  it('takes an internal testing build', () => {
    expect(parseBuild({ track: 'internal', version: '1.0.3', code: 5 })).toEqual({ version: '1.0.3', code: 5 });
  });

  it('refuses anything else', () => {
    for (const body of [
      null,
      { version: '1.0.3', code: 5 },
      { track: 'production', version: '1.0.3', code: 5 },
      { track: 'internal', version: '1.0', code: '5' },
      { track: 'internal', version: 'latest', code: 5 },
      { track: 'internal', version: '1.0.3', code: 0 },
      { track: 'internal', version: '1.0.3', code: 2.5 },
    ]) {
      expect(() => parseBuild(body)).toThrow(BuildError);
    }
  });

  it('writes only a newer version code', () => {
    const build = { version: '1.0.3', code: 6 };
    expect(nextTesting(undefined, build)).toEqual(build);
    expect(nextTesting({ version: '1.0.3', code: 5 }, build)).toEqual(build);
    expect(nextTesting({ version: '1.0.3', code: 6 }, build)).toBeNull();
    expect(nextTesting({ version: '1.0.4', code: 7 }, build)).toBeNull();
  });
});
