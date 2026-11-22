// Recite's memory (lib/reciteMemory/memory): when a word's remembered mistake clears, against a model of the rule
// written out step by step; and a take's passage history (lib/reciteMemory/history, RMEM-7), against its own model.

import fc from 'fast-check';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import { isUnclear } from '../../../src/lib/reciteLive/contract';
import { formatAccuracy, mistakesLabel } from '../../../src/lib/reciteLive/score';
import { historyRows, HISTORY_MAX, passageHistory } from '../../../src/lib/reciteMemory/history';
import { CLEAR_AFTER, memoryOfWord, openInRange, wordMemories } from '../../../src/lib/reciteMemory/memory';
import type { ClearRecord, MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';
import { runs } from './fixtures';

const W = 31453;
const DAY_MS = 86_400_000;
const T0 = Date.UTC(2026, 10, 1, 20);

/** One thing that happens to the word, in order: a take (wrong, right, or Not clear on its harakat), or Clear now. */
type Step =
  | { kind: 'take'; dayGap: 0 | 1 | 2; result: 'wrong' | 'right' | 'unclear'; group: 'word' | 'slip' | 'tajweed'; strict: boolean; reaches: boolean }
  | { kind: 'clear'; dayGap: 0 | 1; group: 'word' | 'slip' | 'tajweed' };

const groupArb = fc.constantFrom<'word' | 'slip' | 'tajweed'>('word', 'slip', 'tajweed');
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant<'take'>('take'),
      dayGap: fc.constantFrom<0 | 1 | 2>(0, 1, 2),
      result: fc.constantFrom<'wrong' | 'right' | 'unclear'>('wrong', 'right', 'right', 'unclear'),
      group: groupArb,
      strict: fc.boolean(),
      reaches: fc.constantFrom(true, true, false),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant<'clear'>('clear'), dayGap: fc.constantFrom<0 | 1>(0, 1), group: groupArb }) },
);

function markFor(group: 'word' | 'slip' | 'tajweed', sure: 'clear' | 'likely'): Mark {
  if (group === 'word') return { id: `${W}:word:`, w: W, ayah: [12, 88], kind: 'word', sure };
  if (group === 'slip') return { id: `${W}:harakat:`, w: W, ayah: [12, 88], kind: 'harakat', sure };
  return { id: `${W}:tajweed:ghunnah`, w: W, ayah: [12, 88], kind: 'tajweed', rule: 'ghunnah', sure };
}

/** The steps as records, a minute apart (or a day or two). */
function recordsOf(steps: Step[]): MemoryRecord[] {
  let at = T0;
  let day = 0;
  return steps.map((s, i): MemoryRecord => {
    day += s.dayGap;
    at = Math.max(at + 60_000, T0 + day * DAY_MS);
    const dayText = new Date(T0 + day * DAY_MS).toISOString().slice(0, 10);
    if (s.kind === 'clear') {
      const c: ClearRecord = { id: `c${i}`, kind: 'clear', createdAt: at, rev: at, day: dayText, w: W, group: s.group };
      return c;
    }
    const marks =
      s.result === 'wrong' ? [markFor(s.group, 'clear')] : s.result === 'unclear' && s.group === 'slip' ? [markFor('slip', 'likely')] : [];
    const t: TakeRecord = {
      id: `t${i}`,
      kind: 'take',
      take: null,
      createdAt: at,
      rev: at,
      day: dayText,
      level: s.strict ? 'strict' : 'words',
      hidden: false,
      from: s.reaches ? W - 10 : W + 1,
      to: s.reaches ? W + 10 : W + 20,
      secs: 60,
      mistakes: marks.length,
      tajweed: 0,
      unclear: 0,
      accuracy: 1,
      marks,
      passed: [],
      recordingId: null,
    };
    return t;
  });
}

