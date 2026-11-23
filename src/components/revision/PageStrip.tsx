import React, { useMemo } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { mushafRow } from '../../lib/mushafDirection';
import { t } from '../../i18n';

/** The room the strip takes above the header (ReaderFrame's `strip`). */
export const PAGE_STRIP_HEIGHT = 8;
/** A day longer than this shares its bars: a bar is a few pages, full once they all are. */
export const MAX_STRIP_BARS = 40;

export interface StripBar {
  key: number;
  done: boolean;
  current: boolean;
}

/** A bar per page, or at most `max` bars over the pages in order. */
export function stripBars(
  pages: readonly number[],
  done: ReadonlySet<number>,
  current: number,
  max: number = MAX_STRIP_BARS,
): StripBar[] {
  const count = Math.min(pages.length, max);
  return Array.from({ length: count }, (_, i) => {
    const group = pages.slice(Math.floor((i * pages.length) / count), Math.floor(((i + 1) * pages.length) / count));
    return { key: group[0], done: group.every((p) => done.has(p)), current: group.includes(current) };
  });
}

/**
 * The day's pages above the page, always on show (SESS-1): a bar each, filled once revised, the page on screen's
 * taller. After a swipe the controls hide, so this is what says how far the day has come. The bars run right to left,
 * the first page's on the right, the way the pages turn under the finger, in every language (Majd, Nov 23 2026: "the bars
 * should be colored the other way ie from right to left just like how the user swipes in that direction").
 */
export function PageStrip({
  pages,
  done,
  current,
}: {
  pages: readonly number[];
  done: ReadonlySet<number>;
  current: number;
}) {
  const { palette } = useTheme();
  const bars = useMemo(() => stripBars(pages, done, current), [pages, done, current]);
  const revised = pages.filter((p) => done.has(p)).length;
  return (
    <View
      style={[styles.strip, { flexDirection: mushafRow(I18nManager.isRTL), gap: bars.length > 16 ? 2 : 4 }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('revision.end.progress', { done: revised, total: pages.length })}
      accessibilityValue={{ min: 0, max: pages.length, now: revised }}
      testID="session-page-strip"
    >
      {bars.map((bar) => (
        <View
          key={bar.key}
          style={[
            styles.bar,
            bar.current && styles.barCurrent,
            { backgroundColor: bar.done ? palette.done : palette.outline },
          ]}
          testID={`session-strip-bar${bar.done ? '-done' : ''}${bar.current ? '-current' : ''}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: PAGE_STRIP_HEIGHT,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bar: { flex: 1, height: 3, borderRadius: 1.5 },
  barCurrent: { height: 6, borderRadius: 3 },
});
