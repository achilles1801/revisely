// Recite (BEHAVIOUR.md RECITE-*): what a take shows of what the checker says, against the checker's events in any
// order and repetition, on real pages of the 1405 mushaf. The app's half is pure (lib/reciteLive), so these run it
// whole; the checker itself is a stand-in that may say anything the contract allows.

import fc from 'fast-check';
import { quranWords } from '../../../src/lib/recite/__fixtures__/quranWords';
import {
  countsAsMistake,
  GROUP_RANK,
  isUnclear,
  markGroup,
  strongestByWord,
  type FinalResult,
  type LiveEvent,
  type LiveScore,
  type Mark,
  type MarkKind,
} from '../../../src/lib/reciteLive/contract';
import {
  applyEvent,
  dismissMark,
  findingStart,
  liveConnecting,
  mistakeCount,
  restoreMark,
  seekOnPage,
  settleUnfinished,
  isUnfinished,
  liveStopping,
  startNotFound,
  furthestWord,
  revealedUpTo,
  guessCursor,
  shownUpTo,
  revealDelay,
  wordLetters,
  REVEAL_AFTER_MS,
  REVEAL_MAX_MS,
  BACKSTOP_MIN_MS,
  BACKSTOP_MAX_MS,
  slowAfterBeat,
  SLOW_AT_S,
  SLOW_CLEAR_S,
  LIVE_IDLE,
  type LiveState,
} from '../../../src/lib/reciteLive/state';
import { isATake, LONG_AYAH_WORDS, recitedEnough } from '../../../src/lib/reciteLive/takeEnough';
import { AT_LAG, clipRange, endsPhrase, LEAD, MAX_SECONDS, phraseOf, SHORT_WORDS, TAIL, WORDS_AFTER, WORDS_BEFORE } from '../../../src/lib/reciteLive/phrase';
import { pagesReached, perPageLabel, PER_PAGE_FROM } from '../../../src/lib/reciteLive/score';
import { expectedPhrase, recitedPhrase } from '../../../src/lib/reciteLive/describe';
import { socketFeed, CATCHUP_SLICE_SAMPLES, CATCHUP_TICK_MS, KEEPALIVE_MS, WATCHDOG_MS, type SocketLike } from '../../../src/lib/reciteLive/socket';
import { scoreTapOpens } from '../../../src/lib/reciteLive/view';
import type { StartFrame } from '../../../src/lib/reciteLive/feed';
import { meanScore } from '../../../src/lib/reciteInsights/insights';
import { passageTakes } from '../../../src/lib/reciteMemory/progress';
import { orphanTakes } from '../../../src/lib/reciteMemory/apart';
import type { RecordingMeta } from '../../../src/lib/recordings';
import { markFill } from '../../../src/components/reciteLive/markColours';
import { markTitle } from '../../../src/lib/reciteLive/describe';
import { coverHighlights, NOTHING_SHOWN, revealAyah, revealNextWord, wordShown } from '../../../src/lib/reciteLive/view';
import { createMistakeCue, cuesMark, CUE_GAP_MS } from '../../../src/lib/reciteLive/mistakeCue';
import { drillRange, lastWordOf, openDrill } from '../../../src/lib/reciteLive/drill';
import { CUE_WORDS, TEST_AYAHS, TEST_PLACES, testPlaces, testResult } from '../../../src/lib/reciteLive/testMe';
import { recordFromTake } from '../../../src/lib/reciteMemory/fromTake';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';
import { ayahKey, ayahsBetween, ayahCount, suraOf, ayahOf, type AyahKey } from '../../../src/lib/ayahKeys';
import { getJuzForPage } from '../../../src/lib/quranData';
import { runs } from './fixtures';
import { ayahBand, cursorBox, markHighlight, wordBox } from '../../../src/lib/reciteLive/geometry';
import { followCues, washOf, washReach } from '../../../src/lib/reciteLive/wash';
import { followBox, hiddenInkPlan } from '../../../src/components/reciteLive/HiddenInkLayer';
import { hiddenTakeInfo, keepRecited, revealedOnHide } from '../../../src/lib/reciteLive/hideSwitch';
import { pageLines } from '../../../src/lib/recite/pageLines';
import { CAP_S, chainView, endsAyah, nextLinkStart, ROLL_FROM_S, ROLL_NOW_S, rolloverDue } from '../../../src/lib/reciteLive/chain';

const words = quranWords();
const KINDS: MarkKind[] = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'];

/** A page of the 1405 print with words (1–604). */
const pageArb = fc.integer({ min: 1, max: 604 });

/** A word on `page`. */
const wordOn = (page: number) => {
  const [from, to] = words.pageRange(page);
  return fc.integer({ min: from, max: to - 1 });
};

/** A mark the checker may send on `page`: any kind, sure or only likely, a few per word. */
function markArb(page: number): fc.Arbitrary<Mark> {
  return fc
    .record({ w: wordOn(page), kind: fc.constantFrom(...KINDS), sure: fc.constantFrom<'clear' | 'likely'>('clear', 'likely'), n: fc.nat(2) })
    .map(({ w, kind, sure, n }) => {
      const r = words.ref(w);
      return { id: `${w}:${kind}:${n}`, w, ayah: [r.sura, r.ayah], kind, sure, ...(kind === 'tajweed' ? { rule: 'ghunnah' as const } : {}) };
    });
}

/** A score as a checker that counts Not clear apart (`unclear`) or not would send it for `marks`. */
function scoreOf(marks: readonly Mark[], reached: number, apart: boolean): LiveScore {
  const unclear = marks.filter(isUnclear).length;
  const mistakes = marks.filter((m) => countsAsMistake(m) && (!apart || !isUnclear(m))).length;
  const tajweed = marks.filter((m) => m.kind === 'tajweed').length;
  return { reached, mistakes, tajweed, ...(apart ? { unclear } : {}), accuracy: reached > 0 ? 1 - mistakes / reached : 1 };
}

const finalOf = (marks: Mark[], from: number, to: number, start: number | null | undefined, score: LiveScore | null): FinalResult => ({
  v: 2,
  take: 't',
  from,
  to,
  secs: 60,
  marks,
  score,
  ...(start === undefined ? {} : { start }),
});

/** Anything the checker may send during a take on `page`, `locked` included or not. */
function eventArb(page: number, locks: boolean): fc.Arbitrary<LiveEvent> {
  const [from, to] = words.pageRange(page);
  const w = wordOn(page);
  const base: fc.Arbitrary<LiveEvent>[] = [
    w.map((x) => ({ type: 'at' as const, w: x })),
    w.map((x) => ({ type: 'said' as const, upTo: x })),
    w.map((x) => ({ type: 'off' as const, w: x })),
    markArb(page).map((mark) => ({ type: 'mark' as const, mark })),
    markArb(page).map((m) => ({ type: 'unmark' as const, id: m.id, why: 'corrected' as const })),
    w.map((x) => ({ type: 'ayah' as const, s: words.ref(x).sura, a: words.ref(x).ayah })),
    fc.array(markArb(page), { maxLength: 6 }).map((ms) => ({ type: 'score' as const, score: scoreOf(ms, to - from, true) })),
    fc.constant({ type: 'ready' as const, take: 't', protocol: 7 }),
  ];
  if (locks) base.push(w.map((x) => ({ type: 'locked' as const, w: x, s: words.ref(x).sura, a: words.ref(x).ayah })));
  return fc.oneof(...base);
}

/** A take started anywhere on `page`, its checker ready (protocol 7: it looks for the start). */
const anywhere = (page: number): LiveState => applyEvent(liveConnecting({ anywhereFrom: words.pageRange(page)[0] }), { type: 'ready', take: 't', protocol: 7 });

const fold = (s: LiveState, es: readonly LiveEvent[]) => es.reduce(applyEvent, s);

/** A take on `page` and what the checker sent it: locked somewhere, then anything. */
const takeArb = pageArb.chain((page) =>
  fc.record({
    page: fc.constant(page),
    lock: wordOn(page),
    // A checker that looks for the start (protocol 6 on) sends no cursor before `locked`. A cursor with no `locked` is
    // an older checker's, which starts at the page's top (lib/reciteLive/state startedUnlocked).
    before: fc.array(eventArb(page, false).filter((e) => e.type !== 'at'), { maxLength: 8 }),
    after: fc.array(eventArb(page, true), { maxLength: 20 }),
  }),
);
function played(t: { page: number; lock: number; before: LiveEvent[]; after: LiveEvent[] }): LiveState {
  const r = words.ref(t.lock);
  return fold(anywhere(t.page), [...t.before, { type: 'locked', w: t.lock, s: r.sura, a: r.ayah }, ...t.after]);
}

describe('[RECITE-1] a take shows nothing of the reciter until it has found them, and nothing before the start is skipped', () => {
  it('until found: no cursor (no band, no word box), nothing recited shows on a hidden page', () => {
    fc.assert(
      fc.property(
        pageArb.chain((page) => fc.tuple(fc.constant(page), fc.array(eventArb(page, false).filter((e) => e.type !== 'at'), { maxLength: 25 }))),
        ([page, events]) => {
          const s = fold(anywhere(page), events);
          expect(findingStart(s)).toBe(true);
          expect(s.cursor).toBeNull();
          expect(s.start).toBeNull();
          const [from, to] = words.pageRange(page);
          for (let w = from; w < to; w++) expect(wordShown(w, NOTHING_SHOWN, { saidUpTo: s.saidUpTo, startWord: s.start })).toBe(false);
        },
      ),
      { numRuns: runs(150) },
    );
  });

  it('once found: the first place found is the start, and no word before it is ever marked skipped, live or in the final answer', () => {
    fc.assert(
      fc.property(takeArb, fc.array(fc.constant(0), { maxLength: 1 }), (t, withDone) => {
        let s = played(t);
        expect(s.start).toBe(t.lock);
        const before = (m: Mark) => m.kind === 'skipped' && m.w < t.lock;
        expect(Object.values(s.marks).filter(before)).toEqual([]);
        if (withDone.length) {
          const [from, to] = words.pageRange(t.page);
          const finalMarks = [
            { id: `${from}:skipped:9`, w: from, ayah: [words.ref(from).sura, words.ref(from).ayah] as [number, number], kind: 'skipped' as const, sure: 'clear' as const },
            ...Object.values(s.marks),
          ];
          s = applyEvent(s, { type: 'done', result: finalOf(finalMarks, from, to - 1, t.lock, null) });
          expect(Object.values(s.marks).filter(before)).toEqual([]);
        }
      }),
      { numRuns: runs(150) },
    );
  });

  it('a page turned by hand looks for the reciter there, keeping what was decided', () => {
    fc.assert(
      fc.property(takeArb, pageArb, (t, other) => {
        const s = played(t);
        const turned = seekOnPage(s, words.pageRange(other)[0]);
        expect(turned.cursor).toBeNull();
        expect(findingStart(turned)).toBe(true);
        expect(turned.marks).toEqual(s.marks);
        expect(turned.saidUpTo).toBe(s.saidUpTo);
        expect(turned.start).toBe(s.start);
      }),
      { numRuns: runs(100) },
    );
  });

  it('a start never found ends with nothing: no start, and no record kept', () => {
    fc.assert(
      fc.property(
        pageArb.chain((page) => fc.tuple(fc.constant(page), fc.array(eventArb(page, false).filter((e) => e.type !== 'at'), { maxLength: 15 }), fc.boolean())),
        ([page, events, sayNull]) => {
          const [from, to] = words.pageRange(page);
          const s = applyEvent(fold(anywhere(page), events), { type: 'done', result: finalOf([], from, to - 1, sayNull ? null : undefined, null) });
          expect(startNotFound(s)).toBe(true);
          const ctx = { id: 'x', createdAt: 1, rev: 1, day: '2026-11-16', level: 'words' as const, hidden: false, secs: 60, recordingId: null, timeOf: () => null, openWords: () => [] };
          expect(recordFromTake(s, words, ctx)).toBeNull();
        },
      ),
      { numRuns: runs(100) },
    );
  });
});

