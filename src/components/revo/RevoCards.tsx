import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { bandOf, dailyPagesData, pageRatingsData, shortDate, type RatingBand } from '../../lib/revo/charts';
import type { RevoAction, RevoChart } from '../../lib/revo/types';
import { PillButton } from '../v2/PillButton';

/**
 * A chart Revo asked for, drawn from this account's own data (lib/revo/charts): ratings of up
 * to four pages over the month, or pages revised per day. `bubble` card, radius 16.
 */
export function ChartCard({ chart, day }: { chart: RevoChart; day: string }) {
  const { palette } = useTheme();
  const { logs } = useApp();
  const bandColor: Record<RatingBand, string> = { weak: palette.red, moderate: palette.secondary, strong: palette.good };
  return (
    <View style={[styles.card, { backgroundColor: palette.bubble }]} testID={`revo-chart-${chart.kind}`}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {chart.title}
        </Text>
        <Ionicons name="stats-chart-outline" size={20} color={palette.secondary} />
      </View>
      {chart.kind === 'pageRatings' ? (
        (() => {
          const data = pageRatingsData(logs, chart.pages, day);
          return (
            <View
              accessible
              accessibilityLabel={data.rows
                .map((r) => `p. ${r.page}: ${r.dots.length ? r.dots.map((d) => `${d.band} on ${shortDate(d.day)}`).join(', ') : 'no ratings'}`)
                .join('. ')}
            >
              {data.rows.map((r) => (
                <View key={r.page} style={styles.ratingRow}>
                  <Text style={[styles.axis, { color: palette.secondary }]}>p. {r.page}</Text>
                  <View style={styles.track}>
                    <View style={[styles.line, { backgroundColor: palette.separator }]} />
                    {r.dots.map((d, i) => (
                      <View
                        key={`${d.day}-${i}`}
                        style={[styles.dot, { left: `${d.at * 100}%`, backgroundColor: bandColor[d.band] }]}
                        testID="revo-chart-dot"
                      />
                    ))}
                  </View>
                </View>
              ))}
              <View style={styles.dates}>
                {[data.start, null, data.end].map((d, i) => (
                  <Text key={i} style={[styles.axis, { color: palette.secondary }]}>
                    {d ? shortDate(d) : ''}
                  </Text>
                ))}
              </View>
              <View style={styles.legend}>
                {(['weak', 'moderate', 'strong'] as const).map((b) => (
                  <View key={b} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: bandColor[b] }]} />
                    <Text style={[styles.axis, { color: palette.secondary }]}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()
      ) : (
        (() => {
          const data = dailyPagesData(logs, day, chart.days);
          const max = Math.max(1, ...data.map((d) => d.pages));
          return (
            <View accessible accessibilityLabel={data.map((d) => `${shortDate(d.day)}: ${d.pages} pages`).join(', ')}>
              <View style={styles.bars}>
                {data.map((d) => (
                  <View key={d.day} style={styles.barCol}>
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(3, Math.round((d.pages / max) * 72)), backgroundColor: d.pages > 0 ? palette.primary : palette.track },
                      ]}
                      testID="revo-chart-bar"
                    />
                    {chart.days === 7 ? (
                      <Text style={[styles.axis, { color: palette.secondary }]}>
                        {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              {chart.days === 30 ? (
                <View style={styles.dates}>
                  <Text style={[styles.axis, { color: palette.secondary }]}>{shortDate(data[0].day)}</Text>
                  <Text style={[styles.axis, { color: palette.secondary }]}>{shortDate(data[data.length - 1].day)}</Text>
                </View>
              ) : null}
            </View>
          );
        })()
      )}
    </View>
  );
}

const ACTION_BUTTON: Record<RevoAction['kind'], string> = {
  reviseFirst: 'Add to my plan',
  openPage: 'Open the page',
  startRevision: 'Start revision',
};

const ACTION_ICON: Record<RevoAction['kind'], keyof typeof Ionicons.glyphMap> = {
  reviseFirst: 'calendar-outline',
  openPage: 'book-outline',
  startRevision: 'play-circle-outline',
};

/** The one thing Revo suggests: nothing changes until the user taps it. */
export function PlanCard({
  action,
  state,
  onDo,
  onDismiss,
}: {
  action: RevoAction;
  state?: 'added' | 'dismissed';
  onDo: () => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.plan, { borderColor: palette.outline }]} testID="revo-plan">
      <View style={styles.planHead}>
        <Ionicons name={ACTION_ICON[action.kind]} size={22} color={palette.text} />
        <Text style={[styles.planTitle, { color: palette.text }]} maxFontSizeMultiplier={1.3}>
          {action.title}
        </Text>
      </View>
      {action.detail ? (
        <Text style={[styles.planDetail, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
          {action.detail}
        </Text>
      ) : null}
      {state === 'added' ? (
        <View style={styles.planDone} testID="revo-plan-added">
          <Ionicons name="checkmark-circle" size={18} color={palette.doneText} />
          <Text style={[styles.planDetail, { color: palette.text }]}>
            {action.kind === 'reviseFirst' ? 'Added to tomorrow’s revision' : 'Done'}
          </Text>
        </View>
      ) : state === 'dismissed' ? null : (
        <View style={styles.planButtons}>
          <PillButton title={ACTION_BUTTON[action.kind]} onPress={onDo} size="sm" testID="revo-plan-do" style={styles.planPrimary} />
          <PillButton title="Not now" onPress={onDismiss} size="sm" variant="outline" testID="revo-plan-not-now" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  ratingRow: { marginBottom: 10 },
  track: { height: 14, justifyContent: 'center', marginTop: 2 },
  line: { height: StyleSheet.hairlineWidth * 2, position: 'absolute', left: 0, right: 0 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, marginLeft: -6 },
  axis: { fontSize: 13, lineHeight: 17 },
  dates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 92 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '70%', borderRadius: 3 },
  plan: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 6 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planTitle: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  planDetail: { fontSize: 14, lineHeight: 19 },
  planButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  planPrimary: { minHeight: 34 },
  planDone: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
});
