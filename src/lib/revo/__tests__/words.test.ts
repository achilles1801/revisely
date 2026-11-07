import { plainText } from '../../passages';
import { contextWords, juzOf, passageShort } from '../words';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
// What the server takes (functions/src/revo/validate.ts passageText).
const SERVER = /^[\p{L}\p{M}0-9 '’ʿʾ.,·–—\-‑ ]+$/u;

describe('Revo’s words for parts of the Qur’an (REVO-20, REVO-27)', () => {
  it('[REVO-20] labels by surah and juz, never page numbers', () => {
    expect(plainText(passageShort([548, 549]))).toBe('Al-Hashr to Al-Mumtahanah');
    expect(plainText(passageShort([548]))).toBe('End of Al-Hashr');
    expect(plainText(passageShort(range(542, 561)))).toBe('Juz 28');
    expect(juzOf([1, 2, 22])).toBe('Juz 1–2');
    expect(juzOf([548])).toBe('Juz 28');
  });

  it('[REVO-27] the context’s words: today, where it starts, what’s next, the weak parts, and each page, as plain text', () => {
    const w = contextWords({ today: range(542, 561), next: range(548, 561), weakNext: [548, 549], weak: [548, 549, 12] });
    expect(w.passages).toEqual({
      today: 'Juz 28',
      startsAt: 'Al-Mujadila',
      next: 'Al-Hashr 17 to At-Tahrim · Juz 28',
      nextAt: 'Al-Hashr, ayah 17',
      weakNext: 'Al-Hashr 17 to Al-Mumtahanah 5 · Juz 28',
      weak: 'Al-Baqarah 77–83 and Al-Hashr 17 to Al-Mumtahanah 5',
    });
    expect(w.pageNames['548']).toBe('Al-Hashr, ayahs 17–24 · Juz 28');
    expect(Object.keys(w.pageNames).map(Number).sort((a, b) => a - b)).toEqual([12, ...range(548, 561)]);
  });

  it('[REVO-27] every worded part is one the server takes: short, plain, letters, numbers and a little punctuation', () => {
    // A spread of page sets: single pages across the mushaf, whole juz, runs across surahs, scattered sets.
    const sets: number[][] = [];
    for (let p = 1; p <= 604; p += 7) sets.push([p]);
    for (let j = 0; j < 30; j++) sets.push(range(1 + j * 20, Math.min(604, 20 + j * 20)));
    for (let p = 1; p <= 580; p += 37) sets.push(range(p, p + 24));
    sets.push([1, 50, 101, 255, 300, 404, 500, 604], range(595, 604).concat(range(1, 10)));
    for (const pages of sets) {
      const w = contextWords({ today: pages, next: pages.slice(0, 20), weakNext: pages.slice(0, 3), weak: pages.slice(0, 30) });
      for (const text of Object.values(w.passages)) {
        expect(text.length).toBeLessThanOrEqual(160);
        expect(text).toMatch(SERVER);
        expect(text).toBe(plainText(text));
      }
      for (const text of Object.values(w.pageNames)) {
        expect(text.length).toBeLessThanOrEqual(100);
        expect(text).toMatch(SERVER);
      }
    }
  });
});
