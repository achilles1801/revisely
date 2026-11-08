import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { useHaptics } from '../../../design/haptics';
import { formatDayLong } from '../../../lib/activityFormat';
import { monthLabel } from '../../../lib/insightsView';
import { shiftDay } from '../../../lib/journal';
import { logger } from '../../../lib/logger';
import { memorizedMonthsData, monthDays, monthReadout, slotAt, stepIndex, type MemorizedDay } from '../../../lib/revo/charts';
import { spokenText } from '../../../lib/passages';
import { Tap } from '../../v2/Tap';
import { CHART_TEXT_MAX, ChartFrame, ChartPlot } from './ChartFrame';

const BAR_AREA = 96;
/** How far back the records are read: Insights' window (twelve months, with room). */
const LOOKBACK_DAYS = 400;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The memorization records, as Insights reads them (loaded only when this chart is drawn). */
const loadRecords = (from: string, to: string): Promise<MemorizedDay[]> =>
  import('../../../services/firestoreService').then((m) => m.getMemorizationsBetween(from, to));

/**
 * Pages memorized each month over the last 6 or 12, counted as Insights counts them. A tap (or a
 * slide) picks a month: the header names what was memorized by its ayahs, and the panel lists its
 * days, each opening in Activity.
 */
export function MemorizedChart({
  title,
  months,
  today,
  onOpenDay,
  load = loadRecords,
  testID = 'revo-chart-memorized',
}: {
  title: string;
  months: 6 | 12;
  today: string;
  onOpenDay?: (day: string) => void;
  /** Where the records come from (tests pass their own). */
  load?: (from: string, to: string) => Promise<MemorizedDay[]>;
  testID?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [items, setItems] = useState<MemorizedDay[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const pickedRef = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    load(shiftDay(today, -LOOKBACK_DAYS), today)
      .then((list) => live && setItems(list))
      .catch((err) => {
        logger.warn('Revo: could not load memorization for its chart', err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [load, today]);

  const bars = useMemo(() => (items ? memorizedMonthsData(items, today, months) : []), [items, today, months]);
  const total = bars.reduce((n, b) => n + b.pages, 0);
  const max = Math.max(1, ...bars.map((b) => b.pages));
  const bar = picked != null ? bars[picked] : null;
  const readout = bar && items ? monthReadout(bar, items) : null;
  const days = bar && items ? monthDays(items, bar.month) : [];

  const pick = (i: number | null) => {
    pickedRef.current = i;
    setPicked(i);
  };

  const hint = failed ? 'Couldn’t load your memorization' : !items ? 'Loading…' : `${plural(total, 'page')} in ${months} months · tap a month to see it`;

  return (
    <ChartFrame
      title={title}
      hint={hint}
      readout={readout}
      onClear={() => pick(null)}
      testID={testID}
      detail={
        // A month with nothing memorized: the header says so, and there is nothing to open.
        bar && days.length > 0 ? (
          <View testID={`${testID}-days`}>
            {days.map((d, i) => (
              <Tap
                key={d.day}
                style={[
                  styles.row,
                  i > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: palette.separator,
                  },
                ]}
                onPress={onOpenDay ? () => onOpenDay(d.day) : undefined}
                disabled={!onOpenDay}
                accessibilityRole="button"
                accessibilityLabel={spokenText(`${d.name}, ${formatDayLong(d.day)}, ${plural(d.pages, 'page')}`)}
                testID={`${testID}-day-${d.day}`}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.name, { color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                    {d.name}
                  </Text>
                  <Text style={[styles.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                    {formatDayLong(d.day)}
                  </Text>
                </View>
                <Text style={[styles.meta, { color: palette.secondary }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                  {plural(d.pages, 'page')}
                </Text>
                {onOpenDay ? <Ionicons name="chevron-forward" size={15} color={palette.secondary} /> : null}
              </Tap>
            ))}
          </View>
        ) : null
      }
    >
      {items ? (
        <ChartPlot
          testID={`${testID}-plot`}
          label={`${title}. ${bars.map((b) => `${monthLabel(b.month, true)}: ${plural(b.pages, 'page')}`).join(', ')}`}
          value={readout ? spokenText(`${readout.title}, ${readout.line}`) : 'Swipe up or down to pick a month'}
          onStep={(by) => pick(stepIndex(picked, by, bars.length))}
          onActivate={() => pick(picked == null ? bars.length - 1 : null)}
          onTap={(x, _y, size) => {
            const i = slotAt(x, size.width, bars.length);
            pick(i === pickedRef.current ? null : i);
          }}
          onSlide={(x, size) => {
            const i = slotAt(x, size.width, bars.length);
            if (i === pickedRef.current) return;
            haptics.selection();
            pick(i);
          }}
        >
          <View style={[styles.bars, { height: BAR_AREA }]}>
            {bars.map((b, i) => {
              const h = b.pages > 0 ? Math.max(3, Math.round((b.pages / max) * BAR_AREA)) : 3;
              return (
                <View key={b.month} style={[styles.col, picked != null && i !== picked && styles.dim]} testID="revo-chart-month">
                  {i === picked && b.pages > 0 ? (
                    <Text style={[styles.value, { bottom: h + 3, color: palette.text }]} maxFontSizeMultiplier={CHART_TEXT_MAX}>
                      {b.pages}
                    </Text>
                  ) : null}
                  <View
                    style={[
                      styles.bar,
                      {
                        height: h,
                        backgroundColor: b.pages > 0 ? palette.primary : palette.track,
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
          <View style={styles.letters}>
            {bars.map((b, i) => (
              <Text
                key={b.month}
                style={[
                  styles.letter,
                  {
                    color: i === picked ? palette.text : palette.secondary,
                    fontWeight: i === picked ? '600' : '400',
                  },
                ]}
                maxFontSizeMultiplier={CHART_TEXT_MAX}
              >
                {monthLabel(b.month, false)}
              </Text>
            ))}
          </View>
        </ChartPlot>
      ) : null}
    </ChartFrame>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18 },
  col: { flex: 1, height: '100%' },
  dim: { opacity: 0.3 },
  bar: {
    position: 'absolute',
    bottom: 0,
    left: '18%',
    width: '64%',
    borderRadius: 4,
  },
  value: {
    position: 'absolute',
    left: -12,
    right: -12,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
  },
  letters: { flexDirection: 'row', gap: 8, marginTop: 6 },
  letter: { flex: 1, textAlign: 'center', fontSize: 13, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 20 },
  meta: { fontSize: 13, lineHeight: 18 },
});
