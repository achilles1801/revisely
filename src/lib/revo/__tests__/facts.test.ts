// What + attaches, worked out by hand for a small account: Juz 30's first ten pages, two a day from
// Sunday Nov 1 (Nov 1: 582–583, Nov 2: 584–585, … Nov 6: 582–583 again), asked on Saturday Nov 7.
import type { RevisionLog, User, UserPage } from '../../../types';
import { recomputePagesFromLogs } from '../../algorithm';
import { todaySnapshot } from '../../todaySnapshot';
import { dayAttachment, findPassages, juzAttachment, pagesAttachment, surahAttachment } from '../attachments';
import { dayFacts, dayPreview, passageFacts, passagePreview, prepare, type FactSources } from '../facts';
import type { RevoPassageFacts } from '../types';

const user = {
  id: 'u1',
  createdAt: '2026-10-01T12:00:00',
  scheduleAnchorDate: '2026-11-01T12:00:00',
  dailyPageCapacity: 2,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
  locationCoords: null,
} as unknown as User;

const log = (date: string, pagesRevised: number[], extra: Partial<RevisionLog> = {}): RevisionLog => ({
  id: date,
  date,
  assignedPages: pagesRevised,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...extra,
});

const logs: RevisionLog[] = [
  log('2026-11-01', [582, 583], { durationMinutes: 20, weaknessUpdates: [{ page: 583, rating: 2 }] }),
  // 585 left, caught up on Nov 4 (credited back to Nov 2).
  log('2026-11-02', [584], { assignedPages: [584, 585], pagesSkipped: [585], durationMinutes: 10 }),
  // Nov 3 missed: 586–587 never revised.
  log('2026-11-04', [588, 589, 585], { assignedPages: [588, 589], ahead: { '2026-11-02': [585] }, durationMinutes: 12.4 }),
  // 582 revised ahead for Nov 6.
  log('2026-11-05', [590, 591, 582], { assignedPages: [590, 591], ahead: { '2026-11-06': [582] } }),
  log('2026-11-06', [583], { assignedPages: [582, 583], durationMinutes: 6 }),
];