describe('[RECITE-2] what a take marks, how it counts, and how it shows', () => {
  const palette = {
    markWord: 'red',
    markWordFirm: 'red!',
    markSlip: 'amber',
    markSlipFirm: 'amber!',
    markTajweed: 'violet',
    markTajweedFirm: 'violet!',
  };

  it('three colours: red for words (wrong, skipped, added), amber for harakat and letters (Not clear too), violet for tajweed', () => {
    fc.assert(
      fc.property(pageArb.chain(markArb), (m) => {
        const expected = m.kind === 'tajweed' ? 'violet' : m.kind === 'harakat' || m.kind === 'letter' ? 'amber' : 'red';
        expect(markFill(palette, m)).toBe(expected);
      }),
      { numRuns: runs(200) },
    );
  });

  it('a word with several marks shows its strongest: a word mistake, then a slip, then a tajweed note', () => {
    fc.assert(
      fc.property(pageArb.chain((p) => fc.array(markArb(p), { minLength: 1, maxLength: 12 })), (marks) => {
        const shown = strongestByWord(marks);
        expect([...shown.keys()].sort()).toEqual([...new Set(marks.map((m) => m.w))].sort());
        for (const [w, m] of shown) {
          const best = Math.max(...marks.filter((x) => x.w === w).map((x) => GROUP_RANK[markGroup(x)]));
          expect(GROUP_RANK[markGroup(m)]).toBe(best);
        }
      }),
      { numRuns: runs(200) },
    );
  });

  it('the count is the mistakes shown: never a tajweed note (nor Not clear), and a tajweed note taken off leaves the score as it was', () => {
    fc.assert(
      fc.property(takeArb, (t) => {
        // No score from the checker yet: the marks shown count.
        const s0 = { ...played(t), score: null };
        const marks = Object.values(s0.marks);
        expect(mistakeCount(s0)).toBe(marks.filter((m) => m.kind !== 'tajweed' && !isUnclear(m)).length);
        // With a score: a tajweed note taken off never moves the mistakes or the accuracy.
        const s = { ...s0, score: scoreOf(marks, 200, true) };
        for (const m of marks.filter((x) => x.kind === 'tajweed')) {
          const after = dismissMark(s, m.id);
          expect(after.score?.mistakes).toBe(s.score.mistakes);
          expect(after.score?.accuracy).toBe(s.score.accuracy);
        }
      }),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-3] Not clear is never wrong and never counts', () => {
  it('a haraka or letter heard only as likely reads "Not clear"; nothing else does', () => {
    fc.assert(
      fc.property(pageArb.chain(markArb), (m) => {
        const unclear = (m.kind === 'harakat' || m.kind === 'letter') && m.sure === 'likely';
        expect(isUnclear(m)).toBe(unclear);
        expect(markTitle(m) === 'Not clear').toBe(unclear);
      }),
      { numRuns: runs(200) },
    );
  });

  it('the count leaves Not clear out, whether the checker counted it apart or not', () => {
    fc.assert(
      fc.property(takeArb, fc.boolean(), (t, apart) => {
        const s = played(t);
        const marks = Object.values(s.marks);
        const scored = { ...s, score: scoreOf(marks, 200, apart) };
        expect(mistakeCount(scored)).toBe(marks.filter((m) => countsAsMistake(m) && !isUnclear(m)).length);
      }),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-4] Not a mistake takes a mark off; Undo or Put back brings it back as it was', () => {
  it('taken off and put back: the marks and the score are as before', () => {
    fc.assert(
      fc.property(takeArb, fc.boolean(), fc.nat(), (t, apart, pick) => {
        const s0 = played(t);
        const marks = Object.values(s0.marks);
        fc.pre(marks.length > 0);
        const s = { ...s0, score: scoreOf(marks, 200, apart), dismissed: [], removed: {} };
        const m = marks[pick % marks.length];
        const off = dismissMark(s, m.id);
        expect(off.marks[m.id]).toBeUndefined();
        if (countsAsMistake(m) && !isUnclear(m)) expect(mistakeCount(off)).toBe(mistakeCount(s) - 1);
        else expect(mistakeCount(off)).toBe(mistakeCount(s));
        const back = restoreMark(off, m.id);
        expect(back.marks).toEqual(s.marks);
        expect(back.score).toEqual(s.score);
        expect(back.dismissed).toEqual([]);
        expect(back.removed).toEqual({});
      }),
      { numRuns: runs(200) },
    );
  });

  it('a mark taken off stays off whatever the checker sends again, live or in its final answer', () => {
    fc.assert(
      fc.property(takeArb, fc.nat(), fc.boolean(), (t, pick, final) => {
        const s0 = played(t);
        const marks = Object.values(s0.marks);
        fc.pre(marks.length > 0);
        const m = marks[pick % marks.length];
        let s = dismissMark(s0, m.id);
        s = applyEvent(s, { type: 'mark', mark: m });
        expect(s.marks[m.id]).toBeUndefined();
        if (final) {
          const [from, to] = words.pageRange(t.page);
          s = applyEvent(s, { type: 'done', result: finalOf(marks, from, to - 1, t.lock, null) });
          expect(s.marks[m.id]).toBeUndefined();
          // …and Put back still has it, as the final answer gave it.
          expect(restoreMark(s, m.id).marks[m.id]).toEqual(m);
        }
      }),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-5] a take resumed after a dropped connection shows the same take', () => {
  it('any event sent twice changes nothing', () => {
    fc.assert(
      fc.property(takeArb.chain((t) => fc.tuple(fc.constant(t), eventArb(t.page, true))), ([t, e]) => {
        const once = applyEvent(played(t), e);
        expect(applyEvent(once, e)).toEqual(once);
      }),
      { numRuns: runs(300) },
    );
  });

  it('the whole take sent again from its start (a resume replays it) ends where it was', () => {
    fc.assert(
      fc.property(takeArb, (t) => {
        const r = words.ref(t.lock);
        const all: LiveEvent[] = [...t.before, { type: 'locked', w: t.lock, s: r.sura, a: r.ayah }, ...t.after];
        const once = fold(anywhere(t.page), all);
        // The take itself; the hidden view's red cover is a hint (RECITE-6) that a replay may bring back on the next word
        // until it's reached: an `off` a later one replaced live is replayed after `said` has passed that later word.
        const take = ({ off: _off, ...rest }: LiveState) => rest;
        expect(take(fold(once, all))).toEqual(take(once));
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-6] the hidden page: words show as recited, peeks are words shown by hand, the red cover is only a hint', () => {
  it('a word shows when recited from where the take started, or shown by hand; nothing else', () => {
    fc.assert(
      fc.property(
        pageArb.chain((p) => fc.tuple(fc.constant(p), wordOn(p), wordOn(p), fc.array(wordOn(p), { maxLength: 5 }), wordOn(p))),
        ([, start, said, byHand, w]) => {
          const revealed = new Set(byHand);
          const shown = wordShown(w, revealed, { saidUpTo: said, startWord: start });
          expect(shown).toBe(revealed.has(w) || (w >= start && w <= said));
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('‹ shows the next hidden word from the start, ‹‹ the rest of its ayah', () => {
    fc.assert(
      fc.property(pageArb.chain((p) => fc.tuple(fc.constant(p), wordOn(p), fc.option(wordOn(p), { nil: null }))), ([page, start, said]) => {
        const live = { saidUpTo: said, startWord: start };
        const [from, to] = words.pageRange(page);
        const next = revealNextWord(words, page, NOTHING_SHOWN, live);
        const added = [...next];
        const firstHidden = (() => {
          for (let w = start > from ? start : from; w < to; w++) if (!wordShown(w, NOTHING_SHOWN, live)) return w;
          return null;
        })();
        expect(added).toEqual(firstHidden == null ? [] : [firstHidden]);
        if (firstHidden != null) {
          const r = words.ref(firstHidden);
          const [a, b] = words.verseRange(r.sura, r.ayah);
          expect([...revealAyah(words, page, NOTHING_SHOWN, live)].sort((x, y) => x - y)).toEqual(Array.from({ length: b - a }, (_, i) => a + i));
        }
      }),
      { numRuns: runs(200) },
    );
  });

  it('the red cover: set ahead of the reciter, gone once the word is reached or said, they go back, or a mark lands on it; never a mark', () => {
    fc.assert(
      fc.property(
        takeArb.chain((t) => fc.tuple(fc.constant(t), fc.integer({ min: 1, max: 6 }), fc.constantFrom('at', 'said', 'back', 'mark', 'added'))),
        ([t, ahead, how]) => {
          const [, to] = words.pageRange(t.page);
          let s: LiveState = { ...played(t), status: 'listening', seeking: false, saidUpTo: null, off: null };
          const cursor = s.cursor ?? t.lock;
          s = { ...s, cursor };
          const w = cursor + ahead;
          fc.pre(w < to);
          const before = { marks: s.marks, count: mistakeCount(s) };
          s = applyEvent(s, { type: 'off', w });
          expect(s.off).toEqual({ w, from: cursor });
          expect(s.marks).toEqual(before.marks);
          expect(mistakeCount(s)).toBe(before.count);
          const r = words.ref(w);
          const ev: LiveEvent =
            how === 'at'
              ? { type: 'at', w }
              : how === 'said'
                ? { type: 'said', upTo: w }
                : how === 'back'
                  ? { type: 'at', w: cursor - 1 }
                  : how === 'mark'
                    ? { type: 'mark', mark: { id: `${w}:word:7`, w, ayah: [r.sura, r.ayah], kind: 'word', sure: 'clear' } }
                    : { type: 'mark', mark: { id: `${w - 1}:added:7`, w: w - 1, ayah: [words.ref(w - 1).sura, words.ref(w - 1).ayah], kind: 'added', sure: 'clear' } };
          expect(applyEvent(s, ev).off).toBeNull();
        },
      ),
      { numRuns: runs(200) },
    );
  });
});

/** Ayah order across surahs. */
const order = (x: readonly [number, number]) => x[0] * 1000 + x[1];

describe('[RECITE-7] Recite the mistakes again: from the ayah before the first mistake to the last mistake’s ayah', () => {
  it('the stretch: tajweed notes left out, peeked ayahs in, the ayah before the first (in its surah); none without either', () => {
    fc.assert(
      fc.property(
        pageArb.chain((p) => fc.tuple(fc.array(markArb(p), { maxLength: 8 }), fc.array(wordOn(p), { maxLength: 3 }))),
        ([marks, peekedWords]) => {
          const peeked = peekedWords.map((w) => [words.ref(w).sura, words.ref(w).ayah] as const);
          const range = drillRange(marks, peeked);
          const ayahs = [...marks.filter((m) => m.kind !== 'tajweed').map((m) => m.ayah), ...peeked];
          if (ayahs.length === 0) {
            expect(range).toBeNull();
            return;
          }
          const first = ayahs.reduce((a, b) => (order(b) < order(a) ? b : a));
          const last = ayahs.reduce((a, b) => (order(b) > order(a) ? b : a));
          expect(range).toEqual({ from: [first[0], Math.max(1, first[1] - 1)], to: [last[0], last[1]] });
          // It stops by itself at that ayah's last word.
          expect(lastWordOf(words, range!)).toBe(words.verseRange(last[0], last[1])[1] - 1);
        },
      ),
      { numRuns: runs(300) },
    );
  });

  it('a page with remembered mistakes: one word each, over the same stretch', () => {
    fc.assert(
      fc.property(pageArb.chain((p) => fc.tuple(fc.constant(p), fc.array(markArb(p).map((m) => ({ ...m, sure: 'clear' as const })), { minLength: 1, maxLength: 8 }))), ([page, marks]) => {
        const [from, to] = words.pageRange(page);
        const take: TakeRecord = {
          id: 'TakeOnThePage0000000',
          kind: 'take',
          take: 'take-1',
          createdAt: 1,
          rev: 1,
          day: '2026-11-16',
          level: 'strict',
          hidden: false,
          from,
          to: to - 1,
          secs: 60,
          mistakes: marks.length,
          tajweed: 0,
          unclear: 0,
          accuracy: 0.9,
          marks,
          passed: [],
          recordingId: null,
        };
        const drill = openDrill([take], words, page);
        const open = new Set(marks.filter((m) => m.kind !== 'tajweed').map((m) => m.w));
        if (open.size === 0) {
          expect(drill).toBeNull();
          return;
        }
        expect(drill?.count).toBe(open.size);
        expect(drill?.range).toEqual(drillRange(drill!.marks));
      }),
      { numRuns: runs(150) },
    );
  });
});

const surahKeys = (n: number) => ayahsBetween(ayahKey(n, 1), ayahKey(n, ayahCount(n)));
const juzOfKey = (k: AyahKey) => getJuzForPage(words.pageOf(words.verseFirstWord(suraOf(k), ayahOf(k))));

describe('[RECITE-8] Test me: places at random in what is memorized, and how each went', () => {
  it('up to five places, no two sharing an ayah, each in memorized ayahs of one surah, its first two words shown', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 114 }), { minLength: 1, maxLength: 6 }),
        fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
        fc.integer({ min: 1, max: 2 ** 30 }),
        (surahs, juz, seed) => {
          const memorized = surahs.flatMap(surahKeys);
          let x = seed;
          const random = () => ((x = (x * 1103515245 + 12345) % 2147483648), x / 2147483648);
          const places = testPlaces(memorized, words, { juz, random });
          const held = new Set(memorized);
          expect(places.length).toBeLessThanOrEqual(TEST_PLACES);
          const used = new Set<AyahKey>();
          for (const p of places) {
            const from = ayahKey(p.span.from[0], p.span.from[1]);
            const to = ayahKey(p.span.to![0], p.span.to![1]);
            const ayahs = ayahsBetween(from, to);
            expect(ayahs.length).toBeLessThanOrEqual(TEST_AYAHS);
            expect(new Set(ayahs.map(suraOf)).size).toBe(1);
            for (const k of ayahs) {
              expect(held.has(k)).toBe(true);
              expect(used.has(k)).toBe(false);
              used.add(k);
            }
            if (juz != null) expect(juzOfKey(from)).toBe(juz);
            const [a, b] = words.verseRange(suraOf(from), ayahOf(from));
            expect(b - a).toBeGreaterThanOrEqual(CUE_WORDS + 2);
            expect(p.cue).toEqual([a, a + 1]);
            expect(p.last).toBe(words.verseRange(suraOf(to), ayahOf(to))[1] - 1);
          }
        },
      ),
      { numRuns: runs(150) },
    );
  });

  it('a place is clean, helped (peeked), unfinished, with mistakes, or not continued; tajweed and Not clear never count against it', () => {
    fc.assert(
      fc.property(takeArb, fc.nat(3), fc.boolean(), (t, peeked, found) => {
        const [, to] = words.pageRange(t.page);
        const place = { span: { from: [1, 1] as [number, number] }, cue: [], last: Math.min(to - 1, t.lock + 3) };
        const s = found ? played(t) : { ...played(t), start: null };
        const r = testResult(place, s, peeked);
        if (!found) return expect(r.outcome).toBe('missed');
        const counted = Object.values(s.marks).filter((m) => countsAsMistake(m) && !isUnclear(m)).length;
        const score = s.score ? mistakeCount(s) : counted;
        if (score > 0) return expect(r.outcome).toBe('mistakes');
        const reached = Math.max(s.cursor ?? -1, s.saidUpTo ?? -1) >= place.last;
        expect(r.outcome).toBe(!reached ? 'unfinished' : peeked > 0 ? 'helped' : 'clean');
      }),
      { numRuns: runs(200) },
    );
  });
});


// ---------------------------------------------------------------------------------------------------- long takes

/** A socket the tests answer for, and timers they run (lib/reciteLive/socket). */
class TestSocket implements SocketLike {
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
  answer(e: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(e) });
  }
}
const START: StartFrame = { type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, keep: false };
const micro = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function harness() {
  const sockets: TestSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let now = 0;
  const connect = socketFeed({
    url: 'wss://example.test/live',
    pairUrl: null,
    now: () => now,
    token: async () => 'tok',
    open: () => {
      const s = new TestSocket();
      sockets.push(s);
      return s;
    },
    timers: {
      set: (fn, ms) => {
        const t = { fn, ms };
        timers.push(t);
        return t;
      },
      clear: (h) => {
        const i = timers.indexOf(h as { fn: () => void; ms: number });
        if (i >= 0) timers.splice(i, 1);
      },
    },
  });
  return { connect, sockets, timers, later: (ms: number) => (now += ms) };
}
/** What a socket was sent after its start frame: samples in order, and each text frame with the sample it came at. */
function sentStream(s: TestSocket): { samples: number[]; frames: { at: number; type: string }[] } {
  const samples: number[] = [];
  const frames: { at: number; type: string }[] = [];
  for (const d of s.sent.slice(1)) {
    if (typeof d === 'string') frames.push({ at: samples.length, type: (JSON.parse(d) as { type: string }).type });
    else samples.push(...Array.from(new Int16Array(d)));
  }
  return { samples, frames };
}

describe('[RECITE-1] the guess before the lock (protocol 9) is only a cursor', () => {
  it('never a start, cursor or said; ignored once locked, from older checkers, and cleared by the lock or a page turn', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constant('guess' as const), w: fc.integer({ min: 0, max: 300 }) }),
            fc.record({ type: fc.constant('locked' as const), w: fc.integer({ min: 0, max: 300 }), s: fc.constant(27), a: fc.constant(23) }),
          ),
          { maxLength: 12 },
        ),
        fc.constantFrom(8, 9),
        fc.boolean(),
        (events, protocol, seekAfter) => {
          let state: LiveState = { ...LIVE_IDLE, status: 'listening', seeking: true, protocol };
          let locked = false;
          for (const e of events) {
            const before = state;
            state = applyEvent(state, e as never);
            if (e.type === 'guess') {
              expect(state.start).toBe(before.start);
              expect(state.cursor).toBe(before.cursor);
              expect(state.saidUpTo).toBe(before.saidUpTo);
              if (locked || protocol < 9) expect(guessCursor(state)).toBeNull();
              else expect(guessCursor(state)).toBe(e.w);
            } else {
              locked = true;
              expect(guessCursor(state)).toBeNull();
            }
          }
          if (seekAfter) expect(guessCursor(seekOnPage(state, 100))).toBeNull();
        },
      ),
    );
  });
});

