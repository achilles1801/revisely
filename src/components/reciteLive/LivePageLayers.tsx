import React from 'react';
import { StyleSheet, View } from 'react-native';
import { HiddenPageOverlay } from '../recite/HiddenPageOverlay';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordFollow } from '../../lib/recite/hiddenPage';
import type { Mark, MarkGroup } from '../../lib/reciteLive/contract';
import { markGroup, strongestByWord } from '../../lib/reciteLive/contract';
import { markTitle } from '../../lib/reciteLive/describe';
import { currentLineBand, grow, markBox, markHighlight, offBox, wordBox } from '../../lib/reciteLive/geometry';
import { followCues } from '../../lib/reciteLive/wash';
import { t } from '../../i18n';
import { FollowInk } from './FollowInk';
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
 * Over the page's ink: on a hidden page, the covers (words show as recited, or shown by hand), with no band on any line
 * (Majd, Nov 15 2026). The newest word's grey wash and the marks' washes are behind the ink (LiveUnderlay); what marks a
 * cover (a mistake on a hidden word, the word being said, `off`) is a wash too, over the cover.
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
  follow = null,
  image = null,
}: {
  page: number;
  scale: number;
  hidden: {
    follow: WordFollow;
    cover: string;
    guide: string;
    off?: { w: number; words: QuranWords; colour: string } | null;
    /** The word being said, still covered: its cover lightly marked, so the reciter sees where they are (Majd, Nov 22 2026). */
    current?: { w: number; words: QuranWords; colour: string } | null;
  } | null;
  peeked?: { words: QuranWords; peeked: readonly number[]; veil: string } | null;
  /**
   * Mistakes on words the hidden page still covers (Majd, Nov 20 2026: "if I hide the page, that highlight should still
   * be there. Obviously, the word won't be shown"): a take's marks in their colour, and Recite's memory's lighter, drawn
   * over the cover so the word stays hidden. A word that shows has its highlight behind its ink (LiveUnderlay).
   */
  coverMarks?: { words: QuranWords; marks: readonly { mark: Mark; fill: string; opacity?: number }[] } | null;
  /**
   * On a hidden page, the newest word shown, drawn again in the following ink over its own (FollowInk; followCues
   * decides which word, none for a word with a mark). Drawn first, so a cover over a neighbour stays on top.
   */
  follow?: { w: number; words: QuranWords; colour: string } | null;
  /** The page's image as the pager draws it, for drawing a word again. */
  image?: { uri: string; width: number; height: number } | null;
}) {
  const veiled = peeked ? peeked.peeked.filter((w) => peeked.words.pageOf(w) === page) : [];
  if (!hidden && veiled.length === 0) return null;
  const off = hidden?.off && hidden.off.words.pageOf(hidden.off.w) === page && !hidden.follow.shown(hidden.off.w) ? hidden.off : null;
  const current =
    hidden?.current && hidden.current.words.pageOf(hidden.current.w) === page && !hidden.follow.shown(hidden.current.w) && off?.w !== hidden.current.w
      ? hidden.current
      : null;
  const inked =
    hidden && follow && image && follow.words.pageOf(follow.w) === page && hidden.follow.shown(follow.w) ? follow : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-overlay-${page}`}>
      {inked && image ? (
        <FollowInk testID="live-follow-ink" box={grow(wordBox(inked.words, inked.w), 1, 0)} scale={scale} image={image} colour={inked.colour} />
      ) : null}
      {hidden ? (
        <HiddenPageOverlay page={page} scale={scale} revealed={NO_REVEALED} follow={hidden.follow} colors={{ cover: hidden.cover, guide: hidden.guide }} />
      ) : null}
      {hidden && coverMarks
        ? coverMarks.marks.map(({ mark, fill, opacity }) =>
            coverMarks.words.pageOf(mark.w) === page && !hidden.follow.shown(mark.w) ? (
              <Wash
                key={`cover-${mark.w}`}
                testID={opacity == null ? `cover-highlight-${markGroup(mark)}` : `cover-past-${markGroup(mark)}`}
                box={markHighlight(coverMarks.words, mark)}
                scale={scale}
                colour={fill}
                opacity={opacity}
              />
            ) : null,
          )
        : null}
      {current ? <Wash testID="live-cover-current" box={offBox(current.words, current.w)} scale={scale} colour={current.colour} /> : null}
      {off ? <Wash testID="live-off" box={offBox(off.words, off.w)} scale={scale} colour={off.colour} /> : null}
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
