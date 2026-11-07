import { dayChangesKey, overlayDayItems, touchesDay, type DayItems } from '../dayItems';
import { manualRevisionItem } from '../../manualRevision';
import type { OutboxEntry, OutboxOp } from '../ops';

const DAY = '2026-11-03';
const UID = 'u1';
const empty: DayItems = { revisions: [], memorized: [], reads: [], doneAhead: [] };
const entry = (id: string, op: OutboxOp): OutboxEntry => ({ id, op, at: 1 });

describe('the day’s items with the waiting changes over them (ACT-13)', () => {
  it('[ACT-13] a Revised item added by hand shows on its day, once even if sent twice', () => {
    const item = manualRevisionItem({ uid: UID, day: DAY, now: 5, pages: [557, 556], minutes: 8 });
    const out = overlayDayItems(empty, [entry('a', { kind: 'revision.add', item }), entry('b', { kind: 'revision.add', item })], DAY, UID);
    expect(out.revisions).toEqual([{ id: item.id, day: DAY, countsFor: DAY, pages: [556, 557], skipped: [], assigned: [], minutes: 8 }]);
    expect(overlayDayItems(empty, [entry('a', { kind: 'revision.add', item })], '2026-11-04', UID)).toBe(empty);
  });

  it('[ACT-13] pages memorized join the day’s item (pages merged, minutes added)', () => {
    const base: DayItems = { ...empty, memorized: [{ id: DAY, day: DAY, pages: [562], minutes: 25 }] };
    const out = overlayDayItems(base, [entry('a', { kind: 'memorization.mark', day: DAY, pages: [563, 562], at: 9, minutes: 10 })], DAY, UID);
    expect(out.memorized).toEqual([{ id: DAY, day: DAY, pages: [562, 563], minutes: 35 }]);
  });

  it('[ACT-13] a memorization removed, or its pages un-memorized, leaves the day', () => {
    const base: DayItems = { ...empty, memorized: [{ id: DAY, day: DAY, pages: [562, 563] }] };
    expect(overlayDayItems(base, [entry('a', { kind: 'memorization.delete', day: DAY, id: DAY })], DAY, UID).memorized).toEqual([]);
    expect(overlayDayItems(base, [entry('a', { kind: 'memorization.unmark', pages: [563] })], DAY, UID).memorized).toEqual([
      { id: DAY, day: DAY, pages: [562] },
    ]);
  });

  it('[ACT-13] a timed read added, its pages changed, then deleted', () => {
    const session = { date: DAY, startedAt: 1000, endedAt: 601000, durationSeconds: 600, mode: 'stopwatch' as const, targetSeconds: null, pages: [562], pagesVisited: [562] };
    const added = overlayDayItems(empty, [entry('a', { kind: 'reading.add', id: 'r1', session })], DAY, UID);
    expect(added.reads).toEqual([{ id: 'r1', day: DAY, pages: [562], minutes: 10, occurredAt: 1000 }]);
    expect(overlayDayItems(added, [entry('b', { kind: 'reading.pages', id: 'r1', pages: [562, 563] })], DAY, UID).reads[0].pages).toEqual([562, 563]);
    expect(overlayDayItems(added, [entry('b', { kind: 'reading.delete', id: 'r1' })], DAY, UID).reads).toEqual([]);
  });

  it('[ACT-13] the day reloads only for changes that touch it', () => {
    const item = manualRevisionItem({ uid: UID, day: DAY, now: 5, pages: [1], minutes: null });
    expect(touchesDay({ kind: 'revision.add', item }, DAY)).toBe(true);
    expect(touchesDay({ kind: 'journal.entry.add', date: DAY, entry: { id: 'n', at: 1, kind: 'note', text: 'x', minutes: null } }, DAY)).toBe(true);
    expect(touchesDay({ kind: 'journal.entry.add', date: '2026-11-02', entry: { id: 'n', at: 1, kind: 'note', text: 'x', minutes: null } }, DAY)).toBe(false);
    expect(touchesDay({ kind: 'usage', seconds: 30 }, DAY)).toBe(false);
    expect(touchesDay({ kind: 'pages', pages: [] }, DAY)).toBe(false);
    const entries = [entry('a', { kind: 'usage', seconds: 30 }), entry('b', { kind: 'revision.add', item })];
    expect(dayChangesKey(entries, DAY)).toBe('b');
  });
});