const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) => ({
  pageNumber: 582 + i,
  status: 'memorized',
  dateMemorized: i < 2 ? '2026-11-07T09:00:00' : '2026-09-01T09:00:00',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const pages = recomputePagesFromLogs(memorized, logs);
const TODAY = '2026-11-07';

function sources(over: Partial<FactSources> = {}): FactSources {
  const snapshot = todaySnapshot({ user, pages, logs, day: TODAY, assignment: [584, 585], history: null, now: Date.parse('2026-11-07T10:00:00') });
  return { user, pages, logs, history: null, snapshot, now: Date.parse('2026-11-07T10:00:00'), ...over };
}

describe('a surah: An-Naba (582–583)', () => {
  const f = passageFacts([582, 583], prepare(sources()));

  it('times revised: each page twice this week, on three days', () => {
    expect(f.memorized).toBe(2);
    expect(f.revised.last7).toEqual({ days: 3, minEach: 2, maxEach: 2 });
    expect(f.revised.last30).toEqual({ days: 3, minEach: 2, maxEach: 2 });
    expect(f.revised.all).toEqual({ days: 3, minEach: 2, maxEach: 2 });
  });

  it('last revised yesterday; 582 left longest, two days ago', () => {
    expect(f.lastRevisedDaysAgo).toBe(1);
    expect(f.oldest).toMatchObject({ page: 582, daysAgo: 2 });
    expect(f.neverRevised).toBe(0);
  });

  it('on the plan: Nov 1 on the day, Nov 6 with 582 revised ahead on Nov 5', () => {
    expect(f.plan.last7).toEqual({ days: 2, pages: 4, onDay: 3, late: 0, ahead: 1, skipped: 0, skippedDays: 0 });
  });

  it('strength as Insights counts it, the weak page as a weak spot', () => {
    expect(f.strength).toEqual({ weak: 1, moderate: 0, strong: 1, unrated: 0, average: 3 });
    expect(f.weakSpots).toEqual([{ name: expect.stringContaining('An-Naba'), pages: [583], rating: 2 }]);
  });

  it('not today; next on Wednesday, in four days', () => {
    expect(f.today).toBeNull();
    expect(f.next).toEqual({ inDays: 4, pages: 2 });
  });

  it('named by its surah, never by page number', () => {
    expect(f.name).toMatch(/^An-Naba/);
    expect(f.name).not.toMatch(/\b58\d\b/);
  });
});

describe('pages of a day that was missed and one caught up', () => {
  const f = passageFacts([584, 585, 586, 587], prepare(sources()));
  it('Nov 2: 585 carried over and caught up; Nov 3: both missed; today: two pages, none done', () => {
    expect(f.plan.last7).toEqual({ days: 2, pages: 4, onDay: 1, late: 1, ahead: 0, skipped: 2, skippedDays: 1 });
    expect(f.today).toEqual({ pages: 2, done: 0 });
    expect(f.neverRevised).toBe(2);
    expect(f.revised.last7).toEqual({ days: 2, minEach: 0, maxEach: 1 });
    expect(f.strength).toEqual({ weak: 0, moderate: 0, strong: 2, unrated: 2, average: 4 });
    expect(f.oldest).toMatchObject({ daysAgo: null });
  });
});

describe('days', () => {
  const p = prepare(sources());
  it('Nov 2: one on the day, one caught up later: done for the streak', () => {
    const d = dayFacts('2026-11-02', p, { journal: [], readings: [], recordings: [] });
    expect(d.daysAgo).toBe(5);
    expect(d.plan).toMatchObject({ pages: 2, onDay: 1, late: 1, ahead: 0, notDone: 0, carried: 0, done: true });
    expect(d.revised).toMatchObject({ pages: 1, forLater: 0, forEarlier: 0 });
    expect(d.minutes).toBe(10);
  });
  it('Nov 3: missed, not done; no time recorded', () => {
    const d = dayFacts('2026-11-03', p);
    expect(d.plan).toMatchObject({ pages: 2, onDay: 0, notDone: 2, done: false });
    expect(d.revised.pages).toBe(0);
    expect(d.minutes).toBeNull();
    expect(d.notes).toBeNull();
    expect(d.readMinutes).toBeNull();
  });
  it('Nov 4: its own pages, and one catching up Nov 2; minutes rounded', () => {
    const d = dayFacts('2026-11-04', p);
    expect(d.plan).toMatchObject({ pages: 2, onDay: 2, done: true });
    expect(d.revised).toMatchObject({ pages: 3, forLater: 0, forEarlier: 1 });
    expect(d.minutes).toBe(12);
  });
  it('Nov 5: one page ahead for Nov 6', () => {
    expect(dayFacts('2026-11-05', p).revised).toMatchObject({ pages: 3, forLater: 1, forEarlier: 0 });
  });
  it('Nov 1: a weak rating, named', () => {
    const d = dayFacts('2026-11-01', p);
    expect(d.ratings).toEqual({ weak: 1, moderate: 0, strong: 0, weakName: expect.stringContaining('An-Naba'), weakPages: [583] });
  });
  it("today as Home has it: two pages, none done; memorized today; the day's notes, readings and recordings", () => {
    const d = dayFacts(TODAY, p, {
      journal: [{ date: TODAY, entries: [{ id: 'a', at: 1, kind: 'note', text: '  Felt rushed  ', minutes: null }, { id: 'b', at: 2, kind: 'note', text: ' ', minutes: null }] } as never],
      readings: [{ id: 'r', date: TODAY, startedAt: 1, endedAt: 2, durationSeconds: 610, mode: 'stopwatch', targetSeconds: null, pages: [], pagesVisited: [] }],
      recordings: [{ id: 'x', day: TODAY, kind: 'revision', durationMs: 150_000, pageMarks: [], createdAt: 1 } as never],
    });
    expect(d.daysAgo).toBe(0);
    expect(d.plan).toMatchObject({ pages: 2, onDay: 0, ahead: 0, late: 0, notDone: 2, done: false });
    expect(d.memorized.pages).toBe(2);
    expect(d.notes).toEqual(['Felt rushed']);
    expect(d.readMinutes).toBe(10);
    expect(d.recordings).toEqual({ count: 1, minutes: 3 });
    expect(dayPreview(d)).toBe('0 of 2 pages · 1 recording · includes 1 note');
  });
});

describe('attachments', () => {
  const p = prepare(sources());
  it('a surah, a juz and pages carry their facts and labels', () => {
    const s = surahAttachment(78, p);
    expect(s).toMatchObject({ kind: 'surah', label: 'An-Naba', surah: 78 });
    const j = juzAttachment(30, p);
    expect(j).toMatchObject({ kind: 'juz', label: 'Juz 30', juz: 30 });
    expect((j as { facts: RevoPassageFacts }).facts.pages).toBe(23);
    expect((j as { facts: RevoPassageFacts }).facts.memorized).toBe(10);
    const pg = pagesAttachment([586, 584, 585, 584], p);
    expect(pg).toMatchObject({ kind: 'pages', pages: [584, 585, 586] });
  });
  it('a day with notes says so in its label', () => {
    const a = dayAttachment(TODAY, 'Today · Sat 7 Nov', p, { journal: [{ date: TODAY, entries: [{ id: 'a', at: 1, kind: 'note', text: 'x', minutes: null }] } as never] });
    expect(a.label).toBe('Today · Sat 7 Nov · 1 note');
  });
  it('previews: a line of the data for a picker row', () => {
    expect(passagePreview(passageFacts([582, 583], p))).toBe('Revised 2× in 30 days · 1 weak spot');
    expect(passagePreview(passageFacts([1], p))).toBe('Not memorized');
  });
});

describe('search', () => {
  it('finds a juz, a page and surahs by name', () => {
    expect(findPassages('Juz 14')).toEqual([{ kind: 'juz', juz: 14, label: 'Juz 14' }]);
    expect(findPassages('juz 31')).toEqual([]);
    expect(findPassages('p. 288')).toEqual([{ kind: 'pages', pages: [288], label: expect.any(String) }]);
    expect(findPassages('yusuf')).toEqual([{ kind: 'surah', surah: 12, label: 'Yusuf' }]);
  });
});
