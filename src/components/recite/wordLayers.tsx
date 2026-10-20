import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordStatus } from '../../lib/recite/tracker';
import { pageLines, Span, subtractSpans } from '../../lib/recite/pageLines';

// What recitation checking draws on a mushaf page (as Tarteel does).
//
// Hidden words: every line is covered whole, in the page's colour, with a faint
// guide line where its text was; only the verse markers are left open. Each word
// recited (or given as a hint, or passed over) is opened in place, so the page's
// own ink shows through. The line being recited has a light band over it, and
// mistakes are underlined on the word rather than blocked out in colour.

export const RECITE_COLORS = {
  current: '#2F9E8F',
  wrong: '#E5484D',
  missed: '#F08C00',
  corrected: '#E8B004',
  past: '#E8B004',
};

/** Points (bounds space) a recited word is opened beyond its box. */
const OPEN_PAD = 1.5;
/** Underline thickness (points on screen). */
const UNDERLINE = 2.5;

export interface WordLayerInput {
  words: QuranWords;
  page: number;
  /** Scale from the 1024-wide bounds to the page as drawn. */
  scale: number;
  status: (word: number) => WordStatus;
  /** The next word expected, or null. Its line gets the current-line band. */
  position: number | null;
  /** Cover words not yet recited. */
  hide: boolean;
  /** Words shown although not recited yet (hints, the utterance in progress). */
  revealed: (word: number) => boolean;
  /** Words given as hints (underlined so the reciter knows they had help). */
  hinted?: (word: number) => boolean;
  /** Words that were mistakes in earlier checks (count), or null. */
  past: Map<number, number> | null;
  pageColor: string;
  inkColor: string;
}

const UNDERLINE_COLOR: Partial<Record<WordStatus, string>> = {
  wrong: RECITE_COLORS.wrong,
  missed: RECITE_COLORS.missed,
  corrected: RECITE_COLORS.corrected,
};

export function wordLayers(input: WordLayerInput): { under: React.ReactNode; over: React.ReactNode } {
  const { words, page, scale, status, position, hide, revealed, hinted, past, pageColor, inkColor } = input;
  const under: React.ReactNode[] = [];
  const over: React.ReactNode[] = [];
  const currentLine =
    position != null && position < words.count && words.pageOf(position) === page ? words.lineOf(position) : null;

  for (const l of pageLines(words, page)) {
    const open: Span[] = [...l.markers];
    for (let w = l.from; w < l.to; w++) {
      const s = status(w);
      const shown = s !== 'pending' || revealed(w);
      const r = words.rect(w);
      if (shown) {
        // A little room round the word, but never into a word beside it.
        let lo = r.x0 - OPEN_PAD;
        let hi = r.x1 + OPEN_PAD;
        for (let o = l.from; o < l.to; o++) {
          if (o === w) continue;
          const b = words.rect(o);
          if (b.x1 <= r.x0 + 1) lo = Math.max(lo, b.x1);
          if (b.x0 >= r.x1 - 1) hi = Math.min(hi, b.x0);
        }
        open.push([lo, hi]);
      }
      const color = UNDERLINE_COLOR[s] ?? (shown && s === 'pending' && hinted?.(w) ? RECITE_COLORS.current : null);
      if (color) {
        over.push(
          <View
            key={`u${w}`}
            pointerEvents="none"
            style={[
              styles.underline,
              { left: r.x0 * scale, width: (r.x1 - r.x0) * scale, top: l.y1 * scale - 1, backgroundColor: color },
            ]}
          />,
        );
      } else if (past?.has(w) && (shown || !hide)) {
        under.push(
          <View
            key={`p${w}`}
            pointerEvents="none"
            style={[
              styles.past,
              { left: (r.x0 + 2) * scale, width: Math.max(4, (r.x1 - r.x0 - 4) * scale), top: l.y1 * scale - 3 },
            ]}
          />,
        );
      }
    }

    const top = l.coverTop * scale;
    const height = (l.coverBottom - l.coverTop) * scale;
    if (hide) {
      // The guide sits where the letters rest, a little above the band's bottom.
      const guideTop = (l.y1 - (l.y1 - l.y0) * 0.22) * scale - top;
      for (const [x0, x1] of subtractSpans(l.x0, l.x1, open)) {
        over.push(
          <View
            key={`h${l.line}-${Math.round(x0)}`}
            pointerEvents="none"
            style={[styles.cover, { left: x0 * scale, width: (x1 - x0) * scale, top, height, backgroundColor: pageColor }]}
          >
            <View style={[styles.guide, { top: guideTop, backgroundColor: inkColor }]} />
          </View>,
        );
      }
    }

    // The line being recited (with the words hidden or shown): a light band
    // across it, after the covers so it reads as one band (as in Tarteel), and
    // translucent over the ink.
    if (l.line === currentLine) {
      over.push(
        <View
          key={`c${l.line}`}
          pointerEvents="none"
          style={[
            styles.band,
            { left: l.x0 * scale, width: (l.x1 - l.x0) * scale, top, height, backgroundColor: inkColor },
          ]}
        />,
      );
    }
  }
  return { under, over };
}

const styles = StyleSheet.create({
  band: { position: 'absolute', borderRadius: 6, opacity: 0.07 },
  underline: { position: 'absolute', height: UNDERLINE, borderRadius: UNDERLINE / 2 },
  past: { position: 'absolute', height: 2, borderRadius: 1, backgroundColor: RECITE_COLORS.past, opacity: 0.7 },
  cover: { position: 'absolute' },
  guide: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, opacity: 0.18 },
});