describe('[RECITE-6] the word being said shows once it has been under the cursor a moment, never a word ahead', () => {
  it('held counts only for the cursor’s own word while listening, and never shows past it', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        fc.constantFrom('listening', 'connecting', 'checking', 'done') as fc.Arbitrary<'listening' | 'connecting' | 'checking' | 'done'>,
        (cursor, said, held, status) => {
          const state = { ...LIVE_IDLE, status, cursor, saidUpTo: said };
          const shown = shownUpTo(state, held);
          if (status === 'listening' && held != null && held === cursor) expect(shown).toBeGreaterThanOrEqual(cursor);
          else expect(shown).toBe(revealedUpTo(state));
          if (status === 'listening' && cursor != null && (said == null || said <= cursor)) expect(shown ?? -1).toBeLessThanOrEqual(cursor);
        },
      ),
    );
  });
});

describe('[RECITE-6] with a checker whose said follows the voice, the wait is only a late backstop', () => {
  it('between 1.5 s and 4 s, and never sooner than the ordinary wait', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.option(fc.double({ min: 1, max: 600, noNaN: true }), { nil: null }), (letters, pace) => {
        const late = revealDelay(letters, pace, true);
        expect(late).toBeGreaterThanOrEqual(BACKSTOP_MIN_MS);
        expect(late).toBeLessThanOrEqual(BACKSTOP_MAX_MS);
        expect(late).toBeGreaterThanOrEqual(revealDelay(letters, pace));
      }),
    );
  });
});

