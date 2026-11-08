import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import type { RevisionLog, UserPage } from '../../../types';
import {
  pageDetail,
  pageRatingsData,
  ratingsDotReadout,
  ratingsRowReadout,
  revisedBefore,
  shortDate,
  stepIndex,
  type RatingBand,
} from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import { passageShort } from '../../../lib/revo/words';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';
import { ChartButtons, DetailLine, DetailTitle, Legend, useBandColor } from './ChartParts';

/** How near (pt) a tap must land to a dot to pick it, rather than only its row. */
const DOT_REACH = 18;

/**
 * Up to four passages' ratings over the month, one row each. A tap on a row (or one of its dots)
 * picks it: the header gives the rating and the gap before it, and the panel the passage with
 * Revise first tomorrow and Open in the reader.
 */
export function PageRatingsChart({
  title,
  pages,
  today,
  logs,
  userPages,
  onReviseFirst,
  onOpenPage,
  testID = 'revo-chart-pageRatings',
}: {
  title: string;
  pages: readonly number[];
  today: string;
  logs: readonly RevisionLog[];
  userPages: readonly UserPage[];
  onReviseFirst?: (pages: number[]) => Promise<void>;
  onOpenPage?: (page: number) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const color = useBandColor();
  const data = useMemo(() => pageRatingsData(logs, pages, today), [logs, pages, today]);
  const byNumber = useMemo(() => new Map(userPages.map((p) => [p.pageNumber, p])), [userPages]);
  const [picked, setPicked] = useState<{ row: number; dot: number | null } | null>(null);
  // Where each row sits in the plot, for a tap's height.
  const rowsAt = useRef<{ y: number; height: number }[]>([]);
  const row = picked ? data.rows[picked.row] : null;
  const dot = row && picked?.dot != null ? row.dots[picked.dot] : null;
  const readout = row ? (dot ? ratingsDotReadout(row.page, dot, revisedBefore(logs, row.page, dot.day)) : ratingsRowReadout(row.page, row.dots, byNumber.get(row.page))) : null;
  const detail = row ? pageDetail(row.page, byNumber.get(row.page), row.dots, today) : null;

  const tapAt = (x: number, y: number, width: number) => {
    const rows = rowsAt.current;
    if (rows.length === 0) return;
    let r = rows.findIndex((at) => y >= at.y && y < at.y + at.height);
    if (r < 0) r = y < rows[0].y ? 0 : rows.length - 1;
    const dots = data.rows[r]?.dots ?? [];
    let best: number | null = null;
    let bestDist = DOT_REACH;
    dots.forEach((d, i) => {
      const dist = Math.abs(d.at * width - x);
      if (dist <= bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    if (picked && picked.row === r && picked.dot === best) setPicked(null);
    else setPicked({ row: r, dot: best });
  };

  const spokenRow = (r: (typeof data.rows)[number]) =>
    `${spokenText(passageShort([r.page]))}: ${r.dots.length ? r.dots.map((d) => `${d.band} on ${shortDate(d.day)}`).join(', ') : 'no ratings'}`;

  return (
    <ChartFrame
      title={title}
      hint="Tap a row to see it"
      readout={readout}
      onClear={() => setPicked(null)}
      testID={testID}
      detail={
        row && detail ? (
          <>
            <DetailTitle text={detail.title} note={detail.note} testID={`${testID}-passage`} />
            <DetailLine text={detail.meta} />
            <ChartButtons
              key={row.page}
              reviseFirst={onReviseFirst ? () => onReviseFirst([row.page]) : undefined}
              openPage={onOpenPage ? () => onOpenPage(row.page) : undefined}
              testID={testID}
            />
          </>
        ) : null
      }
    >
      <ChartPlot
        testID={`${testID}-plot`}
        label={`${title}. ${data.rows.map(spokenRow).join('. ')}`}
        value={readout ? spokenText(`${readout.title}, ${readout.line}`) : 'Swipe up or down to pick a row'}
        onStep={(by) => {
          const r = stepIndex(picked?.row ?? null, by, data.rows.length);
          setPicked(r == null ? null : { row: r, dot: null });
        }}
        onActivate={() => setPicked(picked ? null : { row: 0, dot: null })}
        onTap={(x, y, size) => tapAt(x, y, size.width)}
      >
        {data.rows.map((r, i) => {
          const on = picked?.row === i;
          return (
            <View
              key={r.page}
              style={[styles.row, picked && !on && styles.dim]}
              testID={`${testID}-row`}
              onLayout={(e) => {
                rowsAt.current[i] = { y: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height };
              }}
            >
              {/* The part by surah, not the page number (lib/revo/words). */}
              <Text style={[styles.axis, { color: on ? palette.text : palette.secondary, fontWeight: on ? '600' : '400' }]} numberOfLines={1} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                {passageShort([r.page])}
              </Text>
              <View style={styles.track}>
                <View style={[styles.line, { backgroundColor: palette.separator }]} />
                {r.dots.map((d, j) => (
                  <React.Fragment key={`${d.day}-${j}`}>
                    {on && picked?.dot === j ? <View style={[styles.ring, { left: `${d.at * 100}%`, borderColor: palette.text }]} /> : null}
                    <View style={[styles.dot, { left: `${d.at * 100}%`, backgroundColor: color(d.band as RatingBand) }]} testID="revo-chart-dot" />
                  </React.Fragment>
                ))}
              </View>
            </View>
          );
        })}
        <View style={styles.dates}>
          {[data.start, null, data.end].map((d, i) => (
            <Text key={i} style={[styles.axis, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
              {d ? shortDate(d) : ''}
            </Text>
          ))}
        </View>
      </ChartPlot>
      <Legend
        items={(['weak', 'moderate', 'strong'] as const).map((b) => ({ color: color(b), label: b, round: true }))}
      />
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  row: { paddingTop: 12 },
  dim: { opacity: 0.3 },
  track: { height: 16, justifyContent: 'center', marginTop: 4 },
  line: { height: StyleSheet.hairlineWidth * 2, position: 'absolute', left: 0, right: 0 },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  ring: { position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, borderWidth: 2 },
  axis: { fontSize: 13, lineHeight: 17 },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
});
