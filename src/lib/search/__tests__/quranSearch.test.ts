import { quranWords, say, verse, verses } from '../../recite/__fixtures__/quranWords';
import { matchedWords, queryWords, searchText, withoutRepeats } from '../quranSearch';

const words = quranWords();
const found = (text: string) => searchText(words, text).hits.map((h) => `${h.sura}:${h.ayah}`);

describe('searchText', () => {
  it('finds the one ayah a phrase is in, from its start or its middle', () => {
    expect(found('قل لو شاء الله')).toEqual(['10:16']);
    expect(found('ما تلوته عليكم ولا أدراكم به')).toEqual(['10:16']);
  });

  it('lists every ayah a phrase is in, in mushaf order', () => {
    const hits = found('جنات تجري من تحتها الانهار');
    expect(hits.length).toBeGreaterThan(20);
    expect(hits.slice(0, 3)).toEqual(['2:25', '3:15', '3:195']);
    expect(found('بسم الله الرحمن الرحيم')).toEqual(['1:1', '27:30']);
  });

  it('reads the Uthmani spelling and diacritics as typed or heard', () => {
    expect(found('قُلْ لَوْ شَآءَ ٱللَّهُ مَا تَلَوْتُهُۥ عَلَيْكُمْ')).toEqual(['10:16']);
    expect(found('ذلك الكتاب لا ريب فيه')).toEqual(['2:2']);
  });

  it('still finds the ayah when a word was misheard by a letter', () => {
    const r = searchText(words, 'قل لو شاء الله ما تلوتو عليكم');
    expect(r.hits[0]).toMatchObject({ sura: 10, ayah: 16 });
    expect(r.hits[0].score).toBeLessThan(1);
  });

  it('accepts a phrase without the "and" or "so" it starts with in the text', () => {
    expect(found('يدخلهم جنات')).toContain('58:22');
  });

  it('puts the phrase itself before ayat that only nearly have it', () => {
    const r = searchText(words, 'الله لا اله الا هو الحي القيوم');
    expect(r.hits.map((h) => `${h.sura}:${h.ayah}`)).toEqual(['2:255', '3:2']);
    expect(r.hits.every((h) => h.score === 1)).toBe(true);
  });

  it('follows a recitation into the next ayah', () => {
    const r = searchText(words, say(verse(2, 4).slice(-3), verse(2, 5).slice(0, 4)));
    expect(r.hits[0]).toMatchObject({ sura: 2, ayah: 4 });
    expect(r.hits[0].to - r.hits[0].from).toBe(7);
  });

  it('sets aside the isti’adha and the basmala said before an ayah', () => {
    expect(found('أعوذ بالله من الشيطان الرجيم الحمد لله رب العالمين')[0]).toBe('1:2');
    expect(found(say('بسم الله الرحمن الرحيم', verse(67, 1).slice(0, 4)))).toEqual(['67:1']);
  });

  it('reads يا أيها, printed as one word, said as two', () => {
    expect(queryWords(words, 'يا أيها الذين آمنوا').map((w) => w.key)).toEqual(['ياايها', 'الذين', 'امنوا']);
    const r = searchText(words, 'يا أيها الذين آمنوا');
    expect(r.total).toBeGreaterThan(80);
    expect(r.hits).toHaveLength(50);
  });

  it('finds a long recitation from its words, as recognition writes them', () => {
    expect(found(say(verses(36, 1, 4)))[0]).toBe('36:1');
    expect(found(say(verse(2, 255).slice(10, 30)))[0]).toBe('2:255');
  });

  it('finds the ayah when recognition repeats itself', () => {
    expect(found('إياك نعبد وإياك نعبد وإياك نعبد وإياك نستعين')).toEqual(['1:5']);
  });

  it('finds nothing in words that are not in the Quran', () => {
    expect(found('كيف حالك اليوم يا صديقي')).toEqual([]);
    expect(found('ترجمة نانسي قنقر')).toEqual([]);
    expect(found('')).toEqual([]);
  });

  it('answers quickly', () => {
    const started = Date.now();
    for (let i = 0; i < 5; i++) searchText(words, say(verse(2, 255).slice(0, 12)));
    expect((Date.now() - started) / 5).toBeLessThan(500);
  });
});

describe('withoutRepeats', () => {
  const ws = (text: string) => queryWords(words, text);
  it('keeps a phrase said twice in a row once', () => {
    expect(withoutRepeats(ws('فارجع البصر فارجع البصر هل ترى')).map((w) => w.key)).toEqual(['فارجع', 'البصر', 'هل', 'تري']);
  });
  it('keeps a short word said twice (it can be in the text twice)', () => {
    expect(withoutRepeats(ws('كلا كلا')).map((w) => w.key)).toEqual(['كلا', 'كلا']);
  });
});

describe('matchedWords', () => {
  it('marks the words of the ayah that were searched for', () => {
    const r = searchText(words, 'قل لو شاء الله');
    const set = matchedWords(words, r.hits[0], r.words);
    const [from] = words.verseRange(10, 16);
    expect([...set].sort((a, b) => a - b)).toEqual([from, from + 1, from + 2, from + 3]);
  });
});
