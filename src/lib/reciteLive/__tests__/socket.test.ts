import { KEEPALIVE_MS, READY_WAIT_MS, socketFeed, SocketLike } from '../socket';
import { pairAnswered, pairClosed, pairOpen, PAIR_CLOSED_MS } from '../pairService';
import type { LiveEvent } from '../contract';
import type { StartFrame } from '../feed';

class FakeSocket implements SocketLike {
  binaryType?: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e?: { code?: number }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  closed = false;
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
  }
  close() {
    this.closed = true;
  }
  /** What went out, readable: text frames parsed, audio as its sample values. */
  out(): unknown[] {
    return this.sent.map((d) => (typeof d === 'string' ? JSON.parse(d) : Array.from(new Int16Array(d))));
  }
  answer(e: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}

const START: StartFrame = { type: 'start', s: 27, a: 23, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: false, keep: true };
const pcm = (...xs: number[]) => new Int16Array(xs);
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** The test's clock (the socket's `now`), moved by `later`. */
let clockNow = 1_000_000;
const later = (ms: number) => (clockNow += ms);

function setup(tokens: (string | null)[] = ['tok1', 'tok2', 'tok3', 'tok4'], start: StartFrame = START) {
  const sockets: FakeSocket[] = [];
  const queue: { fn: () => void; ms: number }[] = [];
  // The first-ready wait is kept apart, so the other timers' order stays as each test expects.
  const waits: { fn: () => void; ms: number }[] = [];
  const events: LiveEvent[] = [];
  let closed = 0;
  let n = 0;
  const connect = socketFeed({
    url: 'wss://example.test/live',
    token: async () => tokens[n++] ?? null,
    app: '1.0.4 (40) dev test',
    now: () => clockNow,
    open: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    timers: {
      set: (fn, ms) => {
        const t = { fn, ms };
        (ms === READY_WAIT_MS ? waits : queue).push(t);
        return t;
      },
      clear: (h) => {
        for (const list of [queue, waits]) {
          const i = list.indexOf(h as { fn: () => void; ms: number });
          if (i >= 0) list.splice(i, 1);
        }
      },
    },
  });
  const conn = connect(start, { onEvent: (e) => events.push(e), onClose: () => closed++ });
  const runTimer = () => queue.shift()!.fn();
  return { conn, sockets, events, queue, waits, runTimer, closed: () => closed };
}

