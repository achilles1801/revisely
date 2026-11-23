import { readFileSync } from 'fs';
import { join } from 'path';
import {
  describeAyahs,
  describePageRange,
  describePassage,
  describeSession,
  firstWordsOfPage,
  firstVerseOfPage,
  lastVerseOfPage,
  NBHY,
  NBSP,
  pageInSurah,
  pageRunEnds,
  partOfPage,
  partOfSurah,
  pagesNote,
  placeOfAyah,
  placeOfPage,
  plainText,
  spokenText,
  surahName,
} from '../passages';
import { boundsFile, versesOnPage } from '../ayahBounds';
import { getJuzRange, getPagesForJuz, getSurah, getSurahDisplay } from '../quranData';
import { previousVerse } from '../verses';
import type { MushafEditionId } from '../mushafEdition';
import pageVerses from '../../data/pageVerses.json';

const range = (a: number, b: number) =>
  a <= b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : Array.from({ length: a - b + 1 }, (_, i) => a - i);

// The 1405 print unless a test names the other; text compared with ordinary spaces and hyphens.
const say = (pages: Iterable<number>, opts: Parameters<typeof describePassage>[1] = {}) =>
  plainText(describePassage(pages, { edition: 'madani1405', ...opts }));
const sayRange = (a: number, b: number, opts: Parameters<typeof describePassage>[1] = {}) =>
  plainText(describePageRange(a, b, { edition: 'madani1405', ...opts }));

describe('the page table (src/data/pageVerses.json) agrees with the bounds files', () => {
  const editions: MushafEditionId[] = ['madani1405', 'madani1441'];

  it.each(editions)('%s: every page starts with the verse the bounds put first', (edition) => {
    for (let page = 1; page <= 604; page++) {
      const first = versesOnPage(page, edition)[0];
      expect(firstVerseOfPage(page, edition)).toEqual({ sura: first.sura, ayah: first.ayah });
    }
  });

  it.each(editions)('%s: every page ends where the next begins, on a whole verse', (edition) => {
    for (let page = 1; page <= 604; page++) {
      const onPage = versesOnPage(page, edition);
      const last = onPage[onPage.length - 1];
      expect(lastVerseOfPage(page, edition)).toEqual({ sura: last.sura, ayah: last.ayah });
      if (page < 604) {
        // The next page's first verse is new (no verse is split across pages) and follows on.
        const next = firstVerseOfPage(page + 1, edition);
        expect(previousVerse(next)).toEqual({ sura: last.sura, ayah: last.ayah });
      }
    }
    expect(lastVerseOfPage(604, edition)).toEqual({ sura: 114, ayah: 6 });
  });

  it.each(editions)('%s: surahs and juz begin at the top of the pages the app says', (edition) => {
    for (let sura = 1; sura <= 114; sura++) {
      const s = getSurah(sura)!;
      // A surah that begins mid-page begins on its start page, never on another.
      const pages = range(1, 604).filter((p) => {
        const f = firstVerseOfPage(p, edition);
        const l = lastVerseOfPage(p, edition);
        return (f.sura < sura || (f.sura === sura && f.ayah === 1)) && l.sura >= sura;
      });
      expect(pages[0]).toBe(s.startPage);
    }
    for (let juz = 1; juz <= 30; juz++) {
      const start = getJuzRange(juz).start;
      if (start > 1) expect(previousVerse(firstVerseOfPage(start, edition))).toEqual(lastVerseOfPage(start - 1, edition));
    }
  });

  it('is rebuilt from the bounds: node scripts/build-page-verses.js gives the same table', () => {
    for (const edition of editions) {
      const bounds = boundsFile(edition);
      const fromBounds = range(1, 604).map((p) => bounds[String(p)][0] * 1000 + bounds[String(p)][1]);
      expect((pageVerses as Record<string, number[]>)[edition]).toEqual(fromBounds);
    }
  });
});

