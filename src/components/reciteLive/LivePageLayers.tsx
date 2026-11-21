import React from 'react';
import { StyleSheet, View } from 'react-native';
import { HiddenPageOverlay } from '../recite/HiddenPageOverlay';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordFollow } from '../../lib/recite/hiddenPage';
import type { Mark, MarkGroup } from '../../lib/reciteLive/contract';
import { markGroup, strongestByWord } from '../../lib/reciteLive/contract';
import { markTitle } from '../../lib/reciteLive/describe';
import { currentLineBand, cursorBox, markBox, markHighlight, offBox, wordBox } from '../../lib/reciteLive/geometry';
import { t } from '../../i18n';

const NO_REVEALED: ReadonlySet<string> = new Set();

function rectStyle(r: Rect, scale: number) {
  return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
}

/** Each group's highlight, and its firmer shade for the mark a card is open for (theme/v2: markWord, markWordFirm…). */
export type MarkColours = Record<MarkGroup, { fill: string; firm: string }>;

/**
 * Behind the page's ink, in its frame: the line being recited (a quiet grey band; none on a hidden page) and the word
 * being recited, or the newest shown on a hidden page (a firmer grey box), as Tarteel's grey line and box are; and the
 * marks (Check) as highlights behind their words, three colours at most: red for words, amber for slips and "Not clear",
 * violet for tajweed (Majd, Nov 15 2026: "only things we should show are highlites for mistakes 3 colors max"). An extra
 * word is highlighted on the word before it. A word with several marks shows its strongest. The mark a card is open
 * for is a firmer shade of its own colour. No red ink, dotted lines or + discs on the page any more.
 */
export function LiveUnderlay({
  page,
  scale,
  words,
  cursor,
  marks,
  selected,
  hidden,
  colors,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  cursor: number | null;
  marks: Mark[];
  selected: Mark | null;
  /** The hidden view: no line band. */
  hidden: boolean;
  colors: { band: string; word: string; marks: MarkColours };
}) {
  const here = cursor != null && words.pageOf(cursor) === page;
  const line = here && !hidden ? currentLineBand(words, page, cursor) : null;
  // One highlight per word: its strongest mark (a word mistake over a slip over a tajweed note).
  const byWord = strongestByWord(marks.filter((m) => words.pageOf(m.w) === page));
  const picked = selected && words.pageOf(selected.w) === page ? selected : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-underlay-${page}`}>
      {line ? (
        <View testID="live-line-band" style={[styles.abs, styles.band, rectStyle(line, scale), { backgroundColor: colors.band }]} />
      ) : null}
      {here ? (
        <View testID="live-word-box" style={[styles.abs, styles.box, rectStyle(cursorBox(words, cursor), scale), { backgroundColor: colors.word }]} />
      ) : null}
      {[...byWord.values()].map((m) => {
        const group = markGroup(picked && picked.w === m.w ? picked : m);
        const firm = picked != null && picked.w === m.w;
        return (
          <View
            key={m.w}
            testID={firm ? `live-highlight-${group}-picked` : `live-highlight-${group}`}
            style={[
              styles.abs,
              styles.box,
              rectStyle(markHighlight(words, m), scale),
              { backgroundColor: firm ? colors.marks[group].firm : colors.marks[group].fill },
            ]}
          />
        );
      })}
    </View>
  );
}

/**
 * Over the page's ink: on a hidden page, the covers (words show as recited, or shown by hand), with no band on any line
 * (Majd, Nov 15 2026). The newest word's grey box and the marks' highlights are behind the ink (LiveUnderlay).
 * `off`: the next word, while something else is being said in its slot (the checker's `off`): its cover turns red, the
 * word-mistake highlight over it, its text still hidden. Not a mark: it goes when the word is said, the reciter goes
 * back, or a mark comes (lib/reciteLive/state). During a take, the words peeked (shown by hand) under a veil of the
 * page's colour, so their ink is a quiet grey, in either view and once recited too; a peeked word with a mistake keeps
 * its highlight unveiled.
 */
export function LiveOverlay({
  page,
  scale,
  hidden,
  peeked = null,
  coverMarks = null,
}: {
  page: number;
  scale: number;
  hidden: { follow: WordFollow; cover: string; guide: string; off?: { w: number; words: QuranWords; colour: string } | null } | null;
  peeked?: { words: QuranWords; peeked: readonly number[]; veil: string } | null;
  /**
   * Mistakes on words the hidden page still covers (Majd, Nov 20 2026: "if I hide the page, that highlight should still
   * be there. Obviously, the word won't be shown"): a take's marks in their colour, and Recite's memory's lighter, drawn
   * over the cover so the word stays hidden. A word that shows has its highlight behind its ink (LiveUnderlay).
   */
  coverMarks?: { words: QuranWords; marks: readonly { mark: Mark; fill: string; opacity?: number }[] } | null;
}) {
  const veiled = peeked ? peeked.peeked.filter((w) => peeked.words.pageOf(w) === page) : [];
  if (!hidden && veiled.length === 0) return null;
  const off = hidden?.off && hidden.off.words.pageOf(hidden.off.w) === page && !hidden.follow.shown(hidden.off.w) ? hidden.off : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-overlay-${page}`}>
      {hidden ? (
        <HiddenPageOverlay page={page} scale={scale} revealed={NO_REVEALED} follow={hidden.follow} colors={{ cover: hidden.cover, guide: hidden.guide }} />
      ) : null}
      {hidden && coverMarks
        ? coverMarks.marks.map(({ mark, fill, opacity }) =>
            coverMarks.words.pageOf(mark.w) === page && !hidden.follow.shown(mark.w) ? (
              <View
                key={`cover-${mark.w}`}
                testID={opacity == null ? `cover-highlight-${markGroup(mark)}` : `cover-past-${markGroup(mark)}`}
                style={[styles.abs, styles.box, rectStyle(markHighlight(coverMarks.words, mark), scale), { backgroundColor: fill }, opacity == null ? null : { opacity }]}
              />
            ) : null,
          )
        : null}
      {off ? (
        <View testID="live-off" style={[styles.abs, styles.box, rectStyle(offBox(off.words, off.w), scale), { backgroundColor: off.colour }]} />
      ) : null}
      {peeked
        ? veiled.map((w) => (
            <View
              key={w}
              testID="live-peeked"
              style={[styles.abs, rectStyle(wordBox(peeked.words, w), scale), { backgroundColor: peeked.veil }]}
            />
          ))
        : null}
    </View>
  );
}

/**
 * Each mark on the page as an element of its own, over its word: invisible, read by VoiceOver ("Wrong word,
 * وَأُوتِيَتْ") and found by the tests. The pager draws these beside the page's one element (`pageAccessories`): inside
 * it iOS hides them. A touch goes through to the page, which opens the mark's card, as a tap on the word does.
 */
export function LiveMarkTargets({ page, scale, words, marks }: { page: number; scale: number; words: QuranWords; marks: Mark[] }) {
  return (
    <>
      {marks.map((m) => {
        if (words.pageOf(m.w) !== page) return null;
        const box = markBox(words, m);
        return (
          <View
            key={m.id}
            pointerEvents="none"
            accessible
            accessibilityRole="button"
            accessibilityLabel={t(m.kind === 'added' ? 'reciteLive.markLabelAfter' : 'reciteLive.markLabel', { title: markTitle(m), word: words.uthmani(m.w) })}
            accessibilityHint={t('reciteLive.markHint')}
            testID={`live-mark-${m.kind}`}
            style={[styles.abs, rectStyle(box, scale)]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  band: { borderRadius: 8 },
  box: { borderRadius: 7 },
});
