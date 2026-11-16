import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { Mark } from '../../lib/reciteLive/contract';
import { markTitle } from '../../lib/reciteLive/describe';
import { markBox, markHighlight } from '../../lib/reciteLive/geometry';
import type { WordMemory } from '../../lib/reciteMemory/memory';
import type { PaletteV2 } from '../../theme/v2';
import { markFill, markFirm } from '../reciteLive/markColours';

/**
 * How strong a remembered mistake is drawn: the take's own highlight colour, lighter, so it reads as "from before"
 * beside a live take's marks and never as a fourth colour (Recite UI: the fill at reduced opacity). Dark grounds need
 * more of it to show.
 */
export const PAST_OPACITY = { light: 0.48, dark: 0.62 };

function rectStyle(r: Rect, scale: number) {
  return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
}

type Colours = Pick<PaletteV2, 'markWord' | 'markWordFirm' | 'markSlip' | 'markSlipFirm' | 'markTajweed' | 'markTajweedFirm'>;

/** The mark a remembered mistake is drawn and described by: its latest wrong try. */
export const markOf = (m: WordMemory): Mark | null => m.lastMark;

/**
 * Behind the page's ink, outside a take: each word still to fix, in its group's highlight, lighter (Majd, Nov 15 2026:
 * remembered mistakes stay on the mushaf until said right). The word a card is open for is its firm shade.
 */
export function RememberedUnderlay({
  page,
  scale,
  words,
  memories,
  selected,
  colours,
  isDark,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  /** The open ones on this page (lib/reciteMemory/memory's openInRange). */
  memories: WordMemory[];
  /** The word a card is open for. */
  selected: number | null;
  colours: Colours;
  isDark: boolean;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`past-underlay-${page}`}>
      {memories.map((m) => {
        const mark = markOf(m);
        if (!mark || words.pageOf(m.w) !== page) return null;
        const picked = selected === m.w;
        return (
          <View
            key={m.w}
            testID={picked ? `past-highlight-${m.group}-picked` : `past-highlight-${m.group}`}
            style={[
              styles.abs,
              styles.box,
              rectStyle(markHighlight(words, mark), scale),
              picked
                ? { backgroundColor: markFirm(colours, mark) }
                : { backgroundColor: markFill(colours, mark), opacity: isDark ? PAST_OPACITY.dark : PAST_OPACITY.light },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Each remembered mistake as an element of its own over its word, for VoiceOver ("Past mistake: Wrong word,
 * ٱلْمُتَصَدِّقِينَ") and the tests, as the live marks are (LiveMarkTargets). A touch goes through to the page, which
 * opens the word's history.
 */
export function RememberedTargets({ page, scale, words, memories }: { page: number; scale: number; words: QuranWords; memories: WordMemory[] }) {
  return (
    <>
      {memories.map((m) => {
        const mark = markOf(m);
        if (!mark || words.pageOf(m.w) !== page) return null;
        return (
          <View
            key={m.w}
            pointerEvents="none"
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Past mistake: ${markTitle(mark)}, ${mark.kind === 'added' ? 'after ' : ''}${words.uthmani(m.w)}`}
            accessibilityHint="Shows your takes of this word"
            testID={`past-mark-${m.group}`}
            style={[styles.abs, rectStyle(markBox(words, mark), scale)]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  box: { borderRadius: 7 },
});
