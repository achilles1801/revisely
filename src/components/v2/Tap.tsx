import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';

/**
 * A pressable for the new design: it dims while held (no scale, no buzz).
 * Haptics mark outcomes instead (design/haptics).
 */
export function Tap({
  style,
  children,
  pressedOpacity = 0.55,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  pressedOpacity?: number;
}) {
  // E2E builds trace each press's stages (lib/e2e/taps); every other build drops this line (the
  // variable is inlined).
  const props =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    process.env.EXPO_PUBLIC_E2E === '1' ? (require('../../lib/e2e/taps') as typeof import('../../lib/e2e/taps')).traceTap(rest) : rest;
  return (
    <Pressable style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]} {...props}>
      {children}
    </Pressable>
  );
}
