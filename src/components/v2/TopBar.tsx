import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';

type IconName = keyof typeof Ionicons.glyphMap;

/** A bare icon you can tap: 24pt, ink, no circle behind it. */
export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 24,
  testID,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconButton}
      testID={testID}
    >
      <Ionicons name={icon} size={size} color={color ?? palette.text} />
    </Tap>
  );
}

/**
 * A screen's top bar: back on the left, the title (or something else) in the
 * middle, actions on the right. The sides are the same width, so the middle is
 * centred.
 */
export function TopBar({
  title,
  center,
  onBack,
  left,
  right,
  separator,
}: {
  title?: string;
  center?: React.ReactNode;
  onBack?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  separator?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.bar,
        separator && { borderBottomWidth: layoutV2.hairline, borderBottomColor: palette.separator },
      ]}
    >
      <View style={[styles.side, styles.left]}>
        {onBack ? <IconButton icon="chevron-back" onPress={onBack} label="Back" size={26} testID="back" /> : left}
      </View>
      <View style={styles.center}>
        {center ??
          (title ? (
            <Text
              style={[typeV2.barTitle, { color: palette.text }]}
              numberOfLines={1}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
            >
              {title}
            </Text>
          ) : null)}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

/** A switch in the new design's colours: ink when on. */
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  testID,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const { palette, isDark } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: isDark ? '#39393D' : '#E5E7EB', true: palette.primary }}
      thumbColor={value ? palette.onPrimary : '#FFFFFF'}
      ios_backgroundColor={isDark ? '#39393D' : '#E5E7EB'}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: layoutV2.gutter,
  },
  side: { width: 84, flexDirection: 'row', alignItems: 'center', gap: 18 },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  iconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 28, minHeight: 28 },
});
