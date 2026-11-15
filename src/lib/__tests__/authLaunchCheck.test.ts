import { couldNotAnswer, isLaunchCheckRequest, launchCheckFetch } from '../authLaunchCheck';

const LOOKUP = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=k';
const REFRESH = 'https://securetoken.googleapis.com/v1/token?key=k';
const EMULATOR_LOOKUP = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:lookup?key=k';
const SIGN_IN = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=k';

function answer(status: number, message?: string): Response {
  const body = message ? JSON.stringify({ error: { code: status, message } }) : '<html>Bad gateway</html>';
  return new Response(body, { status, headers: { 'Content-Type': message ? 'application/json' : 'text/html' } });
}

function fetchAnswering(response: () => Response, launching = true) {
  const base = jest.fn(async () => response());
  return { base, fetch: launchCheckFetch(() => base as unknown as typeof fetch, () => launching) };
}

describe('AUTH-1: the launch check keeps the saved sign-in when Google could not answer', () => {
  it('knows the launch check’s requests, from Google or the emulator', () => {
    expect(isLaunchCheckRequest(LOOKUP)).toBe(true);
    expect(isLaunchCheckRequest(REFRESH)).toBe(true);
    expect(isLaunchCheckRequest(EMULATOR_LOOKUP)).toBe(true);
    expect(isLaunchCheckRequest(SIGN_IN)).toBe(false);
  });

  it.each([
    ['a 500 INTERNAL_ERROR', 500, 'INTERNAL_ERROR'],
    ['a 503 UNAVAILABLE', 503, 'UNAVAILABLE'],
    ['a 429 TOO_MANY_ATTEMPTS_TRY_LATER', 429, 'TOO_MANY_ATTEMPTS_TRY_LATER'],
    ['a 400 QUOTA_EXCEEDED', 400, 'QUOTA_EXCEEDED'],
    ['a 502 page that isn’t JSON', 502, undefined],
  ])('%s during the launch check reaches Auth as a network failure', async (_name, status, message) => {
    const { fetch } = fetchAnswering(() => answer(status, message));
    await expect(fetch(LOOKUP)).rejects.toBeInstanceOf(TypeError);
  });

  it.each(['TOKEN_EXPIRED', 'USER_DISABLED', 'USER_NOT_FOUND', 'INVALID_ID_TOKEN', 'INVALID_REFRESH_TOKEN'])(
    'a revoked sign-in (%s) reaches Auth as Google gave it, so it still signs out',
    async (message) => {
      const response = answer(400, message);
      const { fetch } = fetchAnswering(() => response);
      await expect(fetch(REFRESH)).resolves.toBe(response);
    },
  );

  it('an unknown 4xx code is left as Google gave it', async () => {
    const response = answer(400, 'SOMETHING_NEW : details');
    const { fetch } = fetchAnswering(() => response);
    await expect(fetch(LOOKUP)).resolves.toBe(response);
    expect(await couldNotAnswer(answer(400, 'SOMETHING_NEW'))).toBe(false);
  });

  it('after the launch check, every answer is left as Google gave it', async () => {
    const response = answer(500, 'INTERNAL_ERROR');
    const { fetch } = fetchAnswering(() => response, false);
    await expect(fetch(LOOKUP)).resolves.toBe(response);
  });

  it('other Auth requests are left as Google gave them, even during the launch check', async () => {
    const response = answer(500, 'INTERNAL_ERROR');
    const { fetch } = fetchAnswering(() => response);
    await expect(fetch(SIGN_IN)).resolves.toBe(response);
  });

  it('a good answer passes through untouched, with its body unread', async () => {
    const response = new Response(JSON.stringify({ users: [{ localId: 'u' }] }), { status: 200 });
    const { fetch, base } = fetchAnswering(() => response);
    const got = await fetch(LOOKUP, { method: 'POST' });
    expect(got).toBe(response);
    expect(await got.json()).toEqual({ users: [{ localId: 'u' }] });
    expect(base).toHaveBeenCalledWith(LOOKUP, { method: 'POST' });
  });
});