describe('describePassage: a whole juz is "Juz N"', () => {
  it('one juz, several in a row, in any order', () => {
    expect(say(getPagesForJuz(28))).toBe('Juz 28');
    expect(say(getPagesForJuz(1))).toBe('Juz 1');
    expect(say(getPagesForJuz(30))).toBe('Juz 30');
    expect(say([...getPagesForJuz(28), ...getPagesForJuz(27)])).toBe('Juz 27–28');
    expect(sayRange(1, 604)).toBe('Juz 1–30');
  });

  it('a juz inside one long surah is still the juz (Juz 2 is all Al-Baqarah)', () => {
    expect(say(getPagesForJuz(2))).toBe('Juz 2');
  });

  it('the reverse plan: a juz served last page first is the same juz', () => {
    expect(say(range(604, 582), { order: 'given' })).toBe('Juz 30');
    expect(say(range(561, 542), { order: 'given' })).toBe('Juz 28');
  });

  it('off (wholeJuz: false): the surahs instead', () => {
    expect(say(getPagesForJuz(28), { wholeJuz: false })).toBe('Al-Mujadila to At-Tahrim');
    expect(say(getPagesForJuz(2), { wholeJuz: false })).toBe('Al-Baqarah, 21st to 40th page');
    expect(say(getPagesForJuz(30), { wholeJuz: false })).toBe('An-Naba to An-Nas');
  });
});

describe('describePassage: whole surahs by name', () => {
  it('one surah', () => {
    expect(sayRange(560, 561)).toBe('At-Tahrim');
    expect(sayRange(556, 557)).toBe('At-Taghabun');
    expect(sayRange(1, 1)).toBe('Al-Fatihah');
    expect(sayRange(2, 49)).toBe('Al-Baqarah');
    expect(sayRange(585, 585)).toBe("'Abasa");
  });

  it('several surahs: first to last', () => {
    expect(sayRange(526, 541)).toBe('An-Najm to Al-Hadid');
    expect(sayRange(553, 557)).toBe("Al-Jumu'ah to At-Taghabun");
    expect(sayRange(1, 49)).toBe('Al-Fatihah to Al-Baqarah');
    expect(sayRange(560, 604)).toBe('At-Tahrim to An-Nas');
  });

  it('short form names them the same', () => {
    expect(sayRange(560, 561, { form: 'short' })).toBe('At-Tahrim');
    expect(sayRange(526, 541, { form: 'short' })).toBe('An-Najm to Al-Hadid');
    expect(sayRange(549, 552)).toBe('Al-Mumtahanah to As-Saf');
  });
});

describe('describePassage: part of a surah', () => {
  it('a run names the surah and which of its pages', () => {
    expect(sayRange(22, 26)).toBe('Juz 2, first 5 pages');
    expect(sayRange(2, 5)).toBe('Al-Baqarah, first 4 pages');
    expect(sayRange(42, 49)).toBe('Al-Baqarah, last 8 pages');
    expect(sayRange(50, 61)).toBe("Ali 'Imran, first 12 pages");
  });

  it('short: the start or the end of it, else its pages', () => {
    expect(sayRange(2, 5, { form: 'short' })).toBe('Start of Al-Baqarah');
    expect(sayRange(42, 49, { form: 'short' })).toBe('End of Al-Baqarah');
    expect(sayRange(22, 26, { form: 'short' })).toBe('Juz 2, first 5 pages');
    expect(sayRange(562, 562, { form: 'short' })).toBe('Al-Mulk, 1st page');
  });

  it('compact: the same words (sub-lines)', () => {
    expect(sayRange(562, 562, { form: 'compact' })).toBe('Al-Mulk, 1st page');
    expect(sayRange(22, 26, { form: 'compact' })).toBe('Juz 2, first 5 pages');
    expect(sayRange(564, 564, { form: 'compact' })).toBe('Al-Qalam, 1st page');
    expect(sayRange(560, 561, { form: 'compact' })).toBe('At-Tahrim');
  });

  it('mid-sentence: "the start of …"', () => {
    expect(sayRange(2, 5, { form: 'short', sentence: true })).toBe('the start of Al-Baqarah');
    expect(sayRange(42, 49, { form: 'short', sentence: true })).toBe('the end of Al-Baqarah');
    expect(sayRange(22, 26, { sentence: true })).toBe('Juz 2, first 5 pages');
  });

  it('one page inside a long surah', () => {
    expect(sayRange(30, 30)).toBe('Al-Baqarah, 29th page');
    expect(sayRange(30, 30, { form: 'short' })).toBe('Al-Baqarah, 29th page');
    expect(say([118])).toBe("Al-Ma'idah, 13th page");
  });

  it('a run inside one surah that crosses a juz stays one part', () => {
    expect(sayRange(15, 34)).toBe('Al-Baqarah, 14th to 33rd page');
    expect(sayRange(20, 45)).toBe('Al-Baqarah, 19th to 44th page');
  });
});

