import { quranWords } from '../../recite/__fixtures__/quranWords';
import { GROUP_RANK, isUnclear, LiveEvent, markGroup, parseEvent, parseMark, severityOf, Mark } from '../contract';
import {
  applyEvent,
  dismissMark,
  findingStart,
  removedMarks,
  restoreMark,
  furthestWord,
  seekOnPage,
  startNotFound,
  LIVE_IDLE,
  LiveState,
  liveConnecting,
  liveStopping,
  marksInOrder,
  marksOnPage,
  mistakeCount,
} from '../state';
import { replayFeed, ReplayLog } from '../feed';
import { formatAccuracy, mistakesLabel, pageAccuracy, scoreLevel, wordsOnPagesReached } from '../score';
import { ayahBand, cursorBox, markAt, markBox, markHighlight, wordBox } from '../geometry';
import { similarPhrases } from '../similar';
import { expectedPhrase, findingNote, markPlace, markTitle, recitedLabel, recitedPhrase, slipLine, tajweedLines } from '../describe';
import { plainText } from '../../passages';

const FIXTURES = [
  'alafasy.p2.m1.clean', 'alafasy.p2.clean.clean', 'minshawi-murattal.p3.m1.clean', 'rifai.p8.m1.clean', 'abdulbaset-murattal.p2.m1.clean',
  // Real transcripts from the service on revisely-dev (Nov 14 2026).
  'server-live-alafasy.p2.m1', 'server-live-husary.p1.m1.letters', 'server-live-rifai.p8.m1',
];
const fixture = (name: string): ReplayLog & { planted: unknown[] } => require(`../__fixtures__/${name}.json`);

/** Every event of a fixture, parsed, in time order. */
function eventsOf(name: string): LiveEvent[] {
  return fixture(name)
    .events.map((raw, i) => ({ raw, i }))
    .sort((a, b) => a.raw.t - b.raw.t || a.i - b.i)
    .map(({ raw }) => parseEvent(raw))
    .filter((e): e is LiveEvent => e != null);
}

const run = (events: LiveEvent[], from: LiveState = liveConnecting()) => events.reduce(applyEvent, from);

const words = quranWords();
// An-Naml 23 on page 379: إِنِّى وَجَدتُّ ٱمْرَأَةًۭ تَمْلِكُهُمْ وَأُوتِيَتْ مِن كُلِّ شَىْءٍۢ وَلَهَا عَرْشٌ عَظِيمٌۭ
const A23 = words.verseFirstWord(27, 23);
const UTIYAT = A23 + 4;
const SHAY = A23 + 7;

const mark = (over: Partial<Mark>): Mark => ({ id: 'm', w: UTIYAT, ayah: [27, 23], kind: 'word', sure: 'clear', ...over });

describe('the contract', () => {
  it('reads every event of every fixture', () => {
    for (const name of FIXTURES) {
      const raw = fixture(name).events;
      const parsed = raw.map((e) => parseEvent(e));
      expect({ name, dropped: parsed.filter((e) => e == null).length }).toEqual({ name, dropped: 0 });
    }
  });

  it('drops what it doesn’t know, never guesses', () => {
    expect(parseEvent('not json')).toBeNull();
    expect(parseEvent({ type: 'teleport' })).toBeNull();
    expect(parseEvent({ type: 'at', w: -1 })).toBeNull();
    expect(parseEvent({ type: 'at', w: 1.5 })).toBeNull();
    expect(parseEvent({ type: 'mark', mark: { id: 'x', w: 3, ayah: [1, 2], kind: 'shouting', sure: 'clear' } })).toBeNull();
    // A tajweed note needs its rule.
    expect(parseMark({ id: 'x', w: 3, ayah: [1, 2], kind: 'tajweed', sure: 'clear' })).toBeNull();
    // An unknown error is the server's.
    expect(parseEvent({ type: 'error', reason: 'gremlins' })).toEqual({ type: 'error', reason: 'server' });
    // The server's Premium gate (CHECK_GATE) under either name: the app opens the Premium page.
    expect(parseEvent({ type: 'error', reason: 'check_locked' })).toEqual({ type: 'error', reason: 'check_locked' });
    expect(parseEvent({ type: 'error', reason: 'premium_required' })).toEqual({ type: 'error', reason: 'premium_required' });
    // recite-check-pair refusing a level it doesn't take (the socket starts the take on recite-check).
    expect(parseEvent({ type: 'error', reason: 'level_elsewhere' })).toEqual({ type: 'error', reason: 'level_elsewhere' });
    expect(parseEvent({ type: 'error', error: 'idle' })).toEqual({ type: 'error', reason: 'idle' });
  });

  it('reads a mark’s every field, as text or parsed', () => {
    const e = parseEvent(
      JSON.stringify({
        type: 'mark',
        mark: { id: `${SHAY}:harakat:`, w: SHAY, ayah: [27, 23], kind: 'harakat', heard: ' شَيٌّ ', heardExact: true, at: [2, 4], t: [5.1, 5.6], sure: 'likely' },
      }),
    );
    expect(e).toEqual({
      type: 'mark',
      mark: { id: `${SHAY}:harakat:`, w: SHAY, ayah: [27, 23], kind: 'harakat', heard: 'شَيٌّ', heardExact: true, at: [2, 4], t: [5.1, 5.6], sure: 'likely' },
    });
    expect(parseMark({ id: 'a', w: 1, ayah: [1, 1], kind: 'word', heard: 'وأوهيتت', heardExact: false })).toMatchObject({ heardExact: false, sure: 'clear' });
  });

  it('reads Recite’s final answer: words only, no marks list or score (live.py’s follow result)', () => {
    // As the service sends it at the end of a Recite take (scripts/recite-check/live.py, `self.follow`).
    const recite = {
      type: 'done',
      result: {
        v: 2, follow: true, from: A23, to: A23 + 10, secs: 3, take: '20261114-184317-15dbd6', engine: 'c01f4ea0', why: 'end', kept: true,
        words: [{ w: A23, s: 'ok' }], settings: { mon: 4, mot: 4, aar: 0, letters: '0', tajweed: '1' }, ms: { model: 207, words: 190 },
      },
    };
    expect(parseEvent(JSON.stringify(recite))).toEqual({
      type: 'done',
      result: { v: 2, take: '20261114-184317-15dbd6', from: A23, to: A23 + 10, secs: 3, marks: [], score: null, kept: true, why: 'end' },
    });
    // Check's answer still needs its marks.
    expect(parseEvent({ type: 'done', result: { ...recite.result, follow: undefined } })).toBeNull();
  });

  it('mistakes are words; slips are harakat, letters and tajweed', () => {
    expect(['word', 'skipped', 'added'].map((kind) => severityOf({ kind } as Mark))).toEqual(['mistake', 'mistake', 'mistake']);
    expect(['harakat', 'letter', 'tajweed'].map((kind) => severityOf({ kind } as Mark))).toEqual(['slip', 'slip', 'slip']);
  });

  it('three colours (Majd, Nov 15 2026): red for words, amber for harakat and letters, violet for tajweed', () => {
    const kinds = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'] as const;
    expect(kinds.map((kind) => markGroup({ kind }))).toEqual(['word', 'word', 'word', 'slip', 'slip', 'tajweed']);
    // A word with several marks shows its strongest.
    expect(GROUP_RANK.word).toBeGreaterThan(GROUP_RANK.slip);
    expect(GROUP_RANK.slip).toBeGreaterThan(GROUP_RANK.tajweed);
  });
});

