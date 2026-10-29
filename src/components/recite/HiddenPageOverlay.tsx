import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { hiddenPageLayout, WordFollow } from '../../lib/recite/hiddenPage';

/** Where the guide line runs in a line's band (from the top): about the baseline. */
const GUIDE_AT = 0.74;

/**
 * A hidden page (the recite mode), over the page image in its own frame: every
 * line covered in the page colour with a faint guide line across it, the verse
 * markers left open, revealed verses open in place, and an accent band across
 * the line where the next hidden verse starts. Takes no touches: a tap reaches
 * the page underneath (MushafPager's onTapVerse).
 */
export function HiddenPageOverlay({
  page,
  scale,
  revealed,
  follow,
  colors,
}: {
  page: number;
  /** Bounds to points (MushafPager's page size). */
  scale: number;
  revealed: ReadonlySet<string>;
  /** Following the reciter word by word: the words recited show too. */
  follow?: WordFollow | null;
  colors: { cover: string; guide: string; band: string };
}) {
  const { lines } = useMemo(() => hiddenPageLayout(page, revealed, follow), [page, revealed, follow]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`hidden-page-${page}`}>
      {lines.map((l) =>
        l.covers.map(([a, b], i) => (
          <View
            key={`${l.line}-${i}`}
            testID="hidden-cover"
            style={[
              styles.abs,
              {
                backgroundColor: colors.cover,
                left: a * scale,
                top: l.top * scale,
                width: (b - a) * scale,
                height: (l.bottom - l.top) * scale,
              },
            ]}
          >
            <View
              testID="hidden-guide"
              style={[
                styles.guide,
                { backgroundColor: colors.guide, top: (l.y0 - l.top + GUIDE_AT * (l.y1 - l.y0)) * scale },
              ]}
            />
          </View>
        )),
      )}
      {lines
        .filter((l) => l.current)
        .map((l) => (
          <View
            key={`band-${l.line}`}
            testID="hidden-band"
            style={[
              styles.abs,
              styles.band,
              {
                backgroundColor: colors.band,
                left: l.x0 * scale,
                top: l.y0 * scale,
                width: (l.x1 - l.x0) * scale,
                height: (l.y1 - l.y0) * scale,
              },
            ]}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  guide: { position: 'absolute', left: 4, right: 4, height: 1, opacity: 0.35, borderRadius: 1 },
  band: { opacity: 0.12, borderRadius: 4 },
});
