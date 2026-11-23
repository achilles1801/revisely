import type { LiveEvent } from '../contract';
import type { LiveConnection, StartFrame } from '../feed';
import { EngineBridge, EngineFrames, localFeed } from '../localFeed';
import type { PhoneTakeEnd } from '../phoneTake';
import { NAMES_WAIT_MS } from '../socket';

const START: StartFrame = { type: 'start', s: 18, a: 1, s2: 18, a2: 8, mon: 4, mot: 4, aar: 0, letters: true, keep: false, namesAfter: true };
const READY = JSON.stringify({ type: 'ready', take: 'local-1', protocol: 9 });
const AT = JSON.stringify({ type: 'at', w: 5, t: 1 });
const DONE = JSON.stringify({
  type: 'done',
  result: { v: 2, from: 48707, to: 48717, secs: 9, marks: [], score: null, take: 'local-1', why: 'end' },
});
const INTO = JSON.stringify({ type: 'into', names: [] });
const pcm = (...xs: number[]) => new Int16Array(xs);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function fakeEngine(answer: { take?: number; code?: number; error?: string } = { take: 7 }) {
  const calls: unknown[][] = [];
  let listener: ((e: EngineFrames) => void) | null = null;
  let resolveStart: ((v: { take?: number; code?: number; error?: string }) => void) | null = null;
  const engine: EngineBridge = {
    start: (frame) => {
      calls.push(['start', JSON.parse(frame).type]);
      return new Promise((r) => {
        resolveStart = r;
      });
    },
    feed: (take, data) => calls.push(['feed', take, Array.from(data)]),
    control: (take, frame) => calls.push(['control', take, JSON.parse(frame)]),
    finish: (take) => calls.push(['finish', take]),
    close: (take) => calls.push(['close', take]),
    onFrames: (l) => {
      listener = l;
      return () => {
        listener = null;
        calls.push(['unsubscribe']);
      };
    },
  };
  return {
    engine,
    calls,
    answerStart: async (a = answer) => {
      resolveStart?.(a);
      await flush();
    },
    emit: (frames: string[], code = 0, take = 7) => listener?.({ take, frames, code }),
    listening: () => listener != null,
  };
}

function fakeServer() {
  const out: unknown[][] = [];
  const conn: LiveConnection = {
    sendAudio: (x) => out.push(['audio', Array.from(x)]),
    send: (f) => out.push(['send', f]),
    close: () => out.push(['close']),
    hold: (on) => out.push(['hold', on]),
    status: () => 'live',
  };
  return { conn, out, connect: jest.fn(() => conn) };
}

function setup(answer?: { take?: number; code?: number; error?: string }, start: StartFrame = START) {
  const fake = fakeEngine(answer);
  const srv = fakeServer();
  const events: LiveEvent[] = [];
  let closed = 0;
  const host: Record<string, unknown>[] = [];
  const why: string[] = [];
  const ends: PhoneTakeEnd[] = [];
  const waits: { fn: () => void; ms: number; off?: boolean }[] = [];
  const connect = localFeed({
    engine: fake.engine,
    asked: { on: 'phone', why: 'forced' },
    fallback: srv.connect,
    onHostFrame: (f) => host.push(f),
    onFallback: (w) => why.push(w),
    onPhoneEnd: (e) => ends.push(e),
    timers: {
      set: (fn, ms) => {
        const h = { fn, ms };
        waits.push(h);
        return h;
      },
      clear: (h) => {
        (h as { off?: boolean }).off = true;
      },
    },
  });
  const conn = connect(start, { onEvent: (e) => events.push(e), onClose: () => (closed += 1) });
  return { ...fake, srv, conn, events, closedCount: () => closed, host, why, waits, ends };
}

