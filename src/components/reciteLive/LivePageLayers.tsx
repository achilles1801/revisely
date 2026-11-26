import { onNextWord } from '../../lib/reciteLive/markPlace';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordFollow } from '../../lib/recite/hiddenPage';
import type { Mark } from '../../lib/reciteLive/contract';
import { markGroup, strongestByWord } from '../../lib/reciteLive/contract';
import { markTitle } from '../../lib/reciteLive/describe';
import { ayahBand, cursorBox, markBox, markHighlight, offBox, wordBox } from '../../lib/reciteLive/geometry';
import { followCues } from '../../lib/reciteLive/wash';
import { t } from '../../i18n';
import { HiddenInkLayer, shownOnHiddenPage, type InkWash } from './HiddenInkLayer';
import { Wash } from './Wash';
import { markFill, markFirm } from './markColours';
import type { PaletteV2 } from '../../theme/v2';

const NO_REVEALED: ReadonlySet<string> = new Set();

function rectStyle(r: Rect, scale: number) {
  return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
}

/** The marks' colours (theme/v2: markWord, markWordFirm…), read through markFill and markFirm, which say which a mark takes. */
export type MarkColours = Pick<PaletteV2, 'markWord' | 'markWordFirm' | 'markSlip' | 'markSlipFirm' | 'markTajweed' | 'markTajweedFirm'>;

/**
 * Behind the page's ink, in its frame: what follows the reciter (lib/reciteLive/wash's followCues: with the page shown,
 * only a flat grey band behind the whole ayah being recited and no word washed, Majd, Nov 21 and 22 2026: "They dont even
 * use shades when ur reciting with the page shown … which is actually really nice", "we should follow how tarteel does
 * it here"; with it hidden, no band: the newest word shown
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
  /** The cursor's word: the band behind its ayah, on a shown page. */
  cursor: number | null;
  marks: Mark[];
  selected: Mark | null;
  /** The hidden view: no line band. */
  hidden: boolean;
  colors: { band: string; box: string; marks: MarkColours };
}) {
  const cues = followCues(hidden, cursor, null);
  // The whole ayah being recited, every line of it on this page (Majd, Nov 22 2026: "we should follow how tarteel does
  // it here"): flat, full line height, moving per ayah, never per word.
  const ayah = cues.band != null && words.pageOf(cues.band) === page ? words.ref(cues.band) : null;
  const bands = ayah ? ayahBand(page, ayah.sura, ayah.ayah) : [];
  // One highlight per word: its strongest mark (a word mistake over a slip over a tajweed note).
  const byWord = strongestByWord(marks.filter((m) => words.pageOf(m.w) === page));
  const picked = selected && words.pageOf(selected.w) === page ? selected : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-underlay-${page}`}>
      {bands.map((r, i) => (
        <View key={`band-${i}`} testID="live-ayah-band" style={[styles.abs, styles.band, rectStyle(r, scale), { backgroundColor: colors.band }]} />
      ))}
      {cues.box != null && words.pageOf(cues.box) === page ? (
        <View testID="live-word-box" style={[styles.abs, styles.box, rectStyle(cursorBox(words, cues.box), scale), { backgroundColor: colors.box }]} />
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
            colour={firm ? markFirm(colors.marks, m) : markFill(colors.marks, m)}
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
 * page, that highlight should still be there", outside a take; during one, nothing on a word still hidden; `off`), then the verse
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
    off?: { w: number; words: QuranWords; colour: string } | null;
    /**
     * A take is running: nothing is drawn on a word still hidden, its marks and past mistakes included (Majd's Dev take,
     * Nov 22 2026: the marked next word and the boxes on lines not yet recited gave words away); they show once their
     * word does. Outside a take a hidden word's marks show on its place (RECITE-13).
     */
    duringTake?: boolean;
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
      // A shown word's wash is behind its ink (the underlay); over the covers only a word still hidden's, and none of
      // those during a take.
      if (words.pageOf(mark.w) !== page || shown(mark.w) || hidden.duringTake) continue;
      const g = markGroup(mark);
      const past = opacity != null;
      const id = past ? `cover-past-${g}` : `cover-highlight-${g}`;
      washes.push({ box: markHighlight(words, mark), colour: fill, opacity: picked ? undefined : opacity, testID: picked ? `${id}-picked` : id });
    }
    const off = hidden.off && words.pageOf(hidden.off.w) === page && !shown(hidden.off.w) ? hidden.off : null;
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
 * On a hidden page, behind the page's ink: the washes of the words it shows (a take's marks and past mistakes, lighter;
 * the one a card is open for in its firm shade), seen through the covers' openings, the ink on top.
 */
export function ShownWashes({
  page,
  scale,
  words,
  marks,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  marks: readonly { mark: Mark; fill: string; opacity?: number; picked?: boolean }[];
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`shown-washes-${page}`}>
      {marks.map(({ mark, fill, opacity, picked }) => {
        if (words.pageOf(mark.w) !== page) return null;
        const g = markGroup(mark);
        const id = opacity != null && !picked ? `past-highlight-${g}` : `live-highlight-${g}`;
        return <Wash key={mark.w} testID={picked ? `${id}-picked` : id} box={markHighlight(words, mark)} scale={scale} colour={fill} opacity={picked ? undefined : opacity} />;
      })}
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
            accessibilityLabel={t(m.kind === 'added' && !onNextWord(m) ? 'reciteLive.markLabelAfter' : 'reciteLive.markLabel', { title: markTitle(m), word: words.uthmani(m.w) })}
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
  band: { borderRadius: 3 },
  box: { borderRadius: 5 },
});
