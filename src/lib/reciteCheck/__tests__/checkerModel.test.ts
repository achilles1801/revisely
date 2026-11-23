import { modelsOf, readCheckerModels, shortModel } from '../checkerModel';

// What the checker's /health said on Nov 18 2026 (revisely-internal's checker/server.py), dev and production.
const DEV = {
  ok: true,
  engine: '7c12824dd9fa',
  server: 'a5b8def6bf8f',
  protocol: 7,
  words: true,
  ears: { recite: 'v7', harakat: 'v7', strict: 'released+v5' },
};
const PROD = { ...DEV, ears: { recite: 'v6', harakat: 'v6', strict: 'released+v5' } };

const answer = (body: unknown, ok = true) => jest.fn(async () => ({ ok, json: async () => body }));

describe("the checker's models, from its /health", () => {
  it('names each level’s model and the checker’s commit', () => {
    expect(modelsOf(DEV)).toEqual({ recite: 'v7', harakat: 'v7', strict: 'released+v5', server: 'a5b8def6' });
    expect(modelsOf(PROD)?.recite).toBe('v6');
  });

  it('an older checker that doesn’t name all three: nothing, never a guess', () => {
    expect(modelsOf({ ok: true, server: 'a5b8def6bf8f' })).toBeNull();
    expect(modelsOf({ ears: { recite: 'v7', harakat: 'v7' } })).toBeNull();
    expect(modelsOf({ ears: { recite: 'v7', harakat: 7, strict: 'released' } })).toBeNull();
    expect(modelsOf(null)).toBeNull();
    expect(modelsOf('not json')).toBeNull();
  });

  it('a checker without its commit still names the models', () => {
    const { server, ...noServer } = DEV;
    expect(server).toBeTruthy();
    expect(modelsOf(noServer)).toEqual({ recite: 'v7', harakat: 'v7', strict: 'released+v5' });
  });

  it('short names: Strict’s released+v5 is v5 (run on top of the released model)', () => {
    expect(shortModel('released+v5')).toBe('v5');
    expect(shortModel('v7')).toBe('v7');
    expect(shortModel('released')).toBe('released');
  });

  it('asks the app’s own checker, with no sign-in', async () => {
    const fetch = answer(DEV);
    await expect(readCheckerModels({ fetch, base: 'https://checker.test' })).resolves.toMatchObject({ recite: 'v7' });
    expect(fetch).toHaveBeenCalledWith('https://checker.test/health', expect.objectContaining({ signal: expect.anything() }));
    const init = (fetch.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(init.headers).toBeUndefined();
  });

  it('refused, unreachable or too slow: nothing', async () => {
    await expect(readCheckerModels({ fetch: answer(DEV, false), base: 'https://checker.test' })).resolves.toBeNull();
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(readCheckerModels({ fetch: offline, base: 'https://checker.test' })).resolves.toBeNull();

    jest.useFakeTimers();
    try {
      const hangs = jest.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
      );
      const read = readCheckerModels({ fetch: hangs, base: 'https://checker.test', timeoutMs: 20_000 });
      jest.advanceTimersByTime(20_000);
      await expect(read).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
