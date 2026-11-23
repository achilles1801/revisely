// Which way the mushaf's pages run, in either layout direction (pure; MushafPager uses it). BEHAVIOUR.md LANG-2.

/**
 * How the pager lays out its pages: a printed mushaf's order in either direction, page 1 on the right and the next page
 * to its left (swiping left to right turns forward). Left to right, `inverted` gives that order. Right to left
 * (Arabic), the list's own order already does, and React Native's list then measures its offsets from the right, so
 * it must not be pinned left to right: it was, and the page went black (Majd's Revisely Dev, Nov 21 2026; LANG-2).
 * The page itself never mirrors: each page is laid out left to right inside (`pageWrap`).
 */
export function pagerLayout(rtl: boolean): { inverted: boolean; listDirection?: 'ltr' } {
  return rtl ? { inverted: false } : { inverted: true, listDirection: 'ltr' };
}

/**
 * A row that runs the way the mushaf's pages turn: its first item on the right, the next to its left, in English and
 * Arabic alike. React Native's `row` follows the layout's direction, so left to right it takes `row-reverse`.
 */
export function mushafRow(rtl: boolean): 'row' | 'row-reverse' {
  return rtl ? 'row' : 'row-reverse';
}

/**
 * The page under a horizontal offset, as the native list sends it: from the content's left edge, so right to left it
 * counts back from the content's right end (as React Native's own list reads it).
 */
export function pageIndexAt(
  x: number,
  contentWidth: number | undefined,
  visibleWidth: number | undefined,
  pageWidth: number,
  count: number,
  rtl: boolean,
): number {
  const fromStart = rtl && contentWidth != null && visibleWidth != null ? contentWidth - (x + visibleWidth) : x;
  return Math.min(Math.max(Math.round(fromStart / pageWidth), 0), Math.max(0, count - 1));
}