describe('the live socket', () => {
  it('sends the start frame with a token, holds audio until ready, then streams it', async () => {
    const t = setup();
    await flush();
    const s = t.sockets[0];
    expect(s.binaryType).toBe('arraybuffer');
    t.conn.sendAudio(pcm(1, 2, 3));
    s.onopen!();
    expect(s.out()).toEqual([{ ...START, token: 'tok1', app: '1.0.4 (40) dev test' }]);
    t.conn.sendAudio(pcm(4, 5));
    s.answer({ type: 'ready', v: 2, take: 'take1', from: 0, t: 0 });
    // What came before ready goes now, then live audio as it comes.
    expect(s.out().slice(1)).toEqual([[1, 2, 3], [4, 5]]);
    t.conn.sendAudio(pcm(6));
    expect(s.out().slice(-1)).toEqual([[6]]);
    expect(t.events).toEqual([{ type: 'ready', take: 'take1', from: 0, engine: undefined }].map(({ engine: _e, ...r }) => r));
  });

  it('forwards the checker’s events; the final answer closes it', async () => {
    const t = setup();
    await flush();
    const s = t.sockets[0];
    s.onopen!();
    s.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    s.answer({ type: 'at', w: 48710, t: 1.5 });
    s.answer({ type: 'mark', mark: { id: '48711:word:sound', w: 48711, ayah: [27, 23], kind: 'word', sure: 'likely' }, t: 4 });
    s.answer({ type: 'nonsense' });
    t.conn.send({ type: 'end' });
    expect(s.out().slice(-1)).toEqual([{ type: 'end' }]);
    s.answer({ type: 'done', result: { v: 2, from: 48707, to: 48717, secs: 9, marks: [], score: null, take: 'take1', why: 'end' } });
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'at', 'mark', 'done']);
    expect(t.closed()).toBe(1);
    expect(s.closed).toBe(true);
    // Nothing after it.
    t.conn.sendAudio(pcm(9));
    expect(s.out().slice(-1)).toEqual([{ type: 'end' }]);
  });

  describe('with namesAfter (contract draft 8)', () => {
    const DONE = { type: 'done', result: { v: 2, from: 48707, to: 48717, secs: 9, marks: [], score: null, take: 'take1', why: 'end' } };
    const INTO = { type: 'into', names: [{ id: '48711:skipped:', into: { w: 40127, ayah: [20, 8] } }], t: 9 };
    const ended = async () => {
      const t = setup(undefined, { ...START, namesAfter: true });
      await flush();
      const s = t.sockets[0];
      s.onopen!();
      expect((s.out()[0] as { namesAfter?: boolean }).namesAfter).toBe(true);
      s.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
      t.conn.send({ type: 'end' });
      s.answer(DONE);
      return { t, s };
    };

    it('the final answer comes at once, the socket stays for where the slips went, then closes', async () => {
      const { t, s } = await ended();
      expect(t.events.map((e) => e.type)).toEqual(['ready', 'done']);
      expect((t.closed(), s.closed)).toBe(false);
      s.answer(INTO);
      expect(t.events.slice(-1)).toEqual([{ type: 'into', names: [{ id: '48711:skipped:', into: { w: 40127, ayah: [20, 8] } }] }]);
      expect([t.closed(), s.closed, t.queue.length]).toEqual([1, true, 0]);
    });

    it('no `into` within NAMES_WAIT_MS: it closes without the names', async () => {
      const { t, s } = await ended();
      expect(t.queue.map((q) => q.ms)).toEqual([5000]);
      t.runTimer();
      expect([t.closed(), s.closed]).toEqual([1, true]);
      expect(t.events.map((e) => e.type)).toEqual(['ready', 'done']);
    });

    it('a drop after the final answer ends the take: no resume for the names', async () => {
      const { t, s } = await ended();
      s.onclose!({ code: 1006 });
      expect([t.closed(), t.sockets.length, t.queue.length]).toEqual([1, 1, 0]);
    });

    it('without namesAfter, `done` still closes it', async () => {
      const t = setup();
      await flush();
      const s = t.sockets[0];
      s.onopen!();
      expect((s.out()[0] as { namesAfter?: boolean }).namesAfter).toBeUndefined();
      s.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
      s.answer(DONE);
      expect(t.closed()).toBe(1);
    });
  });

  it('a dropped socket resumes the take: a fresh token, and the audio from where the checker stopped, frames at their places', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    t.conn.sendAudio(pcm(1, 2, 3, 4));
    t.conn.send({ type: 'dismiss', id: 'm1' }); // at sample 4
    t.conn.sendAudio(pcm(5, 6));
    t.conn.send({ type: 'seek', w: 100 }); // at sample 6
    t.conn.sendAudio(pcm(7, 8, 9));
    s1.onclose!({ code: 1006 });
    expect(t.queue.map((q) => q.ms)).toEqual([500]);
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    expect(s2.out()).toEqual([{ ...START, token: 'tok2', app: '1.0.4 (40) dev test', resume: 'take1' }]);
    // The same instance held 3 samples: the rest goes, the dismissal and the seek where they first went.
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 3 });
    expect(s2.out().slice(1)).toEqual([[4], { type: 'dismiss', id: 'm1' }, [5, 6], { type: 'seek', w: 100 }, [7, 8, 9]]);
    // And live again.
    t.conn.sendAudio(pcm(10));
    expect(s2.out().slice(-1)).toEqual([[10]]);
    expect(t.closed()).toBe(0);
  });

  it('on the other instance (from 0) the whole take goes again, in second-long frames', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    const long = new Int16Array(40_000).map((_, i) => i % 1000);
    t.conn.sendAudio(long);
    t.conn.send({ type: 'end' });
    s1.onclose!();
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    // Paced, a second a tick (RECITE-10).
    while (t.queue.length) t.runTimer();
    const out = s2.out().slice(1);
    expect(out.map((x) => (Array.isArray(x) ? x.length : x))).toEqual([16_000, 16_000, 8_000, { type: 'end' }]);
    expect((out as number[][]).slice(0, 3).flat()).toEqual(Array.from(long));
    // Audio after the end isn't sent or kept.
    t.conn.sendAudio(pcm(1));
    expect(s2.out().length).toBe(5);
  });

  it('gives up after three tries: the take ends as offline', async () => {
    const t = setup();
    await flush();
    for (let i = 0; i < 3; i++) {
      t.sockets[i].onclose!();
      expect(t.queue.length).toBe(1);
      t.runTimer();
      await flush();
    }
    t.sockets[3].onclose!();
    expect(t.events.slice(-1)).toEqual([{ type: 'error', reason: 'offline' }]);
    expect(t.closed()).toBe(1);
  });

  it('a ready resets the tries; no token ends it at once; the checker’s refusals aren’t retried', async () => {
    const a = setup(['tok1', null]);
    await flush();
    a.sockets[0].onclose!();
    a.runTimer();
    await flush();
    expect(a.events).toEqual([{ type: 'error', reason: 'sign_in' }]);
    expect(a.sockets.length).toBe(1);

    const b = setup();
    await flush();
    b.sockets[0].onopen!();
    b.sockets[0].answer({ type: 'error', reason: 'limit' });
    expect(b.events).toEqual([{ type: 'error', reason: 'limit' }]);
    expect(b.queue.length).toBe(0);
    expect(b.closed()).toBe(1);
  });

  it('a final answer it can’t read still ends the take (as the checker’s failure), with no resume', async () => {
    const t = setup();
    await flush();
    const s = t.sockets[0];
    s.onopen!();
    s.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    t.conn.send({ type: 'end' });
    s.answer({ type: 'done', result: { v: 3 } });
    // The checker closes after its answer; the socket was already let go.
    expect(s.closed).toBe(true);
    s.onclose?.({ code: 1000 });
    expect(t.events.slice(-1)).toEqual([{ type: 'error', reason: 'server' }]);
    expect(t.closed()).toBe(1);
    expect(t.queue.length).toBe(0);
    expect(t.sockets.length).toBe(1);
  });

  it('once the take has ended, resumes don’t renew the tries: a checker that closes without answering ends it as offline', async () => {
    // Each socket opens, is ready, and closes with no answer (what the phone did on Nov 14 2026, 8 sockets in 10 s
    // until the reader was left).
    const t = setup(['tok1', 'tok2', 'tok3', 'tok4', 'tok5', 'tok6']);
    await flush();
    t.sockets[0].onopen!();
    t.sockets[0].answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    t.conn.sendAudio(pcm(1, 2, 3));
    t.conn.send({ type: 'end' });
    t.sockets[0].onclose!({ code: 1000 });
    for (let i = 1; i <= 3; i++) {
      t.runTimer();
      await flush();
      t.sockets[i].onopen!();
      t.sockets[i].answer({ type: 'ready', v: 2, take: 'take1', from: 3 });
      // The resume sends what the checker hasn't had: the end.
      expect(t.sockets[i].out().slice(1)).toEqual([{ type: 'end' }]);
      t.sockets[i].onclose!({ code: 1000 });
    }
    expect(t.events.slice(-1)).toEqual([{ type: 'error', reason: 'offline' }]);
    expect(t.closed()).toBe(1);
    expect(t.sockets.length).toBe(4);
    expect(t.queue.length).toBe(0);
  });

  it('closing it hangs up and stops any retry', async () => {
    const t = setup();
    await flush();
    t.sockets[0].onclose!();
    expect(t.queue.length).toBe(1);
    t.conn.close();
    expect(t.queue.length).toBe(0);
    expect(t.closed()).toBe(1);
    t.conn.close();
    expect(t.closed()).toBe(1);
  });
});

