import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'none';

interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale to apply on press. Default 0.97. */
  scale?: number;
  /** Haptic feedback style. Default 'light'. Use 'none' to disable. */
  haptic?: HapticStyle;
}

/**
 * Drop-in replacement for TouchableOpacity / Pressable with two upgrades:
 *   1. A subtle native-thread scale animation on press (no JS thread work).
 *   2. A haptic tick on press-in. Defaults to light; opt out with haptic="none".
 *
 * Use everywhere a button, card, or list row is interactive.
 */
export function PressableScale({
  children,
  style,
  scale = 0.97,
  haptic = 'light',
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: 1 - pressed.value * (1 - scale),
      },
    ],
  }));

  const triggerHaptic = useCallback(() => {
    if (haptic === 'none' || disabled) return;
    switch (haptic) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'selection':
        Haptics.selectionAsync();
        break;
    }
  }, [haptic, disabled]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: 90 });
        onPressIn?.(e);
      }}
      onPress={(e) => {
        // Fire haptics here (not onPressIn) so they only fire on a committed
        // tap — RN's Pressable cancels the press if the finger moves into a
        // scroll before onPress runs, which keeps a scroll through a list of
        // PressableScale rows from buzzing once per row.
        triggerHaptic();
        rest.onPress?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: 140 });
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