describe('describePassage: across surahs, with an end mid-surah', () => {
  it('names alone: the amount says how much, and no ayah numbers', () => {
    expect(sayRange(521, 541)).toBe('Adh-Dhariyat to Al-Hadid');
    expect(sayRange(542, 546)).toBe('Al-Mujadila to Al-Hashr');
    expect(sayRange(45, 55)).toBe("Al-Baqarah to Ali 'Imran");
    expect(sayRange(1, 10)).toBe('Al-Fatihah to Al-Baqarah');
  });

  it('`exact`: the page at each end, where both must be exact', () => {
    expect(sayRange(309, 315, { exact: true })).toBe('Maryam, 5th page to Taha, 4th page');
    expect(sayRange(1, 10, { exact: true })).toBe('Al-Fatihah to Al-Baqarah, 9th page');
  });

  it('a juz ending mid-surah is named by its surahs too', () => {
    expect(sayRange(45, 61)).toBe('Al-Baqarah to Ali \'Imran');
    expect(sayRange(1, 21, { wholeJuz: false })).toBe('Al-Fatihah to Al-Baqarah');
  });

  it('short form names them the same', () => {
    expect(sayRange(521, 541, { form: 'short' })).toBe('Adh-Dhariyat to Al-Hadid');
    expect(sayRange(45, 61, { form: 'short' })).toBe("Al-Baqarah to Ali 'Imran");
  });

  it('pages shared by two or more surahs', () => {
    expect(sayRange(604, 604)).toBe('Al-Ikhlas to An-Nas');
    expect(sayRange(595, 595)).toBe('Ash-Shams');
    expect(sayRange(595, 595, { form: 'short' })).toBe('Ash-Shams');
    expect(sayRange(596, 596)).toBe('Ad-Duhaa to Ash-Sharh');
    expect(sayRange(603, 604)).toBe('Al-Kafirun to An-Nas');
  });
});

describe('describePassage: the juz as a second part (juz: true)', () => {
  it('added when the pages lie in one juz or two in a row', () => {
    expect(sayRange(22, 26, { juz: true })).toBe('Juz 2, first 5 pages');
    expect(sayRange(542, 543, { juz: true })).toBe('Al-Mujadila, first 2 pages · Juz 28');
    expect(sayRange(560, 561, { juz: true })).toBe('At-Tahrim · Juz 28');
    expect(sayRange(15, 34, { juz: true })).toBe('Al-Baqarah, 14th to 33rd page · Juz 1–2');
  });

  it('left out when the text already names a juz, or the pages span more than two', () => {
    expect(sayRange(542, 561, { juz: true })).toBe('Juz 28');
    expect(sayRange(45, 61, { juz: true })).toBe("Al-Baqarah to Ali 'Imran · Juz 3");
    expect(sayRange(2, 49, { juz: true })).toBe('Al-Baqarah');
    expect(say([...range(595, 604), ...range(1, 10)], { order: 'given', juz: true })).toBe(
      'Ash-Shams to An-Nas, then Al-Fatihah to Al-Baqarah',
    );
  });
});

