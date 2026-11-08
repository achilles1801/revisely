import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import type { RevisionLog, UserPage } from '../../../types';
import type { JuzTile } from '../../../lib/insightsView';
import { juzMapData, juzReadout, juzStrip, juzSummary, slotAt, stepIndex, stripEnds, type RatingBand } from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import { getJuzRange } from '../../../lib/quranData';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';
import { ChartButtons, DetailLine, Legend, RatingCounts, RatingStrip } from './ChartParts';

const COLS = 10;
const ROWS = 3;

/**
 * The 30 juz by when each was last revised, as Insights' Coverage tiles draw them. A tap picks a
 * juz: the header says when it was last revised and where it runs, and the panel shows its pages'
 * strengths, with Revise first tomorrow and Open in the reader.
 */
export function JuzMapChart({
  title,
  today,
  logs,
  userPages,
  preview,
  onReviseFirst,
  onOpenPage,
  testID = 'revo-chart-juzMap',
}: {
  title: string;
  today: string;
  logs: readonly RevisionLog[];
  userPages: readonly UserPage[];
  /** One line on a juz from Revo's facts ("Revised 2× in 30 days · 2 weak spots"), when known. */
  preview?: (pages: number[]) => string | null;
  onReviseFirst?: (pages: number[]) => Promise<void>;
  onOpenPage?: (page: number) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const tiles = useMemo(() => juzMapData(userPages, logs, today), [userPages, logs, today]);
  const [picked, setPicked] = useState<number | null>(null);
  const tile = picked != null ? tiles[picked] : null;
  const readout = tile ? juzReadout(tile) : null;
  const strip = useMemo(() => (tile ? juzStrip(tile.juz, userPages) : []), [tile, userPages]);
  const memorizedPages = strip.filter((s) => s.memorized).map((s) => s.page);
  const counts: Record<RatingBand, number> = { weak: 0, moderate: 0, strong: 0 };
  for (const s of strip) if (s.band) counts[s.band]++;
  const line = tile && tile.state !== 'none' && preview ? preview(memorizedPages) : null;
  const ends = tile ? stripEnds(strip.map((s) => s.page)) : { first: null, last: null };

  const look = (t: JuzTile) =>
    t.state === 'week'
      ? { box: { backgroundColor: palette.heat[3] }, color: palette.heatInk[3] }
      : t.state === 'month'
        ? { box: { backgroundColor: palette.heat[1] }, color: palette.heatInk[1] }
        : t.state === 'stale'
          ? { box: { borderWidth: 1.5, borderColor: palette.red }, color: palette.red }
          : { box: { backgroundColor: palette.heat[0] }, color: palette.secondary, dim: true };

  return (
    <ChartFrame
      title={title}
      hint="Tap a juz to see it"
      readout={readout}
      onClear={() => setPicked(null)}
      testID={testID}
      detail={
        tile ? (
          <>
            {line ? <DetailLine text={line} /> : null}
            <RatingStrip cells={strip.map((s) => s.band)} first={ends.first} last={ends.last} />
            {strip.some((s) => s.band) ? <RatingCounts counts={counts} /> : null}
            <ChartButtons
              key={tile.juz}
              reviseFirst={onReviseFirst && memorizedPages.length > 0 ? () => onReviseFirst(memorizedPages) : undefined}
              openPage={onOpenPage ? () => onOpenPage(getJuzRange(tile.juz).start) : undefined}
              testID={testID}
            />
          </>
        ) : null
      }
    >
      <ChartPlot
        testID={`${testID}-plot`}
        label={`${title}. ${juzSummary(tiles)}`}
        value={readout ? spokenText(`${readout.title}, ${readout.line}`) : 'Swipe up or down to pick a juz'}
        onStep={(by) => setPicked(stepIndex(picked, by, tiles.length))}
        onActivate={() => setPicked(picked == null ? 0 : null)}
        onTap={(x, y, size) => {
          const i = slotAt(y, size.height, ROWS) * COLS + slotAt(x, size.width, COLS);
          setPicked(i === picked ? null : i);
        }}
      >
        <View style={styles.grid}>
          {Array.from({ length: ROWS }, (_, r) => (
            <View key={r} style={styles.row}>
              {tiles.slice(r * COLS, r * COLS + COLS).map((t, c) => {
                const l = look(t);
                const on = picked === r * COLS + c;
                return (
                  <View key={t.juz} style={[styles.tile, l.box]} testID={`revo-chart-juz-${t.juz}`}>
                    {on ? <View style={[styles.ring, { borderColor: palette.text }]} /> : null}
                    <Text style={[styles.tileText, { color: l.color, opacity: 'dim' in l ? 0.7 : 1 }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                      {t.juz}
                    </Text>
                    {t.learning ? <View style={[styles.learning, { backgroundColor: palette.primary }]} /> : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ChartPlot>
      <Legend
        items={[
          { color: palette.heat[3], label: 'This week' },
          { color: palette.heat[1], label: 'This month' },
          { color: palette.red, label: '30+ days', outline: true },
          { color: palette.heat[0], label: 'Not memorized' },
        ]}
      />
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 4, marginTop: 14 },
  row: { flexDirection: 'row', gap: 4 },
  tile: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ring: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 10, borderWidth: 2 },
  learning: { position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: 3 },
});
