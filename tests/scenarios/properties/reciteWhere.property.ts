// Where a take runs (BEHAVIOUR.md ONDEV-4): on the phone's engine or on the server, and the server taking over a take
// the engine refuses with everything said so far.
import fc from 'fast-check';
import type { LiveConnection, StartFrame } from '../../../src/lib/reciteLive/feed';
import { EngineBridge, localFeed } from '../../../src/lib/reciteLive/localFeed';
import { chooseWhere, EngineInfo, RunsOn, WhereSetting } from '../../../src/lib/reciteLive/where';

const START: StartFrame = {
  type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, tajweed: false, keep: false,
  namesAfter: true, startBy: [2, 16], guess: true,
};
const READY_ENGINE: EngineInfo = {
  version: 'recite-core 0.2.0',
  levels: ['recite', 'harakat', 'strict'],
  can: { letters: true, tajweed: true, names: true, startBy: true, startIn: true, controls: true },
  self_check: { ok: true },
};
const pin = fc.constantFrom<RunsOn | null>('phone', 'server', null);
const config = fc.constantFrom<WhereSetting | null>('phone', 'server', 'auto', null);
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('where a take runs', () => {
  it('[ONDEV-4] never on the phone without an engine that passed its self-check and can run the take', () => {
    const engine = fc.constantFrom<EngineInfo | null>(
      null,
      { ...READY_ENGINE, self_check: { ok: false } },
      { ...READY_ENGINE, self_check: undefined },
      { ...READY_ENGINE, levels: ['recite'] },
      { ...READY_ENGINE, can: { ...READY_ENGINE.can, startBy: false } },
    );
    fc.assert(
      fc.property(pin, pin, config, engine, fc.option(fc.boolean()), (testing, p, c, e, fast) => {
        expect(chooseWhere({ testing, pin: p, config: c, engine: e, fastEnough: fast, start: START }).on).toBe('server');
      }),
    );
  });

  it('[ONDEV-4] the nearest choice wins: this phone, then the account, then config/app, else the server', () => {
    fc.assert(
      fc.property(pin, pin, config, (testing, p, c) => {
        const wanted = testing ?? p ?? c ?? 'server';
        const got = chooseWhere({ testing, pin: p, config: c, engine: READY_ENGINE, fastEnough: true, start: START }).on;
        expect(got).toBe(wanted === 'server' ? 'server' : 'phone');
      }),
    );
  });

  it('[ONDEV-4] only `auto` waits for the speed check', () => {
    fc.assert(
      fc.property(fc.option(fc.boolean()), (fast) => {
        const at = (c: WhereSetting) =>
          chooseWhere({ testing: null, pin: null, config: c, engine: READY_ENGINE, fastEnough: fast, start: START }).on;
        expect(at('phone')).toBe('phone');
        expect(at('auto')).toBe(fast === true ? 'phone' : 'server');
      }),
    );
  });

  it('[ONDEV-4] a take the engine refuses reaches the server whole: its audio and controls, in order', async () => {
    const step = fc.oneof(
      fc.array(fc.integer({ min: -32768, max: 32767 }), { minLength: 1, maxLength: 4 }).map((pcm) => ({ pcm })),
      fc.integer({ min: 1, max: 9000 }).map((w) => ({ w })),
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 12 }), fc.array(step, { maxLength: 6 }), async (before, after) => {
        const sent: unknown[] = [];
        const server: LiveConnection = {
          sendAudio: (x) => sent.push(Array.from(x)),
          send: (f) => sent.push(f),
          close: () => undefined,
        };
        let answer: (v: { code: number }) => void = () => undefined;
        const engine: EngineBridge = {
          start: () => new Promise((r) => (answer = r)),
          feed: () => undefined,
          control: () => undefined,
          finish: () => undefined,
          close: () => undefined,
          onFrames: () => () => undefined,
        };
        const events: string[] = [];
        const c = localFeed({ engine, asked: { on: 'phone', why: 'forced' }, fallback: () => server })(START, {
          onEvent: (e) => events.push(e.type),
          onClose: () => events.push('closed'),
        });
        const play = (s: { pcm: number[] } | { w: number }) =>
          'pcm' in s ? c.sendAudio(new Int16Array(s.pcm)) : c.send({ type: 'seek', w: s.w });
        before.forEach(play);
        answer({ code: -3 });
        await flush();
        after.forEach(play);
        const want = [...before, ...after].map((s) => ('pcm' in s ? s.pcm : { type: 'seek', w: s.w }));
        expect(sent).toEqual(want);
        expect(events).toEqual([]); // the reciter sees nothing of it
        expect(c.ranWhere?.().on).toBe('server');
      }),
      { numRuns: 60 },
    );
  });
});
