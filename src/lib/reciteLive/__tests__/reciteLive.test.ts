import { quranWords } from '../../recite/__fixtures__/quranWords';
import { LiveEvent, parseEvent, parseMark, severityOf, Mark } from '../contract';
import {
  applyEvent,
  dismissMark,
  furthestWord,
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
import { ayahBand, cursorBox, markAt, markShape, wordBox } from '../geometry';
import { similarPhrases } from '../similar';
import { expectedPhrase, findingNote, markPlace, markTitle, recitedLabel, recitedPhrase, slipLine, tajweedLines } from '../describe';
import { plainText } from '../../passages';

const FIXTURES = ['alafasy.p2.m1.clean', 'alafasy.p2.clean.clean', 'minshawi-murattal.p3.m1.clean', 'rifai.p8.m1.clean', 'abdulbaset-murattal.p2.m1.clean'];
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

  it('red for words, amber for harakat, letters and tajweed', () => {
    expect(['word', 'skipped', 'added'].map((kind) => severityOf({ kind } as Mark))).toEqual(['mistake', 'mistake', 'mistake']);
    expect(['harakat', 'letter', 'tajweed'].map((kind) => severityOf({ kind } as Mark))).toEqual(['slip', 'slip', 'slip']);
  });
});

describe('the live state', () => {
  it('ends with the final answer’s marks, on every fixture', () => {
    for (const name of FIXTURES) {
      const events = eventsOf(name);
      const done = events.find((e): e is Extract<LiveEvent, { type: 'done' }> => e.type === 'done')!;
      const s = run(events);
      expect(s.status).toBe('done');
      expect(marksInOrder(s).map((m) => m.id)).toEqual(done.result.marks.map((m) => m.id).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)));
      expect(mistakeCount(s)).toBe(done.result.score!.mistakes);
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

  it('after the final answer, late live events change nothing; an error keeps what was shown', () => {
    const done = run(eventsOf('alafasy.p2.m1.clean'));
    expect(applyEvent(done, { type: 'mark', mark: mark({ id: 'late' }) })).toBe(done);
    expect(applyEvent(done, { type: 'error', reason: 'idle' })).toBe(done);
    const live = applyEvent(applyEvent(liveConnecting(), { type: 'mark', mark: mark({ id: 'a' }) }), { type: 'error', reason: 'limit' });
    expect([live.status, live.failure, Object.keys(live.marks)]).toEqual(['failed', 'limit', ['a']]);
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

  it('a mark is its word’s box; an added word is the gap after its word', () => {
    expect(markShape(words, mark({}))).toMatchObject({ type: 'word', box: wordBox(words, UTIYAT) });
    const g = markShape(words, mark({ kind: 'added', w: A23 + 6 }));
    expect(g).toMatchObject({ type: 'gap', x: wordBox(words, A23 + 6).x0, y: 113 });
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
    expect(markTitle(mark({ kind: 'added' }))).toBe('Added word');
    expect(markTitle(mark({ kind: 'added', detail: 'trail' }))).toBe('Added after the end');
    expect(markTitle(mark({ kind: 'harakat' }))).toBe('Harakat slip');
    expect(markTitle(mark({ kind: 'harakat', detail: 'shadda' }))).toBe('Shadda slip');
    expect(markTitle(mark({ kind: 'letter' }))).toBe('Letter slip');
    expect(markTitle(mark({ kind: 'tajweed', rule: 'madd_munfasil' }))).toBe('Madd munfasil');
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
    // A haraka alone sits on a tatweel; each side is an isolate after the Latin.
    expect(slipLine(approx)).toBe('\u2068\u0640ٌّ\u2069 heard for \u2068\u0640ٍ\u2069');
    const exact = mark({ kind: 'letter', heard: 'شَيٌّ', heardExact: true, slip: { expected: 'ء', heard: 'ي' } });
    expect(recitedLabel(exact)).toBe('Recited');
    expect(slipLine(exact)).toBe('\u2068ي\u2069 heard for \u2068ء\u2069');
    expect(slipLine(mark({ kind: 'letter', slip: { expected: 'ء', heard: '' } }))).toBe('\u2068ء\u2069 not heard');
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
