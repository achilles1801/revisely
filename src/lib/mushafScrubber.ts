import { getJuzForPage, getSurahsForPage } from './quranData';

export const MUSHAF_PAGE_COUNT = 604;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The page under a point on the scrubber track. The track reads right to left
 * like the mushaf: x = width is page 1, x = 0 is the last page. Points past
 * either end clamp to it, and a zero-width track (before layout) is page 1.
 */
export function pageAtPosition(
  x: number,
  width: number,
  totalPages: number = MUSHAF_PAGE_COUNT,
): number {
  if (totalPages <= 1 || !(width > 0) || !Number.isFinite(x)) return 1;
  const fromRight = 1 - clamp(x / width, 0, 1);
  return clamp(Math.round(fromRight * (totalPages - 1)) + 1, 1, totalPages);
}

/** Where a page sits on the track (inverse of pageAtPosition). */
export function positionOfPage(
  page: number,
  width: number,
  totalPages: number = MUSHAF_PAGE_COUNT,
): number {
  if (!(width > 0)) return 0;
  if (totalPages <= 1 || !Number.isFinite(page)) return width;
  const fraction = (clamp(Math.round(page), 1, totalPages) - 1) / (totalPages - 1);
  return width * (1 - fraction);
}

/**
 * What the scrubber shows while dragging. Every surah on the page is named
 * (page 293 is the end of Al-Isra and the start of Al-Kahf), so a surah is
 * findable from the page it starts on.
 */
export function scrubberPreview(page: number): {
  page: number;
  surahs: string;
  juz: number;
} {
  const p = clamp(Math.round(page), 1, MUSHAF_PAGE_COUNT);
  return {
    page: p,
    surahs: getSurahsForPage(p)
      .map((s) => s.name)
      .join(' / '),
    juz: getJuzForPage(p),
  };
}