/** The rule, step by step, for one group: is it marked at the end, and how many right days since the last mistake. */
function model(steps: Step[], group: 'word' | 'slip' | 'tajweed'): { everMarked: boolean; open: boolean; days: number } {
  let everMarked = false;
  let open = false;
  let days = new Set<number>();
  let day = 0;
  for (const s of steps) {
    day += s.dayGap;
    if (s.kind === 'clear') {
      if (s.group === group) {
        open = false;
        days = new Set();
      }
      continue;
    }
    const checked = s.reaches && (group !== 'tajweed' || s.strict);
    if (!checked) continue;
    // Wrong, or (harakat and letters) heard only as Not clear: not said clearly (Majd's Nov 20 (a): Not clear is
    // remembered like a slip until said clearly).
    if (s.group === group && (s.result === 'wrong' || (group === 'slip' && s.result === 'unclear'))) {
      // A tajweed note comes only from a take that checked tajweed.
      everMarked = true;
      open = true;
      days = new Set();
      continue;
    }
    if (open) {
      days.add(day);
      if (days.size >= CLEAR_AFTER) open = false;
    }
  }
  return { everMarked, open, days: open ? days.size : 0 };
}

/** A tajweed mark only ever comes from a take at Strict that reached the word (the checker sends none otherwise). */
const valid = (steps: Step[]) => steps.map((s) => (s.kind === 'take' && s.group === 'tajweed' && s.result === 'wrong' ? { ...s, strict: true, reaches: true } : s));

describe("Recite's memory", () => {
  it('[RMEM-2] a mistake clears after two right takes in a row on two different days; wrong again starts over; Clear now clears it', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 14 }), (raw) => {
        // A take marks only words it reached.
        const steps = valid(raw.map((s) => (s.kind === 'take' && (s.result === 'wrong' || s.result === 'unclear') ? { ...s, reaches: true } : s)));
        const memories = wordMemories(recordsOf(steps));
        for (const group of ['word', 'slip', 'tajweed'] as const) {
          const m = model(steps, group);
          const got = memories.get(`${W}|${group}`);
          if (!m.everMarked) {
            expect(got).toBeUndefined();
            continue;
          }
          expect({ group, open: got?.open, rightDays: got?.rightDays }).toEqual({ group, open: m.open, rightDays: m.days });
          expect(got?.needed).toBe(m.open ? CLEAR_AFTER - m.days : 0);
        }
        // The page shows a word at most once, with its most severe open group.
        const shown = openInRange(memories, W, W + 1);
        expect(shown.length).toBeLessThanOrEqual(1);
        const open = (['word', 'slip', 'tajweed'] as const).filter((g) => memories.get(`${W}|${g}`)?.open);
        expect(shown[0]?.group ?? null).toBe(open.includes('word') ? 'word' : open.includes('slip') ? 'slip' : open.includes('tajweed') ? 'tajweed' : null);
        if (shown.length) expect(memoryOfWord(memories, W)?.group).toBe(shown[0].group);
      }),
      { numRuns: runs(400) },
    );
  });

  it('[RMEM-2] a forgotten take leaves the memory as if it had never happened', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { minLength: 1, maxLength: 10 }), fc.nat(), (raw, pick) => {
        const records = recordsOf(valid(raw));
        const takes = records.filter((r) => r.kind === 'take');
        if (takes.length === 0) return;
        const gone = takes[pick % takes.length];
        const forgotten = records.map((r) => (r.id === gone.id ? { ...r, deleted: true } : r));
        const without = records.filter((r) => r.id !== gone.id);
        const a = wordMemories(forgotten);
        const b = wordMemories(without);
        expect([...a.keys()].sort()).toEqual([...b.keys()].sort());
        for (const [k, m] of a) expect({ open: m.open, rightDays: m.rightDays }).toEqual({ open: b.get(k)?.open, rightDays: b.get(k)?.rightDays });
      }),
      { numRuns: runs(200) },
    );
  });
});

// ------------------------------------------------------------------ RMEM-7: a take's passage history

const words = require('../../../src/lib/recite/__fixtures__/quranWords').quranWords();
/** Yusuf 87's first word: the passages here sit around it. */
const P0 = words.verseRange(12, 87)[0];
const NOW = Date.UTC(2026, 10, 22, 20);

