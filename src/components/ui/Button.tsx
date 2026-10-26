import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { radiusV2, typeV2 } from '../../theme/v2';

/**
 * The new design's button: three variants only.
 *   filled → jade, the one primary action on a screen;
 *   tinted → jade on its wash, a secondary action;
 *   plain  → jade text, a quiet link.
 */
export function Button({
  title,
  onPress,
  variant = 'filled',
  disabled,
  busy,
  accessibilityLabel,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'filled' | 'tinted' | 'plain';
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { palette } = useTheme();
  const fg = variant === 'filled' ? palette.onJade : palette.jade;
  const bg = variant === 'filled' ? palette.jade : variant === 'tinted' ? palette.jadeWash : 'transparent';
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || busy}
      scale={0.98}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[variant === 'plain' ? styles.plain : styles.solid, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}
      testID={testID}
    >
      <View style={styles.inner}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : null}
        <Text style={[variant === 'plain' ? typeV2.subhead : typeV2.headline, { color: fg }]} maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  solid: {
    minHeight: 50,
    borderRadius: radiusV2.control,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  plain: {
    minHeight: 44,
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
