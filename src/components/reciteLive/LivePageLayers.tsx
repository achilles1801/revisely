import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordFollow } from '../../lib/recite/hiddenPage';
import type { Mark, MarkGroup } from '../../lib/reciteLive/contract';
import { markGroup, strongestByWord } from '../../lib/reciteLive/contract';
import { markTitle } from '../../lib/reciteLive/describe';
import { currentLineBand, markBox, markHighlight, offBox, wordBox } from '../../lib/reciteLive/geometry';
import { followCues } from '../../lib/reciteLive/wash';
import { t } from '../../i18n';
import { HiddenInkLayer, shownOnHiddenPage, type InkWash } from './HiddenInkLayer';
import { Wash } from './Wash';

const NO_REVEALED: ReadonlySet<string> = new Set();

function rectStyle(r: Rect, scale: number) {
  return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
}

/** Each group's highlight, and its firmer shade for the mark a card is open for (theme/v2: markWord, markWordFirm…). */
export type MarkColours = Record<MarkGroup, { fill: string; firm: string }>;

/**
 * Behind the page's ink, in its frame: what follows the reciter (lib/reciteLive/wash's followCues: with the page shown,
 * only a quiet grey band on the line being recited and no word washed, Majd, Nov 21 2026: "They dont even use shades
 * when ur reciting with the page shown … which is actually really nice"; with it hidden, no band: the newest word shown
 * is in the following ink, over the ink, LiveOverlay), and the marks (Check) behind their words, three colours at most: red for words, amber for slips
 * and "Not clear", violet for tajweed (Majd, Nov 15 2026: "only things we should show are highlites for mistakes 3
 * colors max"). Every highlight is a soft pastel wash (Wash), never a box. An extra word is highlighted on the word
 * before it. A word with several marks shows its strongest. The mark a card is open for is a firmer shade of its own
 * colour. No red ink, dotted lines or + discs on the page.
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
  /** The cursor's word: the band on its line, on a shown page. */
  cursor: number | null;
  marks: Mark[];
  selected: Mark | null;
  /** The hidden view: no line band. */
  hidden: boolean;
  colors: { band: string; marks: MarkColours };
}) {
  const cues = followCues(hidden, cursor, null);
  const line = cues.band != null ? currentLineBand(words, page, cues.band) : null;
  // One highlight per word: its strongest mark (a word mistake over a slip over a tajweed note).
  const byWord = strongestByWord(marks.filter((m) => words.pageOf(m.w) === page));
  const picked = selected && words.pageOf(selected.w) === page ? selected : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-underlay-${page}`}>
      {line ? (
        <View testID="live-line-band" style={[styles.abs, styles.band, rectStyle(line, scale), { backgroundColor: colors.band }]} />
      ) : null}
      {[...byWord.values()].map((m) => {
        const group = markGroup(picked && picked.w === m.w ? picked : m);
        const firm = picked != null && picked.w === m.w;
        return (
          <Wash
            key={m.w}
            testID={firm ? `live-highlight-${group}-picked` : `live-highlight-${group}`}
            box={markHighlight(words, m)}
            scale={scale}
            colour={firm ? colors.marks[group].firm : colors.marks[group].fill}
          />
        );
      })}
    </View>
  );
}

/**
 * Over the page's ink. On a hidden page, the page drawn empty (HiddenInkLayer; Majd, Nov 22 2026): each line covered,
 * a faint rule where its words are still hidden, the washes over the covers (every mark on the page, a take's in their
 * colour and Recite's memory's lighter, so a hidden word's still shows where it is: Majd, Nov 20 2026, "if I hide the
 * page, that highlight should still be there"; the covered word being said lightly marked; `off`), then the verse
 * markers and the words shown drawn again in the page's own ink, the newest in the following colour (`follow`;
 * followCues decides which word, none for a word with a mark). No band on any line (Majd, Nov 15 2026).
 * `off`: the next word, while something else is being said in its slot (the checker's `off`): the word-mistake wash on
 * its place, its text still hidden. Not a mark: it goes when the word is said, the reciter goes back, or a mark comes
 * (lib/reciteLive/state). During a take, the words peeked (shown by hand) under a veil of the page's colour, so their ink
 * is a quiet grey, in either view and once recited too; a peeked word with a mistake keeps its highlight unveiled.
 */
export function LiveOverlay({
  page,
  scale,
  hidden,
  peeked = null,
  coverMarks = null,
  follow = null,
  image = null,
}: {
  page: number;
  scale: number;
  hidden: {
    /** What the hidden page shows (recited, peeked, shown by hand). */
    follow: WordFollow;
    cover: string;
    guide: string;
    /** How the pager tints the page image, so words drawn again match it. */
    ink?: { colour: string | null; opacity?: number };
    off?: { w: number; words: QuranWords; colour: string } | null;
    /** The word being said, still covered: its place lightly marked, so the reciter sees where they are (Majd, Nov 22 2026). */
    current?: { w: number; words: QuranWords; colour: string } | null;
  } | null;
  peeked?: { words: QuranWords; peeked: readonly number[]; veil: string } | null;
  /** On a hidden page, the marks on the page: a take's (`opacity` unset) and Recite's memory's, `picked` the one a card is open for. */
  coverMarks?: { words: QuranWords; marks: readonly { mark: Mark; fill: string; opacity?: number; picked?: boolean }[] } | null;
  /** On a hidden page, the newest word shown, in the following ink over its own. */
  follow?: { w: number; words: QuranWords; colour: string } | null;
  /** The page's image as the pager draws it, for drawing words again. */
  image?: { uri: string; width: number; height: number } | null;
}) {
  const veiled = peeked ? peeked.peeked.filter((w) => peeked.words.pageOf(w) === page) : [];
  if (!hidden && veiled.length === 0) return null;
  const words = hidden?.follow.words ?? null;
  const shown = hidden && words ? shownOnHiddenPage(words, hidden.follow, NO_REVEALED) : null;
  const washes: InkWash[] = [];
  if (hidden && words && shown) {
    for (const { mark, fill, opacity, picked } of coverMarks?.marks ?? []) {
      if (words.pageOf(mark.w) !== page) continue;
      const g = markGroup(mark);
      const past = opacity != null;
      const id = shown(mark.w) ? (past ? `past-highlight-${g}` : `live-highlight-${g}`) : past ? `cover-past-${g}` : `cover-highlight-${g}`;
      washes.push({ box: markHighlight(words, mark), colour: fill, opacity: picked ? undefined : opacity, testID: picked ? `${id}-picked` : id });
    }
    const off = hidden.off && words.pageOf(hidden.off.w) === page && !shown(hidden.off.w) ? hidden.off : null;
    const current =
      hidden.current && words.pageOf(hidden.current.w) === page && !shown(hidden.current.w) && off?.w !== hidden.current.w ? hidden.current : null;
    if (current) washes.push({ box: offBox(words, current.w), colour: current.colour, testID: 'live-cover-current' });
    if (off) washes.push({ box: offBox(words, off.w), colour: off.colour, testID: 'live-off' });
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-overlay-${page}`}>
      {hidden && words && shown ? (
        <HiddenInkLayer
          page={page}
          scale={scale}
          words={words}
          shown={shown}
          image={image}
          ink={hidden.ink ?? { colour: null }}
          colors={{ cover: hidden.cover, guide: hidden.guide }}
          washes={washes}
          follow={follow ? { w: follow.w, colour: follow.colour } : null}
        />
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
});
