// Revo's charts answer a touch: what a picked day or passage says, worked out for a small account
// (the one facts.test uses): Juz 30's first ten pages, two a day from Sunday Nov 1, asked Nov 7.
import type { RevisionLog, User, UserPage } from '../../../types';
import { recomputePagesFromLogs } from '../../algorithm';
import { describePassage, plainText } from '../../passages';
import { todaySnapshot } from '../../todaySnapshot';
import {
  agoWords,
  dailyPagesData,
  dayDetail,
  dayMonth,
  juzMapData,
  juzReadout,
  juzStrip,
  juzSummary,
  dotSizeFor,
  knownChart,
  nearestMark,
  pageDetail,
  passagePagesOf,
  pageRatingsData,
  plannedOf,
  ratingsDotReadout,
  ratingsOn,
  ratingsRowReadout,
  revisedBefore,
  slotAt,
  stepIndex,
  stripEnds,
  timelineData,
  timelineDetail,
  timelineHint,
  timelineReadout,
  timesWord,
} from '../charts';
import { dayFacts, prepare, type FactSources } from '../facts';
import type { RevoChart } from '../types';

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
  log('2026-11-01', [582, 583], { durationMinutes: 20, weaknessUpdates: [{ page: 583, rating: 2 }, { page: 582, rating: 5 }] }),
  // 585 left, caught up on Nov 4 (credited back to Nov 2).
  log('2026-11-02', [584], { assignedPages: [584, 585], pagesSkipped: [585], durationMinutes: 10 }),
  // Nov 3 missed: 586–587 never revised.
  log('2026-11-04', [588, 589, 585], { assignedPages: [588, 589], ahead: { '2026-11-02': [585] }, durationMinutes: 12.4 }),
  log('2026-11-05', [590, 591, 582], { assignedPages: [590, 591], ahead: { '2026-11-06': [582] }, weaknessUpdates: [{ page: 582, rating: 3 }] }),
  log('2026-11-06', [583], { assignedPages: [582, 583], durationMinutes: 6, weaknessUpdates: [{ page: 583, rating: 1 }] }),
];

