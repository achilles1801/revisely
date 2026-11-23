import type { StartFrame } from '../feed';
import { chooseWhere, joinWhere, EngineInfo, engineLacks, levelOf, parseEngineInfo, whereSetting, wherePin, WhereInput } from '../where';

const MARK: StartFrame = {
  type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, tajweed: false, keep: false,
  namesAfter: true, startBy: [2, 16], startIn: 'quran', guess: true,
};
const RECITE: StartFrame = { ...MARK, follow: true, namesAfter: undefined };
const STRICT: StartFrame = { ...MARK, tajweed: true };
const ENGINE: EngineInfo = {
  version: 'recite-core 0.2.0',
  levels: ['recite', 'harakat', 'strict'],
  can: { letters: true, tajweed: true, names: true, startBy: true, startIn: true, controls: true, clips: true },
  self_check: { ok: true, max_diff: 0 },
};
const input = (over: Partial<WhereInput> = {}): WhereInput => ({
  testing: null, pin: null, config: null, engine: ENGINE, fastEnough: true, start: MARK, ...over,
});

describe('chooseWhere', () => {
  it('stays on the server with nothing set', () => {
    expect(chooseWhere(input())).toEqual({ on: 'server', why: 'config' });
  });

  it('config/app moves everyone', () => {
    expect(chooseWhere(input({ config: 'phone' })).on).toBe('phone');
    expect(chooseWhere(input({ config: 'auto' })).on).toBe('phone');
    expect(chooseWhere(input({ config: 'server' })).on).toBe('server');
  });

  it('the account pin beats config/app, and this phone beats both', () => {
    expect(chooseWhere(input({ config: 'phone', pin: 'server' })).on).toBe('server');
    expect(chooseWhere(input({ config: 'server', pin: 'phone' })).on).toBe('phone');
    expect(chooseWhere(input({ config: 'phone', pin: 'phone', testing: 'server' })).on).toBe('server');
    expect(chooseWhere(input({ config: 'server', pin: 'server', testing: 'phone' })).on).toBe('phone');
  });

  it('says who chose', () => {
    expect(chooseWhere(input({ testing: 'phone' }))).toEqual({ on: 'phone', why: 'forced' });
    expect(chooseWhere(input({ testing: 'server', config: 'phone' }))).toEqual({ on: 'server', why: 'forced' });
    expect(chooseWhere(input({ pin: 'phone' }))).toEqual({ on: 'phone', why: 'pin' });
    expect(chooseWhere(input({ pin: 'server', config: 'phone' }))).toEqual({ on: 'server', why: 'pin' });
    expect(chooseWhere(input({ config: 'auto' }))).toEqual({ on: 'phone', why: 'config' });
  });

  it.each([
    ['no engine (a stub build, no pack)', { engine: null }, 'no-pack', undefined],
    ['a failed self-check', { engine: { ...ENGINE, self_check: { ok: false } } }, 'self-check', undefined],
    ['no self-check at all', { engine: { ...ENGINE, self_check: undefined } }, 'self-check', undefined],
    ['a level it does not run', { engine: { ...ENGINE, levels: ['recite'] } }, 'lacks', 'level:harakat'],
    ['a feature it lacks', { engine: { ...ENGINE, can: { ...ENGINE.can, names: false } } }, 'lacks', 'names'],
  ])('falls back to the server on %s, even when asked for the phone', (_n, over, why, detail) => {
    for (const asked of [{ testing: 'phone' as const }, { pin: 'phone' as const }, { config: 'phone' as const }]) {
      expect(chooseWhere(input({ ...asked, ...over }))).toEqual({ on: 'server', why, ...(detail ? { detail } : {}) });
    }
  });

  it('only `auto` asks whether the phone is fast enough', () => {
    expect(chooseWhere(input({ config: 'auto', fastEnough: null }))).toEqual({ on: 'server', why: 'no-speed' });
    expect(chooseWhere(input({ config: 'auto', fastEnough: false }))).toEqual({ on: 'server', why: 'slow' });
    expect(chooseWhere(input({ config: 'phone', fastEnough: false })).on).toBe('phone');
    expect(chooseWhere(input({ config: 'auto', fastEnough: false, demoted: true }))).toEqual({ on: 'server', why: 'demoted' });
    expect(chooseWhere(input({ testing: 'phone', fastEnough: false, demoted: true })).on).toBe('phone');
  });

  it('the replay stand-in runs only on this phone Testing choice', () => {
    const engine: EngineInfo = { version: 'recite-core replay 0.1.0', levels: ['recite', 'harakat'] };
    expect(chooseWhere(input({ engine, testing: 'phone' }))).toEqual({ on: 'phone', why: 'replay' });
    expect(chooseWhere(input({ engine, pin: 'phone' }))).toEqual({ on: 'server', why: 'replay' });
    expect(chooseWhere(input({ engine, config: 'phone' }))).toEqual({ on: 'server', why: 'replay' });
    expect(chooseWhere(input({ engine, config: 'auto' }))).toEqual({ on: 'server', why: 'replay' });
  });
});

