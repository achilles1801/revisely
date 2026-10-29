jest.mock('../../logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { ReciteSession } from '../reciteSession';
import type { AudioSourceHandlers } from '../micSource';
import { SAMPLE_RATE } from '../segmenter';
import { quranWords, say, verse } from '../__fixtures__/quranWords';

const words = quranWords();
const first = (s: number, a: number) => words.verseFirstWord(s, a);

/** Audio of n utterances: half a second of "speech" then a second of quiet each. */
function utterances(n: number): Int16Array[] {
  const chunks: Int16Array[] = [];
  const chunk = SAMPLE_RATE / 10;
  for (let u = 0; u < n; u++) {
    for (let c = 0; c < 5; c++) {
      const a = new Int16Array(chunk);
      for (let i = 0; i < chunk; i++) a[i] = Math.round(Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 6000);
      chunks.push(a);
    }
    for (let c = 0; c < 10; c++) chunks.push(new Int16Array(chunk).map(() => Math.round(Math.random() * 40 - 20)));
  }
  return chunks;
}

/** A session whose recognition hears `heard[i]` for the i-th utterance. */
function setup(heard: string[], options: { pages: number[]; page: number }) {
  let handlers: AudioSourceHandlers | null = null;
  let n = 0;
  const events = { reach: [] as number[], done: [] as number[], mistakes: 0, end: [] as string[] };
  const session = new ReciteSession({
    words,
    engine: { transcribe: async () => heard[n++] ?? '' },
    startSource: async (h) => {
      handlers = h;
      return { stop: async () => undefined };
    },
    pages: options.pages,
    page: options.page,
    onChange: () => undefined,
    onMistakes: (m) => (events.mistakes += m.length),
    onReachPage: (p) => events.reach.push(p),
    onPageDone: (p) => events.done.push(p),
    onEnd: (r) => events.end.push(r),
    // One decode per utterance, so the script lines up.
    segmenter: { partialEveryMs: 60_000 },
  });
  const play = async () => {
    for (const c of utterances(heard.length)) {
      handlers!.onAudio(c);
      await new Promise((r) => setImmediate(r));
    }
  };
  return { session, events, play };
}

describe('ReciteSession', () => {
  it('follows the reciter across pages, credits recited pages and ends on the last', async () => {
    // Page 2 is 2:1-2:5, page 3 starts at 2:6.
    const heard = [1, 2, 3, 4, 5].map((a) => say(verse(2, a)));
    const { session, events, play } = setup(heard, { pages: [2], page: 2 });
    await session.start();
    await play();
    await session.stop();
    expect(session.tracker.mistakes()).toEqual([]);
    expect(events.done).toEqual([2]);
    expect(events.end).toEqual(['finished']);
    // Every word of the page was recited (what the hidden page reveals).
    expect(session.tracker.span).toEqual([first(2, 1), first(2, 6) - 1]);
    expect(session.tracker.recitedCount()).toBe(first(2, 6) - first(2, 1));
  });

  it('shows the last words heard, and how long it has listened', async () => {
    const heard = [say(verse(2, 1)), say(verse(2, 2))];
    const { session, play } = setup(heard, { pages: [2], page: 2 });
    expect(session.lastHeard()).toBe('');
    await session.start();
    await play();
    await session.stop();
    const v = verse(2, 2);
    expect(session.lastHeard(3)).toBe(v.slice(-3).join(' '));
    expect(session.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('going back to a verse on the page before turns the page there', async () => {
    const heard = [6, 7].map((a) => say(verse(2, a)));
    const { session, events, play } = setup(heard, { pages: [2, 3], page: 3 });
    session.startFrom(first(2, 6));
    await session.start();
    await play();
    events.reach.length = 0;
    session.rewindTo(first(2, 5));
    expect(events.reach).toEqual([2]);
    expect(session.tracker.isStale(first(2, 6))).toBe(true);
    await session.stop();
  });

  it('turns to the next page when the reciter reaches it', async () => {
    const heard = [5, 6, 7].map((a) => say(verse(2, a)));
    const { session, events, play } = setup(heard, { pages: [2, 3, 4], page: 2 });
    await session.start();
    await play();
    await session.stop();
    expect(events.reach).toContain(3);
    // Page 2 was only partly recited (from 2:5): from where the reciter started.
    expect(events.done).toEqual([2]);
  });

  it('finds mistakes for the hook (the paid detection), though nothing shows them', async () => {
    const v = verse(2, 2);
    v[4] = 'فيها';
    const { session, events, play } = setup([say(verse(2, 1)), say(v), say(verse(2, 3))], { pages: [2], page: 2 });
    await session.start();
    await play();
    await session.stop();
    expect(events.mistakes).toBe(1);
    const word = first(2, 2) + 4;
    expect(session.tracker.mistakes().map((m) => ({ w: m.word, k: m.kind, h: m.heard }))).toEqual([{ w: word, k: 'wrong', h: 'فيها' }]);
    session.dismiss(word);
    expect(session.tracker.mistakes()).toEqual([]);
  });

  it('looks for the reciter on a page the user turned to', async () => {
    const { session } = setup([], { pages: [2, 3, 50], page: 2 });
    session.startFrom(first(2, 1));
    expect(session.position).toBe(first(2, 1));
    session.pageTurnedByUser(50);
    expect(session.position).toBeNull();
  });
});