describe('the live state', () => {
  it('ends with the final answer’s marks, on every fixture', () => {
    for (const name of FIXTURES) {
      const events = eventsOf(name);
      const done = events.find((e): e is Extract<LiveEvent, { type: 'done' }> => e.type === 'done')!;
      const s = run(events);
      expect(s.status).toBe('done');
      expect(marksInOrder(s).map((m) => m.id).sort()).toEqual(done.result.marks.map((m) => m.id).sort());
      // In mushaf order.
      const ws = marksInOrder(s).map((m) => m.w);
      expect(ws).toEqual([...ws].sort((a, b) => a - b));
      // These checkers counted "not clear" marks in `mistakes` (no `unclear`); the app takes them out.
      expect(mistakeCount(s)).toBe(done.result.score!.mistakes - done.result.marks.filter(isUnclear).length);
    }
  });

  it('Al-Fatiha with a look-alike and a skipped word: the two marks come live, in order', () => {
    const events = eventsOf('alafasy.p2.m1.clean');
    let s = liveConnecting();
    const seen: number[] = [];
    for (const e of events) {
      s = applyEvent(s, e);
      if (e.type === 'mark') seen.push(e.mark.w);
    }
    expect(seen).toEqual([4, 14]);
    expect(marksInOrder(s).map((m) => [m.w, m.kind])).toEqual([
      [4, 'word'],
      [14, 'skipped'],
    ]);
  });

  it('a mark the checker takes back goes (Ayat al-Kursi)', () => {
    const events = eventsOf('rifai.p8.m1.clean');
    const unmark = events.findIndex((e) => e.type === 'unmark');
    const before = run(events.slice(0, unmark));
    const after = applyEvent(before, events[unmark]);
    const id = (events[unmark] as { id: string }).id;
    expect(before.marks[id]).toBeDefined();
    expect(after.marks[id]).toBeUndefined();
  });

  it('applying every event twice (a resumed take) changes nothing', () => {
    for (const name of FIXTURES) {
      const events = eventsOf(name);
      const once = run(events);
      const twice = run(events.flatMap((e) => [e, e]));
      expect(twice).toEqual(once);
      // And replayed from the start after a drop, as a resume on another instance does.
      const half = Math.floor(events.length / 2);
      expect(run([...events.slice(0, half), ...events])).toEqual(once);
    }
  });

  it('the cursor and what’s decided are snapshots; the furthest word is the larger', () => {
    let s = applyEvent(liveConnecting(), { type: 'ready', take: 't1' });
    expect(s.status).toBe('listening');
    s = applyEvent(s, { type: 'at', w: 40 });
    s = applyEvent(s, { type: 'said', upTo: 38 });
    expect(furthestWord(s)).toBe(40);
    // Back an ayah: the server moves both back.
    s = applyEvent(applyEvent(s, { type: 'at', w: 20 }), { type: 'said', upTo: 19 });
    expect([s.cursor, s.saidUpTo, furthestWord(s)]).toEqual([20, 19, 20]);
  });

  it('“Not a mistake” removes the mark for good and takes it off the score', () => {
    let s = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) });
    s = applyEvent(s, { type: 'score', score: { reached: 10, mistakes: 1, tajweed: 0, accuracy: 0.9 } });
    s = dismissMark(s, 'a');
    expect(s.marks).toEqual({});
    expect(s.score).toEqual({ reached: 10, mistakes: 0, tajweed: 0, accuracy: 1 });
    // The server sending it again (a resume) or in the final answer doesn't bring it back.
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a' }) });
    expect(s.marks).toEqual({});
    s = applyEvent(s, { type: 'done', result: { v: 2, take: 't', from: 0, to: 9, secs: 3, marks: [mark({ id: 'a' })], score: null } });
    expect(s.marks).toEqual({});
    // A tajweed note comes off the tajweed count, not the mistakes.
    let t = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'n', kind: 'tajweed', rule: 'qalqalah' }) });
    t = applyEvent(t, { type: 'score', score: { reached: 10, mistakes: 1, tajweed: 1, accuracy: 0.9 } });
    expect(dismissMark(t, 'n').score).toEqual({ reached: 10, mistakes: 1, tajweed: 0, accuracy: 0.9 });
  });

  it('“Put back” (Undo, the Removed list) brings the mark and its count back as they were (Majd, Nov 15 2026)', () => {
    let s = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) });
    s = applyEvent(s, { type: 'score', score: { reached: 10, mistakes: 1, tajweed: 0, accuracy: 0.9 } });
    s = dismissMark(s, 'a');
    expect(removedMarks(s).map((m) => m.id)).toEqual(['a']);
    s = restoreMark(s, 'a');
    expect(Object.keys(s.marks)).toEqual(['a']);
    expect(s.score).toEqual({ reached: 10, mistakes: 1, tajweed: 0, accuracy: 0.9 });
    expect(s.dismissed).toEqual([]);
    expect(removedMarks(s)).toEqual([]);
    // Nothing to put back: unchanged.
    expect(restoreMark(s, 'a')).toBe(s);
    // Put back, the server's updates to it apply again.
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a', sure: 'likely' }) });
    expect(s.marks.a.sure).toBe('likely');
  });

  it('a mark taken off before any score comes back without changing a count it never took', () => {
    let s = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) });
    s = dismissMark(s, 'a');
    s = applyEvent(s, { type: 'score', score: { reached: 10, mistakes: 0, tajweed: 0, accuracy: 1 } });
    expect(restoreMark(s, 'a').score).toEqual({ reached: 10, mistakes: 0, tajweed: 0, accuracy: 1 });
  });

  it('after the final answer: a mark taken off during the take can be put back, as the final answer has it, and counts again', () => {
    let s = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) });
    s = dismissMark(s, 'a');
    // The checker's final score leaves out what was dismissed; its marks still hold it.
    s = applyEvent(s, {
      type: 'done',
      result: { v: 2, take: 't', from: 0, to: 9, secs: 3, marks: [mark({ id: 'a', heard: 'X' }), mark({ id: 'b', w: UTIYAT + 1 })], score: { reached: 10, mistakes: 1, tajweed: 0, accuracy: 0.9 } },
    });
    expect(Object.keys(s.marks)).toEqual(['b']);
    s = restoreMark(s, 'a');
    expect(s.marks.a.heard).toBe('X');
    expect(s.score).toEqual({ reached: 10, mistakes: 2, tajweed: 0, accuracy: 0.8 });
    // One the checker dropped in the end has nothing to put back.
    let t = applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'gone' }) });
    t = dismissMark(t, 'gone');
    t = applyEvent(t, { type: 'done', result: { v: 2, take: 't', from: 0, to: 9, secs: 3, marks: [], score: null } });
    expect(removedMarks(t)).toEqual([]);
  });

  it('after the final answer, late live events change nothing; an error keeps what was shown', () => {
    const done = run(eventsOf('alafasy.p2.m1.clean'));
    expect(applyEvent(done, { type: 'mark', mark: mark({ id: 'late' }) })).toBe(done);
    expect(applyEvent(done, { type: 'error', reason: 'idle' })).toBe(done);
    const live = applyEvent(applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) }), { type: 'error', reason: 'limit' });
    expect([live.status, live.failure, Object.keys(live.marks)]).toEqual(['failed', 'limit', ['a']]);
  });


  it('the real service’s 4-minute take with letters: a word can carry two marks', () => {
    const s = run(eventsOf('server-live-husary.p1.m1.letters'));
    const byWord = new Map<number, string[]>();
    for (const m of marksInOrder(s)) byWord.set(m.w, [...(byWord.get(m.w) ?? []), m.kind]);
    expect([...byWord.values()].some((kinds) => kinds.length > 1)).toBe(true);
    expect(marksInOrder(s).find((m) => m.kind === 'harakat')?.slip).toEqual({ expected: 'ُ', heard: 'َ' });
  });

  it('Stop waits for the final answer with the live marks still up', () => {
    const s = liveStopping(applyEvent(applyEvent(liveConnecting(), { type: 'ready', take: 't' }), { type: 'mark', mark: mark({ id: 'a' }) }));
    expect(s.status).toBe('checking');
    expect(Object.keys(s.marks)).toEqual(['a']);
    expect(liveStopping(LIVE_IDLE)).toBe(LIVE_IDLE);
    // A late ready doesn't put it back to listening.
    expect(applyEvent(s, { type: 'ready', take: 't' }).status).toBe('checking');
  });

  it('marks on a page: only that page’s', () => {
    let s = liveConnecting();
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'a', w: UTIYAT }) });
    s = applyEvent(s, { type: 'mark', mark: mark({ id: 'b', w: words.verseFirstWord(27, 36), ayah: [27, 36] }) });
    expect(marksOnPage(s, words, 379).map((m) => m.id)).toEqual(['a']);
    expect(marksOnPage(s, words, 380).map((m) => m.id)).toEqual(['b']);
  });
});

