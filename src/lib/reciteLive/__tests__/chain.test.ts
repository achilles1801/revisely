// A recitation longer than the checker's cap, as a chain of takes (lib/reciteLive/chain, RECITE-22).
import { quranWords } from '../../recite/__fixtures__/quranWords';
import type { Mark } from '../contract';
import { applyEvent, dismissMark, liveConnecting, liveStopping, mistakeCount, type LiveState } from '../state';
import {
  CAP_S,
  chainTakes,
  chainView,
  endsAyah,
  judgedUpTo,
  linkHolding,
  ROLL_FROM_S,
  ROLL_LOOSE_S,
  ROLL_NOW_S,
  rolloverDue,
  settleLink,
} from '../chain';
import { takeOfWord, type TakeRecord } from '../../reciteMemory/record';
import { recordFromTake } from '../../reciteMemory/fromTake';

const words = quranWords();
const A23 = words.verseFirstWord(27, 23);
const A24 = words.verseFirstWord(27, 24);
const A25 = words.verseFirstWord(27, 25);
const A26 = words.verseFirstWord(27, 26);
const ref = (w: number) => words.ref(w);

/** A take located at `start` (found anywhere on the page), then these events. */
function take(start: number, events: Parameters<typeof applyEvent>[1][] = [], id = 't'): LiveState {
  let s = liveConnecting({ anywhereFrom: words.pageRange(words.pageOf(start))[0] });
  s = applyEvent(s, { type: 'ready', take: id, protocol: 9 });
  s = applyEvent(s, { type: 'locked', w: start, s: ref(start).sura, a: ref(start).ayah });
  return events.reduce(applyEvent, s);
}
const mark = (w: number, kind: Mark['kind'] = 'word', t?: [number, number]): Mark => ({
  id: `${w}:${kind}:`,
  w,
  ayah: [ref(w).sura, ref(w).ayah],
  kind,
  sure: 'clear',
  ...(kind === 'word' ? { heard: 'كذا', heardExact: false } : {}),
  ...(t ? { t } : {}),
});

describe('when a take rolls over', () => {
  const lastOf23 = A24 - 1;
  it('never before 14:00 of its audio, whatever the reciter does', () => {
    const s = take(A23, [{ type: 'at', w: lastOf23 }, { type: 'said', upTo: lastOf23 }]);
    expect(endsAyah(words, lastOf23)).toBe(true);
    expect(rolloverDue(s, words, ROLL_FROM_S - 1)).toBe(false);
    expect(rolloverDue(s, words, ROLL_FROM_S)).toBe(true);
  });

  it('from 14:00, at a pause after an ayah’s last word: everything decided, nothing after it begun', () => {
    // Mid-word: the next ayah's first word has begun past what's decided.
    expect(rolloverDue(take(A23, [{ type: 'at', w: A24 }, { type: 'said', upTo: lastOf23 }]), words, 850)).toBe(false);
    // Mid-ayah, at a pause: not an ayah's or a phrase's end yet.
    expect(rolloverDue(take(A23, [{ type: 'at', w: A23 + 3 }, { type: 'said', upTo: A23 + 3 }]), words, 850)).toBe(false);
    expect(rolloverDue(take(A23, [{ type: 'at', w: lastOf23 }, { type: 'said', upTo: lastOf23 }]), words, 850)).toBe(true);
  });

  it('from 14:45 at any pause between words; from 14:55 at once, mid-word too', () => {
    const pause = take(A23, [{ type: 'at', w: A23 + 3 }, { type: 'said', upTo: A23 + 3 }]);
    const midWord = take(A23, [{ type: 'at', w: A23 + 4 }, { type: 'said', upTo: A23 + 3 }]);
    expect(rolloverDue(pause, words, ROLL_LOOSE_S)).toBe(true);
    expect(rolloverDue(midWord, words, ROLL_LOOSE_S)).toBe(false);
    expect(rolloverDue(midWord, words, ROLL_NOW_S)).toBe(true);
    expect(ROLL_NOW_S).toBeLessThan(CAP_S);
  });

  it('never a take that is stopped, paused for its answer, or hasn’t found where the reciter is', () => {
    const s = take(A23, [{ type: 'at', w: lastOf23 }, { type: 'said', upTo: lastOf23 }]);
    expect(rolloverDue(liveStopping(s), words, ROLL_NOW_S)).toBe(false);
    expect(rolloverDue(liveConnecting({ anywhereFrom: A23 }), words, ROLL_NOW_S)).toBe(false);
  });
});

