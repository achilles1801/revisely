// Where the mushaf's page list starts (READ-1): the page the reader or a session opens on, from its first frame. Undefined
// for the list's first page, or a page it doesn't hold, so the list starts at its beginning as before.

export function pagerStartIndex(pages: readonly number[], initialPage: number | null | undefined): number | undefined {
  if (initialPage == null) return undefined;
  const idx = pages.indexOf(initialPage);
  return idx > 0 ? idx : undefined;
}
