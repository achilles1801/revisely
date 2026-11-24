import { quranWords } from '../../recite/__fixtures__/quranWords';
import { chainView } from '../chain';
import { type LiveEvent, type Mark, parseEvent } from '../contract';
import { applyEvent, liveConnecting, type LiveState } from '../state';
import { barWords } from '../view';

const words = quranWords();
const A = words.verseFirstWord(27, 23);
const SR = 16000;

const ready: LiveEvent = { type: 'ready', take: 't', protocol: 10, words: true };
const play = (s: LiveState, ...events: LiveEvent[]) => events.reduce(applyEvent, s);
const begin = (...events: LiveEvent[]) => play(liveConnecting({ start: A }), ready, { type: 'locked', w: A, s: 27, a: 23 }, ...events);
/** Visit `v` of word A + `d`, from second `from` to `to`. */
const word = (d: number, v: number, from: number, to: number, sub = false): LiveEvent => ({
  type: 'word',
  w: A + d,
  v,
  s: from * SR,
  e: to * SR,
  ...(sub ? { sub: true as const } : {}),
});
const line = (s: LiveState, check = true) => barWords(s, words, { check, startWord: A }).map((b) => b.w - A);
const wrongAt = (d: number, t?: [number, number]): Mark => ({
  id: `${A + d}:word:x`,
  w: A + d,
  ayah: [27, 23],
  kind: 'word',
  sure: 'clear',
  heard: 'وَأُوهِيَتْ',
  heardExact: false,
  ...(t ? { t } : {}),
});

describe('[RECITE-29] the frames', () => {
  it('reads a word, a sub word, an unword and ready.words; refuses a malformed one', () => {
    expect(parseEvent({ type: 'word', w: 5, v: 0, s: 100, e: 900, t: 1 })).toEqual({ type: 'word', w: 5, v: 0, s: 100, e: 900, t: 1 });
    expect(parseEvent({ type: 'word', w: 5, v: 1, s: 0, e: 9, sub: true })).toMatchObject({ sub: true });
    expect(parseEvent({ type: 'unword', w: 5, v: 1 })).toEqual({ type: 'unword', w: 5, v: 1 });
    expect(parseEvent({ type: 'ready', take: 't', words: true })).toMatchObject({ words: true });
    expect(parseEvent({ type: 'ready', take: 't' })).not.toHaveProperty('words');
    for (const bad of [{ w: -1, v: 0, s: 0, e: 1 }, { w: 1, v: 0.5, s: 0, e: 1 }, { w: 1, v: 0, s: 5, e: 1 }, { w: 1, v: 0, e: 1 }]) {
      expect(parseEvent({ type: 'word', ...bad })).toBeNull();
    }
  });
});

describe('[RECITE-29] the line is what was said', () => {
  it('nothing until a word has finished, whatever the cursor does', () => {
    const s = begin({ type: 'at', w: A + 3 });
    expect(line(s)).toEqual([]);
  });

  it('without ready.words, frames change nothing and the bar is RECITE-28’s', () => {
    const s = play(liveConnecting({ start: A }), { type: 'ready', take: 't', protocol: 9 }, { type: 'at', w: A + 3 }, word(9, 0, 1, 2));
    expect(s.visits).toBeUndefined();
    expect(line(s)).toEqual([1, 2]);
  });

  it('the last two in the order said, by first sample, not by id', () => {
    const s = begin(word(0, 0, 1, 1.4), word(2, 1, 2, 2.4), word(1, 2, 1.5, 1.9));
    expect(line(s)).toEqual([1, 2]);
    expect(barWords(s, words, { check: true, startWord: A }).map((b) => b.tone)).toEqual(['said', 'current']);
  });

  it('a word said again, and going back, are written again', () => {
    const s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9), word(0, 2, 2.5, 2.9));
    expect(line(s)).toEqual([1, 0]);
    expect(s.visits).toHaveLength(3);
  });

  it('a word said twice stays two visits even where they touch or overlap at their edges', () => {
    const touching = begin(word(1, 0, 1, 1.4), word(1, 1, 1.4, 1.8));
    expect(touching.visits).toHaveLength(2);
    expect(line(touching)).toEqual([1, 1]);
    expect(begin(word(1, 0, 1, 1.5), word(1, 1, 1.4, 1.9)).visits).toHaveLength(2);
    // The same id again is the same visit, its edges moved.
    expect(begin(word(1, 0, 1, 1.4), word(1, 0, 1.1, 1.5)).visits).toHaveLength(1);
  });

  it('a word the checker takes back comes off the line', () => {
    const s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9), { type: 'unword', w: A + 1, v: 1 });
    expect(line(s)).toEqual([0]);
  });

  it('the word the take stops on is there once the checker flushes it', () => {
    const s = begin(word(0, 0, 1, 1.4), { type: 'at', w: A + 1 }, word(1, 1, 1.5, 1.9));
    expect(line({ ...s, status: 'checking' })).toEqual([0, 1]);
  });
});