describe('what the screens see of a chain', () => {
  it('a take that never rolled over is itself', () => {
    const s = take(A23, [{ type: 'at', w: A23 + 2 }]);
    expect(chainView([], { state: s, offset: 0 })).toBe(s);
  });

  it('while the next take looks for the place: listening, the cursor and the words decided where the last take left them, its marks still shown', () => {
    const a = liveStopping(take(A23, [{ type: 'at', w: A24 - 1 }, { type: 'said', upTo: A24 - 1 }, { type: 'mark', mark: mark(A23 + 4) }], 'a'));
    const b = liveConnecting({ anywhereFrom: words.pageRange(words.pageOf(A24))[0] });
    const view = chainView([{ state: a, offset: 0 }], { state: b, offset: 850 });
    expect(view.status).toBe('listening');
    expect(view.seeking).toBe(false);
    expect(view.cursor).toBe(A24 - 1);
    expect(view.saidUpTo).toBe(A24 - 1);
    expect(view.start).toBe(A23);
    expect(Object.keys(view.marks)).toEqual([mark(A23 + 4).id]);
    expect(view.take).toBe('a');
  });

  it('once it has found the place, its cursor; both takes’ marks, their times in the chain’s seconds; one score', () => {
    const a = applyEvent(
      liveStopping(
        take(A23, [
          { type: 'at', w: A24 - 1 },
          { type: 'said', upTo: A24 - 1 },
          { type: 'mark', mark: mark(A23 + 4, 'word', [10, 11]) },
          { type: 'score', score: { reached: 11, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 10 / 11 } },
        ], 'a'),
      ),
      { type: 'done', result: { v: 2, take: 'a', from: A23, to: A26, secs: 850, marks: [mark(A23 + 4, 'word', [10, 11])], score: { reached: 11, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 10 / 11 }, start: A23 } },
    );
    const b = take(A24, [
      { type: 'at', w: A24 + 5 },
      { type: 'said', upTo: A24 + 4 },
      { type: 'mark', mark: mark(A24 + 2, 'word', [3, 4]) },
      { type: 'score', score: { reached: 5, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 0.8 } },
    ], 'b');
    const view = chainView([{ state: a, offset: 0 }], { state: b, offset: 850 });
    expect(view.status).toBe('listening');
    expect(view.cursor).toBe(A24 + 5);
    expect(view.saidUpTo).toBe(A24 + 4);
    expect(view.marks[mark(A23 + 4).id].t).toEqual([10, 11]);
    expect(view.marks[mark(A24 + 2).id].t).toEqual([853, 854]);
    expect(view.score).toMatchObject({ reached: 16, mistakes: 2 });
    expect(mistakeCount(view)).toBe(2);
  });

  it('done only once every take has its answer; the final answer covers the chain', () => {
    const a = liveStopping(take(A23, [{ type: 'at', w: A24 - 1 }, { type: 'said', upTo: A24 - 1 }, { type: 'mark', mark: mark(A23 + 4) }], 'a'));
    let b = take(A24, [{ type: 'at', w: A25 + 2 }, { type: 'said', upTo: A25 + 2 }], 'b');
    b = applyEvent(liveStopping(b), { type: 'done', result: { v: 2, take: 'b', from: A24, to: A26, secs: 300, marks: [], score: null, start: A24 } });
    expect(chainView([{ state: a, offset: 0 }], { state: b, offset: 850 }).status).toBe('checking');
    const aDone = applyEvent(a, { type: 'done', result: { v: 2, take: 'a', from: A23, to: A26, secs: 850, marks: [mark(A23 + 4)], score: null, start: A23 } });
    const view = chainView([{ state: aDone, offset: 0 }], { state: b, offset: 850 });
    expect(view.status).toBe('done');
    expect(view.final).toMatchObject({ from: A23, to: A25 + 3, start: A23, secs: 1150 });
    expect(view.final?.marks.map((m) => m.id)).toEqual([mark(A23 + 4).id]);
    expect(view.final?.unfinished).toBeUndefined();
  });

  it('a take that ends without its answer stands as what it found, and the chain says its end wasn’t checked', () => {
    const a = settleLink(liveStopping(take(A23, [{ type: 'at', w: A24 - 1 }, { type: 'mark', mark: mark(A23 + 4) }], 'a')), 850);
    expect(a.status).toBe('done');
    expect(a.final?.unfinished).toBe(true);
    // The next take stopped as it began, never finding the place: it adds nothing.
    const b = settleLink(liveStopping(liveConnecting({ anywhereFrom: A24 })), 1);
    expect(b.status).toBe('done');
    const view = chainView([{ state: a, offset: 0 }], { state: b, offset: 850 });
    expect(view.status).toBe('done');
    expect(view.start).toBe(A23);
    expect(view.final).toMatchObject({ unfinished: true, from: A23 });
    expect(Object.keys(view.marks)).toEqual([mark(A23 + 4).id]);
  });

  it('Not a mistake in either take: off the page and out of the score, and the take that holds it is found by its id', () => {
    const a = take(A23, [{ type: 'mark', mark: mark(A23 + 4) }, { type: 'score', score: { reached: 11, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 10 / 11 } }], 'a');
    const b = take(A24, [{ type: 'mark', mark: mark(A24 + 2) }, { type: 'score', score: { reached: 5, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 0.8 } }], 'b');
    const links = [
      { state: a, offset: 0 },
      { state: b, offset: 850 },
    ];
    expect(linkHolding(links, mark(A23 + 4).id)).toBe(links[0]);
    expect(linkHolding(links, mark(A24 + 2).id)).toBe(links[1]);
    const view = chainView([{ state: dismissMark(a, mark(A23 + 4).id), offset: 0 }], links[1]);
    expect(Object.keys(view.marks)).toEqual([mark(A24 + 2).id]);
    expect(view.removed[mark(A23 + 4).id]).toBeTruthy();
    expect(mistakeCount(view)).toBe(1);
  });
});

