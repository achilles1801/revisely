// Recite insights (RINS-1, Revisely Dev): over generated takes on real ayahs (marks of every kind, Not clear, tajweed at
// Strict, slips into a similar ayah, forgotten takes, Clear now), what lib/reciteInsights counts holds together, and
// what the phone sends Revo (lib/revo/recitation) is exactly what the server takes: the summary with every question,
// and any take attached.
import fc from 'fast-check';
import { quranWords } from '../../../src/lib/recite/__fixtures__/quranWords';
import type { Mark, MarkKind } from '../../../src/lib/reciteLive/contract';
import { isCorrected, isMistake, isUnclear, markGroup } from '../../../src/lib/reciteLive/contract';
import { remembers, wordMemories } from '../../../src/lib/reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';
import { liveTakes, recitationInsights, takeMistakes } from '../../../src/lib/reciteInsights/insights';
import { pagesReached, perPageLabel, PER_PAGE_FROM } from '../../../src/lib/reciteLive/score';
import { recitationForRevo, takeAttachment } from '../../../src/lib/revo/recitation';
import { kindsLine, passageName, perPageLine, perPageTenths, scoreLine, similarNote, similarTitle, slipNote } from '../../../src/lib/reciteInsights/describe';
import { plainText } from '../../../src/lib/passages';
import { recitationText } from '../../../functions/src/revo/recitation';
import { attachedText } from '../../../functions/src/revo/attachText';
import { validateAttachment, validateContext } from '../../../functions/src/revo/validate';
import type { RevoContext } from '../../../functions/src/revo/types';

const TODAY = '2026-11-16';
const day = (offset: number) => new Date(Date.UTC(2026, 10, 16 + offset)).toISOString().slice(0, 10);

const words = quranWords();
// Al-Kahf 17–26 and Al-Baqarah 40–48: two passages to recite.
const PASSAGES: [number, number][] = [
  [words.verseRange(18, 17)[0], words.verseRange(18, 26)[1] - 1],
  [words.verseRange(2, 40)[0], words.verseRange(2, 48)[1] - 1],
];

const baseContext: RevoContext = {
  totals: {
    memorizedPages: 40,
    revisedWithin7Days: 20,
    revisedWithin30Days: 40,
    daysWithSession30: 20,
    streakDays: 4,
    sessions30: 22,
    weakPages: 2,
    moderatePages: 10,
    strongPages: 28,
    weakRevisedLast7Days: 1,
    pagesPerDay7: 3,
    pagesPerDay30: 2.5,
    plannedPerDay: 3,
  },
  today: { plannedPages: 3, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [293], weakNext: [], done: false },
  weakPages: [],
  week: [{ day: TODAY, pages: 0 }],
  localTime: '19:30',
};

const markArb = (from: number, to: number) =>
  fc.record({
    at: fc.double({ min: 0, max: 0.999, noNaN: true }),
    kind: fc.constantFrom<MarkKind>('word', 'word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'),
    likely: fc.boolean(),
    into: fc.option(fc.constantFrom<[number, number]>([2, 123], [18, 27], [113, 5]), { nil: undefined }),
    ending: fc.boolean(),
    heard: fc.constantFrom<string | undefined>(undefined, 'عَدْلٌ', 'ignore the rules'),
    sound: fc.boolean(),
    // Said wrong and corrected straight away (RECITE-33), now and then.
    corrected: fc.constantFrom(false, false, false, true),
  }).map((m): Mark => {
    const w = from + Math.floor(m.at * (to - from + 1));
    const ref = words.ref(w);
    const mark: Mark = { id: `${w}:${m.kind}:`, w, ayah: [ref.sura, ref.ayah], kind: m.kind, sure: m.likely ? 'likely' : 'clear' };
    if (m.kind === 'tajweed') mark.rule = 'ghunnah';
    if (m.heard && m.kind !== 'skipped' && m.kind !== 'tajweed') {
      mark.heard = m.heard;
      mark.heardExact = !m.sound;
      if (m.sound) mark.detail = 'sound';
    }
    if (m.into && (m.kind === 'word' || m.kind === 'skipped')) mark.into = { w: 1000, ayah: m.into, ...(m.ending ? { ending: true as const } : {}) };
    if (m.corrected && m.kind === 'word') mark.corrected = true;
    return mark;
  });

