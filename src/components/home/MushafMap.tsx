import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { getPagesForJuz } from '../../lib/quranData';

/** Two juz a row: 15 rows, about 40 pages each (juz 29 + 30 is the longest, 43). */
export const MAP_ROWS: number[][][] = Array.from({ length: 15 }, (_, i) => [
  getPagesForJuz(i * 2 + 1),
  getPagesForJuz(i * 2 + 2),
]);
const MOST_PER_ROW = Math.max(...MAP_ROWS.map(([a, b]) => a.length + b.length));
const GAP = 1.5;
/** Extra space between the two juz of a row. */
const JUZ_GAP = 5;

/**
 * The 604 pages of the mushaf as a map: every page a cell, memorized ones in
 * jade, two juz a row. The page, not a percentage, is the unit (the new
 * design's "the page is the hero"). One image to a screen reader, described by
 * the caller's label.
 */
export function MushafMap({
  memorized,
  height,
  accessibilityLabel,
}: {
  memorized: ReadonlySet<number>;
  /** Fixed height; cells keep the proportions of a page (taller than wide). */
  height?: number;
  accessibilityLabel: string;
}) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  const cell = width > 0 ? (width - JUZ_GAP - GAP * (MOST_PER_ROW - 1)) / MOST_PER_ROW : 0;
  const cellH = cell * 1.45;
  const rowH = cellH + GAP * 2;
  const mapHeight = height ?? Math.ceil(rowH * MAP_ROWS.length);

  const rects = useMemo(() => {
    if (cell <= 0) return [];
    const out: { key: number; x: number; y: number; on: boolean }[] = [];
    MAP_ROWS.forEach(([a, b], row) => {
      let x = 0;
      a.forEach((page) => {
        out.push({ key: page, x, y: row * rowH, on: memorized.has(page) });
        x += cell + GAP;
      });
      x += JUZ_GAP - GAP;
      b.forEach((page) => {
        out.push({ key: page, x, y: row * rowH, on: memorized.has(page) });
        x += cell + GAP;
      });
    });
    return out;
  }, [cell, rowH, memorized]);

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, { height: mapHeight }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="mushaf-map"
    >
      {width > 0 && (
        <Svg width={width} height={mapHeight}>
          {rects.map((r) => (
            <Rect
              key={r.key}
              x={r.x}
              y={r.y}
              width={cell}
              height={cellH}
              rx={Math.min(1.5, cell / 4)}
              fill={r.on ? palette.jade : palette.line}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