describe('[RECITE-5] a slow connection’s note: on at 3 s behind and growing, off below 2 s', () => {
  it('never on while catching up, never flickers between 2 and 3 s', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 30, noNaN: true }), { minLength: 1, maxLength: 30 }), (behinds) => {
        let on = false;
        let before: number | null = null;
        for (const b of behinds) {
          const next = slowAfterBeat(on, b, before);
          if (!on && next) {
            expect(b).toBeGreaterThanOrEqual(SLOW_AT_S);
            expect(before != null && b > before).toBe(true);
          }
          if (on && !next) expect(b).toBeLessThan(SLOW_CLEAR_S);
          if (on && b >= SLOW_CLEAR_S) expect(next).toBe(true);
          on = next;
          before = b;
        }
      }),
    );
  });

  it('never on while a resume’s re-check catches up, nor at the first beat after it (measured afresh)', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.double({ min: 0, max: 600, noNaN: true }), fc.boolean()), { minLength: 1, maxLength: 40 }), (beats) => {
        let on = false;
        let before: number | null = null;
        let wasCatchingUp = false;
        for (const [b, catchingUp] of beats) {
          const next = slowAfterBeat(on, b, before, catchingUp);
          if (catchingUp) expect(next).toBe(false);
          if (!catchingUp && wasCatchingUp) expect(next).toBe(false);
          // As the phone keeps it: no "before" through a catch-up.
          before = catchingUp ? null : b;
          on = next;
          wasCatchingUp = catchingUp;
        }
      }),
    );
  });
});

describe('[RECITE-6] the wait follows the word’s length at the reciter’s pace', () => {
  it('between 0.7 s and 2.5 s, never shorter for a longer word, and a madd counts as more letters', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 5 }), fc.option(fc.double({ min: 1, max: 600, noNaN: true }), { nil: null }), (letters, more, pace) => {
        const d = revealDelay(letters, pace);
        expect(d).toBeGreaterThanOrEqual(REVEAL_AFTER_MS);
        expect(d).toBeLessThanOrEqual(REVEAL_MAX_MS);
        expect(revealDelay(letters + more, pace)).toBeGreaterThanOrEqual(d);
      }),
    );
    expect(wordLetters('قَالَ')).toBe(3);
    expect(wordLetters('جَآءَ')).toBe(5);
  });
});

describe('[RECITE-6] a hidden page never shows the word being said', () => {
  it('while the take runs, what may show stops before the cursor unless the checker has decided that far', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        fc.option(fc.integer({ min: 0, max: 200 }), { nil: null }),
        fc.constantFrom('listening', 'connecting', 'checking', 'done') as fc.Arbitrary<'listening' | 'connecting' | 'checking' | 'done'>,
        (cursor, said, status) => {
          const state = { ...LIVE_IDLE, status, cursor, saidUpTo: said };
          const upTo = revealedUpTo(state);
          if (status === 'listening' || status === 'connecting') {
            if (cursor != null && (said == null || said < cursor)) expect(upTo == null || upTo < cursor).toBe(true);
            if (said != null) expect(upTo).toBeGreaterThanOrEqual(said);
            if (cursor != null) expect(upTo ?? -1).toBeGreaterThanOrEqual(cursor - 1);
          } else {
            expect(upTo).toBe(furthestWord(state));
          }
        },
      ),
    );
  });
});

describe('[RECITE-10] a long take keeps up: a resume never holds the screen, and a quiet connection is noticed', () => {
  it('a resume sends the held audio a slice at a time: the same samples, each frame at its place, live after', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ len: fc.integer({ min: 1, max: 30_000 }), frame: fc.option(fc.constantFrom('dismiss', 'seek', 'hint'), { nil: null }) }), { minLength: 1, maxLength: 25 }),
        fc.integer({ min: 0, max: 100 }),
        async (chunks, fromPct) => {
          const h = harness();
          const conn = h.connect(START, { onEvent: () => undefined, onClose: () => undefined });
          await micro();
          const s1 = h.sockets[0];
          s1.onopen!();
          s1.answer({ type: 'ready', take: 'k', from: 0 });
          let n = 0;
          const expected: { at: number; type: string }[] = [];
          const all: number[] = [];
          for (const c of chunks) {
            if (c.frame) {
              conn.send(c.frame === 'seek' ? { type: 'seek', w: 100 } : c.frame === 'hint' ? { type: 'hint', w: 100, what: 'word' } : { type: 'dismiss', id: 'm' });
              expected.push({ at: n, type: c.frame });
            }
            const pcm = new Int16Array(c.len).map((_, i) => (n + i) % 32_000);
            all.push(...Array.from(pcm));
            n += c.len;
            conn.sendAudio(pcm);
          }
          s1.onclose!();
          h.timers.shift()!.fn();
          await micro();
          const s2 = h.sockets[1];
          s2.onopen!();
          const from = Math.floor((n * fromPct) / 100);
          s2.answer({ type: 'ready', take: 'k', from });
          // Each slice is at most CATCHUP_SLICE_SAMPLES of audio, then the next waits for a timer.
          let slices = 1;
          while (h.timers.some((t) => t.ms === CATCHUP_TICK_MS)) {
            const i = h.timers.findIndex((t) => t.ms === CATCHUP_TICK_MS);
            h.timers.splice(i, 1)[0].fn();
            slices++;
          }
          const out = sentStream(s2);
          expect(out.samples).toEqual(all.slice(from));
          expect(out.frames).toEqual(expected.filter((f) => f.at >= from).map((f) => ({ ...f, at: f.at - from })));
          expect(slices).toBeLessThanOrEqual(Math.ceil((n - from) / CATCHUP_SLICE_SAMPLES) + 1);
          // Live again: the next audio goes at once.
          conn.sendAudio(new Int16Array([7]));
          expect(Array.from(new Int16Array(s2.sent[s2.sent.length - 1] as ArrayBuffer))).toEqual([7]);
        },
      ),
      { numRuns: runs(60) },
    );
  });

  it('once the checker beats, the connection is dropped exactly when it says nothing for longer than the watchdog allows', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 12_000 }), { minLength: 1, maxLength: 12 }), fc.boolean(), async (gaps, beats) => {
        const h = harness();
        h.connect(START, { onEvent: () => undefined, onClose: () => undefined });
        await micro();
        const s = h.sockets[0];
        s.onopen!();
        s.answer({ type: 'ready', take: 'k', from: 0 });
        if (beats) s.answer({ type: 'beat', t: 0 });
        let quietSince = 0;
        let elapsed = 0;
        let dropped = false;
        for (const gap of gaps) {
          // Time passes in the watchdog's steps; a message ends each gap.
          let left = gap;
          while (left > 0 && !dropped) {
            const step = Math.min(2000, left);
            h.later(step);
            elapsed += step;
            left -= step;
            const look = h.timers.findIndex((t) => t.ms === 2000);
            if (look >= 0) h.timers.splice(look, 1)[0].fn();
            if (s.closed) dropped = true;
          }
          if (dropped) break;
          expect(s.closed).toBe(false);
          // Silence beyond the watchdog's limit, looked at every 2 s, is always noticed by the next look.
          if (beats) expect(elapsed - quietSince).toBeLessThanOrEqual(WATCHDOG_MS + 2000);
          s.answer({ type: 'at', w: 10, t: elapsed / 1000 });
          quietSince = elapsed;
        }
        if (!beats) expect(s.closed).toBe(false);
        if (dropped) expect(beats).toBe(true);
      }),
      { numRuns: runs(100) },
    );
  });
});

describe('[RECITE-11] Stop always ends in a summary: what the take found, unfinished, until its final answer', () => {
  it('a found take settles as done and unfinished, with exactly its marks and score; a final answer after replaces it as if it had come in time', () => {
    fc.assert(
      fc.property(
        takeArb.chain((t) => fc.tuple(fc.constant(t), fc.array(markArb(t.page), { maxLength: 6 }), fc.nat(1000))),
        ([t, finalMarks, secs]) => {
          const checking = liveStopping(played(t));
          const settled = settleUnfinished(checking, secs);
          expect(settled.status).toBe('done');
          expect(isUnfinished(settled)).toBe(true);
          expect(settled.marks).toEqual(checking.marks);
          expect(settled.score).toEqual(checking.score);
          expect(settled.final!.marks).toEqual(Object.values(checking.marks));
          const [from, to] = words.pageRange(t.page);
          const done: LiveEvent = { type: 'done', result: finalOf(finalMarks, from, to - 1, t.lock, null) };
          const late = applyEvent(settled, done);
          expect(isUnfinished(late)).toBe(false);
          expect(late).toEqual(applyEvent(checking, done));
        },
      ),
      { numRuns: runs(200) },
    );
  });

  it('its record is unfinished, and an unfinished take never counts in a score or a passage’s progress', () => {
    fc.assert(
      fc.property(takeArb, fc.nat(600), (t, secs) => {
        const settled = settleUnfinished(liveStopping(played(t)), secs);
        const r = recordFromTake(settled, words, {
          id: 'r',
          createdAt: 1,
          rev: 2,
          day: '2026-11-19',
          level: 'words',
          hidden: true,
          secs,
          recordingId: 'rec',
          timeOf: () => null,
          openWords: () => [],
        }) as TakeRecord;
        expect(r.unfinished).toBe(true);
        expect(meanScore([r])).toBeNull();
        expect(passageTakes([r], r.from, r.to)).toEqual([]);
      }),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-12] a take let go before its answer is kept; take audio no take names comes back as a take', () => {
  it('a take whose start was never found has nothing to keep', () => {
    fc.assert(
      fc.property(
        pageArb.chain((page) => fc.tuple(fc.constant(page), fc.array(eventArb(page, false).filter((e) => e.type !== 'at'), { maxLength: 15 }))),
        ([page, events]) => {
          const s = liveStopping(fold(anywhere(page), events));
          expect(startNotFound(s)).toBe(true);
          expect(settleUnfinished(s, 30)).toBe(s);
        },
      ),
      { numRuns: runs(100) },
    );
  });

  it('take audio becomes a take exactly when no take names it: never checked, over its pages, its audio its own', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.constantFrom('a', 'b', 'c', 'd', 'e'), take: fc.boolean(), pages: fc.array(pageArb, { minLength: 1, maxLength: 3 }), named: fc.boolean() }), { maxLength: 6 }),
        (items) => {
          const seen = new Set<string>();
          const audio = items
            .filter((i) => !seen.has(i.id) && (seen.add(i.id), true))
            .map(
              (i) =>
                ({
                  id: i.id,
                  kind: 'reading',
                  day: '2026-11-19',
                  createdAt: 1,
                  durationMs: 61_000,
                  pageMarks: i.pages.map((p, k) => ({ atMs: k * 1000, page: p })),
                  take: i.take,
                  uri: 'file:///x.wav',
                  segments: [],
                  sizeBytes: 1,
                  backedUp: false,
                }) as unknown as RecordingMeta,
            );
          const namedIds: string[] = items.filter((i) => i.named).map((i) => i.id);
          const records: TakeRecord[] = namedIds.map((id) => ({ ...(orphanTakes([audio[0] ?? ({} as RecordingMeta)], [], words, 1)[0] ?? ({} as TakeRecord)), id: `r-${id}`, kind: 'take', recordingId: id }) as TakeRecord);
          const out = orphanTakes(audio, records, words, 9);
          const expected = audio.filter((a) => a.take && !namedIds.includes(a.id)).map((a) => a.id);
          expect(out.map((t) => t.recordingId)).toEqual(expected);
          for (const t of out) {
            const a = audio.find((x) => x.id === t.recordingId)!;
            const pages = a.pageMarks.map((m) => m.page);
            expect(t).toMatchObject({ unfinished: true, take: null, marks: [], secs: 61 });
            expect(t.from).toBe(words.pageRange(Math.min(...pages))[0]);
            expect(t.to).toBe(words.pageRange(Math.max(...pages))[1] - 1);
            expect(meanScore([t])).toBeNull();
          }
        },
      ),
      { numRuns: runs(150) },
    );
  });
});