describe('Your recitation: a moment of the take, from the audio held on the phone', () => {
  it('cuts seconds of the take across the chunks it came in, and still has them after the take ends', async () => {
    const { conn: c } = setup();
    await flush();
    // 1.5 s in three chunks of half a second, each chunk's samples its own number.
    for (const v of [1, 2, 3]) c.sendAudio(new Int16Array(8000).fill(v));
    const clip = c.audioClip!(0.25, 1.25)!;
    expect(clip.length).toBe(16000);
    expect([clip[0], clip[3999], clip[4000], clip[11999], clip[12000], clip[15999]]).toEqual([1, 1, 2, 2, 3, 3]);
    // Past what was heard: cut at its end; wholly outside: nothing.
    expect(c.audioClip!(1.25, 9)!.length).toBe(4000);
    expect(c.audioClip!(2, 3)).toBeNull();
    c.close();
    expect(c.audioClip!(0, 0.5)!.length).toBe(8000);
  });
});


describe('two services: the light levels on recite-check-pair (recite-contract.md, "Two services")', () => {
  const MAIN = 'wss://main.test/live';
  const PAIR = 'wss://pair.test/live';
  const RECITE: StartFrame = { ...START, follow: true, letters: true, tajweed: false };
  const HARAKAT: StartFrame = { ...START, letters: false, tajweed: false };
  const WITH_LETTERS: StartFrame = { ...START, letters: true, tajweed: false };
  const STRICT: StartFrame = { ...START, letters: true, tajweed: true };
  // What the phone knows of the pair service is shared by every take: each test starts with it open.
  beforeEach(() => pairAnswered());

  function feed() {
    const opened: { url: string; s: FakeSocket }[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    let clock = 1_000_000;
    const connect = socketFeed({
      url: MAIN,
      pairUrl: PAIR,
      now: () => clock,
      token: async () => 'tok',
      open: (url) => {
        const s = new FakeSocket();
        opened.push({ url, s });
        return s;
      },
      timers: {
        set: (fn, ms) => {
          const t = { fn, ms };
          // The first-ready wait (READY_WAIT_MS) isn't what these tests look at.
          if (ms !== READY_WAIT_MS) timers.push(t);
          return t;
        },
        clear: (h) => {
          const i = timers.indexOf(h as { fn: () => void; ms: number });
          if (i >= 0) timers.splice(i, 1);
        },
      },
    });
    const take = (start: StartFrame) => {
      const events: LiveEvent[] = [];
      const conn = connect(start, { onEvent: (e) => events.push(e), onClose: () => undefined });
      return { conn, events };
    };
    return { take, opened, timers, later: (ms: number) => (clock += ms) };
  }

  it('Recite and Words & harakat without letters go to the pair service; letters or Strict to recite-check', async () => {
    const f = feed();
    for (const start of [RECITE, HARAKAT, WITH_LETTERS, STRICT]) f.take(start);
    await flush();
    expect(f.opened.map((o) => o.url)).toEqual([PAIR, PAIR, MAIN, MAIN]);
  });

  it('level_elsewhere: the take starts on recite-check, as a new take there, with everything held sent after its ready', async () => {
    const f = feed();
    const { conn, events } = f.take(RECITE);
    await flush();
    const pair = f.opened[0].s;
    pair.onopen!();
    conn.sendAudio(pcm(1, 2));
    pair.answer({ type: 'error', reason: 'level_elsewhere' });
    await flush();
    expect(pair.closed).toBe(true);
    expect(events).toEqual([]); // nothing reaches the screen
    expect(f.opened.map((o) => o.url)).toEqual([PAIR, MAIN]);
    const main = f.opened[1].s;
    main.onopen!();
    expect(main.out()[0]).not.toHaveProperty('resume');
    main.answer({ type: 'ready', v: 2, take: 'm1', from: 0, t: 0 });
    expect(main.out().slice(1)).toEqual([[1, 2]]);
    expect(f.timers).toEqual([]); // at once, not after a retry's wait
    // Not passed over for being down: the next Recite take tries the pair service again.
    f.take(RECITE);
    await flush();
    expect(f.opened[2].url).toBe(PAIR);
  });

  it('the pair service unreachable or private (its 403 closes the socket before ready): recite-check at once, and for an hour', async () => {
    const f = feed();
    f.take(RECITE);
    await flush();
    f.opened[0].s.onclose!(); // the upgrade refused
    await flush();
    expect(f.opened.map((o) => o.url)).toEqual([PAIR, MAIN]);
    expect(f.timers).toEqual([]);
    f.take(HARAKAT);
    await flush();
    expect(f.opened[2].url).toBe(MAIN); // passed over meanwhile: no failed upgrade before each take
    f.later(PAIR_CLOSED_MS - 1);
    f.take(RECITE);
    await flush();
    expect(f.opened[3].url).toBe(MAIN);
    f.later(1);
    f.take(RECITE);
    await flush();
    expect(f.opened[4].url).toBe(PAIR);
  });

  it('closed before any take (the warm-up’s /health said 403): even the first take goes straight to recite-check', async () => {
    const f = feed();
    pairClosed(1_000_000);
    expect(pairOpen(1_000_000)).toBe(false);
    f.take(RECITE);
    await flush();
    expect(f.opened.map((o) => o.url)).toEqual([MAIN]);
    pairAnswered(); // its /health answered: open again
    f.take(RECITE);
    await flush();
    expect(f.opened[1].url).toBe(PAIR);
  });

  it('once the pair service has said ready, a dropped socket resumes there, never on recite-check', async () => {
    const f = feed();
    const { conn } = f.take(RECITE);
    await flush();
    const s = f.opened[0].s;
    s.onopen!();
    s.answer({ type: 'ready', v: 2, take: 'p1', from: 0, t: 0 });
    conn.sendAudio(pcm(5));
    s.onclose!();
    f.timers.shift()!.fn();
    await flush();
    expect(f.opened.map((o) => o.url)).toEqual([PAIR, PAIR]);
    f.opened[1].s.onopen!();
    expect(f.opened[1].s.out()[0]).toMatchObject({ resume: 'p1' });
    expect(conn.status?.()).toMatch(/ pair$/);
  });

  it('without a pair service, every take on recite-check', async () => {
    const opened: string[] = [];
    const connect = socketFeed({ url: MAIN, pairUrl: null, token: async () => 'tok', open: (url) => (opened.push(url), new FakeSocket()) });
    connect(RECITE, { onEvent: () => undefined, onClose: () => undefined });
    await flush();
    expect(opened).toEqual([MAIN]);
  });
});

describe('long takes (Nov 20 2026): a quiet connection, and a resume’s held audio', () => {
  it('[RECITE-10] once the checker beats, 8 s without a word from it is a drop: the socket goes and the take resumes', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0, protocol: 8 });
    s1.answer({ type: 'beat', t: 0.5, rx: 0.5 });
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'beat']);
    expect(t.events[1]).toEqual({ type: 'beat', t: 0.5, rx: 0.5 });
    t.conn.sendAudio(pcm(1, 2, 3));
    // Beats keep it alive.
    later(2000);
    t.runTimer();
    s1.answer({ type: 'beat', t: 2.5, rx: 2.5 });
    later(2000);
    t.runTimer();
    expect(s1.closed).toBe(false);
    // Then nothing: audio still goes in, nothing comes back (Majd's take of Nov 19, for 76 s).
    for (let i = 0; i < 3; i++) {
      later(2000);
      t.runTimer();
    }
    // 8 s since its last beat: still watched.
    expect(s1.closed).toBe(false);
    later(2000);
    t.runTimer();
    expect(s1.closed).toBe(true);
    // A drop like any other: a retry, then a resume with the held audio.
    expect(t.queue.map((q) => q.ms)).toEqual([500]);
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    expect((s2.out()[0] as { resume?: string }).resume).toBe('take1');
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    expect(s2.out().slice(1)).toEqual([[1, 2, 3]]);
    expect(t.closed()).toBe(0);
  });

  it('[RECITE-10] a checker that never beats is never watched (older checkers keep today’s behaviour)', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    later(60_000);
    expect(t.queue).toEqual([]);
    expect(s1.closed).toBe(false);
  });

  it('[RECITE-10] the watchdog stops with the take: no timer is left after the final answer', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    s1.answer({ type: 'beat', t: 0 });
    expect(t.queue.length).toBe(1);
    s1.answer({ type: 'done', result: { v: 2, take: 'take1', from: 1, to: 2, secs: 1, marks: [], score: { reached: 1, mistakes: 0, tajweed: 0, accuracy: 1 } } });
    expect(t.queue).toEqual([]);
    expect(t.closed()).toBe(1);
  });

  it('[RECITE-10] a resume sends the held audio a slice at a time (1 s every 125 ms), in order, then goes live', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    // 4 s of audio, a dismissal at 2 s.
    const second = (k: number) => new Int16Array(16_000).fill(k);
    for (let k = 0; k < 4; k++) {
      if (k === 2) t.conn.send({ type: 'dismiss', id: 'm1' });
      t.conn.sendAudio(second(k));
    }
    s1.onclose!();
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    const shape = () => s2.out().slice(1).map((x) => (Array.isArray(x) ? `a${x[0]}` : (x as { type: string }).type));
    // The first second at once; the rest a second a tick.
    expect(shape()).toEqual(['a0']);
    expect(t.queue.map((q) => q.ms)).toEqual([125]);
    // Audio that comes meanwhile joins the end, and isn't sent ahead of the held audio.
    t.conn.sendAudio(second(4));
    expect(shape()).toEqual(['a0']);
    t.runTimer();
    expect(shape()).toEqual(['a0', 'a1']);
    t.runTimer();
    expect(shape()).toEqual(['a0', 'a1', 'dismiss', 'a2']);
    t.runTimer();
    t.runTimer();
    expect(shape()).toEqual(['a0', 'a1', 'dismiss', 'a2', 'a3', 'a4']);
    expect(t.queue).toEqual([]);
    // Live again.
    t.conn.sendAudio(pcm(7));
    expect(s2.out().slice(-1)).toEqual([[7]]);
  });

  it('[RECITE-10] with beats, the held audio goes no further than 5 s ahead of what the checker has received', async () => {
    const t = setup();
    await flush();
    const s1 = t.sockets[0];
    s1.onopen!();
    s1.answer({ type: 'ready', v: 2, take: 'take1', from: 0, beat: 2 });
    for (let k = 0; k < 12; k++) t.conn.sendAudio(new Int16Array(16_000).fill(k));
    s1.onclose!();
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    // The checker holds the first 2 s: what it has, it has received.
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 32_000, beat: 2 });
    const seconds = () => s2.out().slice(1).filter(Array.isArray).map((x) => (x as number[])[0]);
    const runPacing = () => {
      for (let i = 0; i < 20; i++) {
        const k = t.queue.findIndex((q) => q.ms === 125);
        if (k < 0) return;
        t.queue.splice(k, 1)[0].fn();
      }
    };
    runPacing();
    // Up to 5 s ahead of the 2 s received: seconds 2–6.
    expect(seconds()).toEqual([2, 3, 4, 5, 6]);
    // The checker says it has received up to 5 s: up to 10.
    s2.answer({ type: 'beat', t: 4, rx: 5 });
    runPacing();
    expect(seconds()).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    s2.answer({ type: 'beat', t: 9, rx: 9 });
    runPacing();
    expect(seconds()).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('a paused take (Nov 21 2026: the checker let a paused take go after 30 s, and its summary came up by itself)', () => {
  const live = async () => {
    const t = setup();
    await flush();
    const s = t.sockets[0];
    s.onopen!();
    s.answer({ type: 'ready', v: 2, take: 'take1', from: 0 });
    t.conn.sendAudio(pcm(1, 2, 3));
    return { ...t, s };
  };
  const keepalives = (s: FakeSocket) => s.out().filter((f) => (f as { type?: string }).type === 'keepalive').length;

  it('[RECITE-16] held: a frame at once and every 10 s, which the checker ignores but counts; let go, none', async () => {
    const t = await live();
    t.conn.hold!(true);
    expect(keepalives(t.s)).toBe(1);
    expect(t.queue.map((q) => q.ms)).toEqual([KEEPALIVE_MS]);
    t.runTimer();
    t.runTimer();
    expect(keepalives(t.s)).toBe(3);
    t.conn.hold!(false);
    expect(t.queue).toEqual([]);
    t.conn.sendAudio(pcm(4));
    expect(t.s.out().slice(-1)).toEqual([[4]]);
    expect(t.closed()).toBe(0);
  });

  it('[RECITE-16] keepalives are never replayed on a resume, and the final answer stops them', async () => {
    const t = await live();
    t.conn.hold!(true);
    t.s.onclose!({ code: 1006 });
    // The retry's timer, and the keepalive's (which sends nothing while there's no live socket).
    const retry = t.queue.find((q) => q.ms === 500)!;
    t.queue.splice(t.queue.indexOf(retry), 1);
    retry.fn();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    s2.answer({ type: 'ready', v: 2, take: 'take1', from: 3 });
    expect(keepalives(s2)).toBe(0);
    s2.answer({ type: 'done', result: { score: { accuracy: 1 }, marks: [] } });
    expect(t.queue).toEqual([]);
  });

  it('[RECITE-16] the checker’s idle error before its final answer is a drop to resume from, never the take’s end', async () => {
    const t = await live();
    t.s.answer({ type: 'error', reason: 'idle' });
    expect(t.events.some((e) => e.type === 'error')).toBe(false);
    expect(t.s.closed).toBe(true);
    expect(t.queue.map((q) => q.ms)).toContain(500);
    expect(t.closed()).toBe(0);
  });
});

