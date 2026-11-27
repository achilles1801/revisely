// The app's screens the tour draws (What's new 1.0.6): the reader on a page of the mushaf, words arriving one by one,
// and the pieces several slides share. Pictures in a phone's points (parts.tsx), never touched.

import React from 'react';
import { Image, StyleSheet, View, type TextStyle } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { getReadPalette } from '../../../theme/readPalette';
import { getQuranData } from '../../../lib/quranData';
import { getCachedPageUri } from '../../../lib/pageCache';
import { getQuranPageImageUrl } from '../../../lib/quranImages';
import { BOUNDS_WIDTH, PAGE_IMAGE_ASPECT, boundsFile } from '../../../lib/ayahBounds';
import { pageLines } from '../../../lib/recite/pageLines';
import { seg } from '../../../lib/whatsNew/tour';
import { Anim, T, at, type Clock } from './parts';

/** The reader's page box (ReaderFrame): under the header, over the room kept under the page. */
export const PAGE_BOX = { left: 4, top: 110, width: 394, height: 662 } as const;
/** A line of the page, roughly (15 lines in the box). */
export const LINE_H = PAGE_BOX.height / 15;
/** The foot of the page: its number, and Revo's R on its other side (REVO-45). */
export const FOOT_Y = 798;

/**
 * The tour's pages are always the 1405 print's, whatever the reader's edition: the lines and verses the slides mark are
 * measured on its images (src/data/pageLines.json, ayahBounds.json), so a mark sits on its words (Majd, Nov 27 2026: a
 * grey bar under the page's last line, a stray box over a word).
 */
const EDITION = 'madani1405';

export function pageImageUri(page: number): string {
  return getCachedPageUri(page, EDITION) ?? getQuranPageImageUrl(page, undefined, EDITION);
}

/** The page image as the reader draws it in PAGE_BOX: as wide as the box (contain), centred down it. */
const IMAGE_H = PAGE_BOX.width / PAGE_IMAGE_ASPECT;
const IMAGE_TOP = PAGE_BOX.top + (PAGE_BOX.height - IMAGE_H) / 2;
const K = PAGE_BOX.width / BOUNDS_WIDTH;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A box of the page's bounds space (1024 wide, as the line and verse data), in the phone's points. */
export function onPage(x0: number, y0: number, x1: number, y1: number): Box {
  return { left: PAGE_BOX.left + x0 * K, top: IMAGE_TOP + y0 * K, width: (x1 - x0) * K, height: (y1 - y0) * K };
}

/** Line `n` of `page` (1–15): the band of its glyphs across its text, in the phone's points. */
export function lineOn(page: number, n: number): Box & { markers: [number, number][] } {
  const l = pageLines(page).find((x) => x.line === n) ?? pageLines(page)[0];
  return { ...onPage(l.x0, l.y0, l.x1, l.y1), markers: l.markers.map(([a, b]) => [PAGE_BOX.left + a * K, PAGE_BOX.left + b * K]) };
}

/** The lines of `page`, top to bottom: their numbers and their glyphs' bands (the phone's points). */
export function linesOn(
  page: number,
): (Box & { line: number; coverTop: number; coverBottom: number; markers: [number, number][]; markerRows: [number, number][] })[] {
  return pageLines(page).map((l) => ({
    ...onPage(l.x0, l.y0, l.x1, l.y1),
    line: l.line,
    coverTop: IMAGE_TOP + l.coverTop * K,
    coverBottom: IMAGE_TOP + l.coverBottom * K,
    markers: l.markers.map(([a, b]) => [PAGE_BOX.left + a * K, PAGE_BOX.left + b * K] as [number, number]),
    // Each marker's own ink rows: only those are open, so a neighbour's vowel over or under it stays covered.
    markerRows: l.markerRows.map(([a, b]) => [IMAGE_TOP + a * K, IMAGE_TOP + b * K] as [number, number]),
  }));
}

/** The boxes of one ayah on `page` (a box per line it takes), in the phone's points. */
export function ayahOn(page: number, sura: number, ayah: number): Box[] {
  const d = boundsFile(EDITION)[String(page)] ?? [];
  const out: Box[] = [];
  for (let i = 0; i + 5 < d.length; i += 6) {
    if (d[i] === sura && d[i + 1] === ayah) out.push(onPage(d[i + 2], d[i + 3], d[i + 4], d[i + 5]));
  }
  return out;
}

/** A word's span along its line (bounds-space x0, x1), in the phone's points. */
export function wordX(x0: number, x1: number): [number, number] {
  return [PAGE_BOX.left + x0 * K, PAGE_BOX.left + x1 * K];
}

/** "An-Naml", "Juz 19" for a page's header. */
export function pageHeader(page: number): { surah: string; juz: number } {
  const p = getQuranData()[page - 1];
  return { surah: p?.surahName ?? '', juz: p?.juzNumber ?? 1 };
}

/** The reader on `page`: its header, the page, its number at the foot. `under` draws beneath the page's ink (a highlight). */
export function MushafScreen({ page, under, foot = true }: { page: number; under?: React.ReactNode; foot?: boolean }) {
  const { isDark, palette } = useTheme();
  const read = getReadPalette(isDark);
  const { surah, juz } = pageHeader(page);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: read.pageBg }]}>
      <View style={[at(0, 62, 402, 48), styles.header]}>
        <T style={[styles.surah, { color: palette.text }]}>{surah}</T>
        <T style={[styles.sub, { color: palette.secondary }]}>{`Page ${page} · Juz ${juz}`}</T>
      </View>
      {under}
      <Image
        source={{ uri: pageImageUri(page) }}
        resizeMode="contain"
        style={[styles.page, read.pageTint != null && { tintColor: read.pageTint }]}
      />
      {foot ? (
        <T style={[styles.number, at(0, FOOT_Y - 9, 402), { color: palette.secondary }]}>{String(page)}</T>
      ) : null}
    </View>
  );
}

/**
 * Words arriving one by one between `from` and `to` (seconds), as Revo's answer streams in. `rtl`: Arabic, from the
 * right. Each word is its own piece, so the lines break as the finished text does.
 */
export function WordsIn({
  t,
  text,
  from,
  to,
  style,
  rtl = false,
}: {
  t: Clock;
  text: string;
  from: number;
  to: number;
  style: TextStyle | TextStyle[];
  rtl?: boolean;
}) {
  const words = text.split(' ');
  const step = (to - from) / Math.max(1, words.length);
  const size = StyleSheet.flatten(style)?.fontSize ?? 15;
  return (
    <View style={[styles.words, rtl && styles.wordsRtl, { columnGap: Math.round(size * 0.27) }]}>
      {words.map((w, i) => {
        const a = from + i * step;
        return (
          <Anim
            key={`${i}-${w}`}
            t={t}
            style={(now) => {
              'worklet';
              const u = seg(now, a, a + Math.max(0.12, step * 2));
              return { opacity: u, transform: [{ translateY: (1 - u) * 4 }] };
            }}
          >
            <T style={style}>{w}</T>
          </Anim>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { position: 'absolute', left: PAGE_BOX.left, top: PAGE_BOX.top, width: PAGE_BOX.width, height: PAGE_BOX.height },
  header: { alignItems: 'center', justifyContent: 'center' },
  surah: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  sub: { fontSize: 11, lineHeight: 14 },
  number: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  wordsRtl: { flexDirection: 'row-reverse' },
});
