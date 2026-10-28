// The hidden recite mode's state and what it covers (pure).
//
// While the page is hidden every line is covered except its verse markers
// (lib/recite/pageLines); a verse is shown again when it is revealed: tapped,
// reached by a pause in the reciter's voice (lib/recite/pauseDetector), or the
// "Next verse" button. The line where the next hidden verse starts carries the
// accent band.
//
// Reveals go through one place (revealVerse) whatever made them, so speech
// recognition can drive them later (word by word: a verse's words up to the one
// recited, `words`), and mistakes can be kept beside them (`marks`), without
// changing how a page is drawn.

import { AyahRef, ayahRects, Rect, versesOnPage } from '../ayahBounds';
import { pageLines, Span, subtractSpans } from './pageLines';

/** What revealed a verse. 'speech' is for recognition (not in this version). */
export type RevealSource = 'tap' | 'pause' | 'next' | 'speech';

/** A verse as a key: "2:255". */
export const verseKey = (a: { sura: number; ayah: number }) => `${a.sura}:${a.ayah}`;

/** What is shown of one hidden page. */
export interface PageReveal {
  /** Verses shown again, in the order they were revealed. */
  verses: readonly string[];
}

/** Per page; a page with nothing revealed has no entry. */
export type RevealState = Readonly<Record<number, PageReveal>>;

export const NOTHING_REVEALED: RevealState = {};

export function revealedOn(state: RevealState, page: number): ReadonlySet<string> {
  return new Set(state[page]?.verses ?? []);
}

/** The state with `verse` shown on `page` (unchanged if it already is). */
export function revealVerse(state: RevealState, page: number, verse: { sura: number; ayah: number }): RevealState {
  const key = verseKey(verse);
  const verses = state[page]?.verses ?? [];
  if (verses.includes(key)) return state;
  return { ...state, [page]: { verses: [...verses, key] } };
}

/** The page covered again. */
export function hidePageAgain(state: RevealState, page: number): RevealState {
  if (!state[page]) return state;
  const next = { ...state };
  delete next[page];
  return next;
}

/** The first verse on the page (top to bottom) not shown yet, or null. */
export function nextHiddenVerse(state: RevealState, page: number): AyahRef | null {
  const shown = revealedOn(state, page);
  return versesOnPage(page).find((v) => !shown.has(verseKey(v))) ?? null;
}

/** One line of a hidden page, in bounds space. */
export interface CoverLine {
  line: number;
  /** The band of its glyphs (the accent band, the guide line). */
  y0: number;
  y1: number;
  /** The covers' top and bottom. */
  top: number;
  bottom: number;
  /** The whole line's text, left to right (the accent band's width). */
  x0: number;
  x1: number;
  /** What is covered: the line less its markers and its revealed verses. */
  covers: Span[];
  /** The line where the next hidden verse starts. */
  current: boolean;
}

/** Room taken off a revealed verse beside a hidden one, so no stroke of the hidden one shows. */
const EDGE = 2;

const onLine = (r: Rect, y0: number, y1: number) => {
  const mid = (r.y0 + r.y1) / 2;
  return mid >= y0 - 3 && mid <= y1 + 3;
};

/** How a page is drawn while hidden, with `revealed` verses shown. */
export function hiddenPageLayout(page: number, revealed: ReadonlySet<string>): { lines: CoverLine[]; next: AyahRef | null } {
  const verses = versesOnPage(page);
  const next = verses.find((v) => !revealed.has(verseKey(v))) ?? null;
  const boxes = verses.flatMap((v) =>
    ayahRects(page, v.sura, v.ayah).map((r) => ({ r, shown: revealed.has(verseKey(v)), isNext: next != null && verseKey(v) === verseKey(next) })),
  );
  // Where the next verse starts: its first box, top to bottom.
  const nextStart = boxes.filter((b) => b.isNext).sort((a, b) => a.r.y0 - b.r.y0)[0]?.r ?? null;

  const lines = pageLines(page).map((l): CoverLine => {
    const here = boxes.filter((b) => onLine(b.r, l.y0, l.y1));
    const hidden: Span[] = here.filter((b) => !b.shown).map((b) => [b.r.x0 - EDGE, b.r.x1 + EDGE]);
    // A revealed verse opens its box, except where a hidden one reaches into it.
    const opened = here
      .filter((b) => b.shown)
      .flatMap((b) => subtractSpans(b.r.x0, b.r.x1, hidden));
    return {
      line: l.line,
      y0: l.y0,
      y1: l.y1,
      top: l.coverTop,
      bottom: l.coverBottom,
      x0: l.x0,
      x1: l.x1,
      // Only what hides some of a hidden verse (not the padding beside a revealed one).
      covers: subtractSpans(l.x0, l.x1, [...l.markers, ...opened]).filter(([a, b]) =>
        hidden.some(([h0, h1]) => Math.min(b, h1) - Math.max(a, h0) > 1),
      ),
      current: nextStart != null && onLine(nextStart, l.y0, l.y1),
    };
  });
  return { lines, next };
}
