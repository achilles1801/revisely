import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Tap } from '../v2/Tap';
import { useTheme } from '../../context/ThemeContext';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { spacing } from '../../theme/spacing';

interface UndoToastProps {
  visible: boolean;
  message: string;
  /** The action; without it the bar is only the message ("Copied"). */
  onUndo?: () => void;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms. Default 3000. */
  duration?: number;
  /** Distance to inset from bottom (e.g. tab bar footprint). */
  bottomInset?: number;
  /** The action's label (default "Undo"); onUndo runs it. */
  actionLabel?: string;
}

/**
 * A short-lived bar, with an action ("Pages cleared · Undo") or without one
 * ("Copied"): a flat snackbar
 * in the inverse of the ground (ink on white, white on black), no shadow,
 * inside the gutters.
 */
export function UndoToast({
  visible,
  message,
  onUndo,
  onDismiss,
  duration = 3000,
  bottomInset = 0,
  actionLabel = 'Undo',
}: UndoToastProps) {
  const { palette } = useTheme();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  // Through a ref: an inline onDismiss from the parent would otherwise restart
  // the timer (and the entry animation) on every parent render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 180 });
      translateY.value = withTiming(0, { duration: 220 });
      const timer = setTimeout(() => {
        onDismissRef.current();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(20, { duration: 200 });
    }
  }, [visible, duration, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[v2.wrap, { bottom: bottomInset + spacing.md }, animStyle]}
      testID="undo-toast"
    >
      <View style={[v2.toast, !onUndo && v2.plain, { backgroundColor: palette.text }]} accessibilityLiveRegion="polite" testID="undo-toast-bar">
        <Text style={[typeV2.body, v2.message, { color: palette.bg }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {message}
        </Text>
        {onUndo ? (
          <Tap onPress={onUndo} hitSlop={10} style={v2.action} accessibilityRole="button" testID="undo-toast-action">
            <Text style={[typeV2.button, { color: palette.bg }]} maxFontSizeMultiplier={1.4}>
              {actionLabel}
            </Text>
          </Tap>
        ) : null}
      </View>
    </Animated.View>
  );
}

const v2 = StyleSheet.create({
  wrap: { position: 'absolute', left: layoutV2.gutter, right: layoutV2.gutter },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: radiusV2.media,
    paddingLeft: layoutV2.gutter,
    paddingRight: 4,
    paddingVertical: 6,
    gap: 8,
  },
  plain: { paddingRight: layoutV2.gutter },
  message: { flex: 1 },
  action: { paddingHorizontal: 12, paddingVertical: 8 },
});
