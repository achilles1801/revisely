// A section of one Activity tab as a quiet row (ACT-35, version A): its name, one grey line, its figure at the end and ›.
// The whole row is one button that opens the section on a page of its own.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { forwardIcon } from '../../i18n/direction';
import { spokenText } from '../../lib/passages';
import { Tap } from '../v2/Tap';
import { ChromeText } from './ChromeText';
import { formatNumeral, t } from '../../i18n';

export function SectionRow({
  title,
  line,
  figure,
  unit,
  red,
  onPress,
  separator = true,
  testID,
}: {
  title: string;
  /** One grey line under the name: what stands out ("Juz 4, untouched the longest"); none leaves the name alone. */
  line?: string | null;
  /** The figure at the end ("87%", "27"), and its words after it ("of the last 30 days"). */
  figure?: string | null;
  unit?: string | null;
  /** The figure in red (Gaps: pages late). */
  red?: boolean;
  onPress: () => void;
  /** A hairline under the row (the list's last row has none). */
  separator?: boolean;
  testID?: string;
}) {
  const { palette } = useTheme();
  const spoken = [title, figure ? [figure, unit].filter(Boolean).join(' ') : null, line].filter(Boolean).map((s) => spokenText(s as string)).join(', ');
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={t('activity.oneTab.opensSection', { section: title })}
      style={[styles.row, separator && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.separator }]}
      testID={testID}
    >
      <View style={styles.words}>
        <ChromeText style={[styles.title, { color: palette.text }]} numberOfLines={1}>
          {title}
        </ChromeText>
        {line ? (
          <ChromeText style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={2} testID={testID ? `${testID}-line` : undefined}>
            {line}
          </ChromeText>
        ) : null}
      </View>
      {figure ? (
        <View style={styles.figure} testID={testID ? `${testID}-figure` : undefined}>
          <ChromeText style={[styles.number, { color: red ? palette.red : palette.text }]} numberOfLines={1}>
            {formatNumeral(figure)}
          </ChromeText>
          {unit ? (
            <ChromeText style={[typeV2.meta, styles.unit, { color: palette.secondary }]} numberOfLines={2}>
              {unit}
            </ChromeText>
          ) : null}
        </View>
      ) : null}
      <Ionicons name={forwardIcon()} size={16} color={palette.secondary} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingVertical: 12, marginStart: layoutV2.gutter, paddingEnd: layoutV2.gutter },
  words: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  figure: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 1, maxWidth: '50%', justifyContent: 'flex-end' },
  number: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
  unit: { flexShrink: 1 },
});
