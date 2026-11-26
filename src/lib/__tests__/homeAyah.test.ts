// Today's ayah on Home (HOME-7): the list is the app's own Qur'an text, word for word, and a day picks one.
import { readFileSync } from 'fs';
import { join } from 'path';
import { ayahForDay, HOME_AYAHS } from '../homeAyah';
import { getSurahDisplay } from '../quranData';

describe('the daily ayah', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '../../data/quranWords.dat'), 'utf8')) as { uthmani: string[] };
  // Each verse's index in mushaf order.
  const start: number[] = [];
  let at = 0;
  for (let s = 1; s <= 114; s++) {
    start[s] = at;
    at += getSurahDisplay(s)!.ayahCount;
  }

  it('[HOME-7] every ayah is whole and word for word the app’s Qur’an text, once each', () => {
    expect(HOME_AYAHS.length).toBeGreaterThanOrEqual(30);
    for (const a of HOME_AYAHS) {
      expect(a.arabic).toBe(data.uthmani[start[a.sura] + a.ayah - 1]);
      // Short enough for two or three lines at the foot of Home.
      expect(a.arabic.length).toBeLessThanOrEqual(130);
    }
    const keys = HOME_AYAHS.map((a) => `${a.sura}:${a.ayah}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('[HOME-7] one a day: the same all day, the next the day after, round the list', () => {
    expect(ayahForDay('2026-01-01')).toBe(HOME_AYAHS[0]);
    expect(ayahForDay('2026-01-02')).toBe(HOME_AYAHS[1]);
    const n = HOME_AYAHS.length;
    const later = new Date(Date.UTC(2026, 0, 1 + n));
    expect(ayahForDay(later.toISOString().slice(0, 10))).toBe(HOME_AYAHS[0]);
    // Before the list's first day, it still goes round.
    expect(ayahForDay('2025-12-31')).toBe(HOME_AYAHS[n - 1]);
  });
});
