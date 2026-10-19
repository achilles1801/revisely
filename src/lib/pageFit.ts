// How big a mushaf page is drawn: as wide as the screen when it fits, otherwise
// as tall as the space allows, so no part of the page sits under the controls.

import { BOUNDS_WIDTH, PAGE_IMAGE_ASPECT } from './ayahBounds';

export interface PageSize {
  width: number;
  height: number;
  /** Bounds-space (1024-wide) to points. */
  scale: number;
}

/** The largest page (at the images' aspect) that fits `width` × `height`. */
export function fitPage(width: number, height: number): PageSize {
  const w = height > 0 ? Math.min(width, height * PAGE_IMAGE_ASPECT) : width;
  const pageWidth = Math.max(0, Math.floor(w));
  return {
    width: pageWidth,
    height: pageWidth / PAGE_IMAGE_ASPECT,
    scale: pageWidth / BOUNDS_WIDTH,
  };
}
