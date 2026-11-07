const { checkAnswer, checkVerseBlock, excerpt, smokeContext } = require('../live');
const { validateContext } = require('../../../functions/src/revo/validate');

describe('the live smoke check', () => {
  it('sends a context the server accepts (functions/src/revo/validate)', () => {
    expect(() => validateContext(smokeContext('2026-11-07'))).not.toThrow();
  });

  it('accepts only an answer the app would show', () => {
    const q = 'Smoke check?';
    const good = {
      chatId: 'c1',
      title: 'Smoke',
      question: { id: 'q', role: 'user', text: q, at: 1 },
      reply: { id: 'r', role: 'revo', text: 'Today is a rest day.', at: 2 },
      remainingToday: 19,
      cached: false,
    };
    expect(checkAnswer(good, q)).toEqual([]);
    // The envelope read as the answer (REACT-NATIVE-10), an empty reply, a missing count.
    expect(checkAnswer({ result: good }, q)).toContain('no chatId');
    expect(checkAnswer({ ...good, reply: { ...good.reply, text: ' ' } }, q)).toEqual(['the reply has no text']);
    expect(checkAnswer({ ...good, remainingToday: undefined }, q)).toEqual(['no remainingToday']);
    expect(checkAnswer(null, q)).toEqual(['no result']);
  });

  it("accepts only the worker's block for 1:1 as the verse sheet would show it", () => {
    // Placeholder wording, not The Clear Quran's text, except the phrase the check looks for.
    const verses = Array.from({ length: 7 }, (_, i) => ({ verse_key: `1:${i + 1}`, text: `Verse ${i + 1}.` }));
    verses[0].text = 'In the Name of God, the Most Compassionate.';
    verses[2].text = 'With a footnote<footnote id="57" number="1">1</footnote> in it.';
    const good = { surah: 1, from: 1, to: 7, verses };
    expect(checkVerseBlock(good)).toEqual([]);

    expect(checkVerseBlock(null)).toEqual(['no block']);
    expect(checkVerseBlock({ ...good, to: 30, verses: verses.slice(0, 6) })).toEqual([
      'not the block 1:1–1:7 (1:1–30)',
      '6 verses, not 7',
    ]);
    const swapped = [verses[1], verses[0], ...verses.slice(2)];
    expect(checkVerseBlock({ ...good, verses: swapped })).toContain('verse 1 is 1:2');
    const empty = verses.map((v, i) => (i === 4 ? { ...v, text: '' } : v));
    expect(checkVerseBlock({ ...good, verses: empty })).toEqual(['1:5 has no text']);
    const markup = verses.map((v, i) => (i === 1 ? { ...v, text: 'Text <b>bold</b>' } : v));
    expect(checkVerseBlock({ ...good, verses: markup })).toEqual(['1:2 holds markup other than footnotes']);
    // Another translation under The Clear Quran's name (its licence forbids it).
    const other = verses.map((v, i) => (i === 0 ? { ...v, text: 'In the name of God, the Entirely Merciful.' } : v));
    expect(checkVerseBlock({ ...good, verses: other })).toEqual(['1:1 is not The Clear Quran’s wording']);
  });

  it('never prints a token or a key', () => {
    const jwt = `eyJhbGciOiJSUzI1NiJ9.${'a'.repeat(40)}.${'b'.repeat(40)}`;
    expect(excerpt(`bad ${jwt} and AIza${'x'.repeat(35)}`)).toBe('bad [token] and [key]');
  });
});
