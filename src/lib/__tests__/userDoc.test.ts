import { recreateUserDocIfMissing } from '../userDoc';

describe('recreateUserDocIfMissing', () => {
  const make = (exists: boolean[], createFails = false) => {
    const answers = [...exists];
    return {
      existsOnServer: jest.fn(async () => answers.shift() ?? false),
      create: jest.fn(async () => {
        if (createFails) throw new Error('Missing or insufficient permissions.');
      }),
      onLostRace: jest.fn(),
      onError: jest.fn(),
    };
  };

  it('waits when only the local cache says it is missing (fresh install, offline)', async () => {
    const o = make([]);
    expect(await recreateUserDocIfMissing({ fromCache: true, ...o })).toBe('wait');
    expect(o.existsOnServer).not.toHaveBeenCalled();
    expect(o.create).not.toHaveBeenCalled();
  });

  it('does not overwrite a document the server has (REACT-NATIVE-6)', async () => {
    const o = make([true]);
    expect(await recreateUserDocIfMissing({ fromCache: false, ...o })).toBe('exists');
    expect(o.create).not.toHaveBeenCalled();
  });

  it('creates it when the server confirms it is missing', async () => {
    const o = make([false]);
    expect(await recreateUserDocIfMissing({ fromCache: false, ...o })).toBe('created');
    expect(o.create).toHaveBeenCalledTimes(1);
  });

  it('losing the race to sign-up is not an error', async () => {
    const o = make([false, true], true);
    expect(await recreateUserDocIfMissing({ fromCache: false, ...o })).toBe('exists');
    expect(o.onLostRace).toHaveBeenCalled();
    expect(o.onError).not.toHaveBeenCalled();
  });

  it('a real failure is reported', async () => {
    const o = make([false, false], true);
    expect(await recreateUserDocIfMissing({ fromCache: false, ...o })).toBe('failed');
    expect(o.onError).toHaveBeenCalled();
  });
});
