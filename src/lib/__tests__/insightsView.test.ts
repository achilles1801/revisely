import { getPagesForJuz } from '../quranData';
import { plainText } from '../passages';
import {
  busiestHours,
  coverageCount,
  hourRange,
  juzTiles,
  memorizationMonths,
  minutesByHour,
  monthCount,
  monthLabel,
  monthName,
  paceView,
  formatPace,
  quranShare,
  reviseFirstLabel,
  ratedWeakCounts,
  reportMonth,
  untouchedJuz,
  weakSpotRows,
  weekCircles,
} from '../insightsView';

const TODAY = '2026-11-03';
const ago = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const lastOf = (pages: number[], day: string) => new Map(pages.map((p) => [p, day]));

describe('Coverage: juz tiles (gap audit §5)', () => {
  const juz28 = getPagesForJuz(28);
  const juz4 = getPagesForJuz(4);
  const juz29 = getPagesForJuz(29);

  it('a juz is as recent as its least recently revised page', () => {
    const memorized = new Set([...juz28, ...juz4]);
    const last = new Map([...lastOf(juz28, ago(1)), ...lastOf(juz4, ago(2))]);
    last.set(juz4[3], ago(41));
    const tiles = juzTiles(memorized, new Set(), last, TODAY);
    expect(tiles).toHaveLength(30);
    expect(tiles[27]).toMatchObject({ juz: 28, state: 'week', daysSince: 1 });
    expect(tiles[3]).toMatchObject({ juz: 4, state: 'stale', daysSince: 41 });
    expect(tiles[0]).toMatchObject({ juz: 1, state: 'none', learning: false });
  });

  it('7 and 30 days are the edges, and a page never revised makes the juz stale', () => {
    const memorized = new Set(juz28);
    expect(juzTiles(memorized, new Set(), lastOf(juz28, ago(6)), TODAY)[27].state).toBe('week');
    expect(juzTiles(memorized, new Set(), lastOf(juz28, ago(7)), TODAY)[27].state).toBe('month');
    expect(juzTiles(memorized, new Set(), lastOf(juz28, ago(29)), TODAY)[27].state).toBe('month');
    expect(juzTiles(memorized, new Set(), lastOf(juz28, ago(30)), TODAY)[27].state).toBe('stale');
    const partly = lastOf(juz28.slice(1), ago(1));
    expect(juzTiles(memorized, new Set(), partly, TODAY)[27]).toMatchObject({ state: 'stale', daysSince: null });
  });

  it('[ACT-25] a page never revised counts from when it was memorized: “not revised yet” for 30 days, then stale', () => {
    // A new account (Majd, Nov 8 2026): Juz 28 memorized yesterday, five of its pages revised today.
    const memorized = new Set(juz28);
    const revised = lastOf(juz28.slice(0, 5), TODAY);
    const sinceYesterday = () => ago(1);
    const fresh = juzTiles(memorized, new Set(), revised, TODAY, sinceYesterday)[27];
    expect(fresh).toMatchObject({ state: 'new', daysSince: 0, counts: { week: 5, month: 0, new: juz28.length - 5, stale: 0 } });
    // Nothing is untouched the longest for a page not revised yet.
    expect(untouchedJuz(juzTiles(memorized, new Set(), revised, TODAY, sinceYesterday))).toBeNull();
    // None revised yet: still not 30+ days.
    expect(juzTiles(memorized, new Set(), new Map(), TODAY, sinceYesterday)[27]).toMatchObject({ state: 'new', daysSince: null });
    // 29 days on record and never revised: not yet; 30: stale ("Never revised").
    expect(juzTiles(memorized, new Set(), new Map(), TODAY, () => ago(29))[27].state).toBe('new');
    const old = juzTiles(memorized, new Set(), new Map(), TODAY, () => ago(30));
    expect(old[27]).toMatchObject({ state: 'stale', daysSince: null });
    expect(untouchedJuz(old)?.first.juz).toBe(28);
    // A page revised 41 days ago beside fresh ones: stale for that page, and it says 41 days.
    const mixed = new Map(revised);
    mixed.set(juz28[6], ago(41));
    expect(juzTiles(memorized, new Set(), mixed, TODAY, sinceYesterday)[27]).toMatchObject({ state: 'stale', daysSince: 41 });
    // A juz not revised yet is never "the next one" ahead of one revised 20 days ago.
    const both = new Set([...juz28, ...juz4]);
    const lastBoth = new Map([...lastOf(juz4, ago(20))]);
    lastBoth.set(juz4[0], ago(40));
    const u = untouchedJuz(juzTiles(both, new Set(), lastBoth, TODAY, (p) => (juz28.includes(p) ? ago(1) : ago(90))));
    expect(u).toMatchObject({ first: { juz: 4, daysSince: 40 }, next: { juz: 28, state: 'new' } });
  });

  it('marks a juz being learned', () => {
    expect(juzTiles(new Set(), new Set([juz29[0]]), new Map(), TODAY)[28]).toMatchObject({ state: 'none', learning: true });
  });

  it('[ACT-4] a juz under half memorized is being learned, so a page memorized today is never “untouched the longest” (mock d4: Juz 29)', () => {
    const memorized = new Set([...juz28, juz29[0]]);
    const last = new Map(juz28.map((p) => [p, ago(2)] as [number, string]));
    const tiles = juzTiles(memorized, new Set(), last, TODAY);
    expect(tiles[28]).toMatchObject({ juz: 29, state: 'none', learning: true });
    expect(tiles[27]).toMatchObject({ juz: 28, state: 'week' });
    expect(untouchedJuz(tiles)).toBeNull();
    // Half of it memorized: a memorized juz, as recent as those pages.
    const half = new Set(juz29.slice(0, 10));
    expect(juzTiles(half, new Set(), new Map(juz29.slice(0, 10).map((p) => [p, ago(10)] as [number, string])), TODAY)[28]).toMatchObject({ state: 'month', learning: false });
  });

  it('names the juz untouched the longest, and the next, only when it is stale', () => {
    const memorized = new Set([...juz28, ...juz4, ...getPagesForJuz(5)]);
    const last = new Map([...lastOf(juz28, ago(1)), ...lastOf(juz4, ago(41)), ...lastOf(getPagesForJuz(5), ago(33))]);
    const u = untouchedJuz(juzTiles(memorized, new Set(), last, TODAY));
    expect(u?.first).toMatchObject({ juz: 4, daysSince: 41 });
    expect(u?.next).toMatchObject({ juz: 5, daysSince: 33 });
    const fresh = untouchedJuz(juzTiles(new Set(juz28), new Set(), lastOf(juz28, ago(3)), TODAY));
    expect(fresh).toBeNull();
  });

  it('counts the memorized pages revised in the window', () => {
    const memorized = new Set(juz28);
    const last = lastOf(juz28.slice(0, 5), ago(10));
    expect(coverageCount(memorized, last, TODAY, 7)).toEqual({ revised: 0, of: 20 });
    expect(coverageCount(memorized, last, TODAY, 30)).toEqual({ revised: 5, of: 20 });
  });
});

