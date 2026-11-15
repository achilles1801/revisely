// Recite's memory (lib/reciteMemory/memory): when a word's remembered mistake clears, against a model of the rule
// written out step by step.

import fc from 'fast-check';
import type { Mark } from '../../../src/lib/reciteLive/contract';
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
    if (s.group === group && s.result === 'wrong') {
      // A tajweed note comes only from a take that checked tajweed.
      everMarked = true;
      open = true;
      days = new Set();
      continue;
    }
    // A take that heard this word's harakat only as Not clear isn't a try at them.
    if (group === 'slip' && s.group === 'slip' && s.result === 'unclear') continue;
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
        const steps = valid(raw.map((s) => (s.kind === 'take' && s.result === 'wrong' ? { ...s, reaches: true } : s)));
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
