import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PageImage } from '../MushafPager';
import { HiddenPageOverlay } from '../recite/HiddenPageOverlay';
import { pageImageProps } from '../../lib/quranImages';
import type { Rect } from '../../lib/ayahBounds';
import type { QuranWords } from '../../lib/recite/quranWords';
import type { WordFollow } from '../../lib/recite/hiddenPage';
import type { Mark } from '../../lib/reciteLive/contract';
import { severityOf } from '../../lib/reciteLive/contract';
import { ayahBand, cursorBox, grow, markShape, wordBox } from '../../lib/reciteLive/geometry';
import { markStrength } from '../../lib/reciteLive/state';
import { mixColors } from '../../theme/v2';

const NO_REVEALED: ReadonlySet<string> = new Set();

function rectStyle(r: Rect, scale: number) {
  return { left: r.x0 * scale, top: r.y0 * scale, width: (r.x1 - r.x0) * scale, height: (r.y1 - r.y0) * scale };
}

/**
 * Behind the page's ink, in its frame: the ayah being recited (a soft band on each of its lines) and the word being
 * recited (a firmer box), and the mark a card is open for.
 */
export function LiveUnderlay({
  page,
  scale,
  words,
  cursor,
  selected,
  colors,
}: {
  page: number;
  scale: number;
  words: QuranWords;
  cursor: number | null;
  selected: Mark | null;
  colors: { band: string; word: string; selectedMistake: string; selectedSlip: string };
}) {
  const here = cursor != null && words.pageOf(cursor) === page;
  const ref = here ? words.ref(cursor) : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-underlay-${page}`}>
      {ref
        ? ayahBand(page, ref.sura, ref.ayah).map((r, i) => (
            <View key={`b${i}`} testID="live-ayah-band" style={[styles.abs, styles.band, rectStyle(r, scale), { backgroundColor: colors.band }]} />
          ))
        : null}
      {here ? (
        <View testID="live-word-box" style={[styles.abs, styles.box, rectStyle(cursorBox(words, cursor), scale), { backgroundColor: colors.word }]} />
      ) : null}
      {selected && words.pageOf(selected.w) === page && selected.kind !== 'added' ? (
        <View
          testID="live-selected-mark"
          style={[
            styles.abs,
            styles.box,
            rectStyle(grow(wordBox(words, selected.w), 5, 3), scale),
            { backgroundColor: severityOf(selected) === 'mistake' ? colors.selectedMistake : colors.selectedSlip },
          ]}
        />
      ) : null}
    </View>
  );
}

/** The word's own ink in `color`: the page image again, tinted, clipped to the word's box. */
function Recoloured({
  image,
  box,
  scale,
  color,
  opacity,
  testID,
}: {
  image: PageImage;
  box: Rect;
  scale: number;
  color: string;
  opacity: number;
  testID?: string;
}) {
  const r = grow(box, 0, 4);
  return (
    <View style={[styles.abs, styles.clip, rectStyle(r, scale)]} pointerEvents="none" testID={testID}>
      <Image
        source={{ uri: image.uri }}
        {...pageImageProps()}
        fadeDuration={0}
        style={{
          position: 'absolute',
          left: -r.x0 * scale,
          top: -r.y0 * scale,
          width: image.width,
          height: image.height,
          tintColor: color,
          opacity,
        }}
      />
    </View>
  );
}

/** A dotted line under a word (a row of dots: iOS draws a dotted border only on all four sides). */
function Dots({ box, scale, color, opacity }: { box: Rect; scale: number; color: string; opacity: number }) {
  const width = (box.x1 - box.x0) * scale - 4;
  const n = Math.max(2, Math.floor(width / 4.4));
  return (
    <View
      pointerEvents="none"
      style={[styles.abs, styles.dots, { left: box.x0 * scale + 2, top: box.y1 * scale + 1.5, width, opacity }]}
    >
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/**
 * Over the page's ink: hidden-page covers (words show as recited, or shown by hand), the newest word shown in the
 * accent while hidden, and the marks (Check): the word itself in red or amber with a dotted line under it, or a small
 * ⊕ in the gap where a word was added. A mark past the normal bar only (`likely`) is a little lighter.
 */
export function LiveOverlay({
  page,
  scale,
  image,
  words,
  marks,
  hidden,
  newest,
  colors,
}: {
  page: number;
  scale: number;
  image: PageImage | null;
  words: QuranWords;
  marks: Mark[];
  hidden: { follow: WordFollow; cover: string; guide: string; band: string } | null;
  newest: number | null;
  /** `ground`: the page's colour (a likely mark is its colour a little towards it). */
  colors: { mistake: string; slip: string; accent: string; onMistake: string; ground: string };
}) {
  const showNewest = hidden && newest != null && words.pageOf(newest) === page && hidden.follow.shown(newest);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`live-overlay-${page}`}>
      {hidden ? (
        <HiddenPageOverlay
          page={page}
          scale={scale}
          revealed={NO_REVEALED}
          follow={hidden.follow}
          colors={{ cover: hidden.cover, guide: hidden.guide, band: hidden.band }}
        />
      ) : null}
      {image && showNewest ? <Recoloured image={image} box={wordBox(words, newest)} scale={scale} color={colors.accent} opacity={1} /> : null}
      {marks.map((m) => {
        if (words.pageOf(m.w) !== page) return null;
        const shape = markShape(words, m);
        const base = severityOf(m) === 'mistake' ? colors.mistake : colors.slip;
        // A likely mark: lighter, drawn solid (a see-through red over black ink reads as maroon).
        const color = markStrength(m) === 'full' ? base : mixColors(base, colors.ground, 0.3);
        const opacity = 1;
        if (shape.type === 'gap') {
          return (
            <View
              key={m.id}
              testID="live-mark-gap"
              style={[styles.abs, styles.gap, { left: shape.x * scale - 9, top: shape.y * scale - 4, backgroundColor: color, opacity }]}
            >
              <Ionicons name="add" size={14} color={colors.onMistake} />
            </View>
          );
        }
        return (
          <View key={m.id} style={StyleSheet.absoluteFill} pointerEvents="none">
            {image && m.kind !== 'skipped' ? (
              <Recoloured image={image} box={shape.box} scale={scale} color={color} opacity={opacity} testID={`live-mark-${m.kind}`} />
            ) : null}
            {image && m.kind === 'skipped' ? (
              // A word left out: the word in the mark's colour, fainter, as it wasn't said.
              <Recoloured
                image={image}
                box={shape.box}
                scale={scale}
                color={mixColors(color, colors.ground, 0.4)}
                opacity={opacity}
                testID="live-mark-skipped"
              />
            ) : null}
            <Dots box={shape.box} scale={scale} color={color} opacity={opacity} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  band: { borderRadius: 8 },
  box: { borderRadius: 7 },
  clip: { overflow: 'hidden' },
  dots: { flexDirection: 'row', justifyContent: 'space-between', height: 2.4 },
  dot: { width: 2.2, height: 2.2, borderRadius: 1.1 },
  gap: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
