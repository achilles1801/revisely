// The books Revo answers about the Qur'an from (REVO-47): the choice as the server keeps it, and how it reads.
import { booksInWords, booksValue, chosenTafsirBooks, toggleBook } from '../tafsirBooks';

describe('the tafsir books chosen', () => {
  it('are Ibn Kathir alone until chosen, and any of the four, each once', () => {
    expect(chosenTafsirBooks(undefined)).toEqual(['ibnKathir']);
    expect(chosenTafsirBooks(['qurtubi', 'saadi', 'qurtubi', 'nope'])).toEqual(['saadi', 'qurtubi']);
  });

  it('never drop the last book', () => {
    expect(toggleBook(['ibnKathir'], 'ibnKathir')).toEqual(['ibnKathir']);
    expect(toggleBook(['ibnKathir'], 'tabari')).toEqual(['ibnKathir', 'tabari']);
    expect(toggleBook(['ibnKathir', 'tabari'], 'ibnKathir')).toEqual(['tabari']);
  });

  it('read as a sentence and as Settings’ value', () => {
    expect(booksInWords(['ibnKathir'])).toBe('Ibn Kathir');
    expect(booksInWords(['saadi', 'ibnKathir'])).toBe('Ibn Kathir and al-Sa’di');
    expect(booksInWords(['tabari', 'saadi', 'ibnKathir'])).toBe('Ibn Kathir, al-Sa’di and al-Tabari');
    expect(booksInWords(['tabari', 'saadi', 'ibnKathir', 'qurtubi'])).toBe('the four tafsirs');
    expect(booksValue(['ibnKathir'])).toBe('Ibn Kathir');
    expect(booksValue(['ibnKathir', 'qurtubi'])).toBe('Ibn Kathir, al-Qurtubi');
    expect(booksValue(['ibnKathir', 'qurtubi', 'tabari'])).toBe('3 of 4');
    expect(booksValue(['ibnKathir', 'qurtubi', 'tabari', 'saadi'])).toBe('All four');
  });
});
