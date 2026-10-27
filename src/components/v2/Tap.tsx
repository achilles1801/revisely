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
  return (
    <Pressable style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]} {...rest}>
      {children}
    </Pressable>
  );
}