describe('a take started anywhere on the page (Majd, Nov 14 2026)', () => {
  const A25 = words.verseFirstWord(27, 25);
  const looking = () => liveConnecting({ anywhereFrom: A23 });
  const ready6: LiveEvent = { type: 'ready', take: 't', protocol: 6 };

  it('reads `locked`, `ready.protocol` and a final answer’s `start` (a number, or null when never found); not `nolock`', () => {
    expect(parseEvent({ type: 'locked', w: A25, s: 27, a: 25, t: 2.1 })).toEqual({ type: 'locked', w: A25, s: 27, a: 25, t: 2.1 });
    expect(parseEvent({ type: 'locked', w: A25 })).toBeNull();
    // A search that never finds the start fails silently (Majd, Nov 14 2026): nothing is shown for it.
    expect(parseEvent({ type: 'nolock' })).toBeNull();
    expect(parseEvent({ type: 'ready', take: 't', protocol: 6 })).toMatchObject({ protocol: 6 });
    const done = (start: unknown) =>
      parseEvent({ type: 'done', result: { v: 2, follow: true, take: 't', from: A23, to: A25 + 9, secs: 9, words: [], start } });
    expect(done(A25)).toMatchObject({ result: { start: A25 } });
    expect(done(null)).toMatchObject({ result: { start: null } });
    expect((done(undefined) as { result: object }).result).not.toHaveProperty('start');
  });

  it('a checker that looks (protocol 6): no start or cursor until `locked`, then both are its word', () => {
    let s = applyEvent(looking(), ready6);
    expect(findingStart(s)).toBe(true);
    expect(s.start).toBeNull();
    expect(s.cursor).toBeNull();
    s = applyEvent(s, { type: 'locked', w: A25, s: 27, a: 25 });
    expect(findingStart(s)).toBe(false);
    expect(s.start).toBe(A25);
    expect(s.cursor).toBe(A25);
  });

  it('a checker that doesn’t look (protocol 5, or none said) starts at the page’s first word at once, as before', () => {
    for (const ready of [{ type: 'ready', take: 't', protocol: 5 }, { type: 'ready', take: 't' }] as LiveEvent[]) {
      const s = applyEvent(looking(), ready);
      expect(findingStart(s)).toBe(false);
      expect(s.start).toBe(A23);
    }
  });

  it('a cursor before any `locked` means the checker didn’t look: the page’s first word is the start', () => {
    const s = run([ready6, { type: 'at', w: A23 + 3 }], looking());
    expect(s.start).toBe(A23);
    expect(s.cursor).toBe(A23 + 3);
  });

  it('a take started at a known word never looks', () => {
    const s = applyEvent(liveConnecting({ start: A23 }), ready6);
    expect(findingStart(s)).toBe(false);
    expect(s.start).toBe(A23);
  });

  it('nothing before the start is skipped: such marks are dropped live and from the final answer; other marks stay', () => {
    const skipped = mark({ id: 'k', w: A23 + 2, kind: 'skipped' });
    const wrong = mark({ id: 'w', w: A25 + 1, ayah: [27, 25] });
    let s = run([ready6, { type: 'mark', mark: skipped }], looking());
    expect(s.marks.k).toBeDefined();
    s = applyEvent(s, { type: 'locked', w: A25, s: 27, a: 25 });
    expect(s.marks.k).toBeUndefined();
    s = applyEvent(s, { type: 'mark', mark: skipped });
    s = applyEvent(s, { type: 'mark', mark: wrong });
    expect(Object.keys(s.marks)).toEqual(['w']);
    s = applyEvent(s, { type: 'done', result: { v: 2, take: 't', from: A23, to: A25 + 9, secs: 9, marks: [skipped, wrong], score: null, start: A25 } });
    expect(Object.keys(s.marks)).toEqual(['w']);
    expect(s.start).toBe(A25);
  });

  it('never found: the final answer’s null start says so (the take then ends with no summary)', () => {
    const s = run([ready6, { type: 'done', result: { v: 2, take: 't', from: A23, to: A23, secs: 5, marks: [], score: null, start: null } }], looking());
    expect(s.status).toBe('done');
    expect(startNotFound(s)).toBe(true);
    expect(startNotFound(applyEvent(liveConnecting({ start: A23 }), ready6))).toBe(false);
  });

  it('a page turned by hand: looked for again on that page; the cursor goes until it’s found, and the start stays the first', () => {
    const p380 = words.pageRange(380)[0];
    let s = run([ready6, { type: 'locked', w: A25, s: 27, a: 25 }, { type: 'said', upTo: A25 + 4 }], looking());
    s = seekOnPage(s, p380);
    expect(findingStart(s)).toBe(true);
    expect(s.cursor).toBeNull();
    expect(s.saidUpTo).toBe(A25 + 4);
    s = applyEvent(s, { type: 'locked', w: p380 + 30, s: 27, a: 40 });
    expect(s.cursor).toBe(p380 + 30);
    expect(s.start).toBe(A25);
  });
});

