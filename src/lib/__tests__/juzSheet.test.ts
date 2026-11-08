import { juzOfPages, juzSheetModel, type JuzSheetPage } from '../juzSheet';
import { plainText } from '../passages';

const TODAY = '2026-11-03';
// Juz 28 is pages 542–561 (Al-Mujadila to At-Tahrim).
const JUZ28 = Array.from({ length: 20 }, (_, i) => 542 + i);
const page = (pageNumber: number, extra: Partial<JuzSheetPage> = {}): JuzSheetPage => ({
  pageNumber,
  status: 'memorized',
  weaknessRating: 4,
  lastRevisedDate: null,
  skipCount: 0,
  ...extra,
});

describe('the juz sheet', () => {
  it('names the juz by its surahs, and its strip’s ends', () => {
    const m = juzSheetModel({ juz: 28, today: TODAY, pages: JUZ28.map((p) => page(p)), revised: [], windowDays: 30, smartTracking: false });
    expect(m.title).toBe('Juz 28');
    expect(plainText(m.subtitle)).toBe('Al-Mujadila to At-Tahrim');
    expect(m.ends.map(plainText)).toEqual(['Al-Mujadila', 'At-Tahrim']);
    expect(m.cells).toHaveLength(20);
    expect(m.surahs.map((s) => plainText(s.name))[0]).toBe('Al-Mujadila');
    expect(m.surahs.map((s) => plainText(s.name)).slice(-1)).toEqual(['At-Tahrim']);
  });

  describe('without Smart Tracking: recency, never strength (ACT-19)', () => {
    const revised = [
      { countsFor: '2026-11-03', pages: JUZ28 },
      { countsFor: '2026-10-25', pages: JUZ28.slice(0, 10) },
      { countsFor: '2026-10-12', pages: JUZ28.slice(0, 4) },
      // Before the window: counts for when it was last revised, not for the times.
      { countsFor: '2026-09-01', pages: JUZ28 },
    ];
    const m = juzSheetModel({
      juz: 28,
      today: TODAY,
      // Even a page rated weak shows no strength.
      pages: JUZ28.map((p) => page(p, { weaknessRating: p === 546 ? 1 : 4 })),
      revised,
      windowDays: 30,
      smartTracking: false,
    });

    it('when it was last revised, and how many days in the window', () => {
      expect(m.headline).toBe('Last revised today');
      expect(m.times).toBe('3 times in 30 days');
      expect(m.stale).toBe(false);
    });

    it('cells and counts by recency', () => {
      expect(m.cells.every((c) => c.state === 'week')).toBe(true);
      expect(m.counts).toEqual([{ state: 'week', n: 20 }]);
      expect(m.cells.some((c) => ['weak', 'moderate', 'strong'].includes(c.state))).toBe(false);
    });

    it('each surah: how long ago, and how often', () => {
      const mujadila = m.surahs[0];
      expect(mujadila.text).toBe('Last revised today · 3 times in 30 days');
      expect(m.surahs.slice(-1)[0].text).toBe('Last revised today · once in 30 days');
      expect(m.surahs.some((s) => /weak|moderate|strong/i.test(s.text))).toBe(false);
    });

    it('a stale juz says how long, and is stale', () => {
      const old = juzSheetModel({
        juz: 28,
        today: TODAY,
        pages: JUZ28.map((p) => page(p, { lastRevisedDate: '2026-09-23' })),
        revised: [],
        windowDays: 30,
        smartTracking: false,
      });
      expect(old.headline).toBe('Last revised 41 days ago');
      expect(old.times).toBe('not in the last 30 days');
      expect(old.stale).toBe(true);
      expect(old.surahs[0]).toMatchObject({ text: 'Last revised 41 days ago · not in the last 30 days', alert: true, state: 'older' });
    });

    it('a page’s record is a timestamp, as the app holds it: its day counts', () => {
      const stamped = juzSheetModel({
        juz: 28,
        today: TODAY,
        pages: JUZ28.map((p) => page(p, { lastRevisedDate: '2026-09-23T18:30:00.000Z' })),
        revised: [],
        windowDays: 30,
        smartTracking: false,
      });
      expect(stamped.headline).toBe('Last revised 41 days ago');
    });

    it('never revised: says so, and stale', () => {
      const never = juzSheetModel({ juz: 28, today: TODAY, pages: JUZ28.map((p) => page(p)), revised: [], windowDays: 30, smartTracking: false });
      expect(never.headline).toBe('Never revised');
      expect(never.stale).toBe(true);
      expect(never.surahs[0].text).toBe('Never revised');
    });
  });

  describe('with Smart Tracking: strength (ACT-8)', () => {
    // 546 weak (Al-Hashr), 550 moderate (Al-Mumtahanah), the rest strong; At-Tahrim skipped 3 times.
    const pages = JUZ28.map((p) =>
      page(p, { weaknessRating: p === 546 ? 2 : p === 550 ? 3 : 5, skipCount: p === 561 ? 3 : 0 }),
    );
    const m = juzSheetModel({ juz: 28, today: TODAY, pages, revised: [{ countsFor: TODAY, pages: JUZ28 }], windowDays: 30, smartTracking: true });

    it('counts and cells by strength', () => {
      expect(m.counts).toEqual([
        { state: 'weak', n: 1 },
        { state: 'moderate', n: 1 },
        { state: 'strong', n: 18 },
      ]);
      expect(m.cells.find((c) => c.page === 546)?.state).toBe('weak');
    });

    it('a surah names its weakest ayahs; a strong one says how often it was skipped', () => {
      const hashr = m.surahs.find((s) => plainText(s.name) === 'Al-Hashr')!;
      expect(hashr.text).toMatch(/^Ayahs \d+–\d+ weak$/);
      expect(hashr.alert).toBe(true);
      const mumtahanah = m.surahs.find((s) => plainText(s.name) === 'Al-Mumtahanah')!;
      expect(mumtahanah.text).toMatch(/^Ayahs \d+–\d+ moderate$/);
      expect(m.surahs.slice(-1)[0].text).toBe('Strong · skipped 3 times');
    });
  });

  it('a juz not memorized: says so, with its pages being learned kept for their own look', () => {
    const m = juzSheetModel({
      juz: 28,
      today: TODAY,
      pages: JUZ28.map((p) => page(p, { status: p < 545 ? 'in_progress' : 'not_memorized' })),
      revised: [],
      windowDays: 30,
      smartTracking: false,
    });
    expect(m.headline).toBe('Not memorized yet');
    expect(m.times).toBe('');
    expect(m.stale).toBe(false);
    expect(m.learning).toEqual([542, 543, 544]);
    expect(m.cells[0].state).toBe('learning');
    expect(m.counts).toEqual([]);
    expect(m.surahs[0]).toMatchObject({ text: 'Not memorized', state: 'learning' });
  });

  it('juzOfPages: the juz most of a day’s pages are in', () => {
    expect(juzOfPages([540, 541, 542, 543, 544])).toBe(28);
    expect(juzOfPages([])).toBeNull();
  });
});