describe('joinWhere', () => {
  const phone = { on: 'phone', why: 'config' } as const;
  const slow = { on: 'server', why: 'slow' } as const;
  const refused = { on: 'server', why: 'refused' } as const;

  it('a recitation ran on the phone only if all its takes did, and the first that did not says why', () => {
    expect(joinWhere(null, phone)).toEqual(phone);
    expect(joinWhere(phone, phone)).toEqual(phone);
    expect(joinWhere(phone, slow)).toEqual(slow);
    expect(joinWhere(slow, phone)).toEqual(slow);
    expect(joinWhere(slow, refused)).toEqual(slow);
  });

  it('a take nothing routed says nothing', () => {
    expect(joinWhere(null, null)).toBeNull();
    expect(joinWhere(phone, null)).toBeNull();
  });
});

describe('engineLacks', () => {
  it('names the level of a take', () => {
    expect(levelOf(RECITE)).toBe('recite');
    expect(levelOf(MARK)).toBe('harakat');
    expect(levelOf(STRICT)).toBe('strict');
  });

  it('Recite does not need letters or names', () => {
    const can = { startBy: true, startIn: true, controls: true };
    expect(engineLacks(RECITE, { levels: ['recite'], can })).toBeNull();
    expect(engineLacks(MARK, { levels: ['harakat'], can })).toBe('letters');
  });

  it('asks for what the start frame uses', () => {
    const can = { letters: true, names: true, controls: true };
    expect(engineLacks(MARK, { levels: ['harakat'], can })).toBe('startBy');
    expect(engineLacks(MARK, { levels: ['harakat'], can: { ...can, startBy: true } })).toBe('startIn');
    expect(engineLacks({ ...MARK, startBy: undefined, startIn: undefined }, { levels: ['harakat'], can })).toBeNull();
    expect(engineLacks(STRICT, { levels: ['strict'], can: { ...can, startBy: true, startIn: true } })).toBe('tajweed');
    expect(engineLacks(MARK, { levels: ['harakat'] })).toBe('controls');
  });
});

describe('reading the settings', () => {
  it('takes only what it knows', () => {
    expect(whereSetting('auto')).toBe('auto');
    expect(whereSetting('Phone')).toBeNull();
    expect(whereSetting(undefined)).toBeNull();
    expect(wherePin('phone')).toBe('phone');
    expect(wherePin('auto')).toBeNull();
  });

  it('reads rc_info, and nothing else', () => {
    expect(parseEngineInfo('{"version":"x"}')).toEqual({ version: 'x' });
    expect(parseEngineInfo('not json')).toBeNull();
    expect(parseEngineInfo('[1]')).toBeNull();
    expect(parseEngineInfo(null)).toBeNull();
  });
});