describe('localFeed: a take on the phone', () => {
  it('feeds what came before the engine answered, in order, each control at its place in the audio', async () => {
    const t = setup();
    t.conn.sendAudio(pcm(1, 2));
    t.conn.send({ type: 'seek', w: 9 });
    t.conn.sendAudio(pcm(3));
    await t.answerStart();
    t.conn.sendAudio(pcm(4));
    expect(t.calls).toEqual([
      ['start', 'start'],
      ['feed', 7, [1, 2]],
      ['control', 7, { type: 'seek', w: 9 }],
      ['feed', 7, [3]],
      ['feed', 7, [4]],
    ]);
  });

  it('passes the engine frames to the take, and `end` is the engine finishing', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, AT]);
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'at']);
    t.conn.send({ type: 'end' });
    t.conn.sendAudio(pcm(9));
    expect(t.calls.filter((c) => c[0] === 'finish')).toEqual([['finish', 7]]);
    expect(t.calls.filter((c) => c[0] === 'feed')).toEqual([]);
  });

  it('reads frames that came before the answer to start, and only its own take', async () => {
    const t = setup();
    t.emit([READY], 0, 7);
    t.emit([AT], 0, 3);
    expect(t.events).toEqual([]);
    await t.answerStart();
    expect(t.events.map((e) => e.type)).toEqual(['ready']);
    t.emit([AT], 0, 3);
    expect(t.events.map((e) => e.type)).toEqual(['ready']);
  });

  it('with namesAfter, ends at `into`, and closes the engine once', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, DONE]);
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'done']);
    expect(t.closedCount()).toBe(0);
    t.emit([INTO]);
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'done', 'into']);
    expect(t.closedCount()).toBe(1);
    expect(t.calls.filter((c) => c[0] === 'close')).toEqual([['close', 7]]);
    expect(t.listening()).toBe(false);
  });

  it('with namesAfter and no `into`, ends after the wait', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, DONE]);
    const wait = t.waits[t.waits.length - 1];
    expect(wait.ms).toBe(NAMES_WAIT_MS);
    wait.fn();
    expect(t.closedCount()).toBe(1);
  });

  it('keeps clip and health frames from the take', async () => {
    const t = setup();
    await t.answerStart();
    const clip = { type: 'clip', id: 'c1', kind: 'word', s0: 1, s1: 2 };
    t.emit([READY, JSON.stringify(clip), JSON.stringify({ type: 'health', hops: 3 }), AT]);
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'at']);
    expect(t.host).toEqual([clip, { type: 'health', hops: 3 }]);
  });

  it('a final answer it cannot read still ends the take', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, JSON.stringify({ type: 'done', result: 'nonsense' })]);
    expect(t.events[t.events.length - 1]).toEqual({ type: 'error', reason: 'server' });
    expect(t.closedCount()).toBe(1);
  });

  it('after `ready`, an engine failure ends the take as an error, and no server is called', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY]);
    t.emit([], -4);
    expect(t.events[t.events.length - 1]).toEqual({ type: 'error', reason: 'server' });
    expect(t.closedCount()).toBe(1);
    expect(t.srv.connect).not.toHaveBeenCalled();
  });

  it('closes a take the screen left before the engine answered', async () => {
    const t = setup();
    t.conn.close();
    expect(t.closedCount()).toBe(1);
    await t.answerStart();
    expect(t.calls.filter((c) => c[0] === 'close')).toEqual([['close', 7]]);
    expect(t.calls.filter((c) => c[0] === 'feed')).toEqual([]);
  });

  it('holds the audio for playing a moment back, after the take too', async () => {
    const t = setup();
    await t.answerStart();
    t.conn.sendAudio(new Int16Array(16_000).fill(5));
    t.conn.sendAudio(new Int16Array(16_000).fill(6));
    t.emit([READY, DONE, INTO]);
    const clip = t.conn.audioClip!(0.5, 1.5)!;
    expect(clip.length).toBe(16_000);
    expect(clip[0]).toBe(5);
    expect(clip[15_999]).toBe(6);
    expect(t.conn.audioClip!(3, 4)).toBeNull();
  });

  it('gives the native side an array with no offset of its own', async () => {
    const t = setup();
    await t.answerStart();
    const whole = pcm(1, 2, 3, 4);
    const seen: Int16Array[] = [];
    t.engine.feed = (_take, data) => seen.push(data);
    t.conn.sendAudio(whole.subarray(2));
    expect(seen[0].byteOffset).toBe(0);
    expect(Array.from(seen[0])).toEqual([3, 4]);
  });

  it('says it ran on the phone', async () => {
    const t = setup();
    await t.answerStart();
    expect(t.conn.ranWhere!()).toEqual({ on: 'phone', why: 'forced' });
    expect(t.conn.status!()).toBe('local');
  });
});

