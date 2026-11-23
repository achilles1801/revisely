import type { LiveConnection, StartFrame } from '../feed';
import type { EngineBridge } from '../localFeed';
import { routedFeed, RouteDeps } from '../route';
import type { EngineInfo } from '../where';

const START: StartFrame = { type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, keep: false };
const ENGINE: EngineInfo = {
  version: 'recite-core 0.2.0',
  levels: ['recite', 'harakat', 'strict'],
  can: { letters: true, tajweed: true, names: true, startBy: true, startIn: true, controls: true },
  self_check: { ok: true },
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
