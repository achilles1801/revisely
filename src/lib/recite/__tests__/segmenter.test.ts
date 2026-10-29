import { frameDb, SAMPLE_RATE, SegmenterEvent, UtteranceSegmenter } from '../segmenter';
import { StreamingRecognizer, SpeechEngine } from '../recognizer';

// Speech stands in as a loud tone over the room's quiet noise.
let seed = 1;
function noise(ms: number, amplitude = 60): Int16Array {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    out[i] = Math.round(((seed / 0x7fffffff) * 2 - 1) * amplitude);
  }
  return out;
}
function tone(ms: number, amplitude = 6000): Int16Array {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = noise(ms);
  for (let i = 0; i < n; i++) out[i] += Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * amplitude);
  return out;
}
const concat = (...parts: Int16Array[]) => {
  const out = new Int16Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const mix = (a: Int16Array, b: Int16Array) => a.map((x, i) => Math.max(-32768, Math.min(32767, x + (b[i] ?? 0))));
/** Push in 100 ms chunks, as the microphone does. */
function feed(seg: UtteranceSegmenter, audio: Int16Array): SegmenterEvent[] {
  const events: SegmenterEvent[] = [];
  for (let i = 0; i < audio.length; i += 1600) events.push(...seg.push(audio.subarray(i, i + 1600)));
  return events;
}
const ms = (samples: number) => (samples * 1000) / SAMPLE_RATE;

describe('frameDb', () => {
  it('measures loudness', () => {
    expect(frameDb(new Int16Array(100))).toBe(-100);
    expect(frameDb(tone(30, 16384))).toBeGreaterThan(-12);
    expect(frameDb(noise(30))).toBeLessThan(-50);
  });
});

describe('UtteranceSegmenter', () => {
  it('cuts at pauses and keeps a little before and after', () => {
    const seg = new UtteranceSegmenter();
    const events = feed(seg, concat(noise(500), tone(2000), noise(1000), tone(1500), noise(1000)));
    const finals = events.filter((e) => e.type === 'final') as { audio: Int16Array; id: number }[];
    expect(finals).toHaveLength(2);
    expect(finals.map((f) => f.id)).toEqual([1, 2]);
    // About 2 s of speech, plus up to 0.3 s before and 0.5 s after.
    expect(ms(finals[0].audio.length)).toBeGreaterThan(2300);
    expect(ms(finals[0].audio.length)).toBeLessThan(2900);
    // Half a second of quiet after the last of the speech: Whisper tends to drop
    // the last word of a clip that ends right after it.
    const audio = finals[0].audio;
    let lastLoud = audio.length - 1;
    while (lastLoud > 0 && Math.abs(audio[lastLoud]) < 1000) lastLoud--;
    expect(ms(audio.length - 1 - lastLoud)).toBeGreaterThanOrEqual(450);
    expect(events.filter((e) => e.type === 'start')).toHaveLength(2);
  });

  it('does not end an utterance at a short breath', () => {
    const seg = new UtteranceSegmenter();
    const events = feed(seg, concat(noise(300), tone(1000), noise(400), tone(1000), noise(1000)));
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('asks for partial results while speech goes on', () => {
    const seg = new UtteranceSegmenter();
    const events = feed(seg, concat(noise(300), tone(3500)));
    const partials = events.filter((e) => e.type === 'partial') as { audio: Int16Array }[];
    expect(partials.length).toBeGreaterThanOrEqual(3);
    // Each partial is the utterance so far, so they grow.
    expect(partials[1].audio.length).toBeGreaterThan(partials[0].audio.length);
  });

  it('ignores clicks and coughs too short to be speech', () => {
    const seg = new UtteranceSegmenter();
    const events = feed(seg, concat(noise(500), tone(90), noise(1000)));
    expect(events.filter((e) => e.type === 'final')).toHaveLength(0);
  });

  it('cuts a long run without pauses before Whisper’s limit, at a quiet moment', () => {
    const seg = new UtteranceSegmenter({ maxUtteranceMs: 10_000 });
    // 12 s of speech with a dip (still above the pause threshold length-wise: 300 ms).
    const audio = concat(noise(300), tone(8500), tone(300, 600), tone(3200), noise(1000));
    const events = feed(seg, audio);
    const finals = events.filter((e) => e.type === 'final') as { audio: Int16Array; cut?: boolean }[];
    expect(finals.length).toBe(2);
    expect(ms(finals[0].audio.length)).toBeLessThanOrEqual(10_000);
    expect(ms(finals[0].audio.length)).toBeGreaterThan(8000);
    // Cut by the limit, and the next one starts a second before the cut.
    expect(finals[0].cut).toBe(true);
    expect(finals[1].cut).toBeFalsy();
    const total = ms(audio.length);
    expect(ms(finals[0].audio.length) + ms(finals[1].audio.length)).toBeGreaterThan(total - 1300 - 1000 + 900);
  });

  it('adapts to a noisier room', () => {
    const seg = new UtteranceSegmenter();
    // Loud steady noise: no speech in it; then speech above it.
    const events = feed(seg, concat(noise(3000, 400), tone(1500, 8000), noise(1500, 400)));
    expect(events.filter((e) => e.type === 'final')).toHaveLength(1);
  });

  it('keeps hearing long recitation in a room that echoes (no truly quiet gaps)', () => {
    const seg = new UtteranceSegmenter();
    // 40 s of words (about -18 dBFS) whose gaps only fall to about -30 (the
    // echo), and to about -41 only every 5 s. The floor used to creep up 3 dB a
    // second from each quiet moment until the voice itself counted as silence,
    // so utterances ended mid-verse and the words after went unheard.
    const parts: Int16Array[] = [noise(500)];
    for (let t = 0; t < 40_000; t += 500) parts.push(tone(400), tone(100, t % 5000 === 0 ? 400 : 1500));
    parts.push(noise(1500));
    const events = feed(seg, concat(...parts));
    const finals = events.filter((e) => e.type === 'final') as { audio: Int16Array; cut?: boolean }[];
    // One long utterance, cut only by the length limit: never ended as if paused.
    expect(finals.slice(0, -1).every((f) => f.cut)).toBe(true);
    expect(finals.length).toBeGreaterThanOrEqual(3);
    expect(events.filter((e) => e.type === 'discard')).toHaveLength(0);
  });

  it('keeps a phrase whole in a noisy room, where softer syllables sit near the noise', () => {
    const seg = new UtteranceSegmenter();
    // Steady noise (about -43 dBFS), then about 6 s of recitation: loud
    // syllables with softer stretches of 0.9 s only about 9 dB above the noise.
    // With one threshold each soft stretch read as a pause, so the phrase came
    // out in fragments and the softer parts were never decoded.
    const loud = () => mix(noise(500, 400), tone(500, 8000));
    const soft = () => mix(noise(900, 400), tone(900, 850));
    const parts = [noise(3000, 400)];
    for (let i = 0; i < 4; i++) parts.push(loud(), soft());
    parts.push(loud(), noise(1500, 400));
    const finals = feed(seg, concat(...parts)).filter((e) => e.type === 'final') as { audio: Int16Array }[];
    expect(finals).toHaveLength(1);
    expect(ms(finals[0].audio.length)).toBeGreaterThan(6000);
  });

  it('flushes the utterance in progress', () => {
    const seg = new UtteranceSegmenter();
    feed(seg, concat(noise(300), tone(1000)));
    const events = seg.flush();
    expect(events.map((e) => e.type)).toEqual(['final']);
  });
});

describe('StreamingRecognizer', () => {
  function fakeEngine(delayMs = 0) {
    const calls: { samples: number }[] = [];
    let resolveNext: (() => void)[] = [];
    const engine: SpeechEngine = {
      transcribe: jest.fn((audio: Int16Array) => {
        calls.push({ samples: audio.length });
        return new Promise<string>((resolve) => {
          const done = () => resolve(`heard ${calls.length}`);
          if (delayMs === 0) done();
          else resolveNext.push(done);
        });
      }),
    };
    const release = () => {
      const r = resolveNext;
      resolveNext = [];
      r.forEach((f) => f());
    };
    return { engine, calls, release };
  }
  const flush = () => new Promise((r) => setImmediate(r));

  it('hands each final over with the partial results of the same utterance', async () => {
    const { engine } = fakeEngine();
    const finals: { text: string; partials: string[] }[] = [];
    const partials: string[] = [];
    const rec = new StreamingRecognizer(engine, {
      onPartial: (t) => partials.push(t),
      onFinal: (text, p) => finals.push({ text, partials: p }),
    });
    for (const chunk of [noise(300), tone(2500), noise(1000)]) {
      for (let i = 0; i < chunk.length; i += 1600) {
        rec.push(chunk.subarray(i, i + 1600));
        await flush();
      }
    }
    await rec.stop();
    expect(finals).toHaveLength(1);
    expect(partials.length).toBeGreaterThan(0);
    expect(finals[0].partials).toEqual(partials);
  });

  it('only decodes the newest partial while the engine is busy, and every final', async () => {
    const { engine, calls, release } = fakeEngine(1);
    const finals: number[] = [];
    const rec = new StreamingRecognizer(engine, { onFinal: (_t, _p, id) => finals.push(id) });
    // Two utterances pushed while the first decode is still running.
    rec.push(concat(noise(300), tone(3500), noise(1000), tone(1500), noise(1000)));
    const stopped = rec.stop();
    for (let i = 0; i < 10; i++) {
      release();
      await flush();
    }
    await stopped;
    expect(finals).toEqual([1, 2]);
    // One partial (the first asked for) and the two finals; the stale partials were skipped.
    expect(calls.length).toBeLessThanOrEqual(4);
  });

  it('reports engine errors and carries on', async () => {
    const onError = jest.fn();
    const finals: string[] = [];
    let n = 0;
    const engine: SpeechEngine = {
      transcribe: () => (++n === 1 ? Promise.reject(new Error('busy')) : Promise.resolve('ok')),
    };
    const rec = new StreamingRecognizer(engine, { onError, onFinal: (t) => finals.push(t) }, { partialEveryMs: 60_000 });
    rec.push(concat(noise(300), tone(500), noise(1000), tone(500), noise(1000)));
    await rec.stop();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(finals).toEqual(['ok']);
  });
});
