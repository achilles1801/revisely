// The parts of Insights' own pages (Revisely Dev; Majd, Nov 27 2026: "yes build all seven screens", boards in
// ~/Documents/revisely-today-mocks/insights-v2/): each page starts from its point as a figure with its trend against the
// same length of days before the range (`InsightHero`), then its chart or tiles in a quiet card (`InsightCard`), then
// what to do about it (`InsightAdvice`).

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Tap } from '../v2/Tap';
import { ChromeText } from './ChromeText';
import { typeV2 } from '../../theme/v2';
import { formatNumeral } from '../../i18n';
import { chevron, forwardIcon } from '../../i18n/direction';
import { spokenText } from '../../lib/passages';

export interface Trend {
  /** "from 84%", after the arrow. */
  text: string;
  /** The figure went up (the arrow's way). */
  up: boolean;
  /** Up is better here (green); worse is ink, never red: it's information, not a warning. */
  good: boolean;
  /** For VoiceOver: "Up from 84% the 30 days before". */
  label: string;
}

/**
 * "91%  came round  ↑ from 84%", over one grey line; with `onPressLine` the line is a button and ends in ›. The pill, then
 * the words, go under the figure when the line is full (Recitation's "mistakes a page" on an SE at 1.1× text, ACT-44),
 * never a word wrapped.
 */
export function InsightHero({
  value,
  unit,
  trend,
  line,
  onPressLine,
  lineHint,
  testID,
}: {
  value: string;
  unit: string;
  trend?: Trend | null;
  line?: string | null;
  onPressLine?: () => void;
  lineHint?: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const lineText = line ? (
    <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>
      {line}
      {onPressLine ? ` ${chevron()}` : ''}
    </ChromeText>
  ) : null;
  return (
    <View style={styles.hero}>
      <View
        style={styles.heroRow}
        accessible
        accessibilityLabel={[`${value} ${spokenText(unit)}`, trend?.label].filter(Boolean).join(', ')}
        testID={testID}
      >
        <ChromeText
          style={[styles.heroNumber, { color: palette.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          testID={testID ? `${testID}-value` : undefined}
        >
          {formatNumeral(value)}
        </ChromeText>
        <ChromeText style={[styles.heroUnit, { color: palette.secondary }]} testID={testID ? `${testID}-unit` : undefined}>
          {unit}
        </ChromeText>
        {trend ? (
          <View style={[styles.trend, { backgroundColor: trend.good ? palette.goodSubtle : palette.fill }]} testID={testID ? `${testID}-trend` : undefined}>
            <Ionicons name={trend.up ? 'arrow-up' : 'arrow-down'} size={12} color={trend.good ? palette.good : palette.text} />
            <ChromeText style={[styles.trendText, { color: trend.good ? palette.good : palette.text }]}>{trend.text}</ChromeText>
          </View>
        ) : null}
      </View>
      {lineText && onPressLine ? (
        <Tap onPress={onPressLine} accessibilityRole="button" accessibilityHint={lineHint} hitSlop={6} style={styles.line} testID={testID ? `${testID}-line` : undefined}>
          {lineText}
        </Tap>
      ) : lineText ? (
        <View style={styles.line} testID={testID ? `${testID}-line` : undefined}>
          {lineText}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A quiet card: its title, and a grey hint at the end ("tap a juz"), over the chart or tiles. Without a title, the rows
 * alone (Consistency's cycles, ACT-43).
 */
export function InsightCard({ title, hint, children, testID }: { title?: string | null; hint?: string | null; children: React.ReactNode; testID?: string }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: palette.fill }]} testID={testID}>
      {title || hint ? (
        <View style={styles.cardHead}>
          <ChromeText style={[typeV2.name, styles.flex, { color: palette.text }]} accessibilityRole="header">
            {title}
          </ChromeText>
          {hint ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{hint}</ChromeText> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * What to do about it: a mark, a title and one grey line, then its action at the end ("Plan them"). With `onPress` the
 * row (not the action) is a button and ends in ›.
 */
export function InsightAdvice({
  icon,
  title,
  detail,
  action,
  onPress,
  hint,
  testID,
}: {
  /** The mark at the start; a plain row without one. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  detail?: string | null;
  action?: React.ReactNode;
  onPress?: () => void;
  hint?: string;
  testID?: string;
}) {
  const { palette } = useTheme();
  const body = (
    <>
      {icon ? (
        <View style={[styles.mark, { backgroundColor: palette.fill }]}>
          <Ionicons name={icon} size={16} color={palette.text} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <ChromeText style={[typeV2.name, { color: palette.text }]}>{title}</ChromeText>
        {detail ? <ChromeText style={[typeV2.meta, { color: palette.secondary }]}>{detail}</ChromeText> : null}
      </View>
      {onPress && !action ? <Ionicons name={forwardIcon()} size={16} color={palette.secondary} /> : null}
    </>
  );
  return (
    <View style={[styles.advice, { borderTopColor: palette.separator }]} testID={testID}>
      {onPress ? (
        <Tap onPress={onPress} accessibilityRole="button" accessibilityHint={hint} style={styles.adviceMain} testID={testID ? `${testID}-row` : undefined}>
          {body}
        </Tap>
      ) : (
        <View style={styles.adviceMain}>{body}</View>
      )}
      {action}
    </View>
  );
}

/** The advice's action: a small outline pill ("Plan them"). */
export function AdviceButton({ title, onPress, label, testID }: { title: string; onPress: () => void; label?: string; testID?: string }) {
  const { palette } = useTheme();
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={[styles.pill, { borderColor: palette.outline }]} testID={testID}>
      <ChromeText style={[typeV2.name, styles.pillText, { color: palette.text }]} numberOfLines={1}>
        {title}
      </ChromeText>
    </Tap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { marginTop: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6, rowGap: 4 },
  heroNumber: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 17, lineHeight: 22, flexShrink: 1 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'center' },
  trendText: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  line: { marginTop: 4 },
  card: { borderRadius: 16, padding: 14, marginTop: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  advice: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  adviceMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 32, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14 },
});
