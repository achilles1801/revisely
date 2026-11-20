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
  type LiveState,
} from '../../../src/lib/reciteLive/state';
import { socketFeed, CATCHUP_SLICE_SAMPLES, CATCHUP_TICK_MS, WATCHDOG_MS, type SocketLike } from '../../../src/lib/reciteLive/socket';
import type { StartFrame } from '../../../src/lib/reciteLive/feed';
import { meanScore } from '../../../src/lib/reciteInsights/insights';
import { passageTakes } from '../../../src/lib/reciteMemory/progress';
import { orphanTakes } from '../../../src/lib/reciteMemory/apart';
import type { RecordingMeta } from '../../../src/lib/recordings';
import { markFill } from '../../../src/components/reciteLive/markColours';
import { markTitle } from '../../../src/lib/reciteLive/describe';
import { NOTHING_SHOWN, revealAyah, revealNextWord, wordShown } from '../../../src/lib/reciteLive/view';
import { drillRange, lastWordOf, openDrill } from '../../../src/lib/reciteLive/drill';
import { CUE_WORDS, TEST_AYAHS, TEST_PLACES, testPlaces, testResult } from '../../../src/lib/reciteLive/testMe';
import { recordFromTake } from '../../../src/lib/reciteMemory/fromTake';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';
import { ayahKey, ayahsBetween, ayahCount, suraOf, ayahOf, type AyahKey } from '../../../src/lib/ayahKeys';
import { getJuzForPage } from '../../../src/lib/quranData';
import { runs } from './fixtures';

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
