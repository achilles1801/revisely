// Add to chat's search and its choices (mocks a2, a3, a5): names read as people type them.
import { getPagesForSurah } from '../../quranData';
import { pageOfVerse } from '../../verses';
import { matchDays, searchAdd } from '../addSearch';
import { isChosen, keyId, keyOf, toggleKey, type AddKey } from '../addSelection';
import { REVO_MAX_ATTACHMENTS } from '../types';

const TODAY = '2026-11-03'; // a Tuesday

describe('search', () => {
  it('a surah by name, however it is typed, or in Arabic', () => {
    expect(searchAdd('Yusuf', TODAY)).toEqual([{ kind: 'surah', surah: 12, label: 'Yusuf' }]);
    expect(searchAdd('al hashr', TODAY)[0]).toEqual({ kind: 'surah', surah: 59, label: 'Al-Hashr' });
    expect(searchAdd('الحشر', TODAY)[0]).toMatchObject({ kind: 'surah', surah: 59 });
    // One surah named: its juz beside it, when it is in one.
    expect(searchAdd('Al-Mulk', TODAY)).toEqual([
      { kind: 'surah', surah: 67, label: 'Al-Mulk' },
      { kind: 'juz', juz: 29, label: 'Juz 29' },
    ]);
  });

  it('ayahs: the pages they start on, named by the surah; then the surah and its juz', () => {
    const r = searchAdd('Al-Hashr 1–10', TODAY);
    const from = pageOfVerse({ sura: 59, ayah: 1 });
    const to = pageOfVerse({ sura: 59, ayah: 10 });
    expect(r[0]).toEqual({ kind: 'pages', pages: Array.from({ length: to - from + 1 }, (_, i) => from + i), label: 'Al-Hashr, ayahs 1–10', ayahs: true });
    expect(r.slice(1)).toEqual([
      { kind: 'surah', surah: 59, label: 'Al-Hashr' },
      { kind: 'juz', juz: 28, label: 'Juz 28' },
    ]);
    expect(searchAdd('Al-Mulk 1-12', TODAY)[0]).toMatchObject({ label: 'Al-Mulk, ayahs 1–12', ayahs: true });
    expect(searchAdd('Al-Hashr 3', TODAY)[0]).toMatchObject({ label: 'Al-Hashr, ayah 3' });
    // Past the surah's end: not ayahs.
    expect(searchAdd('Al-Ikhlas 9', TODAY).some((x) => x.kind === 'pages')).toBe(false);
  });

  it('a juz, a page, a run of pages', () => {
    expect(searchAdd('Juz 14', TODAY)).toEqual([{ kind: 'juz', juz: 14, label: 'Juz 14' }]);
    expect(searchAdd('juz 31', TODAY)).toEqual([]);
    expect(searchAdd('p. 288', TODAY)).toEqual([{ kind: 'pages', pages: [288], label: expect.any(String) }]);
    expect(searchAdd('288', TODAY)[0]).toMatchObject({ kind: 'pages', pages: [288] });
    expect(searchAdd('pp. 548–551', TODAY)[0]).toMatchObject({ kind: 'pages', pages: [548, 549, 550, 551] });
    expect(searchAdd('605', TODAY)).toEqual([]);
    // Named by surah, not by number.
    expect((searchAdd('p. 288', TODAY)[0] as { label: string }).label).not.toMatch(/288/);
  });

  it('days: today, yesterday, a weekday (the last four), a date', () => {
    expect(matchDays('today', TODAY)).toEqual([TODAY]);
    expect(matchDays('yesterday', TODAY)).toEqual(['2026-11-02']);
    expect(matchDays('Tuesday', TODAY)).toEqual(['2026-11-03', '2026-10-27', '2026-10-20', '2026-10-13']);
    expect(matchDays('tue', TODAY)).toHaveLength(4);
    expect(matchDays('mon', TODAY)[0]).toBe('2026-11-02');
    expect(matchDays('3 Nov', TODAY)).toEqual(['2026-11-03']);
    expect(matchDays('November 3', TODAY)).toEqual(['2026-11-03']);
    expect(matchDays('27 Oct', TODAY)).toEqual(['2026-10-27']);
    expect(matchDays('3/11', TODAY)).toEqual(['2026-11-03']);
    // Not yet this year: last year's.
    expect(matchDays('5 Dec', TODAY)).toEqual(['2025-12-05']);
    expect(matchDays('31 Feb', TODAY)).toEqual([]);
    expect(searchAdd('Tuesday', TODAY).every((x) => x.kind === 'day')).toBe(true);
  });

  it('nothing for nothing', () => {
    expect(searchAdd('', TODAY)).toEqual([]);
    expect(searchAdd('zzzz', TODAY)).toEqual([]);
  });
});

describe('choosing', () => {
  const yusuf: AddKey = { kind: 'surah', surah: 12, label: 'Yusuf' };
  const juz: AddKey = { kind: 'juz', juz: 28, label: 'Juz 28' };
  it('a tap adds, a second takes away; at most six with what was attached already', () => {
    let keys = toggleKey([], yusuf);
    expect(isChosen(keys, yusuf)).toBe(true);
    keys = toggleKey(keys, { ...yusuf, label: 'again' });
    expect(keys).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i): AddKey => ({ kind: 'juz', juz: i + 1, label: `Juz ${i + 1}` })).reduce((ks, k) => toggleKey(ks, k), [] as AddKey[]);
    expect(many).toHaveLength(REVO_MAX_ATTACHMENTS);
    expect(toggleKey([yusuf], juz, 1)).toEqual([yusuf]);
  });

  it('an attachment comes back as its key (an insight or a recording isn’t one)', () => {
    const facts = {} as never;
    expect(keyOf({ kind: 'surah', label: 'Yusuf', surah: 12, facts })).toEqual(yusuf);
    expect(keyOf({ kind: 'revisionDay', label: 'Tue 27 Oct', day: '2026-10-27', facts })).toEqual({ kind: 'day', day: '2026-10-27' });
    expect(keyOf({ kind: 'insight', label: 'Pace', insight: 'pace' })).toBeNull();
    expect(keyId({ kind: 'pages', pages: getPagesForSurah(67), label: 'Al-Mulk' })).toBe('pages:562,563,564');
  });
});