describe('the replayed feed', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('plays the events at their times; Stop brings the rest and the final answer at once', () => {
    const got: LiveEvent[] = [];
    let closed = false;
    const connect = replayFeed(fixture('alafasy.p2.m1.clean'), { speed: 2 });
    const conn = connect(
      { type: 'start', s: 1, a: 1, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: false, keep: false },
      { onEvent: (e) => got.push(e), onClose: () => (closed = true) },
    );
    jest.advanceTimersByTime(0);
    expect(got.map((e) => e.type)).toEqual(['ready']);
    // The look-alike comes 12.5 s in: 6.25 s at double speed.
    jest.advanceTimersByTime(6200);
    expect(got.some((e) => e.type === 'mark')).toBe(false);
    jest.advanceTimersByTime(100);
    expect(got.filter((e) => e.type === 'mark').length).toBe(1);
    conn.send({ type: 'end' });
    expect(got[got.length - 1].type).toBe('done');
    expect(got.filter((e) => e.type === 'mark').length).toBe(2);
    expect(closed).toBe(true);
    // Nothing more after it closed.
    const n = got.length;
    jest.advanceTimersByTime(60_000);
    expect(got.length).toBe(n);
  });

  it('closing early stops every event', () => {
    const got: LiveEvent[] = [];
    const conn = replayFeed(fixture('alafasy.p2.clean.clean'))(
      { type: 'start', s: 1, a: 1, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: false, keep: false },
      { onEvent: (e) => got.push(e), onClose: () => undefined },
    );
    jest.advanceTimersByTime(3000);
    conn.close();
    const n = got.length;
    jest.advanceTimersByTime(120_000);
    expect(got.length).toBe(n);
  });
});