describe('[RECITE-1] the start word itself is shown once said, and a mark on it is kept', () => {
  it('locked on a word (an ayah opening with muqattaʿāt, الٓمٓ): shown once said, and its mark kept, live and in the final answer', () => {
    fc.assert(
      fc.property(
        pageArb.chain((p) => fc.tuple(fc.constant(p), wordOn(p), fc.constantFrom<MarkKind>('word', 'harakat', 'letter'))),
        ([page, lock, kind]) => {
          const r = words.ref(lock);
          const mark: Mark = { id: `${lock}:${kind}:`, w: lock, ayah: [r.sura, r.ayah], kind, sure: 'clear' };
          let s = fold(anywhere(page), [{ type: 'locked', w: lock, s: r.sura, a: r.ayah }, { type: 'said', upTo: lock }, { type: 'mark', mark }]);
          expect(wordShown(lock, NOTHING_SHOWN, { saidUpTo: s.saidUpTo, startWord: s.start })).toBe(true);
          expect(s.marks[mark.id]).toEqual(mark);
          s = applyEvent(liveStopping(s), { type: 'done', result: finalOf([mark], lock, lock + 1, lock, null) });
          expect(s.marks[mark.id]).toEqual(mark);
        },
      ),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-13] the hidden page keeps mistakes on its covers', () => {
  it('each covered word on the page with a mark shows the take’s strongest, else the one remembered; shown words and other pages none', () => {
    fc.assert(
      fc.property(
        pageArb.chain((p) =>
          fc.tuple(fc.constant(p), fc.array(markArb(p), { maxLength: 8 }), fc.array(markArb(p), { maxLength: 8 }), fc.array(wordOn(p), { maxLength: 30 }), fc.array(markArb(p === 604 ? 603 : p + 1), { maxLength: 3 })),
        ),
        ([page, live, past, shownWords, elsewhere]) => {
          const shown = new Set(shownWords);
          const out = coverHighlights(words, page, (w) => shown.has(w), [...live, ...elsewhere], past);
          const [from, to] = words.pageRange(page);
          for (const { mark } of out) {
            expect(mark.w >= from && mark.w < to).toBe(true);
            expect(shown.has(mark.w)).toBe(false);
          }
          // One per word: the take's strongest where it marked one, else memory's.
          const byWord = new Map(out.map((x) => [x.mark.w, x]));
          expect(byWord.size).toBe(out.length);
          const liveCovered = strongestByWord(live.filter((m) => !shown.has(m.w)));
          for (const [w, m] of liveCovered) expect(byWord.get(w)).toEqual({ mark: m, past: false });
          const pastCovered = strongestByWord(past.filter((m) => !shown.has(m.w)));
          for (const [w, m] of pastCovered) if (!liveCovered.has(w)) expect(byWord.get(w)).toEqual({ mark: m, past: true });
          expect(out.length).toBe(new Set([...liveCovered.keys(), ...pastCovered.keys()]).size);
        },
      ),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-14] a mark shown during the take stays after Stop', () => {
  it('the final answer’s marks, and every live mark on a word it didn’t judge (not taken off), counting as it did', () => {
    fc.assert(
      fc.property(
        takeArb.chain((t) => fc.tuple(fc.constant(t), fc.array(markArb(t.page), { maxLength: 6 }), fc.nat(5))),
        ([t, finalMarks, pick]) => {
          let s = liveStopping(played(t));
          const shown = Object.values(s.marks);
          if (shown.length > 0 && pick % 2 === 0) s = dismissMark(s, shown[pick % shown.length].id);
          const [from, to] = words.pageRange(t.page);
          const reached = to - from;
          const score = scoreOf(finalMarks, reached, true);
          const done = applyEvent(s, { type: 'done', result: finalOf(finalMarks, from, to - 1, t.lock, score) });
          const start = done.start;
          const finalKept = finalMarks.filter((m) => !s.dismissed.includes(m.id) && !(start != null && m.kind === 'skipped' && m.w < start));
          for (const m of finalKept) expect(done.marks[m.id]).toBeTruthy();
          const judged = new Set(finalKept.map((m) => m.w));
          const kept = Object.values(s.marks).filter((m) => !judged.has(m.w) && !finalKept.some((f) => f.id === m.id) && !s.dismissed.includes(m.id));
          for (const m of kept) expect(done.marks[m.id]).toEqual(m);
          expect(Object.keys(done.marks).length).toBe(new Set([...finalKept.map((m) => m.id), ...kept.map((m) => m.id)]).size);
          // The score counts what was kept as it was shown.
          const extra = kept.filter((m) => countsAsMistake(m) && !isUnclear(m)).length;
          expect(done.score!.mistakes).toBe(score.mistakes + extra);
          expect(mistakeCount(done)).toBe(score.mistakes + extra);
        },
      ),
      { numRuns: runs(250) },
    );
  });
});

describe('[RECITE-14] a checker from protocol 8 keeps the live marks in its final answer itself', () => {
  it('its final answer’s marks are the take’s (but those taken off, or skipped before the start), and its score stands', () => {
    fc.assert(
      fc.property(takeArb.chain((t) => fc.tuple(fc.constant(t), fc.array(markArb(t.page), { maxLength: 6 }))), ([t, finalMarks]) => {
        // The take's checker says protocol 8 (its last `ready`, as on a resume).
        const s = liveStopping(applyEvent(played(t), { type: 'ready', take: 't', protocol: 8 }));
        const [from, to] = words.pageRange(t.page);
        const score = scoreOf(finalMarks, to - from, true);
        const done = applyEvent(s, { type: 'done', result: finalOf(finalMarks, from, to - 1, t.lock, score) });
        const start = done.start;
        const expected = finalMarks.filter((m) => !s.dismissed.includes(m.id) && !(start != null && m.kind === 'skipped' && m.w < start));
        expect(Object.keys(done.marks).sort()).toEqual([...new Set(expected.map((m) => m.id))].sort());
        expect(done.score).toEqual(score);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-15] a sound and a tap on each new mistake', () => {
  it('once for each new mistake that counts, never for Not clear or tajweed or a mark sent again, at most one every 700 ms, none when off', () => {
    fc.assert(
      fc.property(
        pageArb.chain((p) => fc.array(fc.tuple(markArb(p), fc.integer({ min: 0, max: 2000 }), fc.boolean()), { maxLength: 20 })),
        (steps) => {
          let now = 0;
          let sounds = 0;
          let taps = 0;
          const cue = createMistakeCue({ now: () => now, sound: () => sounds++, tap: () => taps++ });
          const seen = new Set<string>();
          let last = -Infinity;
          let expected = 0;
          for (const [m, gap, on] of steps) {
            now += gap;
            const fired = cue.mark(m, on);
            const fresh = on && !seen.has(m.id) && cuesMark(m);
            if (on && cuesMark(m)) seen.add(m.id);
            const should = fresh && now - last >= CUE_GAP_MS;
            expect(fired).toBe(should);
            if (should) {
              last = now;
              expected++;
            }
            if (fired) expect(countsAsMistake(m) && !isUnclear(m)).toBe(true);
          }
          expect(sounds).toBe(expected);
          expect(taps).toBe(expected);
        },
      ),
      { numRuns: runs(250) },
    );
  });
});

describe('[RECITE-16] a paused take stays open however long the pause', () => {
  /** The checker's IDLE: a take without a frame from the phone for this long is let go. */
  const CHECKER_IDLE_MS = 30_000;
  it('with the take held, the checker never goes 30 s without a frame; an idle error before the answer never ends the take', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ paused: fc.boolean(), ms: fc.integer({ min: 0, max: 600_000 }) }), { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        async (stretches, idleError) => {
          const h = harness();
          const events: string[] = [];
          const conn = h.connect(START, { onEvent: (e) => events.push(e.type), onClose: () => undefined });
          await micro();
          const s = h.sockets[0];
          s.onopen!();
          s.answer({ type: 'ready', take: 'k', from: 0 });
          let t = 0;
          let lastFrame = 0;
          let longest = 0;
          const sentBefore = () => s.sent.length;
          for (const st of stretches) {
            conn.hold!(st.paused);
            if (!st.paused) {
              conn.sendAudio(new Int16Array(160));
              lastFrame = t;
            }
            // Time passes: keepalives go as their timers come due; while reciting, audio every second.
            const end = t + st.ms;
            while (t < end) {
              const due = h.timers.filter((x) => x.ms === KEEPALIVE_MS);
              const step = Math.min(st.paused && due.length ? KEEPALIVE_MS : 1000, end - t);
              t += step;
              const n = sentBefore();
              if (st.paused && due.length && step === KEEPALIVE_MS) {
                h.timers.splice(h.timers.indexOf(due[0]), 1)[0].fn();
              } else if (!st.paused) conn.sendAudio(new Int16Array(160));
              if (s.sent.length > n) {
                longest = Math.max(longest, t - lastFrame);
                lastFrame = t;
              }
            }
            longest = Math.max(longest, t - lastFrame < CHECKER_IDLE_MS ? 0 : t - lastFrame);
          }
          expect(longest).toBeLessThan(CHECKER_IDLE_MS);
          if (idleError) s.answer({ type: 'error', reason: 'idle' });
          expect(events).not.toContain('error');
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('[RECITE-17] the score opens something whenever it shows', () => {
  it('while the take runs or Stop waits: what it has found so far; once done: its summary', () => {
    fc.assert(
      fc.property(fc.constantFrom('idle', 'connecting', 'listening', 'checking', 'done', 'failed') as fc.Arbitrary<
        'idle' | 'connecting' | 'listening' | 'checking' | 'done' | 'failed'
      >, (status) => {
        const opens = scoreTapOpens(status);
        if (status === 'listening' || status === 'checking') expect(opens).toBe('so-far');
        else if (status === 'done') expect(opens).toBe('summary');
        else expect(opens).toBeNull();
      }),
    );
  });
});

describe('[RECITE-18] Your recitation plays the phrase the mistake is in', () => {
  // A take over one ayah and the next: the cursor reaches each word `step` seconds after the one before (some never:
  // skipped), from `from` seconds.
  const overAyah = (t: { w: number; from: number; step: number; skipped: number[]; kind: (typeof KINDS)[number]; tail: number }) => {
    const r = words.ref(t.w);
    const [a0, a1] = words.verseRange(r.sura, r.ayah);
    const end = Math.min(words.count, a1 + 40);
    const times = new Map<number, number>();
    for (let i = a0; i < end; i++) {
      if (i !== t.w && t.skipped.includes(i - a0)) continue;
      if (t.kind === 'skipped' && i === t.w) continue;
      times.set(i, t.from + (i - a0) * t.step);
    }
    const takeEnd = t.from + (end - a0) * t.step + t.tail;
    return { ...t, a0, a1, times, takeEnd, mark: { id: 'm', w: t.w, ayah: [r.sura, r.ayah], kind: t.kind, sure: 'clear' } as Mark };
  };
  const takeOverAyah = fc
    .record({
      w: fc.integer({ min: words.verseFirstWord(2, 1), max: words.count - 2 }),
      from: fc.double({ min: 2, max: 60, noNaN: true }),
      step: fc.double({ min: 0.25, max: 3, noNaN: true }),
      skipped: fc.uniqueArray(fc.nat(40), { maxLength: 4 }),
      kind: fc.constantFrom(...KINDS),
      tail: fc.double({ min: 0, max: 20, noNaN: true }),
    })
    .map(overAyah);
  /** phrase.ts's AROUND: a phrase's words never reached play from this long before the next word that was. */
  const ACROSS_SECONDS = 2;

  it(`never more than ${MAX_SECONDS} s, inside the take, around the mistake, and never past its ayah`, () => {
    fc.assert(
      fc.property(takeOverAyah, (t) => {
        const timeOf = (w: number) => t.times.get(w) ?? null;
        const clip = clipRange(words, t.mark, timeOf, t.takeEnd);
        expect(clip).not.toBeNull();
        const [c0, c1] = clip!;
        // Times are sums of a step that isn't a whole number of seconds: compare to a microsecond.
        const eps = 1e-6;
        expect(c0).toBeGreaterThanOrEqual(0);
        expect(c1).toBeLessThanOrEqual(t.takeEnd + eps);
        expect(c1 - c0).toBeLessThanOrEqual(MAX_SECONDS + eps);
        // The mistake's moment: when the cursor reached the word (or, skipped, the words reached before and after it).
        const before = [...t.times.keys()].filter((w) => w <= t.w).pop();
        const after = [...t.times.keys()].find((w) => w > t.w);
        const moment = t.times.get(t.w) ?? (before != null && after != null ? (t.times.get(before)! + t.times.get(after)!) / 2 : null);
        if (c1 - c0 < MAX_SECONDS - eps) {
          // The phrase (or the ayah) whole: from the word reached before the mistake to the one reached after it.
          if (before != null) expect(c0).toBeLessThanOrEqual(t.times.get(before)! - AT_LAG + eps);
          if (after != null && t.kind !== 'added') expect(c1).toBeGreaterThanOrEqual(Math.min(t.takeEnd, t.times.get(after)! - AT_LAG) - eps);
        } else if (moment != null) {
          // Cut to 15 s (a slow take): it still holds the mistake, with up to half of it after, or to the word reached
          // after it if that comes sooner.
          expect(c0).toBeLessThanOrEqual(moment - AT_LAG + eps);
          const reach = Math.min(t.takeEnd, moment + MAX_SECONDS / 2, after != null ? t.times.get(after)! - AT_LAG : Infinity);
          if (t.kind !== 'added') expect(c1).toBeGreaterThanOrEqual(reach - eps);
        }
        // Not before the ayah's first word the cursor reached (when it reached one, and the mistake isn't a skipped
        // first word, which plays from the word before it), nor much past the next ayah's.
        const first = [...t.times.keys()].find((w) => w >= t.a0 && w < t.a1);
        if (first != null && t.times.has(t.w)) expect(c0).toBeGreaterThanOrEqual(t.times.get(first)! - AT_LAG - LEAD - eps);
        const nextAyah = [...t.times.keys()].find((w) => w >= t.a1);
        if (nextAyah != null) expect(c1).toBeLessThanOrEqual(t.times.get(nextAyah)! - AT_LAG + TAIL + eps);
      }),
    );
  });

  it('a short ayah plays whole; a long one, the phrase between pause marks', () => {
    fc.assert(
      fc.property(takeOverAyah, (t) => {
        const timeOf = (w: number) => t.times.get(w) ?? null;
        const [c0] = clipRange(words, t.mark, timeOf, t.takeEnd)!;
        const firstHeard = (from: number, to: number) => [...t.times.keys()].find((w) => w >= from && w <= to);
        const ayahFirst = firstHeard(t.a0, t.a1 - 1);
        if (ayahFirst == null) return; // a skipped ayah: across it (the property above)
        const short = t.a1 - t.a0 <= SHORT_WORDS;
        const ayahSeconds = (t.times.get(firstHeard(t.a1, t.a1 + 40)!) ?? t.takeEnd) - t.times.get(ayahFirst)!;
        if (short && ayahSeconds + LEAD + TAIL <= MAX_SECONDS) expect(c0).toBeCloseTo(Math.max(0, t.times.get(ayahFirst)! - AT_LAG - LEAD));
        else {
          // Never before the phrase's first word the cursor reached; or, in a phrase too long to play whole with none of
          // the words around the mistake reached, the moment before the next word that was, so the skip is heard.
          const [p0, p1] = phraseOf(words, t.w);
          const pFirst = firstHeard(p0, p1);
          const nearby = firstHeard(Math.max(p0, t.w - WORDS_BEFORE), Math.min(p1, t.w + WORDS_AFTER));
          const room = nearby == null ? ACROSS_SECONDS : 0;
          if (pFirst != null) expect(c0).toBeGreaterThanOrEqual(Math.min(t.times.get(pFirst)!, t.times.get(ayahFirst)!) - AT_LAG - LEAD - room - 1e-9);
          for (let i = p0; i < p1; i++) expect(endsPhrase(i)).toBe(false);
        }
      }),
    );
  });
});

describe('[RECITE-18] a long phrase whose first words were skipped', () => {
  // Develop's Scenarios failed on this (seed 89377117, Nov 23 2026): the test's bound, not the clip. The reciter came in at
  // the fifth word of an ayah whose first phrase runs past 15 s, so none of the words around the mistake were reached.
  it('plays from 2 s before the first word reached, to just past it, so the skip is heard', () => {
    const w = 28697;
    const from = 2;
    const step = 1.0923076923076924;
    const [a0, a1] = words.verseRange(words.ref(w).sura, words.ref(w).ayah);
    expect(a0).toBe(w);
    const [p0, p1] = phraseOf(words, w);
    expect(p1 - p0).toBeGreaterThan(WORDS_AFTER);
    const times = new Map<number, number>();
    for (let i = a0 + 4; i < a1 + 40; i++) times.set(i, from + (i - a0) * step);
    const first = times.get(a0 + 4)!;
    const clip = clipRange(words, { id: 'm', w, ayah: [words.ref(w).sura, words.ref(w).ayah], kind: 'skipped', sure: 'clear' } as Mark, (x) => times.get(x) ?? null, from + (a1 + 40 - a0) * step)!;
    expect(clip[0]).toBeCloseTo(first - AT_LAG - LEAD - 2);
    expect(clip[1]).toBeCloseTo(first - AT_LAG + TAIL);
  });
});

describe('[RECITE-27] a take needs at least one ayah recited', () => {
  const taken = (start: number | null, cursor: number | null, marks: Mark[] = []) =>
    ({ start, cursor, saidUpTo: null, marks: {}, final: { v: 2, take: 't', from: start ?? 0, to: (start ?? 0) + 1, secs: 2, marks, score: null } }) as unknown as LiveState;
  const mark = (w: number, kind: Mark['kind']) => ({ id: `m${w}`, w, ayah: [words.ref(w).sura, words.ref(w).ayah], kind, sure: 'clear' }) as Mark;

  it('the mic pressed and nothing said is not a take, even with its words marked as skipped', () => {
    const [a0, a1] = words.verseRange(112, 1);
    expect(isATake(taken(a0, null), words)).toBe(false);
    expect(isATake(taken(a0, null, [mark(a0, 'skipped'), mark(a1 - 1, 'skipped')]), words)).toBe(false);
  });

  it('a whole short ayah is a take, and part of one is not', () => {
    const [a0, a1] = words.verseRange(112, 1);
    expect(a1 - a0).toBeLessThan(LONG_AYAH_WORDS);
    expect(isATake(taken(a0, a1 - 1), words)).toBe(true);
    expect(isATake(taken(a0, a0), words)).toBe(false);
  });

  it('coming in partway through an ayah needs the next one whole', () => {
    const [a0, a1] = words.verseRange(112, 2 - 1);
    const [, b1] = words.verseRange(112, 2);
    expect(isATake(taken(a0 + 1, a1 - 1), words)).toBe(false);
    expect(isATake(taken(a0 + 1, b1 - 1), words)).toBe(true);
  });

  it('a very long ayah counts from about a mushaf line of its words', () => {
    const [a0] = words.verseRange(2, 282);
    expect(isATake(taken(a0, a0 + LONG_AYAH_WORDS - 2), words)).toBe(false);
    expect(isATake(taken(a0, a0 + LONG_AYAH_WORDS - 1), words)).toBe(true);
    expect(isATake(taken(a0 + 20, a0 + 20 + LONG_AYAH_WORDS - 1), words)).toBe(true);
  });

  it('a recitation of several takes always counts', () => {
    const [a0] = words.verseRange(2, 282);
    expect(isATake(taken(a0, a0), words, [{}, {}])).toBe(true);
  });

  it('whatever the take: a long enough stretch counts, and a short one holding no whole ayah never does', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: words.count - 40 }), fc.integer({ min: 0, max: 30 }), (first, more) => {
        const last = first + more;
        const got = recitedEnough(words, first, last);
        if (more + 1 >= LONG_AYAH_WORDS) expect(got).toBe(true);
        else if (!got) {
          for (let w = first; w <= last; w++) {
            const [a0, a1] = words.verseRange(words.ref(w).sura, words.ref(w).ayah);
            expect(a0 >= first && a1 - 1 <= last).toBe(false);
          }
        }
      }),
    );
  });
});

describe('[RECITE-19] highlights are soft washes wider than their word; with the page shown no word is washed', () => {
  // Every word of the 1405 print that has a box (pages 1 to 604).
  const wordArb = fc.integer({ min: 0, max: words.count - 1 });

  it('a wash reaches past its word on every side, whatever the word, so a box a little off never shows an edge', () => {
    fc.assert(
      fc.property(wordArb, fc.constantFrom('word', 'harakat', 'added'), fc.boolean(), (w, kind, asCursor) => {
        const word = wordBox(words, w);
        const box = asCursor ? cursorBox(words, w) : markHighlight(words, { id: 'm', w, ayah: [1, 1], kind } as Mark);
        const wash = washOf(box);
        const reach = washReach(wash);
        const h = word.y1 - word.y0;
        // Its core stays inside the line, a pill at least as wide as it is tall.
        expect(wash.core.y0).toBeGreaterThanOrEqual(box.y0);
        expect(wash.core.y1).toBeLessThanOrEqual(box.y1);
        expect(wash.core.x1 - wash.core.x0).toBeGreaterThanOrEqual(wash.core.y1 - wash.core.y0 - 1e-9);
        // Its soft edge goes past the word: well past each end, a little above and below.
        expect(reach.x0).toBeLessThanOrEqual(word.x0 - 0.2 * h);
        expect(reach.x1).toBeGreaterThanOrEqual(word.x1 + 0.2 * h);
        expect(reach.y0).toBeLessThan(word.y0);
        expect(reach.y1).toBeGreaterThan(word.y1);
      }),
      { numRuns: runs(300) },
    );
  });

  it('the page shown: the ayah’s band and the box on the word being recited follow the cursor (never ahead of it), no word inked', () => {
    const at = fc.option(wordArb, { nil: null });
    fc.assert(
      fc.property(at, at, (cursor, newest) => {
        expect(followCues(false, cursor, newest)).toEqual({ band: cursor, box: cursor, ink: null });
      }),
      { numRuns: runs(100) },
    );
  });
});

describe('[RECITE-5] the audio 4:1: any block decodes to its own length, its first sample exact, a quarter of the bytes', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { encodeBlock, decodeBlock } = require('../../../src/lib/reciteLive/adpcm');
  it('for any samples and starting step index', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -32768, max: 32767 }), { minLength: 1, maxLength: 4000 }), fc.integer({ min: 0, max: 88 }), (xs, index) => {
        const pcm = Int16Array.from(xs);
        const { block, index: end } = encodeBlock(pcm, index);
        expect(block.byteLength).toBe(6 + Math.ceil((pcm.length - 1) / 2));
        const out = decodeBlock(block);
        expect(out.length).toBe(pcm.length);
        expect(out[0]).toBe(pcm[0]);
        expect(end).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(88);
      }),
    );
  });
});

