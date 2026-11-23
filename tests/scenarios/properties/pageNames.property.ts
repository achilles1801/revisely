// How a page is named and how it begins (BEHAVIOUR.md NAME-1, NAME-2), over all 604 pages of both prints.
import { firstVerseOfPage, firstWordsOfPage, firstWordsOfPlace, placeOfPage, plainText } from '../../../src/lib/passages';

const PAGES = Array.from({ length: 604 }, (_, i) => i + 1);

describe.each(['madani1405', 'madani1441'] as const)('%s', (edition) => {
  it('[NAME-2] every page has its first words: up to four, whole, from the page itself', () => {
    for (const page of PAGES) {
      const words = firstWordsOfPage(page, edition).split(' ');
      expect(words.length).toBeGreaterThan(0);
      expect(words.length).toBeLessThanOrEqual(4);
      expect(words.every((w) => w.length > 0)).toBe(true);
    }
  });

  it('[NAME-2] a place shows them unless its page opens a surah, whose name already says where it begins', () => {
    for (const page of PAGES) {
      const opens = firstVerseOfPage(page, edition).ayah === 1;
      if (opens) expect(firstWordsOfPlace(page, edition)).toBe('');
    }
    expect(firstWordsOfPlace(309, edition)).toBe(firstWordsOfPage(309, edition));
  });

  it('[NAME-1] a place never carries an ayah number', () => {
    for (const page of PAGES) expect(plainText(placeOfPage(page, { edition }))).not.toMatch(/ayah|\d+–\d+/);
  });
});
