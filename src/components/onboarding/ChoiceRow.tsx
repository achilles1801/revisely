import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Mark } from '../v2/Mark';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { forwardIcon } from '../../i18n/direction';

/** A single choice on a hairline: one tap answers the question and moves on (ONBOARD-3). */
export function ChoiceRow({
  icon,
  title,
  detail,
  onPress,
  busy,
  disabled,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  /** Working on this answer (the spinner takes the chevron's place). */
  busy?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      accessibilityState={{ busy: !!busy, disabled: !!disabled }}
      style={[styles.row, { borderBottomColor: palette.separator }]}
      testID={testID}
    >
      <Mark icon={icon} />
      <View style={styles.text}>
        <Text style={[typeV2.barTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[typeV2.body, { color: palette.secondary }]}>{detail}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={palette.secondary} />
      ) : (
        <Ionicons name={forwardIcon()} size={18} color={palette.secondary} />
      )}
    </Tap>
  );
}

/** The rows of one question, under a hairline. */
export function ChoiceList({ children }: { children: React.ReactNode }) {
  const { palette } = useTheme();
  return <View style={[styles.list, { borderTopColor: palette.separator }]}>{children}</View>;
}

const styles = StyleSheet.create({
  list: { borderTopWidth: layoutV2.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: layoutV2.markGap,
    minHeight: 76,
    paddingVertical: 12,
    borderBottomWidth: layoutV2.hairline,
  },
  text: { flex: 1, minWidth: 0 },
});
