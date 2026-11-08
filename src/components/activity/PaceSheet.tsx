// Pace's timed revisions (mock i11; ACT-23): each revision with its time as a dot (minutes a page, over
// the range), a solid line at the range's pace and a dashed one at the same length before, then the list,
// each row opening its day. It says how many revisions had no time.

import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { formatPace } from '../../lib/insightsView';
import { timedRevisions } from '../../lib/insightsTaps';
import { spokenText } from '../../lib/passages';
import { formatDayLong } from '../../lib/activityFormat';
import { typeV2 } from '../../theme/v2';
import { Sheet } from '../v2/Sheet';
import { Tap } from '../v2/Tap';

const CHART_HEIGHT = 120;
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

export function PaceSheet({
  visible,
  onClose,
  revised,
  today,
  range,
  rangeWords,
  beforeWords,
  perPage,
  before,
  onOpenDay,
}: {
  visible: boolean;
  onClose: () => void;
  revised: { day: string; countsFor?: string; pages: number[]; minutes: number | null }[];
  today: string;
  range: number;
  rangeWords: string;
  beforeWords: string;
  perPage: number;
  before: number | null;
  onOpenDay?: (day: string) => void;
}) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  // A row's day opens once the sheet has gone.
  const thenDay = useRef<string | null>(null);
  const { list, untimed } = timedRevisions(revised, today, range);
  const values = [...list.map((r) => r.perPage), perPage, ...(before != null ? [before] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(0.2, (hi - lo) * 0.15);
  const y = (v: number) => CHART_HEIGHT - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * CHART_HEIGHT;
  const first = dayNumber(today) - (range - 1);
  const x = (day: string) => (width <= 8 ? 0 : 4 + ((dayNumber(day) - first) / Math.max(1, range - 1)) * (width - 8));
  const change =
    before == null ? null : Math.abs(perPage - before) < 0.05 ? 'The same' : `${perPage < before ? 'Down' : 'Up'} from ${formatPace(before)}`;
  const startDay = new Date((first) * 86_400_000).toISOString().slice(0, 10);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Pace"
      message="Minutes a page, revising"
      scroll
      onHidden={() => {
        const d = thenDay.current;
        thenDay.current = null;
        if (d) onOpenDay?.(d);
      }}
      testID="pace-sheet"
    >
      <View style={styles.figure}>
        <Text style={[styles.big, { color: palette.text }]}>{formatPace(perPage)}</Text>
        <Text style={[typeV2.body, styles.flex, { color: palette.secondary }]}>{`min a page in ${rangeWords}`}</Text>
        {change ? <Text style={[typeV2.name, { color: before != null && perPage < before ? palette.good : palette.text }]}>{change}</Text> : null}
      </View>
      {before != null ? (
        <Text style={[typeV2.meta, styles.beforeLabel, { color: palette.secondary }]}>{`${formatPace(before)}, ${beforeWords}`}</Text>
      ) : null}
      <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="pace-chart">
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {before != null ? <Line x1={0} x2={width} y1={y(before)} y2={y(before)} stroke={palette.secondary} strokeWidth={1} strokeDasharray="4 4" /> : null}
            <Line x1={0} x2={width} y1={y(perPage)} y2={y(perPage)} stroke={palette.outline} strokeWidth={1.5} />
            {list.map((r, i) => (
              <Circle key={`${r.day}-${i}`} cx={x(r.day)} cy={y(r.perPage)} r={4} fill={palette.primary} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={styles.ends}>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>{formatDayLong(startDay).split(' ').slice(1).join(' ')}</Text>
        <Text style={[typeV2.meta, { color: palette.secondary }]}>Today</Text>
      </View>

      <Text style={[typeV2.name, styles.listHead, { color: palette.secondary }]} accessibilityRole="header">
        {`${list.length} timed ${list.length === 1 ? 'revision' : 'revisions'}`}
      </Text>
      {list.map((r, i) => (
        <Tap
          key={`${r.day}-${i}`}
          onPress={() => {
            thenDay.current = r.day;
            onClose();
          }}
          disabled={!onOpenDay}
          accessibilityRole="button"
          accessibilityLabel={`${spokenText(r.label)}, ${r.detail}, ${formatPace(r.perPage)} minutes a page`}
          accessibilityHint="Opens the day"
          style={[styles.row, { borderTopColor: palette.separator }]}
          testID={`pace-row-${r.day}-${i}`}
        >
          <View style={styles.flex}>
            <Text style={[typeV2.name, { color: palette.text }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {r.label}
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              {r.detail}
            </Text>
          </View>
          <Text style={[typeV2.name, styles.tabular, { color: palette.text }]} maxFontSizeMultiplier={1.4}>
            {formatPace(r.perPage)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={palette.secondary} />
        </Tap>
      ))}
      {untimed > 0 ? (
        <Text style={[typeV2.meta, styles.untimed, { color: palette.secondary }]} testID="pace-untimed">
          {`${untimed} ${untimed === 1 ? 'revision' : 'revisions'} in ${rangeWords} had no time, so ${untimed === 1 ? 'it isn’t' : 'they aren’t'} counted.`}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 4 },
  big: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  beforeLabel: { textAlign: 'right', marginTop: 10 },
  chart: { height: CHART_HEIGHT, marginTop: 4 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  listHead: { marginTop: 18, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  tabular: { fontVariant: ['tabular-nums'] },
  untimed: { paddingTop: 12, paddingBottom: 8 },
});