describe('describePassage: several parts', () => {
  it('a set, in page order, joined with "and"', () => {
    expect(say([...getPagesForJuz(30), ...getPagesForJuz(1)])).toBe('Juz 1 and Juz 30');
    expect(say([...range(560, 561), ...range(2, 5)])).toBe('Al-Baqarah, first 4 pages and At-Tahrim');
    expect(say([...range(560, 561), ...range(2, 5)], { form: 'short' })).toBe('Start of Al-Baqarah and At-Tahrim');
  });

  it('whole juz carved out of a set where surahs alone would need numbers', () => {
    // Juz 1–6, 21–28, page 562 (the first page of Al-Mulk) and Juz 30: the memorized pages of the E2E seed.
    const memorized = [...range(1, 121), ...range(402, 562), ...range(582, 604)];
    expect(say(memorized, { max: 4 })).toBe('Juz 1–6, Juz 21–28, Al-Mulk, 1st page and Juz 30');
    expect(say(memorized)).toBe('Juz 1–6, Juz 21–28 and 2 more');
    expect(say(range(561, 604))).toBe('At-Tahrim, last page and Juz 29–30');
    // One whole juz inside a range is not carved out.
    expect(say(range(581, 604))).toBe('Al-Mursalat to An-Nas');
    expect(say(range(521, 541))).toBe('Adh-Dhariyat to Al-Hadid');
    // Named by surahs alone, it stays that way.
    expect(say(range(560, 604))).toBe('At-Tahrim to An-Nas');
  });

  it("a session's runs in its own order, joined with \"then\"", () => {
    expect(say([...range(595, 604), ...range(1, 10)], { order: 'given' })).toBe(
      'Ash-Shams to An-Nas, then Al-Fatihah to Al-Baqarah',
    );
    // The reverse plan across the cycle's start: page 10 down to 1, then 604 down to 595.
    expect(say([...range(10, 1), ...range(604, 595)], { order: 'given' })).toBe(
      'Al-Fatihah to Al-Baqarah, then Ash-Shams to An-Nas',
    );
    // In page order instead, the same pages are a set.
    expect(say([...range(595, 604), ...range(1, 10)])).toBe('Al-Fatihah to Al-Baqarah and Ash-Shams to An-Nas');
  });

  it('beyond `max` parts: "and N more"', () => {
    expect(say([2, 30, 300, 450, 600])).toBe('Al-Baqarah, 1st page, Al-Baqarah, 29th page and 3 more');
    expect(say([2, 30, 300, 450, 600], { order: 'given', max: 2 })).toBe('Al-Baqarah, 1st page, then 4 more');
  });

  it('pages out of range are ignored; none is ""', () => {
    expect(say([])).toBe('');
    expect(say([0, 605, 1.5, NaN])).toBe('');
    expect(say([0, 560, 561, 999])).toBe('At-Tahrim');
    expect(sayRange(561, 560)).toBe('At-Tahrim');
    expect(sayRange(0, 3)).toBe('');
  });
});

describe('describePassage: the print', () => {
  it('the pages drawn differently are named from their own ayahs; whole surahs and juz are the same', () => {
    expect(sayRange(118, 121, { edition: 'madani1405' })).toBe("Juz 6, last 4 pages");
    expect(sayRange(118, 121, { edition: 'madani1441' })).toBe("Juz 6, last 4 pages");
    expect(sayRange(586, 586, { edition: 'madani1405' })).toBe('At-Takwir');
    expect(sayRange(586, 586, { edition: 'madani1441' })).toBe('At-Takwir');
    expect(pageInSurah(586, 80, 'madani1441')).toEqual({ n: 2, count: 2 });
    expect(pageInSurah(586, 80, 'madani1405')).toBeNull();
    expect(say(getPagesForJuz(30), { edition: 'madani1441' })).toBe('Juz 30');
    expect(sayRange(560, 561, { edition: 'madani1441' })).toBe('At-Tahrim');
  });
});

describe('describeSession (SESS-5)', () => {
  it('whole juz on the juz plan', () => {
    expect(plainText(describeSession(getPagesForJuz(29), { juzPlan: true, edition: 'madani1405' }))).toBe('Juz 29');
    expect(
      plainText(describeSession([...getPagesForJuz(28), ...getPagesForJuz(29)], { juzPlan: true, edition: 'madani1405' })),
    ).toBe('Juz 28–29');
  });

  it('pages credited ahead (not in `revised`) do not stop a whole juz', () => {
    const pages = [...getPagesForJuz(29), 582, 583];
    expect(plainText(describeSession(pages, { juzPlan: true, revised: getPagesForJuz(29), edition: 'madani1405' }))).toBe(
      'Juz 29',
    );
  });

  it('off the juz plan, a juz with a page missing, or juz with more besides: the surahs', () => {
    expect(plainText(describeSession(getPagesForJuz(29), { edition: 'madani1405' }))).toBe('Al-Mulk to Al-Mursalat');
    expect(plainText(describeSession(range(563, 581), { juzPlan: true, edition: 'madani1405' }))).toBe(
      'Al-Mulk to Al-Mursalat',
    );
    expect(plainText(describeSession(range(560, 581), { juzPlan: true, edition: 'madani1405' }))).toBe(
      'At-Tahrim to Al-Mursalat',
    );
    expect(plainText(describeSession(range(522, 541), { form: 'short', edition: 'madani1405' }))).toBe(
      'Adh-Dhariyat to Al-Hadid',
    );
  });
});