describe('Consistency', () => {
  it('shows the last seven days, oldest first, with their letters', () => {
    const c = weekCircles(new Set([ago(0), ago(6)]), TODAY);
    expect(c.map((x) => x.letter).join('')).toBe('WTFSSMT');
    expect(c.map((x) => x.done)).toEqual([true, false, false, false, false, false, true]);
  });

  it('reports on the month just ended for the first six days of a month', () => {
    expect(reportMonth('2026-11-03')).toBe('2026-10');
    expect(reportMonth('2026-11-07')).toBe('2026-11');
    expect(reportMonth('2027-01-02')).toBe('2026-12');
    expect(monthName('2026-10')).toBe('October');
  });

  it('counts a month’s active days out of its days so far', () => {
    const active = new Set(['2026-10-01', '2026-10-31', '2026-11-02']);
    expect(monthCount(active, '2026-10', TODAY)).toEqual({ done: 2, of: 31 });
    expect(monthCount(active, '2026-11', TODAY)).toEqual({ done: 1, of: 3 });
  });

  it('spreads minutes over the hours they ran, in local time', () => {
    const at = new Date(2026, 10, 2, 5, 40).getTime();
    const h = minutesByHour([{ day: ago(1), occurredAt: at, minutes: 34 }], TODAY, 30);
    expect(h[5]).toBe(20);
    expect(h[6]).toBe(14);
    expect(h.reduce((a, b) => a + b, 0)).toBe(34);
    expect(minutesByHour([{ day: ago(40), occurredAt: at, minutes: 34 }], TODAY, 30).every((x) => x === 0)).toBe(true);
  });

  it('names the busiest hours', () => {
    const hours = new Array(24).fill(0);
    hours[5] = 300;
    hours[6] = 340;
    hours[7] = 40;
    hours[21] = 200;
    hours[12] = 20;
    expect(busiestHours(hours)).toBe('Mostly 5–7 AM, then 9–10 PM');
    expect(busiestHours(new Array(24).fill(0))).toBeNull();
    expect(hourRange(11, 13)).toBe('11 AM–1 PM');
    expect(hourRange(23, 24)).toBe('11 PM–12 AM');
  });
});

