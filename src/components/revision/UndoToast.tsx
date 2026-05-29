import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { shadows } from '../../theme/shadows';

interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** Auto-dismiss after this many ms. Default 3000. */
  duration?: number;
  /** Distance to inset from bottom (e.g. tab bar footprint). */
  bottomInset?: number;
}

export function UndoToast({
  visible,
  message,
  onUndo,
  onDismiss,
  duration = 3000,
  bottomInset = 0,
}: UndoToastProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 180 });
      translateY.value = withTiming(0, { duration: 220 });
      const timer = setTimeout(() => {
        onDismiss();
      }, duration);
      return () => clearTimeout(timer);
    } else {
      opacity.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(20, { duration: 200 });
    }
  }, [visible, duration, onDismiss, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: bottomInset + spacing.md },
        animStyle,
      ]}
    >
      <View style={styles.toast}>
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <Pressable onPress={onUndo} hitSlop={10} style={styles.undoBtn}>
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: radius.full,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      paddingVertical: spacing.xs,
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...shadows.md,
    },
    message: {
      ...typography.bodySmall,
      color: theme.textPrimary,
    },
    undoBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
    },
    undoText: {
      ...typography.bodySmall,
      color: theme.accent,
      fontWeight: '700',
    },
  });
