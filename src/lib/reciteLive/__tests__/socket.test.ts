import { socketFeed, SocketLike } from '../socket';
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

function setup(tokens: (string | null)[] = ['tok1', 'tok2', 'tok3', 'tok4']) {
  const sockets: FakeSocket[] = [];
  const queue: { fn: () => void; ms: number }[] = [];
  const events: LiveEvent[] = [];
  let closed = 0;
  let n = 0;
  const connect = socketFeed({
    url: 'wss://example.test/live',
    token: async () => tokens[n++] ?? null,
    app: '1.0.4 (40) dev test',
    open: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    timers: {
      set: (fn, ms) => {
        const t = { fn, ms };
        queue.push(t);
        return t;
      },
      clear: (h) => {
        const i = queue.indexOf(h as { fn: () => void; ms: number });
        if (i >= 0) queue.splice(i, 1);
      },
    },
  });
  const conn = connect(START, { onEvent: (e) => events.push(e), onClose: () => closed++ });
  const runTimer = () => queue.shift()!.fn();
  return { conn, sockets, events, queue, runTimer, closed: () => closed };
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