describe('Weak spots', () => {
  const rating = (p: number) => (p === 546 || p === 547 ? 2 : 4);
  it('lists runs within a surah, weak ones first, with the reason', () => {
    const rows = weakSpotRows({
      memorized: new Set([546, 547, 556, 557, 560]),
      rating,
      ratedWeak: new Map([[546, 3]]),
      revisions: [1, 5, 9].map((n) => ({ day: ago(n), skipped: [556, 557] })),
      today: TODAY,
    });
    // By surah and ayahs, the pages a quiet detail (Majd, Nov 7 2026).
    expect(rows.map((r) => [r.surah, plainText(r.label), plainText(r.pagesNote), r.reason])).toEqual([
      ['Al-Hashr', 'Al-Hashr, ayahs 4–16', 'pp. 546–547', 'Weak now · rated weak 3 times in 30 days'],
      ['At-Taghabun', 'At-Taghabun', 'pp. 556–557', 'Skipped 3 times in 30 days'],
    ]);
  });

  it('puts the most flagged first: times rated weak and skipped, then weak now (mock d4’s order)', () => {
    const rows = weakSpotRows({
      memorized: new Set([40, 41, 546, 547, 556, 557]),
      rating: (p) => (p === 40 || p === 41 || p === 546 || p === 547 ? 2 : 4),
      ratedWeak: new Map([[546, 3]]),
      revisions: [1, 5, 9].map((n) => ({ day: ago(n), skipped: [556, 557] })),
      today: TODAY,
    });
    expect(rows.map((r) => plainText(r.label))).toEqual(['Al-Hashr, ayahs 4–16', 'At-Taghabun', 'Al-Baqarah, ayahs 246–252']);
    expect(plainText(reviseFirstLabel(rows))).toBe('Revise these weak spots first tomorrow');
    expect(plainText(reviseFirstLabel(rows.slice(1, 2)))).toBe('Revise At-Taghabun first tomorrow');
  });

  it('splits a run where a surah begins (548 is Al-Hashr’s last page)', () => {
    const rows = weakSpotRows({ memorized: new Set([548, 549]), rating: () => 2, ratedWeak: new Map(), revisions: [], today: TODAY });
    expect(rows.map((r) => [r.surah, plainText(r.label)])).toEqual([
      ['Al-Hashr', 'Al-Hashr, ayahs 17–24'],
      ['Al-Mumtahanah', 'Al-Mumtahanah, ayahs 1–5'],
    ]);
  });

  it('leaves out pages skipped once, and skips older than the window', () => {
    const rows = weakSpotRows({
      memorized: new Set([556, 557]),
      rating: () => 4,
      ratedWeak: new Map(),
      revisions: [{ day: ago(1), skipped: [556] }, { day: ago(40), skipped: [556] }],
      today: TODAY,
    });
    expect(rows).toEqual([]);
  });

  it('counts the sessions that rated a page weak in the window', () => {
    const m = ratedWeakCounts(
      [
        { date: ago(1), weaknessUpdates: [{ page: 548, rating: 2 }, { page: 550, rating: 4 }] },
        { date: ago(3), weaknessUpdates: [{ page: 548, rating: 1 }] },
        { date: ago(45), weaknessUpdates: [{ page: 548, rating: 1 }] },
      ],
      TODAY,
    );
    expect(m.get(548)).toBe(2);
    expect(m.has(550)).toBe(false);
  });
});

describe('Memorization', () => {
  it('gives the 12 months ending the report month', () => {
    const months = memorizationMonths(
      [
        { day: '2026-10-02', pages: [570] },
        { day: '2026-10-06', pages: [571, 571] },
        { day: '2025-11-20', pages: [1, 2] },
        { day: '2025-10-20', pages: [3] },
      ],
      '2026-10',
    );
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: '2025-11', pages: 2 });
    expect(months[11]).toEqual({ month: '2026-10', pages: 2 });
    expect(monthLabel('2025-11', true)).toBe('Nov');
    expect(monthLabel('2025-12', false)).toBe('D');
  });

  it('says how much of the Quran in words near a simple share', () => {
    expect(quranShare(305)).toBe('half the Quran');
    expect(quranShare(151)).toBe('a quarter of the Quran');
    expect(quranShare(604)).toBe('all of the Quran');
    expect(quranShare(40)).toBe('7% of the Quran');
    expect(quranShare(0)).toBeNull();
  });
});

describe('Pace', () => {
  const revision = (n: number, pages: number, minutes: number) => ({ day: ago(n), pages: Array.from({ length: pages }, (_, i) => i + 1), minutes });
  it('is hidden under ten timed items', () => {
    const revised = Array.from({ length: 9 }, (_, i) => revision(i, 20, 36));
    expect(paceView({ revised, read: [], today: TODAY, capacity: 20 })).toBeNull();
  });

  it('gives minutes a page, the month before, a day at that pace and reading', () => {
    const revised = [...Array.from({ length: 10 }, (_, i) => revision(i, 20, 36)), revision(40, 10, 21)];
    const read = [{ day: ago(2), pages: [1, 2], minutes: 12 }];
    const p = paceView({ revised, read, today: TODAY, capacity: 20 });
    expect(p).toMatchObject({ perPage: 1.8, before: 2.1, dayMinutes: 36, revisions: 10, readingPerPage: 6 });
  });
});

describe('formatPace', () => {
  it('reads "1.8", "6" and "12" (no ".0", whole from 10)', () => {
    expect(formatPace(1.8)).toBe('1.8');
    expect(formatPace(6)).toBe('6');
    expect(formatPace(5.97)).toBe('6');
    expect(formatPace(12.4)).toBe('12');
  });
});
