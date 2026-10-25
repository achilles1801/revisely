import { ensureOnServer, retryDelayMs } from '../userDoc';

describe('ensureOnServer', () => {
  const make = (exists: (boolean | Error)[], createFails = false) => {
    const answers = [...exists];
    return {
      existsOnServer: jest.fn(async () => {
        const a = answers.shift() ?? false;
        if (a instanceof Error) throw a;
        return a;
      }),
      create: jest.fn(async () => {
        if (createFails) throw new Error('Missing or insufficient permissions.');
      }),
      onLostRace: jest.fn(),
      onError: jest.fn(),
    };
  };
  const offline = new Error('Failed to get document because the client is offline.');

  it('never acts on the local cache (offline launch: "missing" is only what is cached)', async () => {
    const o = make([]);
    expect(await ensureOnServer({ fromCache: true, ...o })).toBe('wait');
    expect(o.existsOnServer).not.toHaveBeenCalled();
    expect(o.create).not.toHaveBeenCalled();
  });

  it('waits when the server cannot be reached, instead of creating or reporting an error', async () => {
    const o = make([offline]);
    expect(await ensureOnServer({ fromCache: false, ...o })).toBe('wait');
    expect(o.create).not.toHaveBeenCalled();
    expect(o.onError).not.toHaveBeenCalled();
  });

  it('does not overwrite data the server has (REACT-NATIVE-6, lost page progress)', async () => {
    const o = make([true]);
    expect(await ensureOnServer({ fromCache: false, ...o })).toBe('exists');
    expect(o.create).not.toHaveBeenCalled();
  });

  it('creates it when the server confirms it is missing', async () => {
    const o = make([false]);
    expect(await ensureOnServer({ fromCache: false, ...o })).toBe('created');
    expect(o.create).toHaveBeenCalledTimes(1);
  });

  it('never creates while the account is being deleted', async () => {
    const o = make([false]);
    expect(await ensureOnServer({ fromCache: false, skip: () => true, ...o })).toBe('skipped');
    expect(o.existsOnServer).not.toHaveBeenCalled();
    let deleting = false;
    const o2 = make([false]);
    o2.existsOnServer.mockImplementation(async () => {
      deleting = true; // deletion started while asking the server
      return false;
    });
    expect(await ensureOnServer({ fromCache: false, skip: () => deleting, ...o2 })).toBe('skipped');
    expect(o2.create).not.toHaveBeenCalled();
  });

  it('losing the race to sign-up is not an error', async () => {
    const o = make([false, true], true);
    expect(await ensureOnServer({ fromCache: false, ...o })).toBe('exists');
    expect(o.onLostRace).toHaveBeenCalled();
    expect(o.onError).not.toHaveBeenCalled();
  });

  it('a real failure is reported', async () => {
    const o = make([false, false], true);
    expect(await ensureOnServer({ fromCache: false, ...o })).toBe('failed');
    expect(o.onError).toHaveBeenCalled();
  });

  it('asks again on a backoff while it waits', () => {
    expect([0, 1, 2, 3, 10].map(retryDelayMs)).toEqual([5_000, 15_000, 30_000, 60_000, 60_000]);
  });
});
