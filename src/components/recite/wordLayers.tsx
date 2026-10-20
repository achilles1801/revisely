import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordStatus } from '../../lib/recite/tracker';

// What recitation checking draws on a mushaf page. Tints sit under the page image
// (its ink is drawn over them, as with the verse highlight); covers for hidden
// words sit over it, in the page's own colour.

export const RECITE_COLORS = {
  current: '#2F9E8F',
  wrong: '#E5484D',
  missed: '#F08C00',
  corrected: '#E8B004',
  past: '#E8B004',
};

/** Points a cover extends beyond its word. */
const COVER_PAD = 1.5;

export interface WordLayerInput {
  words: QuranWords;
  page: number;
  /** Scale from the 1024-wide bounds to the page as drawn. */
  scale: number;
  status: (word: number) => WordStatus;
  /** The next word expected (highlighted), or null. */
  position: number | null;
  /** Cover words not yet recited. */
  hide: boolean;
  /** Words shown although not recited yet (hints, the utterance in progress). */
  revealed: (word: number) => boolean;
  /** Words that were mistakes in earlier checks (count), or null. */
  past: Map<number, number> | null;
  pageColor: string;
  inkColor: string;
  /** Tint recited words lightly (while listening; not in a summary). */
  trail?: boolean;
}

export function wordLayers(input: WordLayerInput): { under: React.ReactNode; over: React.ReactNode } {
  const { words, page, scale, status, position, hide, revealed, past, pageColor, inkColor, trail = false } = input;
  const [from, to] = words.pageRange(page);
  const under: React.ReactNode[] = [];
  const over: React.ReactNode[] = [];
  const box = (w: number) => {
    const r = words.rect(w);
    return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
  };

  for (let w = from; w < to; w++) {
    const s = status(w);
    const b = box(w);
    let tint: string | null = null;
    if (s === 'wrong') tint = RECITE_COLORS.wrong + '45';
    else if (s === 'missed') tint = RECITE_COLORS.missed + '45';
    else if (s === 'corrected') tint = RECITE_COLORS.corrected + '33';
    else if (w === position) tint = RECITE_COLORS.current + '66';
    // A light trail over what has been recited, so the reciter sees it heard.
    else if (trail && (s === 'correct' || revealed(w))) tint = RECITE_COLORS.current + '1F';
    if (tint) under.push(<View key={`t${w}`} pointerEvents="none" style={[styles.tint, b, { backgroundColor: tint }]} />);
    if (past?.has(w) && s !== 'wrong' && s !== 'missed') {
      under.push(
        <View
          key={`p${w}`}
          pointerEvents="none"
          style={[styles.past, { left: b.left + 2, width: Math.max(4, b.width - 4), top: b.top + b.height - 3 }]}
        />,
      );
    }
    if (hide && s === 'pending' && !revealed(w)) {
      // A little larger than the word, so no dot or vowel mark shows round it.
      const cover = { left: b.left - COVER_PAD, top: b.top - COVER_PAD, width: b.width + 2 * COVER_PAD, height: b.height + 2 * COVER_PAD };
      over.push(
        <View key={`h${w}`} pointerEvents="none" style={[styles.cover, cover, { backgroundColor: pageColor }]}>
          <View style={[styles.placeholder, { backgroundColor: inkColor + (w === position ? '26' : '12') }]} />
        </View>,
      );
    }
  }
  return { under, over };
}

const styles = StyleSheet.create({
  tint: { position: 'absolute', borderRadius: 5 },
  past: { position: 'absolute', height: 2.5, borderRadius: 2, backgroundColor: RECITE_COLORS.past },
  cover: { position: 'absolute', justifyContent: 'center' },
  placeholder: { marginHorizontal: 2, height: '46%', borderRadius: 6 },
});
