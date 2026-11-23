// A real mushaf page for the Memorized picker and its preview (MEM-8): what is chosen in the page's one
// grey highlight behind the ink, what is already memorized faded. It is not the reader's pager and
// shares nothing with it but the page files: no audio, no recording, no verse menu.

import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { ayahRects, versesOnPage, type Rect } from '../../lib/ayahBounds';
import { ayahKey, type AyahKey } from '../../lib/ayahKeys';
import { getMushafEdition } from '../../lib/mushafEdition';
import { knownOffline } from '../../lib/networkState';
import { cachePage, getCachedPageUri } from '../../lib/pageCache';
import type { PageSize } from '../../lib/pageFit';
import { getQuranPageImageUrl, pageImageProps } from '../../lib/quranImages';
import { getReadPalette } from '../../theme/readPalette';

/** How much of the ink shows through on an ayah already memorized. */
const FADED = 0.62;

/** A small copy decodes at its own size on Android too (the reader's pages are drawn as decoded). */
const thumbImageProps = () => (Platform.OS === 'android' ? ({ resizeMethod: 'resize' } as const) : {});

export function MemorizedPageArt({
  page,
  size,
  memorized,
  chosen,
  thumb = false,
  onMissing,
}: {
  page: number;
  size: PageSize;
  memorized: ReadonlySet<AyahKey>;
  chosen: ReadonlySet<AyahKey>;
  /** A preview's small copy. */
  thumb?: boolean;
  /** The page can't be shown (not on the phone and no connection): the picker offers its list. */
  onMissing?: () => void;
}) {
  const { palette, isDark } = useTheme();
  const read = getReadPalette(isDark);
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
        else setUri(getQuranPageImageUrl(page, undefined, edition));
      });
    return () => {
      live = false;
    };
  }, [page, edition, uri, onMissing]);

  const { chosenRects, fadedRects } = useMemo(() => {
    const on: Rect[] = [];
    const faded: Rect[] = [];
    for (const v of versesOnPage(page, edition)) {
      const key = ayahKey(v.sura, v.ayah);
      if (chosen.has(key)) on.push(...ayahRects(page, v.sura, v.ayah));
      else if (memorized.has(key)) faded.push(...ayahRects(page, v.sura, v.ayah));
    }
    return { chosenRects: on, fadedRects: faded };
  }, [page, edition, chosen, memorized]);

  const box = (r: Rect) => ({
    left: r.x0 * size.scale,
    top: r.y0 * size.scale,
    width: (r.x1 - r.x0) * size.scale,
    height: (r.y1 - r.y0) * size.scale,
  });

  return (
    <View style={[styles.page, { width: size.width, height: size.height, backgroundColor: read.pageBg }]} pointerEvents="none">
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
        <View key={i} testID="picker-faded" style={[styles.rect, box(r), { backgroundColor: read.pageBg, opacity: FADED }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Boxes are measured from the image's left edge, in either language.
  page: { direction: 'ltr', overflow: 'hidden' },
  rect: { position: 'absolute' },
});