const memorized: UserPage[] = Array.from({ length: 10 }, (_, i) => ({
  pageNumber: 582 + i,
  status: 'memorized',
  dateMemorized: '2026-09-01T09:00:00',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const pages = recomputePagesFromLogs(memorized, logs);
const TODAY = '2026-11-07';

function sources(): FactSources {
  const snapshot = todaySnapshot({ user, pages, logs, day: TODAY, assignment: [584, 585], history: null, now: Date.parse('2026-11-07T10:00:00') });
  return { user, pages, logs, history: null, snapshot, now: Date.parse('2026-11-07T10:00:00') };
}

describe('knownChart', () => {
  it('draws the kinds this app has, and nothing else', () => {
    expect(knownChart({ kind: 'pageRatings', title: 'x', pages: [548, 549] })).toBe(true);
    expect(knownChart({ kind: 'dailyPages', title: 'x', days: 7 })).toBe(true);
    expect(knownChart({ kind: 'dailyPages', title: 'x', days: 30 })).toBe(true);
    expect(knownChart({ kind: 'juzMap', title: 'x' })).toBe(true);
    expect(knownChart({ kind: 'timeline', title: 'x', surah: 59, days: 90 })).toBe(true);
    expect(knownChart({ kind: 'timeline', title: 'x', juz: 30, days: 365 })).toBe(true);
    expect(knownChart({ kind: 'timeline', title: 'x', surah: 59, juz: 28, days: 30 })).toBe(false);
    expect(knownChart({ kind: 'timeline', title: 'x', days: 30 })).toBe(false);
    expect(knownChart({ kind: 'timeline', title: 'x', juz: 31, days: 30 })).toBe(false);
    expect(knownChart({ kind: 'timeline', title: 'x', surah: 59, days: 14 } as unknown as RevoChart)).toBe(false);
    // A newer server's kind, or a malformed one: no chart (the old app drew an empty bar chart).
    expect(knownChart({ kind: 'weeksAhead', title: 'x' } as unknown as RevoChart)).toBe(false);
    expect(knownChart({ kind: 'dailyPages', title: 'x', days: 14 } as unknown as RevoChart)).toBe(false);
    expect(knownChart({ kind: 'pageRatings', title: 'x', pages: [] })).toBe(false);
    expect(knownChart({ kind: 'pageRatings', title: 'x', pages: [700] })).toBe(false);
    expect(knownChart(undefined)).toBe(false);
  });
});

describe('pages per day', () => {
  it('counts each day as Revo’s week does, with what the plan had for it', () => {
    const src = sources();
    const bars = dailyPagesData(logs, TODAY, 7, plannedOf(src));
    expect(bars.map((b) => b.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']);
    expect(bars.map((b) => b.pages)).toEqual([2, 1, 0, 3, 3, 1, 0]);
    expect(bars.every((b) => b.planned === 2)).toBe(true);
    // No plan known: no grey bars.
    expect(dailyPagesData(logs, TODAY, 7).every((b) => b.planned === 0)).toBe(true);
  });

  it('a picked day: how its plan went, what else it did, its minutes, and what was revised', () => {
    const prepared = prepare(sources());
    const bars = dailyPagesData(logs, TODAY, 7, plannedOf(prepared.src));
    const sunday = dayDetail(bars[0], TODAY, logs, dayFacts('2026-11-01', prepared), prepared.scheduled('2026-11-01'));
    expect(sunday.title).toBe('Sunday 1 November');
    expect(sunday.line).toBe('Done · 2 of 2 pages · 20 min');
    expect(sunday.passage).toBe(describePassage([582, 583], { juz: true }));
    expect(sunday.strip).toEqual([
      { page: 582, band: 'strong' },
      { page: 583, band: 'weak' },
    ]);
    expect(sunday.counts).toEqual({ weak: 1, moderate: 0, strong: 1 });

    // 585 was left, then caught up on Wednesday.
    const monday = dayDetail(bars[1], TODAY, logs, dayFacts('2026-11-02', prepared), prepared.scheduled('2026-11-02'));
    expect(monday.line).toMatch(/^(Done · )?2 of 2 pages · 1 caught up later · 10 min$/);
    // Wednesday did that page for Monday.
    const wednesday = dayDetail(bars[3], TODAY, logs, dayFacts('2026-11-04', prepared), prepared.scheduled('2026-11-04'));
    expect(wednesday.line).toContain('1 from earlier days');
    expect(wednesday.line).toContain('12 min');
    // Thursday revised Friday's 582 ahead.
    const thursday = dayDetail(bars[4], TODAY, logs, dayFacts('2026-11-05', prepared), prepared.scheduled('2026-11-05'));
    expect(thursday.line).toContain('1 ahead');
  });

  it('a missed day names what was planned', () => {
    const prepared = prepare(sources());
    const bars = dailyPagesData(logs, TODAY, 7, plannedOf(prepared.src));
    const tuesday = dayDetail(bars[2], TODAY, logs, dayFacts('2026-11-03', prepared), prepared.scheduled('2026-11-03'));
    expect(tuesday.line).toBe('0 of 2 pages');
    expect(tuesday.planned).toBe(true);
    expect(tuesday.passage).toBe(describePassage(prepared.scheduled('2026-11-03'), { juz: true }));
    expect(tuesday.strip).toEqual([]);
  });

  it('without the account’s facts it still says what was revised', () => {
    const bars = dailyPagesData(logs, TODAY, 7);
    expect(dayDetail(bars[0], TODAY, logs, null).line).toBe('2 pages revised');
    expect(dayDetail(bars[2], TODAY, logs, null).line).toBe('Nothing revised');
    expect(dayDetail(bars[6], TODAY, logs, null).title).toBe('Today');
  });

  it('a day’s ratings: the last its sessions gave each page', () => {
    const two = [log('2026-11-01', [582], { weaknessUpdates: [{ page: 582, rating: 2 }] }), log('2026-11-01', [582], { weaknessUpdates: [{ page: 582, rating: 4.4 }] })];
    expect([...ratingsOn(two, '2026-11-01')]).toEqual([[582, 4]]);
  });

  it('a strip is named by the surahs it starts and ends in', () => {
    expect(plainText(stripEnds([522, 541]).first ?? '')).toBe('Adh-Dhariyat');
    expect(plainText(stripEnds([522, 541]).last ?? '')).toBe('Al-Hadid');
    // One surah: one name.
    expect(stripEnds([546, 547]).last).toBeNull();
    expect(stripEnds([])).toEqual({ first: null, last: null });
  });
});

describe('page ratings', () => {
  const data = pageRatingsData(logs, [583], TODAY);
  const dots = data.rows[0].dots;
  const page583 = pages.find((p) => p.pageNumber === 583);

  it('a picked row: the passage and how it stands now', () => {
    const r = ratingsRowReadout(583, dots, page583);
    expect(plainText(r.title)).toMatch(/ · weak now$/);
    expect(r.line).toBe('2 ratings in 31 days');
    expect(ratingsRowReadout(590, [], undefined).line).toBe('No ratings in 31 days');
  });

  it('a picked dot: its rating, its day, and the gap since the revision before', () => {
    expect(revisedBefore(logs, 583, '2026-11-06')).toBe('2026-11-01');
    expect(revisedBefore(logs, 583, '2026-11-01')).toBeNull();
    // A page revised ahead counts.
    expect(revisedBefore(logs, 582, '2026-11-06')).toBe('2026-11-05');
    const r = ratingsDotReadout(583, dots[1], revisedBefore(logs, 583, dots[1].day));
    expect(plainText(r.title)).toMatch(/ · weak$/);
    expect(r.line).toBe('6 November, 5 days after the time before');
    expect(ratingsDotReadout(583, dots[0], null).line).toBe('1 November');
  });

  it('the panel names the passage by surah, with the page as a quiet note', () => {
    const d = pageDetail(583, page583, dots, TODAY);
    expect(d.title).toBe(describePassage([583], { juz: true }));
    expect(plainText(d.note)).toBe('p. 583');
    expect(d.meta).toBe('Weak now · rated weak twice in 31 days · revised yesterday');
    expect(pageDetail(590, undefined, [], TODAY).meta).toBe('not revised yet');
  });
});

describe('juz map', () => {
  // Juz 30 (p. 582–604): ten of its 23 pages memorized here, so it is being learned, not memorized.
  it('draws Insights’ tiles from the sessions, as Revo’s context reads them', () => {
    const tiles = juzMapData(pages, logs, TODAY);
    expect(tiles).toHaveLength(30);
    expect(tiles[29]).toMatchObject({ juz: 30, state: 'none', learning: true });
    expect(tiles[0]).toMatchObject({ juz: 1, state: 'none', learning: false });
    // All of Juz 30 memorized: the oldest page decides, and two were never revised.
    const all = Array.from({ length: 23 }, (_, i) => ({ ...memorized[0], pageNumber: 582 + i }));
    expect(juzMapData(recomputePagesFromLogs(all, logs), logs, TODAY)[29]).toMatchObject({ state: 'stale', daysSince: null });
  });

  it('a picked juz: when it was last revised, and its surahs', () => {
    expect(juzReadout({ juz: 4, state: 'stale', learning: false, daysSince: 41 })).toEqual({ title: 'Juz 4 · last revised 41 days ago', line: expect.anything() });
    expect(plainText(juzReadout({ juz: 4, state: 'stale', learning: false, daysSince: 41 }).line)).toBe("Ali 'Imran 92 to the end of Juz 4");
    expect(juzReadout({ juz: 28, state: 'week', learning: false, daysSince: 0 }).title).toBe('Juz 28 · revised today');
    expect(juzReadout({ juz: 27, state: 'week', learning: false, daysSince: 1 }).title).toBe('Juz 27 · last revised yesterday');
    expect(juzReadout({ juz: 5, state: 'stale', learning: false, daysSince: null }).title).toBe('Juz 5 · not all revised yet');
    expect(juzReadout({ juz: 29, state: 'none', learning: true, daysSince: null }).title).toBe('Juz 29 · being learned');
    expect(plainText(juzReadout({ juz: 28, state: 'week', learning: false, daysSince: 0 }).line)).toBe('Al-Mujadila to At-Tahrim');
  });

  it('its strip: each page, in its rating’s colour once memorized and revised', () => {
    const strip = juzStrip(30, pages);
    expect(strip).toHaveLength(23);
    expect(strip[0]).toEqual({ page: 582, memorized: true, band: expect.any(String) });
    // 592 on aren't memorized here.
    expect(strip[10]).toEqual({ page: 592, memorized: false, band: null });
  });

  it('for VoiceOver, the tiles by state', () => {
    const t = (juz: number, state: 'week' | 'month' | 'stale' | 'none', learning = false) => ({ juz, state, learning, daysSince: null });
    expect(juzSummary([t(1, 'month'), t(4, 'stale'), t(5, 'stale'), t(28, 'week'), t(29, 'none', true), t(10, 'none')])).toBe(
      'Revised this week: Juz 28. This month: Juz 1. Over 30 days ago: Juz 4, Juz 5. Being learned: Juz 29',
    );
  });
});

describe('timeline', () => {
  it('a surah’s pages, or a juz’s', () => {
    expect(passagePagesOf({ surah: 59 })).toEqual([545, 546, 547, 548]);
    expect(passagePagesOf({ juz: 28 })).toHaveLength(20);
    expect(passagePagesOf({ juz: 28 })[0]).toBe(542);
    expect(passagePagesOf({})).toEqual([]);
  });

  it('each day the passage was revised, from the first session, in its weakest rating, with the gaps', () => {
    const t = timelineData(logs, [582, 583], TODAY, 30);
    // The account's first session (Nov 1) starts the line, not 30 days back.
    expect(t.start).toBe('2026-11-01');
    expect(t.marks.map((m) => [m.day, m.band, m.gap])).toEqual([
      ['2026-11-01', 'weak', null],
      ['2026-11-05', 'moderate', 4],
      ['2026-11-06', 'weak', 1],
    ]);
    expect(t.marks.map((m) => m.at)).toEqual([0, 4 / 6, 5 / 6]);
    // A shorter window cuts the earlier ones.
    expect(timelineData(logs, [582, 583], TODAY, 3).marks.map((m) => m.day)).toEqual(['2026-11-05', '2026-11-06']);
    // Never revised: no marks.
    expect(timelineData(logs, [600], TODAY, 30).marks).toEqual([]);
  });

  it('a picked revision: its day and rating, the gap before it, and what it was rated', () => {
    const [first, second] = timelineData(logs, [582, 583], TODAY, 30).marks;
    expect(timelineReadout(second)).toEqual({ title: 'Thursday 5 November · moderate', line: '4 days after the time before' });
    expect(timelineReadout(first).line).toBe('The first time in this view');
    const d = timelineDetail(first, logs);
    expect(plainText(d.ratings ?? '')).toBe(`${plainText(describePassage([583], { form: 'short' }))} weak · ${plainText(describePassage([582], { form: 'short' }))} strong`);
    expect(d.line).toBe('2 pages revised that day in 20 min');
    expect(timelineDetail({ ...second, pages: [584] }, logs).ratings).toBeNull();
  });

  it('says what a tap does, or that it wasn’t revised', () => {
    expect(timelineHint(timelineData(logs, [582, 583], TODAY, 30).marks, 30)).toBe('3 revisions · tap one to see it');
    expect(timelineHint([], 30)).toBe('Not revised in 30 days');
    expect(timelineHint([], 365)).toBe('Not revised in the last year');
  });

  it('dots shrink when revisions crowd the line, never under 6pt', () => {
    expect(dotSizeFor([{ at: 0 }, { at: 0.5 }], 360)).toBe(14);
    // Daily for a month: about 13pt apart.
    expect(dotSizeFor(Array.from({ length: 28 }, (_, i) => ({ at: i / 27 })), 360)).toBe(11);
    expect(dotSizeFor([{ at: 0 }, { at: 0.001 }], 360)).toBe(6);
    expect(dotSizeFor([{ at: 0.5 }], 360)).toBe(14);
  });

  it('the mark nearest a finger, within reach', () => {
    const marks = [{ at: 0 }, { at: 0.5 }, { at: 1 }];
    expect(nearestMark(marks, 140, 300)).toBe(1);
    expect(nearestMark(marks, 80, 300, 22)).toBeNull();
    expect(nearestMark(marks, 290, 300, 22)).toBe(2);
    expect(nearestMark([], 10, 300)).toBeNull();
  });
});

describe('words and touch', () => {
  it('says days and counts the way people do', () => {
    expect(agoWords('2026-11-07', TODAY)).toBe('today');
    expect(agoWords('2026-11-06', TODAY)).toBe('yesterday');
    expect(agoWords('2026-11-03', TODAY)).toBe('4 days ago');
    // A page's lastRevisedDate is a timestamp in the app (it showed "NaN days ago" on Android, Nov 8 2026).
    expect(agoWords('2026-11-03T09:00:00.000Z', TODAY)).toBe('4 days ago');
    expect([1, 2, 3].map(timesWord)).toEqual(['once', 'twice', '3 times']);
    expect(dayMonth('2026-10-30')).toBe('30 October');
  });

  it('finds the mark under a finger, and steps through marks for VoiceOver', () => {
    expect(slotAt(0, 350, 7)).toBe(0);
    expect(slotAt(349, 350, 7)).toBe(6);
    expect(slotAt(-20, 350, 7)).toBe(0);
    expect(slotAt(500, 350, 30)).toBe(29);
    expect(slotAt(10, 0, 7)).toBe(0);
    expect(stepIndex(null, 1, 7)).toBe(0);
    expect(stepIndex(null, -1, 7)).toBe(6);
    expect(stepIndex(6, 1, 7)).toBe(6);
    expect(stepIndex(3, -1, 7)).toBe(2);
    expect(stepIndex(null, 1, 0)).toBeNull();
  });
});
