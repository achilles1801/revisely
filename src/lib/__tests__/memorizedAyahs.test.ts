import { ayahsBetween, ayahsOnPage } from '../ayahKeys';
import { __setMushafEditionForTests } from '../mushafEdition';
import {
  addAyahs,
  isPartlyMemorized,
  isRevisable,
  juzShares,
  memorizedAyahs,
  memorizedAyahsOnPage,
  memorizedPageShare,
  memorizedSurahs,
  pageShare,
  removeAyahs,
  revisablePages,
} from '../memorizedAyahs';
import { computeMemorizationStats } from '../memorizationStats';
import type { PageStatus, UserPage } from '../../types';

const NOW = '2026-11-03T13:40:00.000Z';

function page(pageNumber: number, status: PageStatus = 'not_memorized', verses?: number[]): UserPage {
  return {
    pageNumber,
    status,
    dateMemorized: status === 'not_memorized' ? null : '2026-01-15T12:00:00.000Z',
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
    ...(verses ? { verses } : {}),
  };
}

const AL_MULK_1_20 = ayahsBetween(67001, 67020);

beforeAll(() => __setMushafEditionForTests('madani1405'));

describe('memorized ayahs', () => {
  it('a page’s memorized ayahs: all on a memorized page, its own on a partly memorized one, none otherwise', () => {
    expect(memorizedAyahsOnPage(page(562, 'memorized'))).toEqual(ayahsOnPage(562));
    // Ayahs that aren't on the page (left behind, or wrong) don't count.
    expect(memorizedAyahsOnPage(page(563, 'in_progress', [67020, 67013, 67001]))).toEqual([67013, 67020]);
    expect(memorizedAyahsOnPage(page(563, 'not_memorized', [67013]))).toEqual([]);
    expect(memorizedAyahsOnPage(page(563, 'in_progress'))).toEqual([]);
  });

  it('a partly memorized page is revised; a page with no memorized ayah is not', () => {
    expect(isRevisable(page(562, 'memorized'))).toBe(true);
    expect(isRevisable(page(563, 'in_progress', [67013]))).toBe(true);
    expect(isPartlyMemorized(page(563, 'in_progress', [67013]))).toBe(true);
    expect(isRevisable(page(563, 'in_progress', []))).toBe(false);
    expect(isRevisable(page(563, 'not_memorized', [67013]))).toBe(false);
    expect(revisablePages([page(1, 'memorized'), page(2), page(563, 'in_progress', [67013])]).map((p) => p.pageNumber)).toEqual([1, 563]);
  });

  it('a page counts by the share of it its memorized ayahs fill', () => {
    expect(pageShare(page(562, 'memorized'))).toBe(1);
    expect(pageShare(page(562))).toBe(0);
    const part = pageShare(page(563, 'in_progress', ayahsBetween(67013, 67020)));
    expect(part).toBeGreaterThan(0.58);
    expect(part).toBeLessThan(0.62);
    // Every ayah, even if the status lags behind, is the whole page.
    expect(pageShare(page(563, 'in_progress', ayahsBetween(67013, 67026)))).toBe(1);
  });

  it('Al-Mulk 1–20 added to an account makes Al-Mulk’s first page memorized and its second partly', () => {
    const before = [page(561, 'memorized'), page(562), page(563), page(564)];
    const { pages, changed } = addAyahs(before, AL_MULK_1_20, NOW);
    expect(changed).toEqual([562, 563]);
    expect(pages[1]).toMatchObject({ pageNumber: 562, status: 'memorized', verses: null, dateMemorized: NOW });
    expect(pages[2]).toMatchObject({ pageNumber: 563, status: 'in_progress', verses: ayahsBetween(67013, 67020), dateMemorized: NOW });
    expect(pages[0]).toBe(before[0]);
    expect(pages[3]).toBe(before[3]);
  });

  it('adding the rest of a partly memorized page makes it memorized, and keeps when it was begun', () => {
    const start = page(563, 'in_progress', ayahsBetween(67013, 67020));
    const { pages, changed } = addAyahs([start], ayahsBetween(67021, 67026), NOW);
    expect(changed).toEqual([563]);
    expect(pages[0]).toMatchObject({ status: 'memorized', verses: null, dateMemorized: start.dateMemorized });
  });

  it('adding ayahs to a memorized page, or ones already there, changes nothing', () => {
    const memorized = page(562, 'memorized');
    const partly = page(563, 'in_progress', ayahsBetween(67013, 67020));
    const { pages, changed } = addAyahs([memorized, partly], [67005, 67015], NOW);
    expect(changed).toEqual([]);
    expect(pages[0]).toBe(memorized);
    expect(pages[1]).toBe(partly);
  });

  it('removing ayahs keeps a page’s others; a page left with none is not memorized', () => {
    const { pages, changed } = removeAyahs([page(562, 'memorized'), page(563, 'in_progress', [67013, 67014])], [67005, 67013, 67014]);
    expect(changed).toEqual([562, 563]);
    expect(pages[0]).toMatchObject({ status: 'in_progress', verses: ayahsOnPage(562).filter((k) => k !== 67005) });
    expect(pages[1]).toMatchObject({ status: 'not_memorized', verses: null, dateMemorized: null });
  });

  it('a surah ending mid-page is memorized once its own ayahs are', () => {
    const pages = [page(562, 'memorized'), page(563, 'memorized'), page(564, 'in_progress', ayahsBetween(67027, 67030))];
    expect(memorizedSurahs(pages)).toEqual([67]);
    expect(memorizedAyahs(pages)).toEqual(ayahsBetween(67001, 67030));
  });

  it('totals and juz shares count a partly memorized page by its share', () => {
    const pages = [page(562, 'memorized'), page(563, 'in_progress', ayahsBetween(67013, 67020))];
    const total = memorizedPageShare(pages);
    expect(total).toBeGreaterThan(1.58);
    expect(total).toBeLessThan(1.62);
    const juz = juzShares(pages);
    expect(juz).toHaveLength(30);
    expect(juz[28]).toBeCloseTo(total / 20, 10);
    expect(juz.filter((s, i) => i !== 28 && s > 0)).toEqual([]);
  });

  it('the stats keep whole pages apart from the share', () => {
    const stats = computeMemorizationStats([page(562, 'memorized'), page(563, 'in_progress', ayahsBetween(67013, 67020)), page(564)]);
    expect(stats.pages).toBe(1);
    expect(stats.share).toBeGreaterThan(1.58);
    expect(stats.share).toBeLessThan(1.62);
    expect(stats.surahs).toBe(0);
    expect(stats.completeJuz).toBe(0);
  });
});