describe('placeOfPage: where reading begins', () => {
  it('the surah or juz when the page opens it, else which page of the surah', () => {
    expect(plainText(placeOfPage(542, { edition: 'madani1405' }))).toBe('Al-Mujadila');
    expect(plainText(placeOfPage(22, { edition: 'madani1405' }))).toBe('Juz 2');
    expect(plainText(placeOfPage(22, { form: 'short', edition: 'madani1405' }))).toBe('Juz 2');
    expect(plainText(placeOfPage(1, { edition: 'madani1405' }))).toBe('Al-Fatihah');
    expect(plainText(placeOfPage(538, { edition: 'madani1405' }))).toBe('Al-Hadid, 2nd page');
    expect(plainText(placeOfPage(586, { edition: 'madani1441' }))).toBe('At-Takwir');
    expect(placeOfPage(0)).toBe('');
  });

  it('names every page differently, in both prints (where a day starts can be read back from the words)', () => {
    for (const edition of ['madani1405', 'madani1441'] as const) {
      const places = range(1, 604).map((p) => placeOfPage(p, { edition }));
      expect(new Set(places).size).toBe(604);
    }
  });
});

describe('partOfSurah: the part of a surah, for a row named by it', () => {
  it('whole, its pages, several parts; other surahs on the pages add nothing', () => {
    const say1 = (sura: number, pages: number[]) => plainText(partOfSurah(sura, pages, 'madani1405'));
    expect(say1(67, [562, 563, 564])).toBe('Whole surah');
    expect(say1(2, range(22, 41))).toBe('21st to 40th page');
    expect(say1(68, [564])).toBe('1st page');
    expect(say1(67, [564])).toBe('Last page');
    expect(say1(2, [...range(2, 3), ...range(22, 23)])).toBe('First 2 pages, 21st to 22nd page');
    expect(say1(2, [49])).toBe('Last page');
    expect(say1(3, [49])).toBe('');
    expect(say1(112, [604])).toBe('Whole surah');
  });
});

describe('pagesNote: page numbers as a quiet detail', () => {
  it('p. N, pp. N–M, several runs, at most three', () => {
    expect(plainText(pagesNote([542]))).toBe('p. 542');
    expect(plainText(pagesNote(range(542, 561)))).toBe('pp. 542–561');
    expect(plainText(pagesNote([...range(595, 604), ...range(1, 10)], { order: 'given' }))).toBe('pp. 595–604, 1–10');
    expect(plainText(pagesNote([1, 3, 5, 7]))).toBe('pp. 1, 3, 5, …');
    expect(pagesNote([])).toBe('');
  });
});

describe('text for the screen, for notifications and for VoiceOver', () => {
  it('names hold together: no-break hyphens and spaces, "Juz 28" and "first 2 pages" unbroken', () => {
    expect(surahName(2)).toBe(`Al${NBHY}Baqarah`);
    expect(surahName(3)).toBe(`Ali${NBSP}'Imran`);
    expect(describePassage(getPagesForJuz(28))).toBe(`Juz${NBSP}28`);
    expect(describePageRange(542, 543, { edition: 'madani1405' })).toBe(`Al${NBHY}Mujadila, first${NBSP}2${NBSP}pages`);
  });

  it('spokenText reads ranges as "to" and pages as words', () => {
    expect(spokenText(describePageRange(22, 26, { edition: 'madani1405', juz: true }))).toBe(
      'Juz 2, first 5 pages',
    );
    expect(spokenText(describePassage([...getPagesForJuz(27), ...getPagesForJuz(28)]))).toBe('Juz 27 to 28');
    expect(spokenText(pagesNote(range(542, 561)))).toBe('pages 542 to 561');
    expect(spokenText(pagesNote([542]))).toBe('page 542');
  });

  it('every surah has a name and an ayah count', () => {
    for (let s = 1; s <= 114; s++) {
      expect(surahName(s).length).toBeGreaterThan(0);
      expect(getSurahDisplay(s)?.ayahCount).toBeGreaterThan(0);
    }
  });
});

describe('pageRunEnds: a strip’s two labels (Activity’s day, ACT-20)', () => {
  it('the surahs a run starts and ends in', () => {
    expect(pageRunEnds(542, 561).map(plainText)).toEqual(['Al-Mujadila', 'At-Tahrim']);
  });
  it('inside one surah, which of its pages', () => {
    expect(pageRunEnds(23, 25).map(plainText)).toEqual(['22nd page', '24th page']);
    expect(pageRunEnds(47, 49).map(plainText)).toEqual(['46th page', 'Last page']);
  });
  it('nothing for a page out of range', () => {
    expect(pageRunEnds(0, 700)).toEqual(['', '']);
  });
});