type Past = { start: number; length: number; minutesAgo: number; deleted: boolean; unfinished: boolean; kinds: Mark['kind'][]; unclear: boolean[] };
const kindArb = fc.constantFrom<Mark['kind']>('word', 'skipped', 'added', 'harakat', 'letter', 'tajweed');
const pastArb: fc.Arbitrary<Past> = fc.record({
  start: fc.integer({ min: -150, max: 150 }),
  length: fc.integer({ min: 1, max: 260 }),
  // From two months before the take to an hour after it.
  minutesAgo: fc.integer({ min: -60, max: 60 * 24 * 60 }),
  deleted: fc.integer({ min: 0, max: 9 }).map((n) => n < 2),
  unfinished: fc.integer({ min: 0, max: 9 }).map((n) => n < 2),
  kinds: fc.array(kindArb, { maxLength: 6 }),
  unclear: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
});

/** A take as Recite's memory keeps it: its mistakes counted as the summary counts them (tajweed and Not clear apart). */
function pastTake(p: Past, i: number): TakeRecord {
  const from = P0 + p.start;
  const createdAt = NOW - p.minutesAgo * 60_000;
  const marks: Mark[] = p.kinds.map((kind, k) => ({
    id: `${i}:${k}`,
    w: from + Math.min(k, p.length - 1),
    ayah: [12, 87],
    kind,
    sure: (kind === 'harakat' || kind === 'letter') && p.unclear[k] ? 'likely' : 'clear',
  }));
  const summaryCount = marks.filter((m) => m.kind !== 'tajweed' && !isUnclear(m)).length;
  return {
    id: `p${i}`,
    kind: 'take',
    take: null,
    createdAt,
    rev: createdAt,
    day: new Date(createdAt).toISOString().slice(0, 10),
    level: 'strict',
    hidden: false,
    from,
    to: from + p.length - 1,
    secs: 60,
    mistakes: summaryCount,
    tajweed: marks.filter((m) => m.kind === 'tajweed').length,
    unclear: marks.filter(isUnclear).length,
    accuracy: Math.max(0, 1 - summaryCount / p.length),
    marks,
    passed: [],
    recordingId: null,
    ...(p.deleted ? { deleted: true } : {}),
    ...(p.unfinished ? { unfinished: true } : {}),
  };
}

describe("A take's passage history", () => {
  it('[RMEM-7] the summary lists the takes of the same stretch before this one (sharing at least half of each), newest first, five at most; never a forgotten or unfinished one', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 3, max: 140 }), fc.array(pastArb, { maxLength: 14 }), (start, length, pasts) => {
        const current = { id: 'now', createdAt: NOW, from: P0 + start, to: P0 + start + length - 1 };
        const takes = pasts.map(pastTake);
        // This take is in the account's records too, once kept: never its own history.
        const self = { ...pastTake({ start, length, minutesAgo: 0, deleted: false, unfinished: false, kinds: [], unclear: [] }, 0), id: 'now' };
        const records = [...takes, self];
        // The rule, written out.
        const len = (r: { from: number; to: number }) => r.to - r.from + 1;
        const shared = (r: { from: number; to: number }) => Math.min(r.to, current.to) - Math.max(r.from, current.from) + 1;
        const expected = takes
          .filter((r) => !r.deleted && !r.unfinished && r.createdAt < NOW)
          .filter((r) => shared(r) > 0 && shared(r) * 2 >= len(r) && shared(r) * 2 >= len(current))
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, HISTORY_MAX)
          .map((r) => r.id);
        const got = passageHistory(records, current);
        expect(got.map((r) => r.id)).toEqual(expected);
        // Each row: its day in words (never a date), its score, and its mistakes as the summary counts them.
        for (const row of historyRows(words, current, got, NOW)) {
          expect(row.when).toMatch(/^(Earlier today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d+ (days?|weeks?|months?) ago)$/);
          expect(row.score).toBe(formatAccuracy(row.take.accuracy));
          const counted = row.take.marks.filter((m) => m.kind !== 'tajweed' && !isUnclear(m)).length;
          expect(row.detail.split(' · ')).toContain(mistakesLabel(counted));
          expect(row.label).toContain(row.when);
          expect(row.label).toContain(mistakesLabel(counted));
        }
      }),
      { numRuns: runs(300) },
    );
  });
});