describe('[RECITE-20] on a hidden page the newest word shown is in the following ink, unless it carries a mark', () => {
  const wordArb = fc.integer({ min: 0, max: words.count - 1 });
  it('no band; the newest word shown is inked, never another, and never one with a mark', () => {
    fc.assert(
      fc.property(fc.option(wordArb, { nil: null }), fc.option(wordArb, { nil: null }), fc.uniqueArray(wordArb, { maxLength: 6 }), (cursor, newest, marked) => {
        const cues = followCues(true, cursor, newest, (w) => marked.includes(w));
        expect(cues.band).toBeNull();
        expect(cues.box).toBeNull();
        if (newest == null || marked.includes(newest)) expect(cues.ink).toBeNull();
        else expect(cues.ink).toBe(newest);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-20] a hidden page is drawn empty: faint rules where words are hidden, the markers and the words shown in their own ink', () => {
  // A page, and what it shows: a run of words from where a take started (the words recited), and maybe a few more shown
  // by hand further on (peeks, a verse shown whole).
  const caseArb = fc.integer({ min: 3, max: 604 }).chain((page) => {
    const [from, to] = words.pageRange(page);
    return fc.record({
      page: fc.constant(page),
      start: fc.integer({ min: from, max: to - 1 }),
      length: fc.integer({ min: 0, max: to - from }),
      extra: fc.uniqueArray(fc.integer({ min: from, max: to - 1 }), { maxLength: 4 }),
    });
  });

  it('ready at once: covers over the words still hidden, the markers and the words shown left open in the page’s own ink; no rule under them', () => {
    fc.assert(
      fc.property(caseArb, ({ page, start, length, extra }) => {
        const shown = (w: number) => (w >= start && w < start + length) || extra.includes(w);
        const plan = hiddenInkPlan(words, page, shown);
        const lines = pageLines(page);
        expect(plan.lines.map((l) => l.line)).toEqual(lines.map((l) => l.line));
        const lineOf = (line: number) => lines.find((x) => x.line === line)!;
        const coversOn = (line: number) => plan.lines.find((x) => x.line === line)!.covers;
        const openOn = (line: number, kind: 'marker' | 'shown') => plan.open.filter((p) => p.kind === kind && p.line === line).map((p) => p.box);
        const coveredAt = (line: number, x: number, y: number) => coversOn(line).some((c) => c.x0 <= x && x <= c.x1 && c.y0 <= y && y <= c.y1);
        const [from, to] = words.pageRange(page);
        for (let w = from; w < to; w++) {
          const r = words.rect(w);
          const mid = (r.x0 + r.x1) / 2;
          const line = words.lineOf(w);
          if (shown(w)) {
            // Open, whole: inside a run, and no cover reaches into the word.
            expect(openOn(line, 'shown').some((b) => b.x0 <= r.x0 && b.x1 >= r.x1)).toBe(true);
            for (const c of coversOn(line)) expect(Math.min(c.x1, r.x1) - Math.max(c.x0, r.x0)).toBeLessThanOrEqual(0);
          } else {
            // Hidden: its middle under a cover, unless the word data puts it inside a shown word's own box (a few boxes
            // overlap their neighbours; the fitted boxes fix those).
            let insideShown = false;
            for (let v = from; v < to; v++) {
              if (!shown(v) || words.lineOf(v) !== line) continue;
              const o = words.rect(v);
              if (o.x0 < mid && mid < o.x1) insideShown = true;
            }
            if (!insideShown) expect(coversOn(line).some((c) => c.x0 <= mid && mid <= c.x1)).toBe(true);
          }
        }
        for (const l of lines) {
          l.markers.forEach(([a, b], k) => {
            const [top, bottom] = l.markerRows[k];
            // Every marker whole: open in its rows, and no cover reaches into it.
            expect(openOn(l.line, 'marker').some((m) => m.x0 <= a && m.x1 >= b && m.y0 <= top && m.y1 >= bottom)).toBe(true);
            for (const c of coversOn(l.line)) expect(Math.min(c.x1, b) - Math.max(c.x0, a) <= 0 || Math.min(c.y1, bottom) - Math.max(c.y0, top) <= 0).toBe(true);
            // Over and under it, each half with its side's word (page 379's ۲٤ showed a sajdah's overline): the right half
            // covered while the word before it (right to left) is hidden, the left half while the word after is.
            const mid = (a + b) / 2;
            const onLine = [...Array(to - from).keys()].map((i) => from + i).filter((w) => words.lineOf(w) === l.line);
            const before = onLine.filter((w) => words.rect(w).x0 >= mid).sort((p, q) => words.rect(p).x0 - words.rect(q).x0)[0];
            const after = onLine.filter((w) => words.rect(w).x1 <= mid).sort((p, q) => words.rect(q).x1 - words.rect(p).x1)[0];
            const inShown = (x: number) => openOn(l.line, 'shown').some((o) => o.x0 <= x && x <= o.x1);
            for (const [x, word] of [[(mid + b) / 2, before], [(a + mid) / 2, after]] as const) {
              if (inShown(x)) continue;
              const hidden = word == null || !shown(word);
              if (top > l.coverTop + 1) expect({ marker: [page, l.line, k], x, over: coveredAt(l.line, x, (l.coverTop + top) / 2) }).toEqual({ marker: [page, l.line, k], x, over: hidden });
              if (bottom < l.coverBottom - 1) expect({ marker: [page, l.line, k], x, under: coveredAt(l.line, x, (bottom + l.coverBottom) / 2) }).toEqual({ marker: [page, l.line, k], x, under: hidden });
            }
          });
          // The rule never runs under a word shown or a marker.
          const rules = plan.lines.find((x) => x.line === l.line)!.rules;
          for (const box of openOn(l.line, 'shown')) for (const [a, b] of rules) expect(Math.min(b, box.x1 - 1) - Math.max(a, box.x0 + 1)).toBeLessThanOrEqual(0);
        }
        // The newest word's ink: its own x, its line's band.
        if (length > 0) {
          const w = start + length - 1 < to ? start + length - 1 : to - 1;
          const box = followBox(words, plan, w);
          const l = lines.find((x) => x.line === words.lineOf(w))!;
          expect([box.y0, box.y1]).toEqual([l.coverTop, l.coverBottom]);
          expect(box.x0).toBeLessThan(words.rect(w).x0);
          expect(box.x1).toBeGreaterThan(words.rect(w).x1);
        }
      }),
      { numRuns: runs(150) },
    );
  });
});

describe('[RECITE-19] on a shown page the band is the whole ayah being recited', () => {
  it('the band behind the cursor’s ayah takes every line of it on the page, the cursor’s own line among them', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: words.count - 1 }), (w) => {
        const page = words.pageOf(w);
        const ref = words.ref(w);
        const bands = ayahBand(page, ref.sura, ref.ayah);
        const box = wordBox(words, w);
        const mid = (box.y0 + box.y1) / 2;
        expect(bands.length).toBeGreaterThan(0);
        expect(bands.some((b) => b.y0 <= mid && mid <= b.y1)).toBe(true);
        // One rect a line, top to bottom, none overlapping the next.
        for (let i = 1; i < bands.length; i++) expect(bands[i].y0).toBeGreaterThanOrEqual(bands[i - 1].y0);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-22] a recitation past the checker’s 15 minutes: chained takes never overlap, never leave a gap, never lose the reciter’s place', () => {
  /**
   * A recitation from the top of a page: each word 0.5–1.6 s, a breath of 0–2.5 s after each ayah, for 16–46 minutes. A
   * checker that decides a word as the voice stops (`voice`) says so of an ayah's last word half a second into a breath
   * long enough; otherwise a word is decided as the next one begins.
   */
  const recitationArb = fc.record({
    page: fc.integer({ min: 1, max: 560 }),
    pace: fc.array(fc.double({ min: 0.5, max: 1.6, noNaN: true }), { minLength: 32, maxLength: 32 }),
    breath: fc.array(fc.double({ min: 0, max: 2.5, noNaN: true }), { minLength: 16, maxLength: 16 }),
    minutes: fc.integer({ min: 16, max: 46 }),
    voice: fc.boolean(),
  });
  type Timed = { t: number; e: LiveEvent };
  function recitation(r: { page: number; pace: number[]; breath: number[]; minutes: number; voice: boolean }): { events: Timed[]; start: number; end: number } {
    const start = words.pageRange(r.page)[0];
    const events: Timed[] = [];
    let t = 1;
    for (let w = start, i = 0; t < r.minutes * 60 && w < words.count - 1; w++, i++) {
      const dur = r.pace[i % r.pace.length];
      events.push({ t, e: { type: 'at', w } });
      if (w > start) events.push({ t: t + 0.05, e: { type: 'said', upTo: w - 1 } });
      let next = t + dur;
      if (endsAyah(words, w)) {
        const breath = r.breath[i % r.breath.length];
        if (r.voice && breath >= 0.6) events.push({ t: t + dur + 0.5, e: { type: 'said', upTo: w } });
        next += breath;
      }
      t = next;
    }
    return { events: events.sort((a, b) => a.t - b.t), start, end: t };
  }

  it('the phone rolls over before the cap, at a pause unless the cap is seconds away, and the screen keeps the reciter throughout', () => {
    fc.assert(
      fc.property(recitationArb, (r) => {
        const { events, start, end } = recitation(r);
        const fresh = () => applyEvent(liveConnecting({ anywhereFrom: start }), { type: 'ready', take: 't', protocol: 9 });
        const links: { state: LiveState; offset: number }[] = [];
        let cur = fresh();
        let linkStart = 0;
        let k = 0;
        let said = -1;
        for (let step = 1; step / 10 < end; step++) {
          const now = step / 10;
          // The current take hears what's said from its own start; it finds the place a second after the first word it hears.
          while (k < events.length && events[k].t <= now) {
            const x = events[k];
            if (cur.start == null) {
              if (x.e.type !== 'at' || x.t < linkStart) {
                k++;
                continue;
              }
              if (now < x.t + 1) break;
              const at = words.ref(x.e.w);
              cur = applyEvent(cur, { type: 'locked', w: x.e.w, s: at.sura, a: at.ayah });
            }
            cur = applyEvent(cur, x.e);
            k++;
          }
          const view = chainView(links, { state: cur, offset: linkStart });
          if (links.length > 0 || cur.start != null) {
            // Never loses the reciter: a cursor throughout, and a hidden page's words never covered again.
            expect(view.cursor).not.toBeNull();
            expect(view.saidUpTo ?? -1).toBeGreaterThanOrEqual(said);
            said = view.saidUpTo ?? said;
            expect(view.status).toBe('listening');
          }
          const linkSecs = now - linkStart;
          // Never the checker's cap.
          expect(linkSecs).toBeLessThan(CAP_S);
          if (!rolloverDue(cur, words, linkSecs)) continue;
          if (linkSecs < ROLL_NOW_S) {
            // At a pause: the word under the cursor decided, so the next take hears the next word whole.
            expect(cur.cursor).not.toBeNull();
            expect(cur.cursor!).toBeLessThanOrEqual(cur.saidUpTo!);
          }
          links.push({ state: liveStopping(cur), offset: linkStart });
          linkStart = now;
          cur = fresh();
        }
        // Each take begins where the last ended (no overlap, no gap) and holds less than the cap.
        const starts = [...links.map((l) => l.offset), linkStart];
        for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeLessThan(CAP_S);
        if (end > CAP_S) expect(links.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: runs(12) },
    );
  });

  it('at the checker’s cap the next take begins where it stopped hearing, with what the phone sent past it: nothing heard twice or missed', () => {
    const rate = 16_000;
    fc.assert(
      fc.property(fc.nat(10_000_000), fc.integer({ min: 0, max: 5 * rate }), fc.boolean(), (linkStart, past, cap) => {
        const samples = linkStart + Math.round((cap ? CAP_S : ROLL_FROM_S) * rate) + past;
        const next = nextLinkStart(cap, linkStart, samples, rate);
        if (!cap) {
          expect(next).toEqual({ start: samples, tail: null });
          return;
        }
        // The checker heard [linkStart, linkStart + CAP); the next take hears from there, the tail first, then the microphone.
        const heard = linkStart + Math.round(CAP_S * rate);
        expect(next.start).toBe(heard);
        const tail = next.tail ? Math.round((next.tail[1] - next.tail[0]) * rate) : 0;
        expect(next.start + tail).toBe(samples);
      }),
      { numRuns: runs(200) },
    );
  });
});

describe('[RECITE-21] switched to hidden: mid-take everything behind the reciter stays, after a take nothing', () => {
  it('during a take, the page’s words before the start stay (and those recited show anyway); none at or after the start', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 0, max: words.count - 1 }), (page, start) => {
        const kept = revealedOnHide(words, page, { running: true, startWord: start });
        const [from, to] = words.pageRange(page);
        for (let w = from; w < to; w++) expect(kept.has(w)).toBe(w < start);
        // With what the take recited (from its start up to where it is), every word behind the reciter shows.
        const info = { saidUpTo: Math.min(to - 1, start + 3), startWord: start, cursor: null };
        for (let w = from; w < to && w <= info.saidUpTo; w++) expect(wordShown(w, kept, info)).toBe(true);
      }),
      { numRuns: runs(150) },
    );
  });
  it('after a take (or before one), nothing stays, and the take’s recited words no longer show', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 0, max: words.count - 1 }), (page, start) => {
        expect(revealedOnHide(words, page, { running: false, startWord: start }).size).toBe(0);
        const info = hiddenTakeInfo({ saidUpTo: start + 5, startWord: start, cursor: start + 6 }, true);
        expect(wordShown(start + 1, new Set(), info)).toBe(false);
      }),
      { numRuns: runs(80) },
    );
  });
});

