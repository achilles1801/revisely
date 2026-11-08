import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { useHaptics } from '../../../design/haptics';
import type { RevisionLog } from '../../../types';
import { dotSizeFor, nearestMark, shortDate, stepIndex, timelineData, timelineDetail, timelineHint, timelineReadout } from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';
import { ChartButtons, DetailLine, DetailTitle, Legend, useBandColor } from './ChartParts';

/** How near (pt) a tap must land to a revision's dot to pick it. */
const DOT_REACH = 22;
/** The least room (pt) between two dots for the gap between them to be written. */
const GAP_ROOM = 40;
/** A gap this long or longer is written in ink, not grey. */
const LONG_GAP = 14;
const LINE_Y = 34;
/** The line's inset from the plot's sides (a dot's half width), so the end dots aren't cut. */
const INSET = 7;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Each revision of one surah or juz on a line to today, in its weakest rating's colour, with the
 * gaps between them written in. A tap (or a slide) picks one: the header gives its day, rating and
 * the gap before it, and the panel what it was rated, with that day in Activity.
 */
export function TimelineChart({
  title,
  passage,
  days,
  today,
  logs,
  onOpenDay,
  testID = 'revo-chart-timeline',
}: {
  title: string;
  /** The surah's or juz's pages. */
  passage: readonly number[];
  days: number;
  today: string;
  logs: readonly RevisionLog[];
  onOpenDay?: (day: string) => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const color = useBandColor();
  const data = useMemo(() => timelineData(logs, passage, today, days), [logs, passage, today, days]);
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const mark = picked != null ? data.marks[picked] : null;
  const readout = mark ? timelineReadout(mark) : null;
  const detail = mark ? timelineDetail(mark, logs) : null;
  const last = data.marks[data.marks.length - 1];
  // Smaller dots when revisions crowd the line; the ring around a picked one stays 4pt out.
  const dot = width > 0 ? dotSizeFor(data.marks, width) : 14;
  const dotStyle = { top: LINE_Y - dot / 2, width: dot, height: dot, borderRadius: dot / 2, marginLeft: -dot / 2 };
  const ringStyle = { top: LINE_Y - dot / 2 - 4, width: dot + 8, height: dot + 8, borderRadius: dot / 2 + 4, marginLeft: -dot / 2 - 4 };

  const pick = (i: number | null) => {
    pickedRef.current = i;
    setPicked(i);
  };

  return (
    <ChartFrame
      title={title}
      hint={timelineHint(data.marks, days)}
      readout={readout}
      onClear={() => pick(null)}
      testID={testID}
      detail={
        mark && detail ? (
          <>
            {detail.ratings ? <DetailTitle text={detail.ratings} testID={`${testID}-ratings`} /> : null}
            <DetailLine text={detail.line} />
            {onOpenDay ? <ChartButtons openDay={() => onOpenDay(mark.day)} testID={testID} /> : null}
          </>
        ) : null
      }
    >
      <ChartPlot
        testID={`${testID}-plot`}
        label={`${title}. ${data.marks.length ? data.marks.map((m) => `${shortDate(m.day)}${m.band ? `, ${m.band}` : ''}`).join('; ') : timelineHint(data.marks, days)}`}
        value={readout ? spokenText(`${readout.title}, ${readout.line}`) : 'Swipe up or down to pick a revision'}
        onStep={(by) => pick(stepIndex(picked, by, data.marks.length))}
        onActivate={() => pick(picked == null && data.marks.length > 0 ? data.marks.length - 1 : null)}
        onTap={(x, _y, size) => {
          const i = nearestMark(data.marks, x - INSET, size.width - 2 * INSET, DOT_REACH);
          if (i == null) return;
          pick(i === pickedRef.current ? null : i);
        }}
        onSlide={(x, size) => {
          const i = nearestMark(data.marks, x - INSET, size.width - 2 * INSET);
          if (i == null || i === pickedRef.current) return;
          haptics.selection();
          pick(i);
        }}
      >
        <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <View style={[styles.line, { backgroundColor: palette.separator, right: last ? `${(1 - last.at) * 100}%` : 0 }]} />
          {/* Since the last revision, up to today: dashes. */}
          {last && width > 0 ? (
            <View style={[styles.dashes, { left: last.at * width + 9, right: 6 }]}>
              {Array.from({ length: Math.max(0, Math.floor(((1 - last.at) * width - 15) / 6)) }, (_, i) => (
                <View key={i} style={[styles.dash, { backgroundColor: palette.track }]} />
              ))}
            </View>
          ) : null}
          <View style={[styles.today, { borderColor: palette.text, backgroundColor: palette.sheet }]} />
          {width > 0
            ? data.marks.map((m, i) => {
                const prev = data.marks[i - 1];
                if (!prev || m.gap == null || (m.at - prev.at) * width < GAP_ROOM) return null;
                const long = m.gap >= LONG_GAP;
                return (
                  <Text
                    key={`gap-${m.day}`}
                    style={[styles.gap, { left: ((prev.at + m.at) / 2) * width - 30, color: long ? palette.text : palette.secondary, fontWeight: long ? '600' : '400', opacity: picked != null && picked !== i ? 0.3 : 1 }]}
                    maxFontSizeMultiplier={CHART_TEXT_MAX}
                    numberOfLines={1}
                  >
                    {plural(m.gap, 'day')}
                  </Text>
                );
              })
            : null}
          {data.marks.map((m, i) => (
            <React.Fragment key={m.day}>
              {picked === i ? <View style={[styles.ring, ringStyle, { left: `${m.at * 100}%`, borderColor: palette.text }]} /> : null}
              <View
                style={[styles.dot, dotStyle, { left: `${m.at * 100}%`, backgroundColor: color(m.band), opacity: picked != null && picked !== i ? 0.3 : 1 }]}
                testID="revo-chart-revision"
              />
            </React.Fragment>
          ))}
        </View>
        <View style={styles.dates}>
          <Text style={[styles.axis, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
            {shortDate(data.start)}
          </Text>
          <Text style={[styles.axis, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
            Today
          </Text>
        </View>
      </ChartPlot>
      <Legend
        items={[
          { color: color('weak'), label: 'weak', round: true },
          { color: color('moderate'), label: 'moderate', round: true },
          { color: color('strong'), label: 'strong', round: true },
          { color: color(null), label: 'not rated', round: true },
        ]}
      />
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  track: { height: 52, marginTop: 10, marginHorizontal: INSET },
  line: { position: 'absolute', left: 0, top: LINE_Y - 0.75, height: 1.5 },
  dashes: { position: 'absolute', top: LINE_Y - 1, flexDirection: 'row', gap: 3, overflow: 'hidden' },
  dash: { width: 3, height: 2 },
  today: { position: 'absolute', right: -4, top: LINE_Y - 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  gap: { position: 'absolute', top: LINE_Y - 30, width: 60, textAlign: 'center', fontSize: 12, lineHeight: 16 },
  dot: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 2 },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axis: { fontSize: 13, lineHeight: 17 },
});
