// Today's two lines (option E): the examples are the mocks' own.
import { juzSpan, NBHY, NBSP, runsInOrder, todayLines } from '../todayLines';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** No-break spaces and hyphens as plain ones, to read the expectations. */
const plain = (s: string) => s.split(NBSP).join(' ').split(NBHY).join('-');
const lines = (...args: Parameters<typeof todayLines>) => {
  const t = todayLines(...args);
  return {
    title: plain(t.title.text),
    detail: t.detail.kind === 'text' ? plain(t.detail.text) : t.detail,
    chevron: t.title.chevron,
    dot: t.title.dot,
    cta: t.cta,
  };
};

describe('Today’s lines (E: "Starts at")', () => {
  it('not started: where it starts, then how much and to where', () => {
    expect(lines('not_started', range(542, 561), new Set())).toEqual({
      title: 'Starts at Al-Mujadila',
      detail: '20 pages · to At-Tahrim · Juz 28',
      chevron: true,
      dot: false,
      cta: 'Start revision',
    });
  });

  it('in progress: the first page not revised yet, and a bar with "6 of 20"', () => {
    expect(lines('partial', range(542, 561), new Set(range(542, 547)))).toEqual({
      title: 'Continue at Al-Hashr, last page',
      detail: { kind: 'progress', done: 6, total: 20 },
      chevron: true,
      dot: false,
      cta: 'Continue revision',
    });
  });

  it('done: one line with a dot, then the surahs and juz it covered (no ›)', () => {
    expect(lines('completed', range(522, 541), new Set(range(522, 541)))).toEqual({
      title: 'Done · 20 pages',
      detail: 'Adh-Dhariyat → Al-Hadid · Juz 27',
      chevron: false,
      dot: true,
      cta: 'Review session',
    });
  });

  it('done, with pages added from earlier days still to revise: the button goes on to them', () => {
    const t = todayLines('completed', [520, 521, ...range(522, 541)], new Set(range(522, 541)), 2, 2);
    expect(t.title.text.split(' ').join(' ')).toBe('Done · 20 pages');
    expect(t.cta).toBe('Continue revision');
    expect(t.solid).toBe(true);
  });

  it('two ranges read in the session’s order: the end of the cycle, "then" its start (no juz)', () => {
    const wrap = [...range(595, 604), ...range(1, 10)];
    expect(lines('not_started', wrap, new Set())).toMatchObject({
      title: 'Starts at Ash-Shams',
      detail: '20 pages · then Al-Fatihah',
    });
    // A start mid-surah names which page of it, never an ayah number.
    expect(lines('not_started', [...range(596, 604), ...range(22, 32)], new Set())).toMatchObject({
      title: 'Starts at Ad-Duhaa',
      detail: '20 pages · then Juz 2',
    });
  });

  it('pages put first by Insights ("Revise these first tomorrow") say so, not "from yesterday" (ACT-24)', () => {
    expect(lines('not_started', range(538, 557), new Set(), 2, 2, undefined, 2).detail).toBe('20 pages · 2 from Insights first');
  });

  it('pages from Insights and leftovers together: each said (ACT-24)', () => {
    expect(lines('not_started', range(538, 557), new Set(), 7, 7, undefined, 2).detail).toBe('20 pages · 2 from Insights, 5 from yesterday first');
  });

  it('pages carried in from yesterday: said once', () => {
    expect(lines('not_started', range(538, 557), new Set(), 4)).toMatchObject({
      title: 'Starts at Al-Hadid, 2nd page',
      detail: '20 pages · 4 from yesterday first',
    });
  });

  it('a day inside one surah says no "to"; more than two juz, no juz', () => {
    expect(lines('not_started', range(2, 21), new Set()).detail).toBe('20 pages · Juz 1');
    expect(lines('not_started', range(400, 460), new Set()).detail).toMatch(/^61 pages · to \S+$/);
    expect(lines('not_started', [5], new Set()).detail).toBe('1 page · Juz 1');
  });

  it('nothing to revise yet: the old empty state, no ›', () => {
    expect(lines('not_started', [], new Set())).toEqual({
      title: 'Nothing to revise yet',
      detail: "Start by marking what you've memorized. Most people begin with Juz 30.",
      chevron: false,
      dot: false,
      cta: 'Mark memorized pages',
    });
  });

  it('[HOME-9] no pages today with pages memorized: a rest day, where the next day starts, "Revise ahead" (an outline)', () => {
    const rest = todayLines('not_started', [], new Set(), 0, 0, undefined, 0, { memorized: true, next: { lead: 'Tomorrow', first: 1 } });
    expect(rest).toMatchObject({ title: { text: 'Rest day' }, rest: true, empty: true, cta: 'Revise ahead', solid: false });
    expect(rest.detail).toEqual({ kind: 'text', text: expect.stringMatching(/^Tomorrow starts at /) });
    // No next revision day: says so, and no button.
    const none = todayLines('completed', [], new Set([3]), 0, 0, undefined, 0, { memorized: true });
    expect(none).toMatchObject({ title: { text: 'Rest day' }, detail: { kind: 'text', text: 'Nothing is scheduled today.' }, cta: '' });
  });

  it('keeps "last page", "20 pages", "Juz 28" and "Al-Mujadila" together (no-break spaces and hyphens)', () => {
    const t = todayLines('not_started', range(542, 561), new Set());
    expect(t.title.text).toBe(`Starts at Al${NBHY}Mujadila`);
    expect(todayLines('partial', range(542, 561), new Set(range(542, 547))).title.text).toBe(
      `Continue at Al${NBHY}Hashr, last${NBSP}page`,
    );
    expect(t.detail).toEqual({ kind: 'text', text: `20${NBSP}pages · to At${NBHY}Tahrim · Juz${NBSP}28` });
  });

  it('VoiceOver reads both lines in words ("page 542", "to"); in progress, how many are done', () => {
    expect(todayLines('not_started', range(542, 561), new Set()).label).toBe(
      'Starts at Al-Mujadila. 20 pages · to At-Tahrim · Juz 28',
    );
    expect(todayLines('partial', range(542, 561), new Set(range(542, 547))).label).toBe(
      'Continue at Al-Hashr, last page. 6 of 20 pages done',
    );
    expect(todayLines('completed', range(522, 541), new Set(range(522, 541))).label).toBe(
      'Done · 20 pages. Adh-Dhariyat to Al-Hadid · Juz 27',
    );
  });

  it('runs keep the given order; juz spans', () => {
    expect(runsInOrder([595, 596, 1, 2, 2])).toEqual([
      { first: 595, last: 596 },
      { first: 1, last: 2 },
    ]);
    expect(plain(juzSpan(range(522, 561))!)).toBe('Juz 27–28');
    expect(juzSpan(range(500, 561))).toBeNull();
  });
});

