import { callTimeoutMs, CLIPS, clipSender, ClipDeps, parseClip, SecondClip } from '../clipSender';

const word = (n: number, over: Record<string, unknown> = {}) => ({
  type: 'clip',
  id: `${n}:word:lookalike`,
  kind: 'word',
  a: n - 1,
  b: n + 2,
  w: n,
  s0: 16_000,
  s1: 32_000,
  ...over,
});
const LETTERS = { type: 'clip', id: '1240:harakat:', kind: 'letters', s: 2, a: 13, lo: 3, hi: 6, i: 5, w: 1240, s0: 8_000, s1: 40_000 };

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

function setup(over: Partial<ClipDeps> = {}) {
  const calls: { clips: SecondClip[]; timeoutMs: number; answer: (r: { status: number; results?: unknown }) => void; fail: (e: Error) => void }[] = [];
  const verdicts: [string, string][] = [];
  const cuts: [number, number][] = [];
  const timers: { fn: () => void; ms: number; off?: boolean }[] = [];
  const state = { online: true };
  const s = clipSender({
    cut: async (a, b) => {
      cuts.push([a, b]);
      return 'QUJD';
    },
    post: (clips, timeoutMs) => new Promise((answer, fail) => calls.push({ clips, timeoutMs, answer, fail })),
    verdict: (id, v) => verdicts.push([id, v]),
    online: () => state.online,
    later: (fn, ms) => {
      const h = { fn, ms };
      timers.push(h);
      return h;
    },
    cancel: (h) => {
      (h as { off?: boolean }).off = true;
    },
    ...over,
  });
  const ring = () => timers.filter((t) => !t.off).forEach((t) => t.fn());
  return { s, calls, verdicts, cuts, timers, state, ring };
}

const results = (clips: SecondClip[], verdict = 'keep') => ({ status: 200, results: clips.map((c) => ({ id: c.id, verdict })) });

describe('parseClip', () => {
  it('reads the engine’s two kinds', () => {
    expect(parseClip(word(1234))).toEqual({ id: '1234:word:lookalike', kind: 'word', a: 1233, b: 1236, w: 1234, s0: 16000, s1: 32000 });
    expect(parseClip(LETTERS)).toMatchObject({ kind: 'letters', s: 2, a: 13, lo: 3, hi: 6, i: 5 });
  });

  it.each([
    ['no id', { id: '' }],
    ['an id past 80 characters', { id: 'x'.repeat(81) }],
    ['under 0.2 s', { s1: 16_000 + 3_199 }],
    ['over 20 s', { s1: 16_000 + 320_001 }],
    ['a sample that is not whole', { s0: 1.5 }],
    ['a word without its words', { a: undefined }],
    ['another kind', { kind: 'tajweed' }],
  ])('refuses %s', (_n, over) => {
    expect(parseClip(word(1, over))).toBeNull();
  });
});

