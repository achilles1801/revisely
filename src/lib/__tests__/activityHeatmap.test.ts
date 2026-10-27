import { ActivityDay, emptyActivityDay } from '../activity';
import {
  activityScore,
  dayFacts,
  heatCellLabel,
  heatDayLabel,
  heatLevel,
  heatmapWeeks,
  monthLabels,
} from '../activityHeatmap';
import { buildActivityItems, filterActivityItems } from '../activityItems';
import { emptyJournalEntry } from '../journal';
import type { ReadingSession, RevisionLog } from '../../types';

const log = (date: string, pages: number[], durationMinutes: number | null = null): RevisionLog => ({
  id: `log-${date}`,
  date,
  pagesRevised: pages,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes,
});

const reading = (date: string, minutes: number, pages: number[] = [], endedAt = 1): ReadingSession => ({
  id: `r-${date}-${minutes}`,
  date,
  startedAt: endedAt - minutes * 60_000,
  endedAt,
  durationSeconds: minutes * 60,
  mode: 'stopwatch',
  targetSeconds: null,
  pages,
  pagesVisited: [],
});

const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

function day(over: Partial<ActivityDay>): ActivityDay {
  return { ...emptyActivityDay('2026-10-24'), ...over };
}

describe('heatmap levels', () => {
  it('scores pages revised, minutes timed and minutes logged; a session’s own duration is not added', () => {
    expect(activityScore(day({ revisions: [log('2026-10-24', range(1, 20), 41)] }))).toBe(20);
    expect(activityScore(day({ readings: [reading('2026-10-24', 34)] }))).toBe(34);
    expect(
      activityScore(day({ journal: { ...emptyJournalEntry('2026-10-24'), memorizationMinutes: 15, revisionMinutes: 5 } })),
    ).toBe(20);
  });

  it('nothing is 0; any activity at least 1; a juz is 3; a juz with its time, or two, is 4', () => {
    expect(heatLevel(undefined)).toBe(0);
    expect(heatLevel(day({}))).toBe(0);
    expect(heatLevel(day({ recordings: 1 }))).toBe(1);
    expect(heatLevel(day({ journal: { ...emptyJournalEntry('2026-10-24'), notes: 'Tired' } }))).toBe(1);
    expect(heatLevel(day({ revisions: [log('2026-10-24', range(1, 5))] }))).toBe(1);
    expect(heatLevel(day({ revisions: [log('2026-10-24', range(1, 10))] }))).toBe(2);
    expect(heatLevel(day({ revisions: [log('2026-10-24', range(1, 20))] }))).toBe(3);
    expect(heatLevel(day({ revisions: [log('2026-10-24', range(1, 20))], readings: [reading('2026-10-24', 25)] }))).toBe(4);
    expect(heatLevel(day({ revisions: [log('2026-10-24', range(1, 40))] }))).toBe(4);
  });
});

describe('heatmap grid', () => {
  it('weeks run Sunday to Saturday, the last holding today; later days are empty', () => {
    // 2026-10-26 is a Monday.
    const weeks = heatmapWeeks('2026-10-26', 3);
    expect(weeks).toHaveLength(3);
    expect(weeks[2]).toEqual(['2026-10-25', '2026-10-26', null, null, null, null, null]);
    expect(weeks[1][0]).toBe('2026-10-18');
    expect(weeks[0][6]).toBe('2026-10-17');
  });

  it('labels the column where each month starts, dropping a first label the next would crowd', () => {
    const weeks = heatmapWeeks('2026-10-26', 10);
    // Columns start Aug 23, Aug 30, Sep 6 … Oct 25.
    expect(monthLabels(weeks)).toEqual([
      { index: 2, label: 'Sep' },
      { index: 6, label: 'Oct' },
    ]);
    expect(monthLabels(heatmapWeeks('2026-10-26', 12))[0]).toEqual({ index: 0, label: 'Aug' });
  });
});