describe('[NAME-1] a place by its surah and page, never its ayah numbers', () => {
  it('which page of a surah: 1st, nth, last; a page holding two surahs counts for both', () => {
    expect(pageInSurah(309, 19)).toEqual({ n: 5, count: 8 });
    expect(pageInSurah(312, 19)).toEqual({ n: 8, count: 8 });
    expect(pageInSurah(312, 20)).toEqual({ n: 1, count: 10 });
    expect(pageInSurah(304, 19)).toBeNull();
    expect(sayRange(309, 309)).toBe('Maryam, 5th page');
    expect(sayRange(305, 305)).toBe('Maryam, 1st page');
    expect(sayRange(307, 309)).toBe('Maryam, 3rd to 5th page');
    expect(sayRange(305, 307)).toBe('Maryam, first 3 pages');
  });

  it('a page holding two surahs, alone, is named by the one that fills more of it', () => {
    expect(sayRange(312, 312)).toBe('Taha, 1st page');
    expect(sayRange(584, 584)).toBe("An-Nazi'at, last page");
  });

  it('a run from a juz edge says the juz', () => {
    expect(sayRange(22, 26)).toBe('Juz 2, first 5 pages');
    expect(sayRange(38, 41)).toBe('Juz 2, last 4 pages');
    expect(sayRange(22, 26, { wholeJuz: false })).toBe('Al-Baqarah, 21st to 25th page');
  });

  it('part of a page: the page, then start, middle or end', () => {
    const part = (keys: number[]) => plainText(describeAyahs(keys, { edition: 'madani1405' }));
    expect(part([67001, 67002, 67003, 67004, 67005])).toBe('Al-Mulk, 1st page · start');
    expect(part([2150, 2151])).toBe('Al-Baqarah, 22nd page · middle');
    expect(partOfPage({ from: 67010, to: 67012 }, 562, 'madani1405')).toBe('end');
    expect(partOfPage({ from: 67001, to: 67012 }, 562, 'madani1405')).toBe('whole');
  });

  it('a verse being cited or played keeps its number, and only then', () => {
    expect(plainText(placeOfAyah(10016, { form: 'ayahs' }))).toBe('Yunus, ayah 16');
    expect(plainText(placeOfAyah(10016, { form: 'ayahsCompact' }))).toBe('Yunus 16');
    expect(plainText(describeAyahs([2142, 2143], { form: 'ayahs' }))).toBe('Al-Baqarah, ayahs 142–143');
    expect(plainText(describeAyahs([2142, 2143], { form: 'ayahsCompact' }))).toBe('Al-Baqarah 142–143');
    for (const page of range(1, 604)) {
      expect(plainText(describePageRange(page, page))).not.toMatch(/ayah|\d+–\d+/);
      expect(plainText(placeOfPage(page))).not.toMatch(/ayah/);
    }
  });
});

describe('[NAME-1] a page by its first words', () => {
  it('the first words of the page as printed, up to four, whole', () => {
    expect(firstWordsOfPage(309, 'madani1405').split(' ')).toHaveLength(4);
    expect(firstWordsOfPage(2, 'madani1405')).toBe('الٓمٓ');
    expect(firstWordsOfPage(0)).toBe('');
  });

  it('the table is the words of each print’s own first ayah (scripts/build-page-first-words.js)', () => {
    const { uthmani } = JSON.parse(readFileSync(join(__dirname, '../../data/quranWords.dat'), 'utf8')) as { uthmani: string[] };
    const starts = [0];
    for (let s = 1; s <= 114; s++) starts[s] = (starts[s - 1] ?? 0) + (s > 1 ? (getSurahDisplay(s - 1)?.ayahCount ?? 0) : 0);
    for (const edition of ['madani1405', 'madani1441'] as const) {
      for (const page of range(1, 604)) {
        const { sura, ayah } = firstVerseOfPage(page, edition);
        const words = uthmani[starts[sura] + ayah - 1].split(' ').slice(0, 4).join(' ');
        expect(firstWordsOfPage(page, edition)).toBe(words);
      }
    }
  });
});
