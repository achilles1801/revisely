// The 1441 print's verse boxes (src/data/ayahBounds1441.json, scripts/build-mushaf-1441.py) and
// what lib/mushafEdition promises about its page numbers.
import bounds1405 from '../../data/ayahBounds.json';
import bounds1441 from '../../data/ayahBounds1441.json';
import { ayahAt, ayahRects, BOUNDS_WIDTH, versesOnPage } from '../ayahBounds';
import { __setMushafEditionForTests, MUSHAF_EDITIONS } from '../mushafEdition';
import { firstSurahOnPage, pageOfVerse, verseKey } from '../verses';
import { getSurahDisplay } from '../quranData';

type File = Record<string, number[]>;
const b1405 = bounds1405 as File;
const b1441 = bounds1441 as File;

function versesOf(file: File, page: number): string[] {
  const d = file[String(page)] ?? [];
  const out: string[] = [];
  for (let i = 0; i < d.length; i += 6) {
    const k = `${d[i]}:${d[i + 1]}`;
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

// The runs of pages laid out differently from the 1405 print.
const RUNS: [number, number][] = [
  [120, 123],
  [144, 145],
  [531, 534],
  [564, 565],
  [567, 570],
  [575, 576],
  [583, 600],
];
const inRun = (p: number) => RUNS.some(([a, b]) => p >= a && p <= b);

afterEach(() => __setMushafEditionForTests('madani1405'));

describe('the 1441 verse boxes', () => {
  it('cover every verse of the Qur’an once, in order, page by page', () => {
    const all: string[] = [];
    for (let p = 1; p <= 604; p++) {
      const vs = versesOf(b1441, p);
      expect(vs.length).toBeGreaterThan(0);
      all.push(...vs);
    }
    expect(all).toHaveLength(6236);
    expect(new Set(all).size).toBe(6236);
    let n = 0;
    for (let s = 1; s <= 114; s++) {
      for (let a = 1; a <= (getSurahDisplay(s)?.ayahCount ?? 0); a++) expect(all[n++]).toBe(`${s}:${a}`);
    }
  });

  it('every page ends at the end of a verse (no verse is split across pages)', () => {
    const seen = new Set<string>();
    for (let p = 1; p <= 604; p++) {
      for (const v of versesOf(b1441, p)) {
        expect(seen.has(v)).toBe(false);
        seen.add(v);
      }
    }
  });

  it('holds the same verses as the 1405 print on 568 pages, and differs only in the known runs', () => {
    const differ: number[] = [];
    for (let p = 1; p <= 604; p++) {
      if (versesOf(b1441, p).join() !== versesOf(b1405, p).join()) differ.push(p);
    }
    expect(differ).toHaveLength(36);
    expect(differ.every(inRun)).toBe(true);
  });

  it('each run begins and ends on the same verses in both prints', () => {
    for (const [a, b] of RUNS) {
      const run = (file: File) => {
        const out: string[] = [];
        for (let p = a; p <= b; p++) out.push(...versesOf(file, p));
        return out.join();
      };
      expect(run(b1441)).toBe(run(b1405));
    }
  });

  it('every surah and juz starts on the same page in both', () => {
    for (let s = 1; s <= 114; s++) {
      expect(pageOfVerse({ sura: s, ayah: 1 }, 'madani1441')).toBe(pageOfVerse({ sura: s, ayah: 1 }, 'madani1405'));
    }
    const juzStarts = ['2:142', '2:253', '3:93', '4:24', '4:148', '5:82', '6:111', '7:88', '8:41', '9:93', '11:6',
      '12:53', '15:1', '17:1', '18:75', '21:1', '23:1', '25:21', '27:56', '29:46', '33:31', '36:28', '39:32',
      '41:47', '46:1', '51:31', '58:1', '67:1', '78:1'];
    for (const k of juzStarts) {
      const [sura, ayah] = k.split(':').map(Number);
      expect(pageOfVerse({ sura, ayah }, 'madani1441')).toBe(pageOfVerse({ sura, ayah }, 'madani1405'));
    }
  });

  it('stays inside the page: 1024 wide, as tall as the page’s shape', () => {
    const height = BOUNDS_WIDTH / MUSHAF_EDITIONS.madani1441.aspect;
    for (let p = 1; p <= 604; p++) {
      const d = b1441[String(p)];
      for (let i = 0; i < d.length; i += 6) {
        expect(d[i + 2]).toBeGreaterThanOrEqual(0);
        expect(d[i + 4]).toBeLessThanOrEqual(BOUNDS_WIDTH);
        expect(d[i + 4]).toBeGreaterThan(d[i + 2]);
        expect(d[i + 3]).toBeGreaterThanOrEqual(0);
        expect(d[i + 5]).toBeLessThanOrEqual(height);
        expect(d[i + 5]).toBeGreaterThan(d[i + 3]);
      }
    }
  });
});

describe('reading the chosen print', () => {
  it('page 586 begins with the end of ‘Abasa in the 1441 print, with At-Takwir in the 1405', () => {
    expect(pageOfVerse({ sura: 80, ayah: 41 }, 'madani1441')).toBe(586);
    expect(pageOfVerse({ sura: 80, ayah: 41 }, 'madani1405')).toBe(585);
    expect(firstSurahOnPage(586, 'madani1441')?.number).toBe(80);
    expect(firstSurahOnPage(586, 'madani1405')?.number).toBe(81);
  });

  it('the bounds functions follow the edition chosen', () => {
    expect(versesOnPage(586)[0]).toEqual({ page: 586, sura: 81, ayah: 1 });
    __setMushafEditionForTests('madani1441');
    expect(versesOnPage(586)[0]).toEqual({ page: 586, sura: 80, ayah: 41 });
    expect(pageOfVerse({ sura: 80, ayah: 41 })).toBe(586);
    const [r] = ayahRects(586, 80, 42);
    expect(ayahAt(586, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)).toEqual({ page: 586, sura: 80, ayah: 42 });
    // The header of At-Takwir, under the first line, is no verse.
    expect(ayahAt(586, 512, (r.y1 + 30))).toBeNull();
    expect(verseKey(versesOnPage(604).slice(-1)[0])).toBe('114:6');
  });
});
