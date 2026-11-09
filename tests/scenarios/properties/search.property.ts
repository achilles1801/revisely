// Searching the Qur'an (SEARCH-1, SEARCH-2), from lib/search: any few words of any ayah find it, and
// places typed by name or number go there. The words are the mushaf's own, in standard spelling, as
// speech recognition writes them (lib/recite's word data).

import fc from 'fast-check';
import { quranWords, wordsData } from '../../../src/lib/recite/__fixtures__/quranWords';
import { searchText } from '../../../src/lib/search/quranSearch';
import { parseReference } from '../../../src/lib/search/parseQuery';
import { getAllSurahs, getSurahDisplay } from '../../../src/lib/quranData';
import { runs } from './fixtures';

const words = quranWords();
const data = wordsData();

/** Every word of the Qur'an in standard spelling, in mushaf order (word i of QuranWords). */
const plain: string[] = data.imlaei.flatMap((v) => v.split(' ').map((w) => w.replace(/ /g, ' ')));

/** A run of the text: `length` words from word `start` (it may run into the next ayah). */
const runArb = (min: number, max: number) =>
  fc.record({ start: fc.integer({ min: 0, max: plain.length - max - 1 }), length: fc.integer({ min, max }) });

/** Searched with room for every match, so a phrase found in many ayat still lists this one. */
const findsRun = (text: string, start: number, length: number) =>
  searchText(words, text, 2000).hits.some((h) => h.from < start + length && start < h.to);

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));

describe('finding an ayah from its words (SEARCH-1)', () => {
  it('[SEARCH-1] any four to eight words in a row find the ayah they are in', () => {
    fc.assert(
      fc.property(runArb(4, 8), ({ start, length }) => {
        expect(findsRun(plain.slice(start, start + length).join(' '), start, length)).toBe(true);
      }),
      { numRuns: runs(120) },
    );
  });

  it('[SEARCH-1] still found with one word misheard by a letter, or the phrase said twice', () => {
    const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
    fc.assert(
      fc.property(
        runArb(6, 9),
        fc.nat(),
        fc.nat(),
        fc.constantFrom(...letters.split('')),
        fc.boolean(),
        ({ start, length }, which, at, letter, twice) => {
          const run = plain.slice(start, start + length);
          const k = which % run.length;
          const word = run[k];
          if (word.length >= 4 && !word.includes(' ')) {
            const i = 1 + (at % (word.length - 1));
            run[k] = word.slice(0, i) + letter + word.slice(i + 1);
          }
          const text = twice ? `${run.join(' ')} ${run.join(' ')}` : run.join(' ');
          expect(findsRun(text, start, length)).toBe(true);
        },
      ),
      { numRuns: runs(80) },
    );
  });

  it('[SEARCH-1] a phrase in several ayat lists every one, in mushaf order', () => {
    const r = searchText(words, 'فبأي آلاء ربكما تكذبان', 2000);
    expect(r.hits).toHaveLength(31);
    expect(r.hits.every((h) => h.sura === 55 && h.score > 0.999)).toBe(true);
    expect(r.hits.map((h) => h.from)).toEqual([...r.hits.map((h) => h.from)].sort((a, b) => a - b));
  });

  it('[SEARCH-1] words that aren’t in the Qur’an find nothing', () => {
    const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'.split('');
    const wordArb = fc.array(fc.constantFrom(...letters), { minLength: 6, maxLength: 8 }).map((l) => l.join(''));
    fc.assert(
      fc.property(fc.array(wordArb, { minLength: 3, maxLength: 5 }), (ws) => {
        expect(searchText(words, ws.join(' ')).hits).toEqual([]);
      }),
      { numRuns: runs(40) },
    );
  });
});

describe('places by name or number (SEARCH-2)', () => {
  const surahArb = fc.integer({ min: 1, max: 114 });
  const verseArb = surahArb.chain((sura) =>
    fc.record({ sura: fc.constant(sura), ayah: fc.integer({ min: 1, max: getSurahDisplay(sura)?.ayahCount ?? 1 }) }),
  );

  it('[SEARCH-2] an ayah as surah:ayah, in either digits, and a surah’s name with an ayah', () => {
    fc.assert(
      fc.property(verseArb, ({ sura, ayah }) => {
        const verse = { kind: 'verse', sura, ayah };
        expect(parseReference(`${sura}:${ayah}`)).toEqual([verse]);
        expect(parseReference(`${toArabicDigits(sura)}:${toArabicDigits(ayah)}`)).toEqual([verse]);
        const name = getAllSurahs()[sura - 1].name;
        expect(parseReference(`${name} ${ayah}`)).toContainEqual(verse);
      }),
      { numRuns: runs(200) },
    );
  });

  it('[SEARCH-2] every surah by its name, Latin or Arabic', () => {
    for (const s of getAllSurahs()) {
      expect(parseReference(s.name)).toContainEqual({ kind: 'surah', sura: s.number });
      expect(parseReference(getSurahDisplay(s.number)?.nameDisplay ?? s.name)).toContainEqual({ kind: 'surah', sura: s.number });
      expect(parseReference(s.nameArabic)).toContainEqual({ kind: 'surah', sura: s.number });
    }
  });

  it('[SEARCH-2] pages and juz, and nothing past the mushaf', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 604 }), fc.integer({ min: 1, max: 30 }), (page, juz) => {
        expect(parseReference(`page ${page}`)).toEqual([{ kind: 'page', page }]);
        expect(parseReference(`juz ${juz}`)).toEqual([{ kind: 'juz', juz }]);
        const bare = parseReference(String(page));
        expect(bare).toContainEqual({ kind: 'page', page });
        expect(bare.some((t) => t.kind === 'surah')).toBe(page <= 114);
      }),
      { numRuns: runs(200) },
    );
    expect(parseReference('page 605')).toEqual([]);
    expect(parseReference('juz 31')).toEqual([]);
    expect(parseReference('115:1')).toEqual([]);
    expect(parseReference('2:287')).toEqual([]);
  });
});