describe('the score', () => {
  it('reads one decimal under 100, rounded down, so a mistake never shows 100%', () => {
    expect(formatAccuracy(1)).toBe('100%');
    expect(formatAccuracy(1 - 1 / 134)).toBe('99.2%');
    expect(formatAccuracy(1 - 2 / 134)).toBe('98.5%');
    expect(formatAccuracy(0.985)).toBe('98.5%');
    expect(formatAccuracy(0.9999)).toBe('99.9%');
    expect(formatAccuracy(0.97)).toBe('97.0%');
    expect(formatAccuracy(0)).toBe('0.0%');
  });

  it('by the page: page 379 has 134 words; one mistake is good, two or three amber, four red', () => {
    const [from, to] = words.pageRange(379);
    expect(to - from).toBe(134);
    expect(wordsOnPagesReached(words, A23, A23 + 10)).toBe(134);
    expect(wordsOnPagesReached(words, A23, words.verseFirstWord(27, 40))).toBe(words.pageRange(380)[1] - from);
    const level = (n: number) => scoreLevel(pageAccuracy(words, n, A23, A23 + 5));
    expect([0, 1, 2, 3, 4].map(level)).toEqual(['good', 'good', 'warn', 'warn', 'bad']);
  });

  it('words', () => {
    expect([0, 1, 2].map(mistakesLabel)).toEqual(['No mistakes', '1 mistake', '2 mistakes']);
  });
});

describe('where it draws', () => {
  it('word boxes sit on page 379’s first line, right to left, inside the verse box', () => {
    const boxes = [A23, A23 + 1, A23 + 2, UTIYAT].map(wordBox.bind(null, words));
    for (const b of boxes) {
      expect(b.y0).toBe(24);
      expect(b.y1).toBe(113);
      expect(b.x1).toBeGreaterThan(b.x0);
    }
    // Right to left: each word left of the one before.
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x1).toBeLessThanOrEqual(boxes[i - 1].x0 + 2);
    expect(cursorBox(words, UTIYAT)).toEqual({ x0: boxes[3].x0 - 5, x1: boxes[3].x1 + 5, y0: 21, y1: 116 });
  });

  it('pages 1 and 2: on develop’s verse boxes, not the word data’s own fit', () => {
    const w = words.verseFirstWord(2, 2);
    const b = wordBox(words, w);
    const verse = ayahBand(2, 2, 2).map((r) => ({ y0: r.y0 + 6, y1: r.y1 - 6 }));
    expect(verse.some((r) => r.y0 === b.y0 && r.y1 === b.y1)).toBe(true);
  });

  it('the ayah band covers An-Naml 23 on its two lines, its marker included', () => {
    expect(ayahBand(379, 27, 23)).toEqual([
      { x0: 57, y0: 18, x1: 980, y1: 119 },
      { x0: 656, y0: 126, x1: 976, y1: 225 },
    ]);
  });

  it('a mark is its word’s box; an extra word is the word it came after (Majd, Nov 15 2026: highlights only)', () => {
    expect(markBox(words, mark({}))).toEqual(wordBox(words, UTIYAT));
    expect(markBox(words, mark({ kind: 'added', w: A23 + 6 }))).toEqual(wordBox(words, A23 + 6));
    // Its highlight: the word's box a little wider and taller, inside the cursor's box.
    const h = markHighlight(words, mark({}));
    const c = cursorBox(words, UTIYAT);
    const b = wordBox(words, UTIYAT);
    expect(h.x0).toBeLessThan(b.x0);
    expect(h.x1).toBeGreaterThan(b.x1);
    expect(h.x0).toBeGreaterThan(c.x0);
    expect(h.y0).toBeGreaterThan(c.y0);
  });

  it('a tap on an extra word’s highlight finds it', () => {
    const extra = mark({ id: 'x', kind: 'added', w: SHAY });
    const b = wordBox(words, SHAY);
    expect(markAt(words, [extra], (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2)?.id).toBe('x');
  });

  it('a tap finds the mark under it, or none', () => {
    const marks = [mark({ id: 'a' }), mark({ id: 'b', w: SHAY, kind: 'harakat' })];
    const a = wordBox(words, UTIYAT);
    expect(markAt(words, marks, (a.x0 + a.x1) / 2, 60)?.id).toBe('a');
    const b = wordBox(words, SHAY);
    expect(markAt(words, marks, (b.x0 + b.x1) / 2, 60)?.id).toBe('b');
    expect(markAt(words, marks, 900, 60)).toBeNull();
    expect(markAt(words, marks, (a.x0 + a.x1) / 2, 400)).toBeNull();
  });
});

