// Quran page images (Madani Mushaf, rendered by github.com/quran/quran.com-images),
// mirrored to the project's own Storage bucket as public, immutable objects at
// mushaf/001.png ... mushaf/604.png. Mirrored from github.com/GovarJabbar/Quran-PNG.
//
// Those are 2600×4206. iOS shrinks them to the screen with a proper filter.
// Android's image pipeline (Fresco) caps a bitmap at 2048 px and gets there by
// keeping one pixel in three, which breaks thin strokes (#153). So Android loads
// copies made at a phone's width instead (scripts/build-mushaf-variants.py,
// mushaf/w1080/ and mushaf/w1440/) and draws them as decoded (`resizeMethod`
// "none", pageImageProps).
//
// The 1441 print (lib/mushafEdition) lives under mushaf/1441/, drawn from the King Fahd
// Complex's vector files at the two phone widths only (scripts/build-mushaf-1441.py):
// mushaf/1441/w1080/ and mushaf/1441/w1440/. iOS takes w1440, wider than any iPhone screen.

import { Dimensions, PixelRatio, Platform } from 'react-native';
import { getMushafEdition, MushafEditionId, mushafEdition } from './mushafEdition';

const BASE_URL = 'https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf';

/** Which copy of the pages a device loads: the originals, or a width-sized set. */
export type PageImageSet = 'full' | 'w1080' | 'w1440';

/**
 * The set for a platform and the screen's short side in pixels. iOS keeps the
 * originals. Android takes the smallest set at least as wide as the screen,
 * and w1440 beyond it (tablets): a page drawn a little larger than its bitmap
 * is smooth, while the originals would be cut down to 1 pixel in 3.
 */
export function pageImageSetFor(os: string, shortSidePixels: number): PageImageSet {
  if (os !== 'android') return 'full';
  return shortSidePixels <= 1080 ? 'w1080' : 'w1440';
}

let deviceSet: PageImageSet | null = null;

/** This device's set, decided once (the screen, not the window: rotation and split screen don't change it). */
export function pageImageSet(): PageImageSet {
  if (deviceSet == null) {
    const { width, height } = Dimensions.get('screen');
    deviceSet = pageImageSetFor(
      Platform.OS,
      PixelRatio.getPixelSizeForLayoutSize(Math.min(width, height)),
    );
  }
  return deviceSet;
}

/**
 * The set an edition's pages load from on this device: the device's own set, except that the
 * 1441 print has no originals (its widest copy, w1440, takes their place).
 */
export function editionImageSet(edition: MushafEditionId = getMushafEdition(), set: PageImageSet = pageImageSet()): PageImageSet {
  return set === 'full' && mushafEdition(edition).folder !== '' ? 'w1440' : set;
}

/** Props for an <Image> showing a page: on Android, draw the copy as decoded (no Fresco downsampling). */
export function pageImageProps(): { resizeMethod?: 'none' } {
  // iOS loads the originals, or for the 1441 print w1440, and shrinks them itself.
  return pageImageSet() === 'full' ? {} : { resizeMethod: 'none' };
}

/** Test hook: decide the set again. */
export function __resetPageImageSetForTests(): void {
  deviceSet = null;
}

/**
 * Get the URL for a specific Quran page image
 * @param pageNumber - Page number (1-604)
 * @param set - which copy (default: this device's)
 * @param edition - which print (default: the one chosen)
 * @returns URL string for the page image
 */
export function getQuranPageImageUrl(
  pageNumber: number,
  set: PageImageSet = pageImageSet(),
  edition: MushafEditionId = getMushafEdition(),
): string {
  if (pageNumber < 1 || pageNumber > 604) {
    throw new Error(`Invalid page number: ${pageNumber}. Must be between 1 and 604.`);
  }

  // Pages are named with leading zeros (001.png, 002.png, etc.)
  const paddedNumber = pageNumber.toString().padStart(3, '0');
  const folder = mushafEdition(edition).folder;
  const s = editionImageSet(edition, set);
  const base = folder ? `${BASE_URL}/${folder}` : BASE_URL;
  return s === 'full' ? `${base}/${paddedNumber}.png` : `${base}/${s}/${paddedNumber}.png`;
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
