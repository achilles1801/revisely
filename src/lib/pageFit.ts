// How big a mushaf page is drawn: as wide as the screen when it fits, otherwise
// as tall as the space allows, so no part of the page sits under the controls.

import { BOUNDS_WIDTH, pageAspect } from './ayahBounds';

export interface PageSize {
  width: number;
  height: number;
  /** Bounds-space (1024-wide) to points. */
  scale: number;
}

/** The largest page (at the images' aspect: the chosen edition's, unless given) that fits `width` × `height`. */
export function fitPage(width: number, height: number, aspect: number = pageAspect()): PageSize {
  const w = height > 0 ? Math.min(width, height * aspect) : width;
  const pageWidth = Math.max(0, Math.floor(w));
  return {
    width: pageWidth,
    height: pageWidth / aspect,
    scale: pageWidth / BOUNDS_WIDTH,
  };
}