describe('similar phrases', () => {
  it('An-Naml 23’s وَأُوتِيَتْ مِن كُلِّ شَىْءٍ finds An-Naml 16’s وَأُوتِينَا مِن كُلِّ شَىْءٍ', () => {
    const places = similarPhrases(words, UTIYAT);
    const p16 = places.find((p) => p.sura === 27 && p.ayah === 16);
    expect(p16).toBeDefined();
    expect(p16!.same.length).toBeGreaterThanOrEqual(3);
    expect(words.uthmani(p16!.w)).toBe('وَأُوتِينَا');
    // Never the place itself.
    expect(places.some((p) => p.w === UTIYAT)).toBe(false);
    // The words to show stay inside their ayah and hold the shared ones.
    for (const p of places) {
      const [vFrom, vTo] = words.verseRange(p.sura, p.ayah);
      expect(p.from).toBeGreaterThanOrEqual(vFrom);
      expect(p.to).toBeLessThanOrEqual(vTo);
      for (const s of p.same) expect(s >= p.from && s < p.to).toBe(true);
    }
  });

  it('a phrase said nowhere else finds nothing', () => {
    // تَمْلِكُهُمْ ٱمْرَأَةً … is An-Naml 23’s own.
    expect(similarPhrases(words, A23 + 3)).toEqual([]);
  });

  it('is quick enough to run on a tap', () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) similarPhrases(words, UTIYAT + i);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe('the card’s words', () => {
  it('titles each kind', () => {
    expect(markTitle(mark({}))).toBe('Wrong word');
    expect(markTitle(mark({ detail: 'order' }))).toBe('Out of order');
    expect(markTitle(mark({ kind: 'skipped' }))).toBe('Skipped word');
    expect(markTitle(mark({ kind: 'added' }))).toBe('Extra word');
    expect(markTitle(mark({ kind: 'added', detail: 'trail' }))).toBe('Extra word after the end');
    expect(markTitle(mark({ kind: 'harakat' }))).toBe('Harakat slip');
    expect(markTitle(mark({ kind: 'harakat', detail: 'shadda' }))).toBe('Shadda slip');
    expect(markTitle(mark({ kind: 'letter' }))).toBe('Letter slip');
    expect(markTitle(mark({ kind: 'tajweed', rule: 'madd_munfasil' }))).toBe('Madd munfasil');
  });

  it('a haraka or letter past the normal bar only is “Not clear”: say it more clearly, not counted (Majd, Nov 15 2026)', () => {
    const unclear = mark({ kind: 'harakat', sure: 'likely', slip: { expected: 'َ', heard: 'ِ' }, heard: 'x', heardExact: true });
    expect(isUnclear(unclear)).toBe(true);
    expect(markTitle(unclear)).toBe('Not clear');
    expect(findingNote(unclear)).toBe('Say it more clearly. Not counted in the score.');
    // The title says it, so the place doesn't add "likely".
    expect(plainText(markPlace(unclear))).toBe('An-Naml, ayah 23');
    expect(markTitle(mark({ kind: 'letter', sure: 'likely' }))).toBe('Not clear');
    // Clear harakat and letters, and every word mark, keep their names.
    expect(markTitle(mark({ kind: 'harakat', sure: 'clear' }))).toBe('Harakat slip');
    expect(isUnclear(mark({ kind: 'word', sure: 'likely' }))).toBe(false);
    expect(isUnclear(mark({ kind: 'skipped', sure: 'likely' }))).toBe(false);
    expect(isUnclear(mark({ kind: 'tajweed', rule: 'ghunnah', sure: 'likely' }))).toBe(false);
  });

  it('names the ayah by its surah, and says when a mark is only likely', () => {
    expect(plainText(markPlace(mark({})))).toBe('An-Naml, ayah 23');
    expect(plainText(markPlace(mark({ sure: 'likely' })))).toBe('An-Naml, ayah 23 · likely');
  });

  it('Expected and Recited: two words either side, the word swapped for what was said', () => {
    const exp = expectedPhrase(words, mark({ heard: 'وَأُوهِيَتْ' }));
    expect(exp.map((p) => p.role)).toEqual(['context', 'context', 'expected', 'context', 'context']);
    expect(exp[2].text).toBe('وَأُوتِيَتْ');
    const rec = recitedPhrase(words, mark({ heard: 'وَأُوهِيَتْ', heardExact: false }))!;
    expect(rec.map((p) => [p.role, p.role === 'context' ? '' : p.text])).toEqual([
      ['context', ''], ['context', ''], ['recited', 'وَأُوهِيَتْ'], ['context', ''], ['context', ''],
    ]);
    expect(recitedLabel(mark({ heardExact: false }))).toBe('As heard');
    expect(recitedLabel(mark({ heard: 'x', heardExact: true }))).toBe('Recited');
  });

  it('a skipped word leaves a gap; an added word sits after its word; at an ayah’s start the context is shorter', () => {
    expect(recitedPhrase(words, mark({ kind: 'skipped', w: A23 + 5 }))!.map((p) => p.role)).toEqual(['context', 'context', 'gap', 'context', 'context']);
    const added = recitedPhrase(words, mark({ kind: 'added', w: A23 + 6, heard: 'ذَٰلِكَ' }))!;
    expect(added.map((p) => p.role)).toEqual(['context', 'context', 'recited', 'context', 'context']);
    expect(added[1].text).toBe(words.uthmani(A23 + 6));
    expect(expectedPhrase(words, mark({ w: A23 })).map((p) => p.role)).toEqual(['expected', 'context', 'context']);
  });

  it('no Recited row without heard text, nor for tajweed', () => {
    expect(recitedPhrase(words, mark({}))).toBeNull();
    expect(recitedPhrase(words, mark({ kind: 'tajweed', rule: 'ghunnah' }))).toBeNull();
  });

  it('a harakat or letter slip: the exact word, or the sounds “as heard”, and which letter or haraka', () => {
    // Until the letters judge maps its position back to the written word, the heard word is spelt from the sounds.
    const approx = parseMark({ id: 'h', w: SHAY, ayah: [27, 23], kind: 'harakat', heard: 'شيون', heardExact: false, slip: { expected: 'ٍ', heard: 'ٌّ' }, sure: 'clear' })!;
    expect(recitedLabel(approx)).toBe('As heard');
    expect(approx.slip).toEqual({ expected: 'ٍ', heard: 'ٌّ' });
    // Harakat by name (a lone haraka is too small to read in a line); letters in Arabic, in isolates.
    expect(slipLine(approx)).toBe('Dammatan and shadda heard for kasratan');
    const exact = mark({ kind: 'letter', heard: 'شَيٌّ', heardExact: true, slip: { expected: 'ء', heard: 'ي' } });
    expect(recitedLabel(exact)).toBe('Recited');
    expect(slipLine(exact)).toBe('\u2068ي\u2069 heard for \u2068ء\u2069');
    expect(slipLine(mark({ kind: 'letter', slip: { expected: 'ء', heard: '' } }))).toBe('\u2068ء\u2069 not heard');
    expect(slipLine(mark({ kind: 'harakat', detail: 'shadda', slip: { expected: 'لّ', heard: 'ل' } }))).toBe('\u2068ل\u2069 heard for \u2068لّ\u2069');
    expect(slipLine(mark({ kind: 'harakat', slip: { expected: 'ُ', heard: 'َ' } }))).toBe('Fatha heard for damma');
    expect(slipLine(mark({ kind: 'word', slip: { expected: 'ء', heard: 'ي' } }))).toBeNull();
    expect(parseMark({ id: 'x', w: 1, ayah: [1, 1], kind: 'letter', slip: { expected: 3 }, sure: 'clear' })!.slip).toBeUndefined();
  });

  it('tajweed lines and the summary’s notes', () => {
    expect(tajweedLines(mark({ kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4 }))).toEqual({ main: 'Held about 2 counts', sub: 'Your setting: 4 counts' });
    expect(findingNote(mark({ kind: 'tajweed', rule: 'madd_munfasil', got: 2, expected: 4 }))).toBe('Held about 2 counts · Your setting: 4 counts');
    expect(findingNote(mark({ kind: 'skipped' }))).toBe('Left out');
    expect(findingNote(mark({}))).toBe('Said as another word');
    expect(findingNote(mark({ kind: 'harakat', heard: 'شَيٌّ', heardExact: true }))).toBe('Recited ⁨شَيٌّ⁩');
  });
});

describe('the first answer (v1) as marks', () => {
  it('skipped, wrong, extras, letters and tajweed become marks in mushaf order, with the score', () => {
    const { finalFromV1, marksFromV1 } = require('../fromV1') as typeof import('../fromV1');
    const v1 = {
      v: 1 as const,
      from: A23,
      to: A23 + 10,
      secs: 12,
      words: [
        ...Array.from({ length: 11 }, (_, i) => ({ w: A23 + i, status: 'correct' as const })),
      ].map((x) =>
        x.w === UTIYAT ? { ...x, status: 'wrong' as const, kind: 'sound' as const } : x.w === A23 + 5 ? { ...x, status: 'missed' as const } : x,
      ),
      extras: [{ after: A23 + 9, t: 8, trail: false }],
      tajweed: [{ w: A23 + 10, rule: 'madd_aared' as const, got: 2, expected: 4 }],
      letters: [{ w: SHAY, slip: 'ء→ي' }],
    };
    expect(marksFromV1(v1, words).map((m) => [m.w - A23, m.kind, m.id])).toEqual([
      [4, 'word', `${UTIYAT}:word:sound`],
      [5, 'skipped', `${A23 + 5}:skipped:`],
      [7, 'letter', `${SHAY}:letter:`],
      [9, 'added', `${A23 + 9}:added:`],
      [10, 'tajweed', `${A23 + 10}:tajweed:madd_aared`],
    ]);
    const f = finalFromV1(v1, words);
    expect(f.score).toEqual({ reached: 11, mistakes: 4, tajweed: 1, accuracy: 1 - 4 / 11 });
    expect(f.marks.every((m) => m.ayah[0] === 27 && m.ayah[1] === 23)).toBe(true);
  });
});

describe('`into`: where a slip into a similar ayah went (contract draft 6, final answer only)', () => {
  const { intoLine, intoMarks, spokenIntoLine } = require('../describe');
  const { plainText, surahName } = require('../../passages');
  const base = { id: 'a', w: 40, ayah: [2, 5] as [number, number], kind: 'skipped' as const, sure: 'clear' as const };

  it('is kept on its mark, with the other ayat reading the same and a swapped ending', () => {
    expect(parseMark({ ...base, into: { w: 3500, ayah: [31, 6], also: [[2, 7], 'x', [300, 1]] } })!.into).toEqual({ w: 3500, ayah: [31, 6], also: [[2, 7]] });
    expect(parseMark({ ...base, into: { w: 9, ayah: [113, 3], ending: true } })!.into).toEqual({ w: 9, ayah: [113, 3], ending: true });
  });

  it('a malformed one is dropped, never its mark', () => {
    for (const into of ['x', { w: -1, ayah: [31, 6] }, { w: 3, ayah: [200, 1] }, { w: 3, ayah: [31, 0] }, { w: 3 }]) {
      const m = parseMark({ ...base, into });
      expect(m).toMatchObject({ id: 'a', kind: 'skipped' });
      expect(m!.into).toBeUndefined();
    }
  });

  it('reads as a line on the card: the ayah gone on with, surah first; a swapped ending by its ayah', () => {
    const luqman = plainText(surahName(31));
    const m = { ...base, into: { w: 3500, ayah: [31, 6] as [number, number] } };
    expect(plainText(intoLine(m, 'ayah 5'))).toBe(`You continued with ${luqman} 31:6, a similar ayah`);
    expect(plainText(intoLine({ ...m, into: { ...m.into, also: [[2, 7]] } }, 'ayah 5'))).toBe(`You continued with ${luqman} 31:6, a similar ayah (and 1 other)`);
    expect(plainText(intoLine({ ...m, into: { ...m.into, also: [[2, 7], [3, 9]] } }, 'ayah 5'))).toBe(`You continued with ${luqman} 31:6, a similar ayah (and 2 others)`);
    const ending = { ...base, ayah: [113, 5] as [number, number], into: { w: 9, ayah: [113, 3] as [number, number], ending: true as const } };
    expect(plainText(intoLine(ending, 'ayah 5'))).toBe('You ended ayah 5 as ayah 3 ends');
    // VoiceOver hears the surah and ayah in words, not "31:6".
    expect(spokenIntoLine(m, 'ayah 5')).toBe(`You continued with ${surahName(31)}, ayah 6, a similar ayah`);
  });

  it('only marks that carry one, in page order', () => {
    const marks = [
      { ...base, id: 'b', w: 50, into: { w: 1, ayah: [1, 1] as [number, number] } },
      { ...base, id: 'c', w: 45 },
      { ...base, id: 'd', w: 41, into: { w: 2, ayah: [1, 2] as [number, number] } },
    ];
    expect(intoMarks(marks).map((m: { id: string }) => m.id)).toEqual(['d', 'b']);
  });
});

describe('`off`: something else said where the next word goes (contract draft 7; the hidden view’s red cover)', () => {
  const apply = applyEvent;
  const connecting = liveConnecting;
  const stopping = liveStopping;
  const seek = seekOnPage;
  const run = (events: LiveEvent[], from: LiveState = connecting({ start: 100 })): LiveState => events.reduce(apply, from);
  const reciting: LiveEvent[] = [{ type: 'ready', take: 't', protocol: 6 }, { type: 'at', w: 104 }, { type: 'said', upTo: 104 }];

  it('is read as an event (with its time), and an app that never gets it is unchanged', () => {
    expect(parseEvent({ type: 'off', w: 105, t: 3.2 })).toEqual({ type: 'off', w: 105, t: 3.2 });
    expect(parseEvent({ type: 'off' })).toBeNull();
    expect(run(reciting).off).toBeNull();
  });

  it('marks the word, never a mark or the score', () => {
    const s = run([...reciting, { type: 'off', w: 105 }]);
    expect(s.off).toEqual({ w: 105, from: 104 });
    expect(s.marks).toEqual({});
    expect(s.score).toBeNull();
  });

  it('goes when the word is said (at reaches it, or said decides it), and not while the reciter stays put', () => {
    const on = [...reciting, { type: 'off', w: 105 } as LiveEvent];
    expect(run([...on, { type: 'at', w: 104 }]).off).toEqual({ w: 105, from: 104 });
    expect(run([...on, { type: 'at', w: 105 }]).off).toBeNull();
    expect(run([...on, { type: 'said', upTo: 105 }]).off).toBeNull();
  });

  it('goes when the reciter goes back to say it again', () => {
    expect(run([...reciting, { type: 'off', w: 105 }, { type: 'at', w: 101 }]).off).toBeNull();
  });

  it('goes when a mark comes on the word, or the stray speech is marked as an extra word just before it', () => {
    const on = [...reciting, { type: 'off', w: 105 } as LiveEvent];
    const mark = (w: number, kind: Mark['kind']): LiveEvent => ({ type: 'mark', mark: { id: `${w}:${kind}:`, w, ayah: [27, 23], kind, sure: 'clear' } });
    expect(run([...on, mark(105, 'word')]).off).toBeNull();
    expect(run([...on, mark(104, 'added')]).off).toBeNull();
    expect(run([...on, mark(90, 'word')]).off).toEqual({ w: 105, from: 104 });
  });

  it('only while reciting a found place, for a word not reached yet (a resume’s replay of a cleared one is ignored)', () => {
    expect(run([{ type: 'ready', take: 't', protocol: 6 }, { type: 'off', w: 105 }], connecting({ anywhereFrom: 100 })).off).toBeNull();
    expect(run([...reciting, { type: 'off', w: 104 }]).off).toBeNull();
    expect(run([...reciting, { type: 'at', w: 106 }, { type: 'off', w: 105 }]).off).toBeNull();
    expect(run([{ type: 'off', w: 105 }]).off).toBeNull(); // connecting
  });

  it('goes with Stop, a page turned by hand, the final answer and a failure', () => {
    const on = run([...reciting, { type: 'off', w: 105 }]);
    expect(stopping(on).off).toBeNull();
    expect(seek(on, 200).off).toBeNull();
    expect(apply(on, { type: 'done', result: { v: 2, take: 't', from: 100, to: 110, secs: 9, marks: [], score: null } }).off).toBeNull();
    expect(apply(on, { type: 'error', reason: 'server' }).off).toBeNull();

describe('protocol 7: where the start was found', () => {
  it('locked carries where (page or quran); anything else is left out', () => {
    expect(parseEvent({ type: 'locked', w: 10, s: 1, a: 2, where: 'quran' })).toEqual({ type: 'locked', w: 10, s: 1, a: 2, where: 'quran' });
    expect(parseEvent({ type: 'locked', w: 10, s: 1, a: 2, where: 'page' })).toEqual({ type: 'locked', w: 10, s: 1, a: 2, where: 'page' });
    expect(parseEvent({ type: 'locked', w: 10, s: 1, a: 2, where: 'mars' })).toEqual({ type: 'locked', w: 10, s: 1, a: 2 });
  });
});
