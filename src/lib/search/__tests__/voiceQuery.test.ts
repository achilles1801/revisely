import type { AudioSourceHandlers } from '../../recite/micSource';
import { SAMPLE_RATE } from '../../recite/segmenter';
import { VoiceQuery } from '../voiceQuery';

const CHUNK = SAMPLE_RATE / 10;
const tone = () => {
  const a = new Int16Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) a[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 6000);
  return a;
};
const quiet = () => new Int16Array(CHUNK).map(() => Math.round(Math.random() * 40 - 20));

function setup(heard: string[]) {
  let handlers: AudioSourceHandlers | null = null;
  let stopped = 0;
  let decodes = 0;
  const partials: string[] = [];
  const query = new VoiceQuery({
    engine: { transcribe: async () => heard[Math.min(decodes++, heard.length - 1)] ?? '' },
    startSource: async (h) => {
      handlers = h;
      return { stop: async () => void stopped++ };
    },
    onPartial: (t) => partials.push(t),
  });
  const feed = async (chunks: Int16Array[]) => {
    for (const c of chunks) {
      handlers?.onAudio(c);
      await new Promise((r) => setImmediate(r));
    }
  };
  return { query, feed, stopped: () => stopped, partials };
}

describe('VoiceQuery', () => {
  it('hears a phrase and ends at the pause after it', async () => {
    const { query, feed, stopped } = setup(['قل لو شاء الله']);
    await query.start();
    // A quiet start (the room's noise floor), a second and a half of speech, then a pause.
    await feed([...Array(5)].map(quiet));
    await feed([...Array(15)].map(tone));
    await feed([...Array(20)].map(quiet));
    await expect(query.result).resolves.toEqual({ text: 'قل لو شاء الله', end: 'heard' });
    expect(stopped()).toBe(1);
    expect(query.listening).toBe(false);
  });

  it('searches with what was said so far when stopped', async () => {
    const { query, feed } = setup(['الحمد لله']);
    await query.start();
    await feed([...Array(5)].map(quiet));
    await feed([...Array(8)].map(tone));
    await query.stop();
    await expect(query.result).resolves.toEqual({ text: 'الحمد لله', end: 'heard' });
  });

  it('ends with nothing when nothing was said', async () => {
    const { query, feed } = setup([]);
    await query.start();
    await feed([...Array(10)].map(quiet));
    await query.stop();
    await expect(query.result).resolves.toEqual({ text: '', end: 'nothing' });
  });

  it('stops listening after a while with nothing said', async () => {
    jest.useFakeTimers();
    try {
      let now = 0;
      const q = new VoiceQuery({
        engine: { transcribe: async () => '' },
        startSource: async () => ({ stop: async () => undefined }),
        now: () => now,
      });
      await q.start();
      now = 8100;
      jest.advanceTimersByTime(300);
      jest.useRealTimers();
      await expect(q.result).resolves.toEqual({ text: '', end: 'nothing' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives nothing when cancelled', async () => {
    const { query, feed } = setup(['قل']);
    await query.start();
    await feed([...Array(5)].map(quiet));
    await feed([...Array(8)].map(tone));
    await query.cancel();
    await expect(query.result).resolves.toEqual({ text: '', end: 'nothing' });
  });
});
