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

  it('follows a recitation into the next ayah, and says where it ends', () => {
    const r = searchText(words, say(verse(2, 4).slice(-3), verse(2, 5).slice(0, 4)));
    expect(r.hits[0]).toMatchObject({ sura: 2, ayah: 4, last: { sura: 2, ayah: 5 } });
    expect(r.hits[0].to - r.hits[0].from).toBe(7);
    expect(searchText(words, 'قل لو شاء الله').hits[0].last).toEqual({ sura: 10, ayah: 16 });
  });

  // From the property test's seed -935442960 (Nov 9 2026): the end of 22:49 and the first
  // word of 22:50 found nothing. "نذير مبين" was read as the one word 71:2 prints, and
  // "إنما أنا" as one word said twice.
  it('finds the end of an ayah run into the first word of the next', () => {
    const r = searchText(words, 'الناس إنما أنا لكم نذير مبين فالذين');
    const [from] = words.verseRange(22, 49);
    expect(r.hits[0]).toMatchObject({ sura: 22, ayah: 49, last: { sura: 22, ayah: 50 }, from: from + 2, to: from + 9 });
    expect(r.hits[0].score).toBeGreaterThan(0.999);
    expect(r.hits).toHaveLength(1);
  });

  it('reads two words apart where the text has them apart, though one ayah prints them as one', () => {
    // "نذير مبين" is one word in 71:2 only; "سواء السبيل" in 60:1 only.
    expect(found('إنما أنا لكم نذير مبين')[0]).toBe('22:49');
    expect(found('إني لكم نذير مبين')).toEqual(['11:25', '71:2']);
    expect(found('فقد ضل سواء السبيل')).toEqual(expect.arrayContaining(['2:108', '5:12', '60:1']));
    expect(found('ولا تتبعوا أهواء قوم قد ضلوا من قبل وأضلوا كثيرا وضلوا عن سواء السبيل')).toEqual(['5:77']);
  });

  it('sets aside the isti’adha and the basmala said before an ayah', () => {
    expect(found('أعوذ بالله من الشيطان الرجيم الحمد لله رب العالمين')[0]).toBe('1:2');
    expect(found(say('بسم الله الرحمن الرحيم', verse(67, 1).slice(0, 4)))).toEqual(['67:1']);
  });

  it('finds the ayah when the basmala and the words after it are said twice', () => {
    // The Fatihah from its start (the property's seed -378724082), and 27:30's basmala on into 27:31.
    const fatihah = 'بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن';
    expect(found(`${fatihah} ${fatihah}`)[0]).toBe('1:2');
    const naml = 'بسم الله الرحمن الرحيم ألا تعلوا علي وأتوني مسلمين';
    expect(found(`${naml} ${naml}`)).toEqual(['27:31']);
    const both = 'أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم الحمد لله رب العالمين';
    expect(found(`${both} ${both}`)[0]).toBe('1:2');
    // A word said twice after the basmala is still the word, not the basmala.
    expect(found('بسم الله الرحمن الرحيم فارجع البصر فارجع البصر')).toEqual(['67:3', '67:4']);
  });

  it('searches two words after a basmala with it too, and lists both', () => {
    // 27:30's basmala and 27:31's first two words, the second misheard (تعلوا as تكلوا): the two
    // words alone are 6:119's (ألا تأكلوا without its hamza), the basmala with them 27:30–31.
    expect(found('ألا تكلوا')).toEqual(['6:119']);
    const r = searchText(words, 'بسم الله الرحمن الرحيم ألا تكلوا');
    expect(r.hits.map((h) => `${h.sura}:${h.ayah}`)).toEqual(['6:119', '27:30']);
    expect(r.hits[1].last).toEqual({ sura: 27, ayah: 31 });
    // Two words that follow no basmala in the text: nothing is added for the basmala alone.
    expect(found('بسم الله الرحمن الرحيم الم ذلك')).toEqual(['2:1']);
    // The Fatihah's basmala and the start of its second ayah: still 1:2 first.
    expect(found('بسم الله الرحمن الرحيم الحمد لله')[0]).toBe('1:2');
  });

  it('reads يا أيها, printed as one word, said as two (or typed as one)', () => {
    const r = searchText(words, 'يا أيها الذين آمنوا');
    expect(r.total).toBeGreaterThan(80);
    expect(r.hits).toHaveLength(50);
    expect(r.hits[0]).toMatchObject({ sura: 2, ayah: 104, from: words.verseRange(2, 104)[0] });
    expect(r.hits[0].score).toBeGreaterThan(0.999);
    expect(searchText(words, 'ياأيها الذين آمنوا').total).toBe(r.total);
    // Said as three: يا ابن أم (20:94).
    expect(found('قال يا ابن أم لا تأخذ بلحيتي')).toEqual(['20:94']);
  });

  it('finds a long recitation from its words, as recognition writes them', () => {
    expect(found(say(verses(36, 1, 4)))[0]).toBe('36:1');
    expect(found(say(verse(2, 255).slice(10, 30)))[0]).toBe('2:255');
  });

  it('finds the ayah when recognition repeats itself', () => {
    expect(found('إياك نعبد وإياك نعبد وإياك نعبد وإياك نستعين')).toEqual(['1:5']);
  });

  it('finds words said twice as said when the text has them twice', () => {
    const r = searchText(words, 'ليلة القدر ليلة القدر');
    expect(r.hits[0]).toMatchObject({ sura: 97, ayah: 2, last: { sura: 97, ayah: 3 } });
    expect(r.hits[0].to - r.hits[0].from).toBe(4);
    const [from, to] = words.verseRange(112, 3);
    expect(searchText(words, 'لم يلد ولم يولد').hits[0]).toMatchObject({ sura: 112, ayah: 3, from, to });
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
  const ws = (text: string) => queryWords(text);
  it('keeps a phrase said twice in a row once', () => {
    expect(withoutRepeats(ws('فارجع البصر فارجع البصر هل ترى')).map((w) => w.key)).toEqual(['فارجع', 'البصر', 'هل', 'تري']);
  });
  it('keeps a short word said twice (it can be in the text twice)', () => {
    expect(withoutRepeats(ws('كلا كلا')).map((w) => w.key)).toEqual(['كلا', 'كلا']);
  });
  it('keeps neighbouring words a letter apart: one word counts as said twice only when it is the same', () => {
    expect(withoutRepeats(ws('إنما أنا لكم')).map((w) => w.key)).toEqual(['انما', 'انا', 'لكم']);
    expect(withoutRepeats(ws('الرحمن الرحمن الرحيم')).map((w) => w.key)).toEqual(['الرحمن', 'الرحيم']);
  });
});

describe('matchedWords', () => {
  it('marks the words of the ayah that were searched for', () => {
    const r = searchText(words, 'قل لو شاء الله');
    const set = matchedWords(words, r.hits[0], r.words);
    const [from] = words.verseRange(10, 16);
    expect([...set].sort((a, b) => a - b)).toEqual([from, from + 1, from + 2, from + 3]);
  });
  it('marks a word printed as one that was said as two, and words in the next ayah', () => {
    const r = searchText(words, 'يا أيها الناس إنما أنا لكم نذير مبين فالذين آمنوا');
    const set = matchedWords(words, r.hits[0], r.words);
    const [from] = words.verseRange(22, 49);
    const [next] = words.verseRange(22, 50);
    expect([...set].sort((a, b) => a - b)).toEqual([from + 1, from + 2, from + 3, from + 4, from + 5, from + 6, from + 7, next, next + 1]);
  });
});
