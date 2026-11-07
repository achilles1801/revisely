import { buildDayView, juzLabelFor } from '../activityDayView';
import { getPagesForJuz } from '../quranData';

const DAY = '2026-11-03';
const empty = { revisions: [], memorized: [], reads: [], notes: [] };

describe('the Activity day view (C2)', () => {
  it('has four blocks in order, always', () => {
    const v = buildDayView(DAY, empty, new Set());
    expect(v.blocks.map((b) => b.kind)).toEqual(['revised', 'memorized', 'read', 'notes']);
  });

  it('builds one Revised block from the day’s own item, and lists the credit to later days apart', () => {
    const v = buildDayView(
      DAY,
      {
        ...empty,
        revisions: [
          { id: DAY, day: DAY, countsFor: DAY, pages: [1, 2], skipped: [], assigned: [1, 2, 3], minutes: 10 },
          { id: `${DAY}-ahead-2026-11-04`, day: DAY, countsFor: '2026-11-04', pages: [9], skipped: [], assigned: [], minutes: null },
        ],
      },
      new Set([1, 2, 3, 9]),
    );
    const rev = v.blocks[0];
    expect(rev).toMatchObject({ kind: 'revised', revised: [1, 2], assigned: [1, 2, 3], credits: [{ countsFor: '2026-11-04', pages: [9] }] });
  });

  it('a revision of another day stays out of this day', () => {
    const v = buildDayView(
      DAY,
      { ...empty, revisions: [{ id: '2026-11-02', day: '2026-11-02', countsFor: '2026-11-02', pages: [1], skipped: [], assigned: [1], minutes: null }] },
      new Set([1]),
    );
    expect(v.blocks[0]).toMatchObject({ revised: [] });
  });

  it('labels a session assigned a whole juz as “Juz X”', () => {
    const juz30 = getPagesForJuz(30);
    expect(juzLabelFor(juz30, new Set(juz30))).toBe('Juz 30');
  });

  it('keeps the label when some of the juz was skipped (d1: “Juz 28”, 18 of 20)', () => {
    const juz28 = getPagesForJuz(28);
    const v = buildDayView(
      DAY,
      {
        revisions: [{ id: DAY, day: DAY, countsFor: DAY, pages: juz28.slice(2), skipped: juz28.slice(0, 2), assigned: juz28, minutes: 34 }],
        memorized: [],
        reads: [],
        notes: [],
      },
      new Set(juz28),
    );
    expect((v.blocks[0] as { juzLabel: string | null }).juzLabel).toBe('Juz 28');
  });

  it('does not label an assignment of part of a juz', () => {
    const juz30 = getPagesForJuz(30);
    expect(juzLabelFor(juz30.slice(0, 5), new Set(juz30))).toBeNull();
  });

  it('a juz only counts its memorized pages', () => {
    const juz30 = getPagesForJuz(30);
    const memorized = new Set(juz30.slice(0, 3));
    expect(juzLabelFor(juz30.slice(0, 3), memorized)).toBe('Juz 30');
  });

  it('lists memorized, read and note items of the day only', () => {
    const v = buildDayView(
      DAY,
      {
        ...empty,
        memorized: [{ id: DAY, day: DAY, pages: [5] }, { id: '2026-11-02', day: '2026-11-02', pages: [6] }],
        reads: [{ id: 'r', day: DAY, pages: [7], minutes: 4 }],
        notes: [{ id: 'n', day: DAY, text: 'felt steady', kind: 'note' }],
      },
      new Set(),
    );
    expect(v.blocks[1]).toEqual({ kind: 'memorized', items: [{ id: DAY, day: DAY, pages: [5] }] });
    expect(v.blocks[2]).toEqual({ kind: 'read', items: [{ id: 'r', day: DAY, pages: [7], minutes: 4 }] });
    expect(v.blocks[3]).toEqual({ kind: 'notes', items: [{ id: 'n', day: DAY, text: 'felt steady', kind: 'note' }] });
  });
});