describe('the audio 4:1 (contract "ADPCM uplink", Nov 22 2026)', () => {
  const { decodeBlock } = jest.requireActual('../adpcm');
  const ADPCM_START: StartFrame = { ...START, audio: 'adpcm' };
  const setupAdpcm = async () => {
    const t = setup(['tok1', 'tok2', 'tok3', 'tok4'], ADPCM_START);
    await flush();
    t.sockets[0].onopen!();
    return t;
  };
  const isBlock = (d: string | ArrayBuffer, n: number) => typeof d !== 'string' && d.byteLength === 6 + Math.ceil((n - 1) / 2);

  it('[RECITE-5] raw until ready says "adpcm"; then each frame is a block that decodes to the same number of samples', async () => {
    const t = await setupAdpcm();
    const s = t.sockets[0];
    expect(s.out()[0]).toMatchObject({ audio: 'adpcm' });
    t.conn.sendAudio(new Int16Array(1600).fill(100)); // held before ready
    s.answer({ type: 'ready', v: 2, take: 'k', from: 0, audio: 'adpcm' });
    const held = s.sent[1];
    expect(isBlock(held, 1600)).toBe(true);
    expect(decodeBlock(held as ArrayBuffer).length).toBe(1600);
    t.conn.sendAudio(new Int16Array(1600).fill(-50));
    expect(isBlock(s.sent[s.sent.length - 1], 1600)).toBe(true);
  });

  it('a checker that doesn’t answer "adpcm" gets raw audio, and so does a resume onto one', async () => {
    const t = await setupAdpcm();
    const s1 = t.sockets[0];
    s1.answer({ type: 'ready', v: 2, take: 'k', from: 0, audio: 'adpcm' });
    t.conn.sendAudio(new Int16Array(1600));
    s1.onclose!({ code: 1006 });
    t.runTimer();
    await flush();
    const s2 = t.sockets[1];
    s2.onopen!();
    s2.answer({ type: 'ready', v: 2, take: 'k', from: 0 });
    // The held audio goes again, raw (3,200 bytes for 1,600 samples).
    const frames = s2.sent.slice(1).filter((d) => typeof d !== 'string');
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect((f as ArrayBuffer).byteLength % 2).toBe(0);
    expect(frames.reduce((n, f) => n + (f as ArrayBuffer).byteLength, 0)).toBe(3200);
  });

  it('a start frame that didn’t ask gets raw audio even if the checker says "adpcm"', async () => {
    const t = setup();
    await flush();
    const s = t.sockets[0];
    s.onopen!();
    s.answer({ type: 'ready', v: 2, take: 'k', from: 0, audio: 'adpcm' });
    t.conn.sendAudio(new Int16Array(1600));
    expect((s.sent[s.sent.length - 1] as ArrayBuffer).byteLength).toBe(3200);
  });
});

describe('a checker at capacity (Nov 22 2026: Cloud Run holds a new take about 35 s, then refuses it)', () => {
  it('[RECITE-5] no ready within 20 s of the start: the take ends as busy, said in the bar, not minutes of Starting…', async () => {
    const t = setup();
    await flush();
    t.sockets[0].onopen!();
    expect(t.waits).toHaveLength(1);
    t.waits[0].fn();
    expect(t.events).toContainEqual({ type: 'error', reason: 'busy' });
  });

  it('a ready in time clears it, and a later resume isn’t held to it', async () => {
    const t = setup();
    await flush();
    t.sockets[0].onopen!();
    t.sockets[0].answer({ type: 'ready', v: 2, take: 'k', from: 0 });
    expect(t.waits).toHaveLength(0);
  });
});