describe('[RECITE-29] a word not heard as the page’s word is never printed as it', () => {
  it('nothing for it meanwhile; later words go on', () => {
    const s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9, true), word(2, 2, 2, 2.4));
    expect(line(s)).toEqual([0, 2]);
  });

  it('a mark names it: as heard, in its place', () => {
    const s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9, true), word(2, 2, 2, 2.4), { type: 'mark', mark: wrongAt(1) });
    const shown = barWords(s, words, { check: true, startWord: A });
    expect(shown.map((b) => [b.w - A, b.tone])).toEqual([
      [1, 'wrong'],
      [2, 'current'],
    ]);
    expect(shown[0].text).toBe('وَأُوهِيَتْ');
  });

  it('`said` passes it unmarked: the page’s word', () => {
    const held = begin(word(1, 0, 1.5, 1.9, true));
    expect(line(held)).toEqual([]);
    expect(line(play(held, { type: 'said', upTo: A + 1 }))).toEqual([1]);
  });

  it('a `said` from before it came doesn’t settle it', () => {
    const s = begin({ type: 'said', upTo: A + 5 }, word(1, 0, 8, 8.4, true));
    expect(line(s)).toEqual([]);
  });

  it('once the take has stopped nothing is held', () => {
    const s = begin(word(1, 0, 1.5, 1.9, true));
    expect(line({ ...s, status: 'done' })).toEqual([1]);
  });

  it('a mark on a word said twice goes on the visit its time falls in', () => {
    const s = begin(word(1, 0, 1, 1.4), word(2, 1, 1.5, 1.9), word(1, 2, 3, 3.4), { type: 'mark', mark: wrongAt(1, [1.1, 1.3]) });
    const shown = barWords(s, words, { check: true, startWord: A });
    expect(shown.map((b) => [b.w - A, b.tone])).toEqual([
      [2, 'said'],
      [1, 'current'],
    ]);
  });

  it('a skipped word isn’t on the line', () => {
    const skipped: Mark = { id: 'sk', w: A + 1, ayah: [27, 23], kind: 'skipped', sure: 'clear' };
    const s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9), { type: 'mark', mark: skipped });
    expect(line(s)).toEqual([0]);
  });
});

describe('[RECITE-29] across connections and long recitations', () => {
  it('a resume’s visits sent again are the same entries', () => {
    let s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9));
    s = play(s, ready, { type: 'locked', w: A + 1, s: 27, a: 23 }, word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9));
    expect(s.visits).toHaveLength(2);
    expect(line(s)).toEqual([0, 1]);
  });

  it('another instance counts `v` from 0: its visits don’t replace or take back the earlier ones', () => {
    let s = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9));
    s = play(s, ready, word(2, 0, 2, 2.4));
    expect(s.visits).toHaveLength(3);
    s = play(s, { type: 'unword', w: A + 2, v: 0 });
    expect(s.visits!.map((x) => x.w - A)).toEqual([0, 1]);
  });

  it('a chain’s links join in order, in the chain’s time, without a cut link’s word in flight', () => {
    const first = begin(word(0, 0, 1, 1.4), word(1, 1, 1.5, 1.9));
    const second = begin(word(2, 0, 0.5, 0.9));
    const view = chainView([{ state: { ...first, status: 'done' }, offset: 0, upTo: A }], { state: second, offset: 10 });
    expect(view.visits!.map((x) => [x.w - A, x.s / SR])).toEqual([
      [0, 1],
      [2, 10.5],
    ]);
    expect(line(view)).toEqual([0, 2]);
  });
});