describe('[ONDEV-4] localFeed: what a finished take leaves for the server', () => {
  const HEALTH = JSON.stringify({ type: 'health', hop: 0.5, marks: 2 });

  it('a take without names ends on `done` and still gets the `health` right after it', async () => {
    const t = setup(undefined, { ...START, namesAfter: false });
    await t.answerStart();
    t.conn.sendAudio(pcm(1, 2));
    t.emit([READY, DONE, HEALTH]);
    expect(t.closedCount()).toBe(1);
    expect(t.ends).toHaveLength(1);
    expect(t.ends[0]).toMatchObject({ how: 'done', take: 'local-1', samples: 2, health: { hop: 0.5 }, asked: { why: 'forced' } });
    expect(t.ends[0].result).toEqual(JSON.parse(DONE).result);
    expect(t.host).toEqual([JSON.parse(HEALTH)]);
  });

  it('a take with names waits for them, whichever order `health` comes in', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, DONE, HEALTH]);
    expect(t.ends).toHaveLength(0);
    t.emit([INTO]);
    expect(t.ends).toHaveLength(1);
    expect(t.ends[0]).toMatchObject({ how: 'done', health: { marks: 2 } });
  });

  it('names that never come still end the take once', async () => {
    const t = setup();
    await t.answerStart();
    t.emit([READY, DONE]);
    t.waits[t.waits.length - 1].fn();
    t.conn.close();
    expect(t.ends).toHaveLength(1);
    expect(t.ends[0].how).toBe('done');
  });

  it('holds the frames, labels and hints only for a kept take', async () => {
    const kept = setup(undefined, { ...START, keep: true });
    await kept.answerStart();
    kept.emit([READY, AT]);
    kept.conn.sendAudio(new Int16Array(16_000));
    kept.conn.send({ type: 'dismiss', id: 'm1' });
    kept.conn.send({ type: 'dismiss', id: 'm2' });
    kept.conn.send({ type: 'undismiss', id: 'm1' });
    kept.conn.send({ type: 'hint', w: 40, what: 'word' });
    kept.emit([DONE, INTO]);
    expect(kept.ends[0].events.map((e) => e.type)).toEqual(['ready', 'at', 'done', 'into']);
    expect(kept.ends[0].dismissed).toEqual(['m2']);
    expect(kept.ends[0].hints).toEqual([[1, { w: 40, what: 'word' }]]);

    const plain = setup();
    await plain.answerStart();
    plain.emit([READY, DONE, INTO]);
    expect(plain.ends[0].events).toEqual([]);
  });

  it('says so when the reciter left, or the engine failed', async () => {
    const left = setup();
    await left.answerStart();
    left.emit([READY]);
    left.conn.close();
    left.conn.close();
    expect(left.ends.map((e) => e.how)).toEqual(['left']);

    const failed = setup();
    await failed.answerStart();
    failed.emit([READY]);
    failed.emit([], -3);
    expect(failed.ends.map((e) => e.how)).toEqual(['error']);
  });

  it('a take that never started here, or went to the server, leaves nothing', async () => {
    const refused = setup({ code: -3 });
    await refused.answerStart();
    expect(refused.srv.connect).toHaveBeenCalledTimes(1);
    refused.conn.close();
    expect(refused.ends).toEqual([]);

    const gone = setup();
    gone.conn.close();
    await gone.answerStart();
    expect(gone.ends).toEqual([]);
  });
});

describe('localFeed: a take the engine will not start goes to the server', () => {
  it.each([
    ['refuses the start', async (t: ReturnType<typeof setup>) => t.answerStart({ code: -3, error: 'no engine' }), 'start:-3'],
    [
      'answers with an error first',
      async (t: ReturnType<typeof setup>) => {
        await t.answerStart({ take: 7 });
        t.emit([JSON.stringify({ type: 'error', reason: 'server' })]);
      },
      'error:server',
    ],
    [
      'fails before ready',
      async (t: ReturnType<typeof setup>) => {
        await t.answerStart({ take: 7 });
        t.emit([], -2);
      },
      'code:-2',
    ],
  ])('when the engine %s', async (_name, refuse, why) => {
    const t = setup();
    t.conn.sendAudio(pcm(1, 2));
    t.conn.send({ type: 'seek', w: 4 });
    t.conn.sendAudio(pcm(3));
    await refuse(t);
    expect(t.why).toEqual([why]);
    expect(t.srv.connect).toHaveBeenCalledTimes(1);
    expect(t.srv.out).toEqual([
      ['audio', [1, 2]],
      ['send', { type: 'seek', w: 4 }],
      ['audio', [3]],
    ]);
    expect(t.events.filter((e) => e.type === 'error')).toEqual([]);
    expect(t.closedCount()).toBe(0);
    expect(t.conn.ranWhere!().on).toBe('server');
    // And everything after it goes to the server.
    t.conn.sendAudio(pcm(8));
    t.conn.send({ type: 'end' });
    t.conn.hold!(true);
    t.conn.close();
    expect(t.srv.out.slice(3)).toEqual([['audio', [8]], ['send', { type: 'end' }], ['hold', true], ['close']]);
    expect(t.conn.audioClip!(0, 1)!.length).toBe(4);
  });

  it('tells the server a pause that began before it took over', async () => {
    const t = setup();
    t.conn.hold!(true);
    await t.answerStart({ code: -3 });
    expect(t.srv.out).toEqual([['hold', true]]);
  });

  it('survives a start that throws', async () => {
    const t = setup();
    const failing = fakeEngine();
    failing.engine.start = () => Promise.reject(new Error('native gone'));
    const srv = fakeServer();
    localFeed({ engine: failing.engine, asked: { on: 'phone', why: 'forced' }, fallback: srv.connect })(START, { onEvent: () => undefined, onClose: () => undefined });
    await flush();
    expect(srv.connect).toHaveBeenCalledTimes(1);
    expect(t.srv.connect).not.toHaveBeenCalled();
  });
});
