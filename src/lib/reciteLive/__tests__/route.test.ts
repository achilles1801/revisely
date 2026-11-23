import type { LiveConnection, StartFrame } from '../feed';
import type { EngineBridge } from '../localFeed';
import { routedFeed, RouteDeps } from '../route';
import type { EngineInfo } from '../where';

const START: StartFrame = { type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, keep: false };
const ENGINE: EngineInfo = {
  version: 'recite-core 0.2.0',
  levels: ['recite', 'harakat', 'strict'],
  can: { letters: true, tajweed: true, names: true, startBy: true, startIn: true, controls: true },
  self_check: { ran: true, ok: true, models: { v7: { ran: true, ok: true }, v5: { ran: true, ok: true } } },
};
const handlers = { onEvent: () => undefined, onClose: () => undefined };
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function setup(over: Partial<RouteDeps> = {}, startAnswer: { take?: number; code?: number } = { take: 1 }) {
  const serverConn: LiveConnection = { sendAudio: jest.fn(), send: jest.fn(), close: jest.fn() };
  const server = jest.fn(() => serverConn);
  const start = jest.fn(async () => startAnswer);
  const bridge: EngineBridge = {
    start,
    feed: jest.fn(),
    control: jest.fn(),
    finish: jest.fn(),
    close: jest.fn(),
    onFrames: () => () => undefined,
  };
  const warm = jest.fn();
  const routed: unknown[][] = [];
  const connect = routedFeed({
    server,
    engine: () => bridge,
    info: () => ENGINE,
    fastEnough: () => true,
    settings: () => ({ config: null, pin: null, testing: null }),
    warm,
    onRouted: (a) => routed.push([a.on, a.why, a.detail]),
    ...over,
  });
  return { connect, server, start, warm, routed };
}

const sentWhy = (server: jest.Mock) => (server.mock.calls[0] as [{ ranWhy?: string }])[0].ranWhy;

describe('routedFeed', () => {
  it('sends a take to the server with nothing set, and opens nothing', () => {
    const t = setup();
    t.connect(START, handlers);
    expect(t.server).toHaveBeenCalledTimes(1);
    expect(t.start).not.toHaveBeenCalled();
    expect(t.warm).not.toHaveBeenCalled();
    expect(t.routed).toEqual([['server', 'config', undefined]]);
    expect(sentWhy(t.server)).toBe('config');
  });

  it('runs a take on the engine when asked', async () => {
    const t = setup({ settings: () => ({ config: 'phone', pin: null, testing: null }) });
    const c = t.connect(START, handlers);
    await flush();
    expect(t.start).toHaveBeenCalledTimes(1);
    expect(t.server).not.toHaveBeenCalled();
    expect(t.warm).toHaveBeenCalledTimes(1);
    expect(c.ranWhere?.()).toEqual({ on: 'phone', why: 'config' });
  });

  it('asked for the phone with no engine open: this take on the server, and the engine opening for the next', () => {
    const t = setup({ info: () => null, settings: () => ({ config: null, pin: 'phone', testing: null }) });
    t.connect(START, handlers);
    expect(t.server).toHaveBeenCalledTimes(1);
    expect(t.warm).toHaveBeenCalledTimes(1);
    expect(t.routed).toEqual([['server', 'no-pack', undefined]]);
  });

  it('a module without the engine calls goes to the server', () => {
    const t = setup({ engine: () => null, settings: () => ({ config: 'phone', pin: null, testing: null }) });
    t.connect(START, handlers);
    expect(t.server).toHaveBeenCalledTimes(1);
    expect(t.routed).toEqual([['server', 'no-pack', undefined]]);
  });

  describe('the teacher’s clips', () => {
    const CLIPPING = { ...ENGINE, can: { ...ENGINE.can, clips: true } };
    const sender = () => ({ add: jest.fn(), drop: jest.fn(), stop: jest.fn(async () => undefined), close: jest.fn() });
    const onPhone = { settings: () => ({ config: 'phone' as const, pin: null, testing: null }) };
    const asked = async (over: Parameters<typeof setup>[0], start = START) => {
      const t = setup({ ...onPhone, clips: sender, ...over });
      t.connect(start, handlers);
      await flush();
      return JSON.parse((t.start.mock.calls[0] as unknown as [string])[0]).clips;
    };

    it('asks the engine for them when it can hear them and this phone can send them', async () => {
      expect(await asked({ info: () => CLIPPING, canClip: () => true })).toBe(true);
    });

    it('never asks offline or signed out, or an engine without them, or for a take that only follows', async () => {
      expect(await asked({ info: () => CLIPPING, canClip: () => false })).toBeUndefined();
      expect(await asked({ info: () => CLIPPING })).toBeUndefined();
      expect(await asked({ info: () => ENGINE, canClip: () => true })).toBeUndefined();
      expect(await asked({ info: () => CLIPPING, canClip: () => true }, { ...START, follow: true })).toBeUndefined();
    });
  });

  it('a take the engine refuses goes to the server, and says why', async () => {
    const t = setup({ settings: () => ({ config: 'phone', pin: null, testing: null }) }, { code: -3 });
    const c = t.connect(START, handlers);
    await flush();
    expect(t.server).toHaveBeenCalledTimes(1);
    expect(c.ranWhere?.()).toEqual({ on: 'server', why: 'refused', detail: 'start:-3' });
    expect(sentWhy(t.server)).toBe('refused');
    expect(t.routed).toEqual([
      ['phone', 'config', undefined],
      ['server', 'refused', 'start:-3'],
    ]);
  });
});