describe('a juz being learned (MEM-7, mock j1)', () => {
  // Juz 29 is pages 562–581: Al-Mulk's first page memorized (ayahs 1–12), ayahs 13–20 of its second.
  const JUZ29 = Array.from({ length: 20 }, (_, i) => 562 + i);
  const alMulk = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => 67000 + from + i);
  const learning = (extra: Partial<JuzSheetPage> = {}): JuzSheetPage[] =>
    JUZ29.map((p) =>
      p === 562
        ? page(p, extra)
        : p === 563
          ? page(p, { status: 'in_progress', verses: alMulk(13, 20) })
          : page(p, { status: 'not_memorized' }),
    );

  it('fills the page in part by its share, names what is learned so far, and where to continue', () => {
    const m = juzSheetModel({ juz: 29, today: TODAY, pages: learning(), revised: [], windowDays: 30, smartTracking: false });
    expect(m.headline).toBe('Being learned');
    expect(m.stale).toBe(false);
    expect(m.times).toBe('');
    expect(m.learning).toEqual([563]);
    const cell = m.cells.find((c) => c.page === 563)!;
    expect(cell.state).toBe('learning');
    expect(cell.share).toBeGreaterThan(0.4);
    expect(cell.share).toBeLessThan(0.75);
    expect(plainText(m.learningText ?? '')).toBe('Al-Mulk 1–20 so far');
    expect(m.continueAt && { page: m.continueAt.page, label: plainText(m.continueAt.label) }).toEqual({ page: 563, label: 'Al-Mulk 21' });
    const mulk = m.surahs.find((s) => s.sura === 67)!;
    expect(mulk.state).toBe('learning');
    expect(plainText(mulk.text)).toBe('Ayahs 1–20 · 21–30 to go');
    expect(mulk.firstPage).toBe(563);
    expect(m.surahs.find((s) => s.sura === 68)).toMatchObject({ text: 'Not memorized', state: 'not-memorized' });
  });

  it('keeps when it was revised once part of it has been, and still says what is being learned', () => {
    const m = juzSheetModel({
      juz: 29,
      today: TODAY,
      pages: learning({ lastRevisedDate: '2026-11-01' }),
      revised: [{ countsFor: '2026-11-01', pages: [562] }],
      windowDays: 30,
      smartTracking: false,
    });
    expect(m.headline).toBe('Last revised 2 days ago');
    expect(plainText(m.learningText ?? '')).toBe('Al-Mulk 1–20 so far');
  });

  it('has nothing being learned when no page is in part', () => {
    const m = juzSheetModel({ juz: 28, today: TODAY, pages: JUZ28.map((p) => page(p)), revised: [], windowDays: 30, smartTracking: false });
    expect(m.learningText).toBeNull();
    expect(m.continueAt).toBeNull();
    expect(m.cells.every((c) => c.share == null)).toBe(true);
  });
});
