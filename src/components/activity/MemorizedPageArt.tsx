// A real mushaf page for the Memorized picker and its preview (MEM-8): what is chosen in the page's one
// grey highlight behind the ink, what is already memorized faded. It is not the reader's pager and
// shares nothing with it but the page files: no audio, no recording, no verse menu.

import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ayahRects, versesOnPage, type Rect } from '../../lib/ayahBounds';
import { ayahKey, type AyahKey } from '../../lib/ayahKeys';
import { getMushafEdition } from '../../lib/mushafEdition';
import { nativeRequestUrl } from '../../lib/devNetwork';
import { knownOffline } from '../../lib/networkState';
import { cachePage, getCachedPageUri } from '../../lib/pageCache';
import type { PageSize } from '../../lib/pageFit';
import { getQuranPageImageUrl, pageImageProps } from '../../lib/quranImages';
import { getReadPalette } from '../../theme/readPalette';
import { t } from '../../i18n';

/** The line in the margin, beside the page's text. */
const MARGIN_LINE = 2;
/** How much of the sheet's colour lies over an ayah already memorized. */
const FADED = 0.6;

/** A small copy decodes at its own size on Android too (the reader's pages are drawn as decoded). */
const thumbImageProps = () => (Platform.OS === 'android' ? ({ resizeMethod: 'resize' } as const) : {});

export function MemorizedPageArt({
  page,
  size,
  memorized,
  chosen,
  thumb = false,
  leftOff = null,
  onMissing,
}: {
  page: number;
  size: PageSize;
  memorized: ReadonlySet<AyahKey>;
  chosen: ReadonlySet<AyahKey>;
  /** A preview's small copy. */
  thumb?: boolean;
  /** Where they left off, marked on the page until something is chosen. */
  leftOff?: AyahKey | null;
  /** The page can't be shown (not on the phone and no connection): the picker offers its list. */
  onMissing?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const read = getReadPalette(isDark);
  // The big page sits on the sheet itself (in dark, a black page was a box on it); a preview is a small page of its own.
  const paper = thumb ? read.pageBg : palette.sheet;
  const edition = getMushafEdition();
  const [uri, setUri] = useState<string | null>(() => getCachedPageUri(page, edition));

  useEffect(() => {
    if (uri) return;
    let live = true;
    cachePage(page, edition)
      .catch(() => null)
      .then((local) => {
        if (!live) return;
        if (local) setUri(local);
        else if (knownOffline()) onMissing?.();
        else setUri(nativeRequestUrl(getQuranPageImageUrl(page, undefined, edition)));
      });
    return () => {
      live = false;
    };
  }, [page, edition, uri, onMissing]);

  const { chosenRects, fadedRects, lines, marginX, leftOffRect } = useMemo(() => {
    const on: Rect[] = [];
    const faded: Rect[] = [];
    // One line in the margin per line of text; a line shared by a memorized ayah and a chosen one is chosen.
    const bands = new Map<number, { y0: number; y1: number; chosen: boolean }>();
    let right = 0;
    let tag: Rect | null = null;
    const band = (r: Rect, isChosen: boolean) => {
      const y = Math.round(r.y0);
      const had = bands.get(y);
      bands.set(y, { y0: r.y0, y1: r.y1, chosen: isChosen || had?.chosen === true });
    };
    for (const v of versesOnPage(page, edition)) {
      const key = ayahKey(v.sura, v.ayah);
      const rects = ayahRects(page, v.sura, v.ayah);
      for (const r of rects) right = Math.max(right, r.x1);
      if (key === leftOff) tag = rects[0] ?? null;
      if (chosen.has(key)) {
        on.push(...rects);
        rects.forEach((r) => band(r, true));
      } else if (memorized.has(key)) {
        faded.push(...rects);
        rects.forEach((r) => band(r, false));
      }
    }
    return { chosenRects: on, fadedRects: faded, lines: [...bands.values()], marginX: right, leftOffRect: tag as Rect | null };
  }, [page, edition, chosen, memorized, leftOff]);

  const box = (r: Rect) => ({
    left: r.x0 * size.scale,
    top: r.y0 * size.scale,
    width: (r.x1 - r.x0) * size.scale,
    height: (r.y1 - r.y0) * size.scale,
  });

  return (
    <View style={[styles.page, { width: size.width, height: size.height, backgroundColor: paper }]} pointerEvents="none">
      {chosenRects.map((r, i) => (
        <View key={i} testID="picker-chosen" style={[styles.rect, box(r), { backgroundColor: palette.highlight }]} />
      ))}
      {uri ? (
        <Image
          testID="picker-page-image"
          source={{ uri }}
          {...(thumb ? thumbImageProps() : pageImageProps())}
          fadeDuration={0}
          onError={() => onMissing?.()}
          style={[{ width: size.width, height: size.height }, read.pageTint != null && { tintColor: read.pageTint, opacity: 0.92 }]}
        />
      ) : null}
      {fadedRects.map((r, i) => (
        <View key={i} testID="picker-faded" style={[styles.rect, box(r), { backgroundColor: paper, opacity: FADED }]} />
      ))}
      {thumb
        ? null
        : lines.map((l) => (
            <View
              key={l.y0}
              testID={l.chosen ? 'picker-line-chosen' : 'picker-line-faded'}
              style={[
                styles.rect,
                {
                  left: Math.min(size.width - MARGIN_LINE, marginX * size.scale + 3),
                  top: l.y0 * size.scale + 1,
                  width: MARGIN_LINE,
                  height: (l.y1 - l.y0) * size.scale - 2,
                  backgroundColor: l.chosen ? palette.accentText : palette.separator,
                },
              ]}
            />
          ))}
      {!thumb && leftOffRect && chosen.size === 0 ? (
        <View
          testID="picker-left-off"
          style={[
            styles.tag,
            {
              right: Math.max(0, size.width - leftOffRect.x1 * size.scale),
              top: Math.max(0, leftOffRect.y0 * size.scale - 11),
              backgroundColor: palette.accentText,
            },
          ]}
        >
          <Text style={[styles.tagText, { color: palette.sheet }]} maxFontSizeMultiplier={1.1}>
            {t('activity.pick.leftOffTag')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Boxes are measured from the image's left edge, in either language.
  page: { direction: 'ltr', overflow: 'hidden' },
  rect: { position: 'absolute' },
  tag: { position: 'absolute', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9 },
  tagText: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
});
