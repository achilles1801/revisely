// Quran page images from GitHub CDN
// Source: https://github.com/GovarJabbar/Quran-PNG

const BASE_URL = 'https://raw.githubusercontent.com/GovarJabbar/Quran-PNG/master';

/**
 * Get the URL for a specific Quran page image
 * @param pageNumber - Page number (1-604)
 * @returns URL string for the page image
 */
export function getQuranPageImageUrl(pageNumber: number): string {
  if (pageNumber < 1 || pageNumber > 604) {
    throw new Error(`Invalid page number: ${pageNumber}. Must be between 1 and 604.`);
  }

  // Pages are named with leading zeros (001.png, 002.png, etc.)
  const paddedNumber = pageNumber.toString().padStart(3, '0');
  return `${BASE_URL}/${paddedNumber}.png`;
}

/**
 * Preload page images for smoother swiping
 * @param pageNumbers - Array of page numbers to preload
 */
export function preloadPageImages(pageNumbers: number[]): void {
  pageNumbers.forEach(pageNum => {
    const url = getQuranPageImageUrl(pageNum);
    // Preload using Image component
    if (typeof Image !== 'undefined') {
      const img = new (globalThis as any).Image();
      img.src = url;
    }
  });
}

/**
 * Get juz number for a given page
 * Juz boundaries in the Quran Mushaf
 */
export function getJuzForPage(pageNumber: number): number {
  const juzStartPages = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582
  ];

  for (let i = juzStartPages.length - 1; i >= 0; i--) {
    if (pageNumber >= juzStartPages[i]) {
      return i + 1;
    }
  }
  return 1;
}

/**
 * Get page range for a juz
 */
export function getPagesForJuz(juzNumber: number): { start: number; end: number } {
  const juzStartPages = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582
  ];

  const start = juzStartPages[juzNumber - 1];
  const end = juzNumber === 30 ? 604 : juzStartPages[juzNumber] - 1;

  return { start, end };
}