describe('Today’s lines with a partly memorized page (MEM-4)', () => {
  // The Qur'an's last page holds Al-Ikhlas, Al-Falaq and An-Nas; only An-Nas is memorized.
  const anNas = [114001, 114002, 114003, 114004, 114005, 114006];
  const partial = new Map([[604, anNas]]);
  // Al-Mulk's second page, its first eight ayahs memorized (13–20).
  const alMulk = new Map([[563, [67013, 67014, 67015, 67016, 67017, 67018, 67019, 67020]]]);

  it('starts, continues and runs on to a page by its first memorized ayah', () => {
    expect(lines('not_started', [604, 1, 2], new Set(), 0, 0, partial).title).toBe('Starts at An-Nas');
    expect(lines('not_started', [1, 2, 3, 4, 604], new Set(), 0, 0, partial).detail).toBe('5 pages · then An-Nas');
    expect(lines('partial', [602, 603, 604], new Set([602, 603]), 0, 0, partial).title).toBe('Continue at An-Nas');
  });

  it('a page whose memorized ayahs start it reads as before; the day ends where its memorized ayahs do', () => {
    expect(lines('not_started', [562, 563], new Set(), 0, 0, alMulk)).toMatchObject({ title: 'Starts at Al-Mulk', detail: '2 pages · Juz 29' });
    expect(lines('not_started', range(560, 563), new Set(), 0, 0, alMulk).detail).toBe('4 pages · to Al-Mulk · Juz 28–29');
  });

  it('with no partly memorized page among them, the lines are exactly as before', () => {
    expect(todayLines('not_started', range(542, 561), new Set(), 0, 0, partial)).toEqual(todayLines('not_started', range(542, 561), new Set()));
  });
});