describe('[RECITE-24] the summary: mistakes per page for a long take, Expected and Recited for a wrong word', () => {
  it('per page only from 2 pages, the mistakes over the pages reached to a tenth', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: words.count - 1 }), fc.integer({ min: 0, max: 1500 }), fc.nat(40), (a, span, mistakes) => {
        const b = Math.min(words.count - 1, a + span);
        const pages = pagesReached(words, a, b);
        expect(pages).toBe(words.pageOf(b) - words.pageOf(a) + 1);
        const label = perPageLabel(mistakes, pages);
        if (pages < PER_PAGE_FROM) expect(label).toBeNull();
        else expect(label).toBe(`${Math.round((mistakes / pages) * 10) / 10} a page`);
      }),
    );
  });

  it('a wrong word with what was heard: the same words either side in both lines, the mark’s word or what was said between', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: words.count - 1 }), fc.constantFrom<'word' | 'harakat' | 'letter'>('word', 'harakat', 'letter'), (w, kind) => {
        const r = words.ref(w);
        const m: Mark = { id: 'm', w, ayah: [r.sura, r.ayah], kind, sure: 'clear', heard: 'قَالَ', heardExact: true };
        const expected = expectedPhrase(words, m);
        const recited = recitedPhrase(words, m)!;
        expect(recited.map((p) => (p.role === 'recited' ? 'X' : p.text))).toEqual(expected.map((p) => (p.role === 'expected' ? 'X' : p.text)));
        expect(expected.filter((p) => p.role === 'expected').map((p) => p.text)).toEqual([words.uthmani(w)]);
        expect(recited.filter((p) => p.role === 'recited').map((p) => p.text)).toEqual(['قَالَ']);
        // Never past its ayah, at most two words either side.
        const [a0, a1] = words.verseRange(r.sura, r.ayah);
        expect(expected.length).toBeLessThanOrEqual(Math.min(5, a1 - a0));
      }),
    );
  });
});

describe('[RECITE-21] when a take stops, the words it recited stay shown with those shown by hand', () => {
  it('every word from the take’s start to the last one shown stays, and every word shown by hand', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: words.count - 40 }),
        fc.integer({ min: 0, max: 30 }),
        fc.uniqueArray(fc.integer({ min: 0, max: words.count - 1 }), { maxLength: 8 }),
        (start, n, byHand) => {
          const kept = keepRecited(new Set(byHand), start, start + n);
          for (let w = start; w <= start + n; w++) expect(kept.has(w)).toBe(true);
          for (const w of byHand) expect(kept.has(w)).toBe(true);
          expect(kept.size).toBe(new Set([...byHand, ...Array.from({ length: n + 1 }, (_, i) => start + i)]).size);
          // A take that never found its start keeps nothing more.
          expect(keepRecited(new Set(byHand), null, null).size).toBe(new Set(byHand).size);
        },
      ),
      { numRuns: runs(120) },
    );
  });
});
