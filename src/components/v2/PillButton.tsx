import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { radiusV2, typeV2 } from '../../theme/v2';
import { Tap } from './Tap';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The new design's button, a pill:
 *   solid   → black (white in dark), the one primary action of a row or screen;
 *   outline → a hairline pill, a secondary action.
 */
export function PillButton({
  title,
  onPress,
  variant = 'solid',
  size = 'md',
  icon,
  disabled,
  busy,
  accessibilityLabel,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline';
  /** md: in a row; lg: full width, at the foot of a screen or sheet. */
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { palette, isDark } = useTheme();
  const solid = variant === 'solid';
  const fg = solid ? palette.onPrimary : palette.text;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.base,
        styles[size],
        solid
          ? { backgroundColor: palette.primary }
          : { borderWidth: 1, borderColor: isDark ? '#333333' : '#D1D5DB' },
        disabled && { opacity: 0.4 },
        style,
      ]}
      testID={testID}
    >
      <View style={styles.inner}>
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Ionicons name={icon} size={size === 'sm' ? 14 : 16} color={fg} />
        ) : null}
        <Text
          style={[typeV2.button, size === 'sm' && styles.smText, { color: fg }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {title}
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radiusV2.pill, justifyContent: 'center', alignItems: 'center' },
  sm: { minHeight: 30, paddingHorizontal: 12, borderRadius: radiusV2.pill - 2 },
  md: { minHeight: 36, paddingHorizontal: 16 },
  lg: { minHeight: 48, paddingHorizontal: 20, borderRadius: radiusV2.sheet, alignSelf: 'stretch' },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  smText: { fontSize: 14, lineHeight: 18 },
});
