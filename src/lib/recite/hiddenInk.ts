// What a hidden page needs beyond the words' boxes (RECITE-20, pure but for its loader): where a word's ink crosses its
// box.
//
// A hidden page covers each hidden word's box (its x0..x1 across its line's cover rows) and leaves each shown word's box
// open (components/reciteLive/HiddenInkLayer). That is exact wherever a straight edge parts two words' ink. Where it
// can't (a stroke's edge past its box, a hamza under an alif, a kaf's top over the word before, a descender into the
// next line's rows, a blurred pixel of Android's smaller page images), src/data/hiddenInk.dat gives the word:
//   - patches: small covers over its ink outside what its box's cover takes, drawn while it is hidden;
//   - notches: holes over its ink that another cover would take, cut from the covers while it is shown.
// Each holds that word's ink and no other's (any word's, a marker's, a quarter sign's: every image set), so a patch never
// hides a word shown and a notch never shows a word hidden. Majd, Nov 26 2026: "theres still instances where the white
// still shows up when the page is hidden like that symbol ... part of it and other letters and symbols show -- we should
// do a full run through of every page and ensure that never happens again".
//
// Built by scripts/check-hidden-page.py --write from the page images, all three sets (the originals, w1080, w1440); the
// same script checks every page's hidden view against them. An asset, as quranWords.dat is (about 0.8 MB): read with the
// word data (loadQuranWords), so an update that doesn't change it doesn't download it again. Per page a flat list: per
// rect, the word (its index on the page), the kind (0 patch, 1 notch, 2 both), then x0, y0, x1, y1 (1024-wide bounds
// space, as the words' boxes).

import type { Rect } from '../ayahBounds';

export interface InkRect {
  /** The word (its index in QuranWords). */
  w: number;
  kind: 'patch' | 'notch';
  rect: Rect;
}

export interface HiddenInkData {
  v: number;
  pages: Record<string, number[]>;
}

let data: HiddenInkData | null = null;
const cache = new Map<string, InkRect[]>();

/** The patches and notches, once read (loadQuranWords reads them with the word data; tests set them). */
export function setHiddenInk(d: HiddenInkData | null): void {
  data = d;
  cache.clear();
}

/** A page's patches and notches (none until the asset is read); `first` is the page's first word (QuranWords.pageRange). */
export function hiddenInk(page: number, first: number): InkRect[] {
  if (!data) return [];
  const key = `${page}:${first}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const flat = data.pages[String(page)] ?? [];
  const out: InkRect[] = [];
  for (let i = 0; i + 6 <= flat.length; i += 6) {
    const rect = { x0: flat[i + 2], y0: flat[i + 3], x1: flat[i + 4], y1: flat[i + 5] };
    const w = first + flat[i];
    if (flat[i + 1] !== 1) out.push({ w, kind: 'patch', rect });
    if (flat[i + 1] !== 0) out.push({ w, kind: 'notch', rect });
  }
  cache.set(key, out);
  return out;
}

/** What is left of rect `c` after taking out `n`: up to four rects. */
export function rectMinus(c: Rect, n: Rect): Rect[] {
  if (n.x1 <= c.x0 || n.x0 >= c.x1 || n.y1 <= c.y0 || n.y0 >= c.y1) return [c];
  const out: Rect[] = [];
  if (n.y0 > c.y0) out.push({ x0: c.x0, y0: c.y0, x1: c.x1, y1: n.y0 });
  if (n.y1 < c.y1) out.push({ x0: c.x0, y0: n.y1, x1: c.x1, y1: c.y1 });
  const top = Math.max(c.y0, n.y0);
  const bottom = Math.min(c.y1, n.y1);
  if (n.x0 > c.x0) out.push({ x0: c.x0, y0: top, x1: n.x0, y1: bottom });
  if (n.x1 < c.x1) out.push({ x0: n.x1, y0: top, x1: c.x1, y1: bottom });
  return out;
}
