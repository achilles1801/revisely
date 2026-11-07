// Today's two lines (option E): the examples are the mocks' own.
import { juzSpan, NBHY, NBSP, rangesText, runsInOrder, todayLines } from '../todayLines';

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
      title: 'Continue at Al-Hashr, ayah 17',
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
    // A start mid-surah names its ayah, never the page.
    expect(lines('not_started', [...range(596, 604), ...range(22, 32)], new Set())).toMatchObject({
      title: 'Starts at Al-Layl, ayah 15',
      detail: '20 pages · then Al-Baqarah, ayah 142',
    });
  });

  it('pages carried in from yesterday: said once', () => {
    expect(lines('not_started', range(538, 557), new Set(), 4)).toMatchObject({
      title: 'Starts at Al-Hadid, ayah 4',
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

  it('keeps "ayah 17", "20 pages", "Juz 28" and "Al-Mujadila" together (no-break spaces and hyphens)', () => {
    const t = todayLines('not_started', range(542, 561), new Set());
    expect(t.title.text).toBe(`Starts at Al${NBHY}Mujadila`);
    expect(todayLines('partial', range(542, 561), new Set(range(542, 547))).title.text).toBe(
      `Continue at Al${NBHY}Hashr, ayah${NBSP}17`,
    );
    expect(t.detail).toEqual({ kind: 'text', text: `20${NBSP}pages · to At${NBHY}Tahrim · Juz${NBSP}28` });
  });

  it('the › sheet’s header: the surahs and juz first, in order, then the pages as a quiet detail', () => {
    expect(plain(rangesText(range(542, 561)))).toBe('Al-Mujadila to At-Tahrim · Juz 28 · pp. 542–561');
    expect(plain(rangesText([...range(595, 604), ...range(1, 10)]))).toBe(
      'Ash-Shams to An-Nas, then Al-Fatihah to Al-Baqarah 69 · pp. 595–604, 1–10',
    );
    expect(plain(rangesText([5]))).toBe('Al-Baqarah, ayahs 25–29 · Juz 1 · p. 5');
    expect(plain(rangesText(range(522, 541)))).toBe('Adh-Dhariyat 31 to Al-Hadid · Juz 27 · pp. 522–541');
    expect(rangesText([])).toBe('');
  });

  it('VoiceOver reads both lines in words ("page 542", "to"); in progress, how many are done', () => {
    expect(todayLines('not_started', range(542, 561), new Set()).label).toBe(
      'Starts at Al-Mujadila. 20 pages · to At-Tahrim · Juz 28',
    );
    expect(todayLines('partial', range(542, 561), new Set(range(542, 547))).label).toBe(
      'Continue at Al-Hashr, ayah 17. 6 of 20 pages done',
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
