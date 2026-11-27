// The app's screens the tour draws (What's new 1.0.6): the reader on a page of the mushaf, words arriving one by one,
// and the pieces several slides share. Pictures in a phone's points (parts.tsx), never touched.

import React from 'react';
import { Image, StyleSheet, View, type TextStyle } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { getReadPalette } from '../../../theme/readPalette';
import { getQuranData } from '../../../lib/quranData';
import { getCachedPageUri } from '../../../lib/pageCache';
import { getQuranPageImageUrl } from '../../../lib/quranImages';
import { seg } from '../../../lib/whatsNew/tour';
import { Anim, T, at, type Clock } from './parts';

/** The reader's page box (ReaderFrame): under the header, over the room kept under the page. */
export const PAGE_BOX = { left: 4, top: 110, width: 394, height: 662 } as const;
/** A line of the page, roughly (15 lines in the box). */
export const LINE_H = PAGE_BOX.height / 15;
/** The foot of the page: its number, and Revo's R on its other side (REVO-45). */
export const FOOT_Y = 798;

export function pageImageUri(page: number): string {
  return getCachedPageUri(page) ?? getQuranPageImageUrl(page);
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
