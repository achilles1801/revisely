// The Memorized sub-line's verses (mock d1: "Al-Mulk 1–12").
import { ayahSpan } from '../ayahSpan';

describe('ayahSpan', () => {
  it('names a page by its surah and verses', () => {
    expect(ayahSpan([562])).toBe('Al-Mulk 1–12');
    expect(ayahSpan([563])).toBe('Al-Mulk 13–26');
    expect(ayahSpan([562, 563])).toBe('Al-Mulk 1–26');
  });
  it('spans surahs, and joins runs of pages', () => {
    expect(ayahSpan([564])).toBe('Al-Mulk 27 to Al-Qalam 15');
    expect(ayahSpan([1, 562])).toBe('Al-Fatihah 1–7, Al-Mulk 1–12');
  });
  it('is null for no pages', () => {
    expect(ayahSpan([])).toBeNull();
  });
});