describe('a take cut mid-word (at the cap, or at once near it)', () => {
  it('judged only what it had decided by then: no mark, and no count, on the word in flight', () => {
    // The cursor on A24 + 1 (being said), A24 decided: cut there.
    const cut = take(A23, [
      { type: 'at', w: A24 + 1 },
      { type: 'said', upTo: A24 },
      { type: 'mark', mark: mark(A23 + 4) },
      { type: 'score', score: { reached: 13, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 12 / 13 } },
    ], 'a');
    expect(judgedUpTo(cut)).toBe(A24);
    // At a pause there's nothing in flight.
    expect(judgedUpTo(take(A23, [{ type: 'at', w: A24 }, { type: 'said', upTo: A24 }]))).toBeNull();
    // Its final answer marks the part-word (a false haraka slip, as the checker's cuts sometimes do) and counts it.
    const answered = applyEvent(liveStopping(cut), {
      type: 'done',
      result: { v: 2, take: 'a', from: A23, to: A26, secs: 900, marks: [mark(A23 + 4), mark(A24 + 1, 'harakat')], score: { reached: 13, mistakes: 2, tajweed: 0, unclear: 0, accuracy: 11 / 13 }, start: A23, why: 'too_long' },
    });
    const b = take(A24 + 2, [{ type: 'at', w: A24 + 4 }, { type: 'score', score: { reached: 3, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1 } }], 'b');
    const view = chainView([{ state: answered, offset: 0, upTo: judgedUpTo(cut)! }], { state: b, offset: 900 });
    expect(Object.keys(view.marks)).toEqual([mark(A23 + 4).id]);
    expect(view.score).toMatchObject({ reached: 12 + 3, mistakes: 1 });
  });
});

describe('Recite’s memory keeps one record, with each take’s id', () => {
  it('the record covers the chain, and a word’s label goes to the take that judged it', () => {
    const a = applyEvent(liveStopping(take(A23, [{ type: 'at', w: A24 - 1 }, { type: 'said', upTo: A24 - 1 }, { type: 'mark', mark: mark(A23 + 4) }], 'a')), {
      type: 'done',
      result: { v: 2, take: 'a', from: A23, to: A26, secs: 850, marks: [mark(A23 + 4)], score: null, start: A23 },
    });
    const b = applyEvent(liveStopping(take(A24, [{ type: 'at', w: A25 + 2 }, { type: 'said', upTo: A25 + 2 }, { type: 'mark', mark: mark(A24 + 2) }], 'b')), {
      type: 'done',
      result: { v: 2, take: 'b', from: A24, to: A26, secs: 300, marks: [mark(A24 + 2)], score: null, start: A24 },
    });
    const view = chainView([{ state: a, offset: 0 }], { state: b, offset: 850 });
    const links = chainTakes([a, b]);
    expect(links).toEqual([
      { take: 'a', from: A23 },
      { take: 'b', from: A24 },
    ]);
    const r = recordFromTake(view, words, {
      id: 'r1',
      createdAt: 1,
      rev: 1,
      day: '2026-11-22',
      level: 'words',
      hidden: false,
      secs: 1150,
      recordingId: 'rec-1',
      timeOf: () => null,
      openWords: () => [],
      links,
    }) as TakeRecord;
    expect(r).toMatchObject({ from: A23, to: A25 + 2, take: 'a', mistakes: 2, links });
    expect(takeOfWord(r, A23 + 4)).toBe('a');
    expect(takeOfWord(r, A24 + 2)).toBe('b');
    // A single take's record has no links: its own take id.
    expect(takeOfWord({ ...r, links: undefined }, A24 + 2)).toBe('a');
  });
});