describe('[ONDEV-4] clipSender', () => {
  it('sends a clip as it comes, and hands its verdict to the engine', async () => {
    const t = setup();
    t.s.add(word(1234));
    await flush();
    expect(t.cuts).toEqual([[16000, 32000]]);
    expect(t.calls[0].clips).toEqual([{ id: '1234:word:lookalike', kind: 'word', a: 1233, b: 1236, w: 1234, audio: 'QUJD' }]);
    t.calls[0].answer(results(t.calls[0].clips, 'veto'));
    await flush();
    expect(t.verdicts).toEqual([['1234:word:lookalike', 'veto']]);
  });

  it('sends a letters clip as the contract names it, without the engine’s own fields', async () => {
    const t = setup();
    t.s.add(LETTERS);
    await flush();
    expect(t.calls[0].clips).toEqual([{ id: '1240:harakat:', kind: 'letters', s: 2, a: 13, lo: 3, hi: 6, i: 5, audio: 'QUJD' }]);
  });

  it('up to 3 calls at once, and what waits goes up to 8 clips a call', async () => {
    const t = setup();
    for (let n = 1; n <= 13; n++) t.s.add(word(n));
    await flush();
    expect(t.calls.map((c) => c.clips.length)).toEqual([1, 1, 1]);
    t.calls[0].answer(results(t.calls[0].clips));
    await flush();
    expect(t.calls.map((c) => c.clips.length)).toEqual([1, 1, 1, 8]);
    t.calls[1].answer(results(t.calls[1].clips));
    await flush();
    expect(t.calls.map((c) => c.clips.length)).toEqual([1, 1, 1, 8, 2]);
  });

  it('a call holds about 12 s of audio, and a longer clip goes alone', async () => {
    const t = setup();
    for (let n = 1; n <= 3; n++) t.s.add(word(n)); // the three calls out
    await flush();
    const secs = (n: number, s: number) => word(n, { s0: 0, s1: s * 16_000 });
    t.s.add(secs(10, 5));
    t.s.add(secs(11, 5));
    t.s.add(secs(12, 5));
    t.s.add(secs(13, 20));
    t.s.add(secs(14, 1));
    for (let i = 0; i < 3; i++) {
      t.calls[i].answer(results(t.calls[i].clips));
      await flush();
    }
    expect(t.calls.slice(3).map((c) => c.clips.map((x) => x.id.split(':')[0]))).toEqual([['10', '11'], ['12'], ['13']]);
    t.calls[3].answer(results(t.calls[3].clips));
    await flush();
    expect(t.calls[6].clips.map((x) => x.id.split(':')[0])).toEqual(['14']);
  });

  it('gives each call time for its audio, and a cold start', async () => {
    expect(callTimeoutMs(12 * 16_000)).toBe(20_000 + 18_000);
    expect(callTimeoutMs(20 * 16_000)).toBe(20_000 + 30_000);
    const t = setup();
    t.s.add(word(1, { s0: 0, s1: 8 * 16_000 }));
    await flush();
    expect(t.calls[0].timeoutMs).toBe(callTimeoutMs(8 * 16_000));
  });

  it('a clip the take dropped doesn’t count toward its call’s time', async () => {
    const t = setup();
    for (let n = 1; n <= 3; n++) t.s.add(word(n));
    await flush();
    t.s.add(word(4, { s0: 0, s1: 4 * 16_000 }));
    t.s.add(word(5, { s0: 0, s1: 4 * 16_000 }));
    t.calls[0].answer(results(t.calls[0].clips));
    t.s.drop('5:word:lookalike');
    await flush();
    expect(t.calls[3].clips.map((c) => c.id)).toEqual(['4:word:lookalike']);
    expect(t.calls[3].timeoutMs).toBe(callTimeoutMs(4 * 16_000));
  });

  it('beyond a short queue the oldest unsent clip goes', async () => {
    const t = setup();
    for (let n = 1; n <= CLIPS.parallel; n++) t.s.add(word(n)); // on their way
    await flush();
    const first = CLIPS.parallel + 1;
    for (let n = first; n <= first + CLIPS.queue; n++) t.s.add(word(n));
    t.calls[0].answer(results(t.calls[0].clips));
    await flush();
    const next = t.calls[CLIPS.parallel].clips.map((c) => c.id);
    expect(next[0]).toBe(`${first + 1}:word:lookalike`);
  });

  it('never sends the same mark twice', async () => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    t.calls[0].answer(results(t.calls[0].clips));
    await flush();
    t.s.add(word(1));
    await flush();
    expect(t.calls).toHaveLength(1);
  });

  it('offline, nothing is sent, and Stop does not wait', async () => {
    const t = setup();
    t.state.online = false;
    t.s.add(word(1));
    await flush();
    expect(t.calls).toHaveLength(0);
    await t.s.stop();
    expect(t.calls).toHaveLength(0);
  });

  it('a clip the take took back does not go, and its late verdict is ignored', async () => {
    const t = setup();
    for (let n = 1; n <= CLIPS.parallel; n++) t.s.add(word(n));
    t.s.add(word(9));
    t.s.drop('9:word:lookalike');
    await flush();
    t.calls[0].answer(results(t.calls[0].clips));
    await flush();
    expect(t.calls).toHaveLength(CLIPS.parallel);

    const late = setup();
    late.s.add(word(1));
    await flush();
    late.s.drop('1:word:lookalike');
    late.calls[0].answer(results(late.calls[0].clips, 'veto'));
    await flush();
    expect(late.verdicts).toEqual([]);
  });

  it.each([401, 403, 404, 429, 503])('a %d stops this take’s clips; its marks stand', async (status) => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    t.calls[0].answer({ status });
    await flush();
    t.s.add(word(3));
    await flush();
    expect(t.calls).toHaveLength(1);
    expect(t.verdicts).toEqual([]);
    await t.s.stop();
  });

  it('a failed call leaves its marks standing and the next clips still go', async () => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    t.calls[0].fail(new Error('network'));
    await flush();
    t.s.add(word(2));
    await flush();
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1].clips[0].id).toBe('2:word:lookalike');
  });

  it('a 500 is not retried, and does not stop the take', async () => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    t.calls[0].answer({ status: 500 });
    await flush();
    t.s.add(word(2));
    await flush();
    expect(t.calls.map((c) => c.clips[0].id)).toEqual(['1:word:lookalike', '2:word:lookalike']);
  });

  it('a clip that cannot be cut is left out of the call', async () => {
    const t = setup({ cut: async (a) => (a === 1 ? null : 'QUJD') });
    t.s.add(word(1, { s0: 1, s1: 16_001 }));
    await flush();
    expect(t.calls).toHaveLength(0);
    t.s.add(word(2));
    await flush();
    expect(t.calls[0].clips.map((c) => c.id)).toEqual(['2:word:lookalike']);
  });

  it('ignores answers it did not ask for, and verdicts it does not know', async () => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    t.calls[0].answer({ status: 200, results: [{ id: 'other', verdict: 'veto' }, { id: '1:word:lookalike', verdict: 'maybe' }, null] });
    await flush();
    expect(t.verdicts).toEqual([]);
  });

  describe('at Stop', () => {
    it('resolves at once with nothing out', async () => {
      const t = setup();
      await t.s.stop();
      expect(t.timers.every((h) => h.off)).toBe(true);
    });

    it('waits for a verdict still out, and takes it', async () => {
      const t = setup();
      t.s.add(word(1));
      await flush();
      let stopped = false;
      const stop = t.s.stop().then(() => (stopped = true));
      await flush();
      expect(stopped).toBe(false);
      t.calls[0].answer(results(t.calls[0].clips, 'veto'));
      await stop;
      expect(t.verdicts).toEqual([['1:word:lookalike', 'veto']]);
    });

    it('sends what is queued inside its budget', async () => {
      const t = setup();
      for (let n = 1; n <= CLIPS.parallel + 1; n++) t.s.add(word(n));
      await flush();
      const stop = t.s.stop();
      for (let i = 0; i < CLIPS.parallel; i++) t.calls[i].answer(results(t.calls[i].clips));
      await flush();
      expect(t.calls).toHaveLength(CLIPS.parallel + 1);
      t.calls[CLIPS.parallel].answer(results(t.calls[CLIPS.parallel].clips));
      await stop;
      expect(t.verdicts).toHaveLength(CLIPS.parallel + 1);
    });

    it('waits no longer than 0.5 s, and a late verdict is ignored', async () => {
      const t = setup();
      t.s.add(word(1));
      await flush();
      const stop = t.s.stop();
      expect(t.timers.find((h) => !h.off)?.ms).toBe(500);
      t.ring();
      await stop;
      t.calls[0].answer(results(t.calls[0].clips, 'veto'));
      await flush();
      expect(t.verdicts).toEqual([]);
    });
  });

  it('closed, it sends nothing more and lets a waiting Stop go', async () => {
    const t = setup();
    t.s.add(word(1));
    await flush();
    const stop = t.s.stop();
    t.s.close();
    await stop;
    t.s.add(word(2));
    await flush();
    expect(t.calls).toHaveLength(1);
  });
});