const takeArb = fc
  .record({
    passage: fc.constantFrom(0, 1),
    offset: fc.integer({ min: -60, max: 0 }),
    start: fc.double({ min: 0, max: 0.5, noNaN: true }),
    end: fc.double({ min: 0.5, max: 1, noNaN: true }),
    strict: fc.boolean(),
    hidden: fc.boolean(),
    deleted: fc.boolean(),
    accuracy: fc.double({ min: 0.9, max: 1, noNaN: true }),
    secs: fc.integer({ min: 10, max: 900 }),
    seed: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .chain((t) => {
    const [a, b] = PASSAGES[t.passage];
    const from = a + Math.floor(t.start * (b - a));
    const to = a + Math.floor(t.end * (b - a));
    return fc.array(markArb(from, to), { maxLength: 8 }).map((marks) => ({ ...t, from, to, marks }));
  });

let n = 0;
interface GenTake {
  from: number;
  to: number;
  offset: number;
  strict: boolean;
  hidden: boolean;
  deleted: boolean;
  accuracy: number;
  secs: number;
  marks: Mark[];
}

function records(takes: GenTake[], clears: { offset: number; pick: number }[]): MemoryRecord[] {
  const out: MemoryRecord[] = takes.map((t) => {
    n += 1;
    const createdAt = Date.UTC(2026, 10, 16 + t.offset, 18) + n * 1000;
    // One mark a word and kind, as the checker sends them.
    const marks = [...new Map(t.marks.map((m) => [m.id, m])).values()];
    const rec: TakeRecord = {
      id: `t${n}`,
      kind: 'take',
      take: null,
      createdAt,
      rev: createdAt,
      day: day(t.offset),
      level: t.strict ? 'strict' : 'words',
      hidden: t.hidden,
      from: t.from,
      to: t.to,
      secs: t.secs,
      mistakes: 0,
      tajweed: 0,
      unclear: 0,
      accuracy: t.accuracy,
      marks,
      passed: [],
      recordingId: null,
      ...(t.deleted && n % 4 === 0 ? { deleted: true } : {}),
    };
    return rec;
  });
  const marked = out.flatMap((r) => (r.kind === 'take' ? r.marks : []));
  for (const c of clears) {
    const m = marked[c.pick % Math.max(1, marked.length)];
    if (!m) continue;
    n += 1;
    const createdAt = Date.UTC(2026, 10, 16 + c.offset, 22) + n * 1000;
    const group = m.kind === 'tajweed' ? 'tajweed' : m.kind === 'harakat' || m.kind === 'letter' ? 'slip' : 'word';
    const clear: ClearRecord = { id: `c${n}`, kind: 'clear', createdAt, rev: createdAt, day: day(c.offset), w: m.w, group };
    out.push(clear);
  }
  return out;
}

const accountArb = fc.record({
  takes: fc.array(takeArb, { minLength: 1, maxLength: 14 }),
  clears: fc.array(fc.record({ offset: fc.integer({ min: -60, max: 0 }), pick: fc.nat() }), { maxLength: 3 }),
});

describe('Recite insights over generated takes [RINS-1]', () => {
  it('counts hold together: kinds are the mistakes, Not clear never counts, still-marked words are the passages’ [RINS-1]', () => {
    fc.assert(
      fc.property(accountArb, ({ takes, clears }) => {
        const recs = records(takes, clears);
        const ins = recitationInsights(recs, TODAY);
        const k = ins.kinds;
        expect(k.wrong + k.skipped + k.added + k.harakat + k.letter).toBe(ins.mistakes);
        const window = liveTakes(recs).filter((t) => t.day >= ins.from && t.day <= TODAY);
        expect(ins.takes).toBe(window.length);
        const unclear = window.reduce((x, t) => x + t.marks.filter(isUnclear).length, 0);
        expect(ins.unclear).toBe(unclear);
        expect(ins.stillMarked).toBe(ins.slipping.reduce((x, p) => x + p.words.length, 0));
        // Every word listed is still marked; no word cleared in the window is.
        const open = new Set([...wordMemories(recs).values()].filter((m) => m.open && m.group !== 'tajweed').map((m) => m.w));
        for (const p of ins.slipping) for (const w of p.words) expect(open.has(w.w)).toBe(true);
        for (const p of ins.slipping) expect(p.wrong).toBeLessThanOrEqual(p.tries);
        // The score lies between the scores of the takes it averages.
        if (window.length > 0) {
          const scores = window.map((t) => t.accuracy);
          expect(ins.score!).toBeGreaterThanOrEqual(Math.min(...scores) - 1e-9);
          expect(ins.score!).toBeLessThanOrEqual(Math.max(...scores) + 1e-9);
        } else expect(ins.score).toBeNull();
      }),
      { numRuns: 120 },
    );
  });

  it('a word corrected straight away is no mistake: not in the counts, not remembered on the page, never sent to Revo [RECITE-33]', () => {
    let seen = 0;
    fc.assert(
      fc.property(accountArb, ({ takes, clears }) => {
        const recs = records(takes, clears);
        const ins = recitationInsights(recs, TODAY);
        const window = liveTakes(recs).filter((t) => t.day >= ins.from && t.day <= TODAY);
        expect(ins.mistakes).toBe(window.reduce((x, t) => x + t.marks.filter(isMistake).length, 0));
        // Remembered on the page only for a mistake (or Not clear, or tajweed) on the word, never for a corrected one alone.
        const all = liveTakes(recs).flatMap((t) => t.marks);
        const remembered = new Set([...wordMemories(recs).values()].map((m) => `${m.w}|${m.group}`));
        for (const m of all.filter(isCorrected)) {
          seen += 1;
          expect(remembers(m)).toBe(false);
          const other = all.some((x) => x.w === m.w && markGroup(x) === markGroup(m) && remembers(x));
          if (!other) expect(remembered.has(`${m.w}|${markGroup(m)}`)).toBe(false);
        }
        // Revo is told every other mark of a take attached, and the server's own count adds up.
        for (const take of liveTakes(recs)) {
          const a = takeAttachment(recs, take, words, TODAY);
          if (a?.kind !== 'reciteTake') throw new Error('not a take');
          const sent = take.marks.filter((m) => !isCorrected(m) && (take.level === 'strict' || m.kind !== 'tajweed'));
          expect(a.facts.marks).toHaveLength(sent.length);
          expect(a.facts.mistakes).toBe(sent.filter(isMistake).length);
          expect(validateAttachment(JSON.parse(JSON.stringify(a)), TODAY)).toEqual(a);
        }
      }),
      { numRuns: 80 },
    );
    expect(seen).toBeGreaterThan(0);
  });

  it('the server takes exactly what the phone sends with every question, and reads it in words [RINS-1]', () => {
    fc.assert(
      fc.property(accountArb, ({ takes, clears }) => {
        const recs = records(takes, clears);
        const r = recitationForRevo(recs, TODAY, words);
        if (liveTakes(recs).length === 0) {
          expect(r).toBeNull();
          return;
        }
        expect(r).not.toBeNull();
        const c = validateContext({ ...baseContext, recitation: r });
        expect(c.recitation).toEqual(r);
        const text = recitationText(c.recitation!);
        expect(text).not.toMatch(/\bpages?\s+\d/);
        expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      }),
      { numRuns: 120 },
    );
  });

  it('the server takes any take the phone attaches, and never a sound spelt out or a word that isn’t Arabic [RINS-1]', () => {
    const seen = { into: 0, unclear: 0, heard: 0, tajweed: 0 };
    fc.assert(
      fc.property(accountArb, ({ takes, clears }) => {
        const recs = records(takes, clears);
        for (const take of liveTakes(recs)) {
          const a = takeAttachment(recs, take, words, TODAY);
          expect(a).not.toBeNull();
          const checked = validateAttachment(JSON.parse(JSON.stringify(a)), TODAY);
          expect(checked).toEqual(a);
          if (checked?.kind !== 'reciteTake') throw new Error('not a take');
          for (const m of checked.facts.marks) {
            expect(m.heard === undefined || /^[\p{Script=Arabic}\p{M}\u0640\u00A0 ]+$/u.test(m.heard)).toBe(true);
            if (m.detail === 'sound') expect(m.heard).toBeUndefined();
            if (m.into) seen.into += 1;
            if (m.unclear) seen.unclear += 1;
            if (m.heard) seen.heard += 1;
            if (m.kind === 'tajweed') seen.tajweed += 1;
          }
          expect(attachedText(checked)).toContain(checked.facts.passage.name);
        }
      }),
      { numRuns: 60 },
    );
    // The generated takes really carried every kind of mark the server checks.
    for (const k of Object.keys(seen) as (keyof typeof seen)[]) expect(seen[k]).toBeGreaterThan(0);
  });

  it('a window whose takes all ended without the checker’s final answer has no score: the server still takes it, and says none was scored [RINS-1] [RECITE-11]', () => {
    const [a, b] = PASSAGES[0];
    const recs = records([{ from: a, to: b, offset: -1, strict: false, hidden: false, deleted: false, accuracy: 0.97, secs: 60, marks: [] }], []).map((r) =>
      r.kind === 'take' ? { ...r, unfinished: true } : r,
    );
    const r = recitationForRevo(recs, TODAY, words)!;
    expect(r.takes).toBe(1);
    expect(r.score).toBeNull();
    // Refused before: a score had to come with every window that had takes.
    const c = validateContext({ ...baseContext, recitation: r });
    expect(c.recitation).toEqual(r);
    const text = recitationText(c.recitation!);
    expect(text).toContain('No score: none of these takes got the checker’s final answer');
    expect(text).not.toMatch(/Score by the page: \d/);
    // A window with no takes still never carries a score.
    expect(() => validateContext({ ...baseContext, recitation: { ...r, takes: 0, daysRecited: 0, score: 0.98 } })).toThrow();
  });

  it('the server takes the summary whichever takes ended without a final answer, and names a score only when one was checked [RINS-1] [RECITE-11]', () => {
    fc.assert(
      fc.property(accountArb, fc.array(fc.boolean(), { minLength: 14, maxLength: 14 }), ({ takes, clears }, unfinished) => {
        const recs = records(takes, clears).map((r, i) => (r.kind === 'take' && unfinished[i % 14] ? { ...r, unfinished: true } : r));
        const r = recitationForRevo(recs, TODAY, words);
        if (!r) return;
        const c = validateContext({ ...baseContext, recitation: r });
        expect(c.recitation).toEqual(r);
        const text = recitationText(c.recitation!);
        if (r.takes > 0) expect(text.includes('Score by the page:')).toBe(r.score !== null);
      }),
      { numRuns: 120 },
    );
  });

  it('tells Revo nothing of recitation without takes, or before the word data has loaded [RINS-1]', () => {
    expect(recitationForRevo([], TODAY, words)).toBeNull();
    const [a, b] = PASSAGES[0];
    const recs = records([{ from: a, to: b, offset: 0, strict: false, hidden: false, deleted: false, accuracy: 0.98, secs: 60, marks: [] }], []);
    expect(recitationForRevo(recs, TODAY, null)).toBeNull();
    expect(recitationForRevo(recs, TODAY, words)?.last?.passage.name).toBe('Al-Kahf, 3rd to 4th page');
  });
});

describe('Insights’ Recitation section in words [RINS-2]', () => {
  it('names surahs and ayahs, never pages; counts words first and never Not clear; and says nothing of strength with Smart Tracking off [RINS-2]', () => {
    fc.assert(
      fc.property(accountArb, fc.constantFrom<7 | 30 | 90>(7, 30, 90), ({ takes, clears }, window) => {
        const recs = records(takes, clears);
        const ins = recitationInsights(recs, TODAY, window);
        const lines = [
          scoreLine(ins, `in ${window} days`),
          kindsLine(ins),
          ...ins.slipping.flatMap((p) => [passageName(p.sura, p.from, p.to), slipNote(p, false, TODAY)]),
          ...ins.similar.flatMap((x) => [similarTitle(x), similarNote(x, TODAY)]),
        ].map(plainText);
        for (const line of lines) {
          expect(line).not.toMatch(/\bp(?:ages?|p?\.)\s?\d/);
          // Smart Tracking off: nothing about strength or how often a passage went wrong.
          expect(line).not.toMatch(/strong|weak|rated|rating|wrong in/i);
        }
        // The kinds' numbers are the mistakes; Not clear is said apart, as not counted.
        const kinds = kindsLine(ins);
        if (ins.mistakes > 0) {
          const listed = (kinds.split('.')[0].split(':')[1] ?? '').match(/\d+/g)?.map(Number) ?? [];
          expect(listed.reduce((a, b) => a + b, 0)).toBe(ins.mistakes);
          // Words before harakat and letters.
          const list = kinds.split('.')[0].split(':')[1] ?? '';
          const order = ['wrong', 'skipped', 'extra', 'harakat', 'letter'].map((k) => list.indexOf(` ${k}`)).filter((i) => i >= 0);
          expect([...order].sort((a, b) => a - b)).toEqual(order);
        }
        if (ins.unclear > 0) expect(kinds).toContain('clear enough to check (not counted)');
      }),
      { numRuns: 120 },
    );
  });
});

describe('Mistakes a page in long takes: Insights and Revo [RECITE-24]', () => {
  // Takes anywhere in the Qur'an, from a few words to about ten pages, some kept without their final answer.
  const longArb = fc
    .record({
      start: fc.integer({ min: 0, max: words.count - 1600 }),
      span: fc.integer({ min: 0, max: 1500 }),
      offset: fc.integer({ min: -40, max: 0 }),
      strict: fc.boolean(),
      unfinished: fc.boolean(),
      accuracy: fc.double({ min: 0.9, max: 1, noNaN: true }),
    })
    .chain((t) => fc.array(markArb(t.start, t.start + t.span), { maxLength: 10 }).map((marks) => ({ ...t, marks })));

  const recordsOf = (gen: { start: number; span: number; offset: number; strict: boolean; unfinished: boolean; accuracy: number; marks: Mark[] }[]) =>
    records(
      gen.map((g) => ({ from: g.start, to: g.start + g.span, offset: g.offset, strict: g.strict, hidden: false, deleted: false, accuracy: g.accuracy, secs: 60, marks: g.marks })),
      [],
    ).map((r, i) => (r.kind === 'take' && gen[i].unfinished ? { ...r, unfinished: true } : r));

  it('pools the window’s finished takes of 2 pages or more, each from its first word’s page to its last’s, between the takes’ own rates', () => {
    fc.assert(
      fc.property(fc.array(longArb, { minLength: 1, maxLength: 8 }), (gen) => {
        const recs = recordsOf(gen);
        const ins = recitationInsights(recs, TODAY, 30, words);
        const long = liveTakes(recs).filter(
          (t) => t.day >= ins.from && t.day <= TODAY && !t.unfinished && words.pageOf(t.to) - words.pageOf(t.from) + 1 >= PER_PAGE_FROM,
        );
        if (long.length === 0) {
          expect(ins.perPage).toBeNull();
          expect(perPageLine(ins.perPage)).toBeNull();
          return;
        }
        const pagesOf = (t: TakeRecord) => pagesReached(words, t.from, t.to);
        // Never a tajweed note, a Not clear or a word corrected straight away (RECITE-33).
        const mistakesOf = (t: TakeRecord) => t.marks.filter(isMistake).length;
        expect(ins.perPage).toEqual({ takes: long.length, pages: long.reduce((n, t) => n + pagesOf(t), 0), mistakes: long.reduce((n, t) => n + mistakesOf(t), 0) });
        const p = ins.perPage!;
        const rates = long.map((t) => mistakesOf(t) / pagesOf(t));
        const pooled = p.mistakes / p.pages;
        expect(pooled).toBeGreaterThanOrEqual(Math.min(...rates) - 1e-9);
        expect(pooled).toBeLessThanOrEqual(Math.max(...rates) + 1e-9);
        // Its line: none, under a tenth, or the figure to a tenth; never a page number.
        const line = perPageLine(p)!;
        if (p.mistakes === 0) expect(line).toBe('Takes of 2 pages or more: no mistakes');
        else if (perPageTenths(p) === 0) expect(line).toBe('Takes of 2 pages or more: under 0.1 mistakes a page');
        else expect(line).toMatch(new RegExp(`: ${perPageTenths(p)} mistakes? a page$`));
        expect(line).not.toMatch(/\bp(?:ages?|p?\.)\s?\d/);
      }),
      { numRuns: 150 },
    );
  });

  it('a single long take reads in Insights as its summary does', () => {
    fc.assert(
      fc.property(longArb, (g) => {
        const recs = recordsOf([{ ...g, offset: 0, unfinished: false }]);
        const t = liveTakes(recs)[0];
        const pages = pagesReached(words, t.from, t.to);
        const p = recitationInsights(recs, TODAY, 30, words).perPage;
        const summary = perPageLabel(takeMistakes(t), pages);
        if (pages < PER_PAGE_FROM) {
          expect(p).toBeNull();
          expect(summary).toBeNull();
          return;
        }
        expect(p).toEqual({ takes: 1, pages, mistakes: takeMistakes(t) });
        expect(summary).toBe(`${perPageTenths(p!)} a page`);
      }),
      { numRuns: 150 },
    );
  });

  it('Revo’s server takes the figure as the phone sends it and reads it out, and refuses one that doesn’t add up', () => {
    let sent = 0;
    fc.assert(
      // Finished takes: a window of only unfinished ones sends no score, which the server refuses today (reported apart).
      fc.property(fc.array(longArb.map((g) => ({ ...g, unfinished: false })), { minLength: 1, maxLength: 6 }), (gen) => {
        const recs = recordsOf(gen);
        const r = recitationForRevo(recs, TODAY, words);
        if (!r) return;
        const c = validateContext({ ...baseContext, recitation: r });
        expect(c.recitation).toEqual(r);
        const text = recitationText(c.recitation!);
        if (!r.perPage) {
          expect(text).not.toContain('pages or more');
          return;
        }
        sent += 1;
        expect(r.perPage).toEqual(recitationInsights(recs, TODAY, 28, words).perPage);
        expect(text).toContain(`In their takes of 2 pages or more (`);
        const bad = [
          { ...r.perPage, pages: r.perPage.takes * PER_PAGE_FROM - 1 },
          { ...r.perPage, mistakes: r.mistakes + 1 },
          { ...r.perPage, takes: r.takes + 1, pages: (r.takes + 1) * PER_PAGE_FROM },
          { ...r.perPage, takes: 0 },
          { ...r.perPage, extra: 1 },
        ];
        for (const perPage of bad) expect(() => validateContext({ ...baseContext, recitation: { ...r, perPage } })).toThrow();
      }),
      { numRuns: 80 },
    );
    expect(sent).toBeGreaterThan(0);
  });
});