describe('the selected day, in words', () => {
  it('pages revised, pages read, time, recordings', () => {
    const d = day({
      revisions: [log('2026-10-24', range(1, 12), 20)],
      readings: [reading('2026-10-24', 14, range(100, 18))],
      recordings: 1,
    });
    expect(dayFacts(d)).toEqual(['12 pages revised', '18 read', '34 min', '1 recording']);
    expect(dayFacts(day({ readings: [reading('2026-10-24', 70, [5])] }))).toEqual(['1 page read', '1h 10m']);
    expect(dayFacts(day({ journal: { ...emptyJournalEntry('2026-10-24'), notes: 'Tired' } }))).toEqual(['Daily log']);
    expect(dayFacts(undefined)).toEqual([]);
  });

  it('dates read short, with the year only when it differs; VoiceOver hears them in full', () => {
    expect(heatDayLabel('2026-10-24', '2026-10-26')).toBe('Sat, Oct 24');
    expect(heatDayLabel('2025-10-24', '2026-10-26')).toBe('Fri, Oct 24, 2025');
    expect(heatCellLabel('2026-10-24', day({ recordings: 2 }))).toBe('Saturday, October 24: 2 recordings');
    expect(heatCellLabel('2026-10-23', undefined)).toBe('Friday, October 23: no activity');
  });
});

describe('activity items (Recent and See all)', () => {
  const items = buildActivityItems({
    logs: [log('2026-10-26', range(503, 20), 41), log('2026-10-20', [])],
    readings: [reading('2026-10-25', 12, range(293, 12), 2_000), reading('2026-10-25', 5, [], 1_000)],
    journal: [
      { ...emptyJournalEntry('2026-10-24'), memorization: '1/2 p3', memorizationMinutes: 30 },
      emptyJournalEntry('2026-10-23'),
    ],
    recordings: [{ id: 'rec1', day: '2026-10-26', createdAt: 5_000, durationMs: 312_000, kind: 'revision', pageMarks: [{ page: 503 }] }],
  });

  it('one per thing done, newest first; empty logs and sessions without pages are left out', () => {
    expect(items.map((i) => [i.kind, i.day, i.title])).toEqual([
      ['revision', '2026-10-26', 'Revised 20 pages'],
      ['recording', '2026-10-26', 'Recorded 5:12'],
      ['reading', '2026-10-25', 'Read for 12 min'],
      ['reading', '2026-10-25', 'Read for 5 min'],
      ['log', '2026-10-24', 'Daily log'],
    ]);
    expect(items[0]).toMatchObject({ detail: 'Pages 503–522 · 41 min · Al-Ahqaf to Adh-Dhariyat', done: true });
    expect(items[1].detail).toBe('Page 503 · During revision');
    expect(items[2].detail).toBe('Pages 293–304 · Al-Isra to Al-Kahf');
    expect(items[3].detail).toBe('Timed session');
    expect(items[4].detail).toBe('Memorized 1/2 p3 · 30 min');
  });

  it('search matches every word, across pages, surahs, dates and notes; filters by kind and date', () => {
    const today = '2026-10-26';
    expect(filterActivityItems(items, { query: 'kahf' }, today).map((i) => i.key)).toEqual(['reading-r-2026-10-25-12']);
    expect(filterActivityItems(items, { query: 'saturday p3' }, today).map((i) => i.kind)).toEqual(['log']);
    expect(filterActivityItems(items, { query: 'oct 26' }, today)).toHaveLength(2);
    expect(filterActivityItems(items, { query: 'Al-Kahf' }, today)).toHaveLength(1);
    expect(filterActivityItems(items, { query: '1/2' }, today)).toHaveLength(1);
    expect(filterActivityItems(items, { query: 'ahf' }, today)).toHaveLength(0);
    // A surah in the middle of a session's pages (503–522 runs through Muhammad and Al-Fath).
    expect(filterActivityItems(items, { query: 'fath' }, today).map((i) => i.kind)).toEqual(['revision']);
    expect(filterActivityItems(items, { kind: 'reading' }, today)).toHaveLength(2);
    expect(filterActivityItems(items, { kind: 'revision', query: 'kahf' }, today)).toHaveLength(0);
    expect(filterActivityItems(items, { range: 'last7' }, today)).toHaveLength(5);
    expect(filterActivityItems(items, { range: '2026-09' }, today)).toHaveLength(0);
  });
});
