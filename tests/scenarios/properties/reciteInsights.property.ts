// Recite insights (RINS-1, Revisely Dev): over generated takes on real ayahs (marks of every kind, Not clear, tajweed at
// Strict, slips into a similar ayah, forgotten takes, Clear now), what lib/reciteInsights counts holds together, and
// what the phone sends Revo (lib/revo/recitation) is exactly what the server takes: the summary with every question,
// and any take attached.
import fc from 'fast-check';
import { quranWords } from '../../../src/lib/recite/__fixtures__/quranWords';
import type { Mark, MarkKind } from '../../../src/lib/reciteLive/contract';
import { isUnclear } from '../../../src/lib/reciteLive/contract';
import { wordMemories } from '../../../src/lib/reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';
import { liveTakes, recitationInsights } from '../../../src/lib/reciteInsights/insights';
import { recitationForRevo, takeAttachment } from '../../../src/lib/revo/recitation';
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

  it('tells Revo nothing of recitation without takes, or before the word data has loaded [RINS-1]', () => {
    expect(recitationForRevo([], TODAY, words)).toBeNull();
    const [a, b] = PASSAGES[0];
    const recs = records([{ from: a, to: b, offset: 0, strict: false, hidden: false, deleted: false, accuracy: 0.98, secs: 60, marks: [] }], []);
    expect(recitationForRevo(recs, TODAY, null)).toBeNull();
    expect(recitationForRevo(recs, TODAY, words)?.last?.passage.name).toBe('Al-Kahf, ayahs 17–26');
  });
});
