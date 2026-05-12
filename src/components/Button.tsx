import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { PressableScale } from './PressableScale';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  const variantStyle: ViewStyle = (() => {
    if (isDisabled) {
      return {
        backgroundColor: theme.bgAlt,
        borderWidth: 1,
        borderColor: theme.border,
      };
    }
    switch (variant) {
      case 'primary':
        return { backgroundColor: theme.accent };
      case 'secondary':
        return { backgroundColor: theme.bgAlt };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: theme.border,
        };
      case 'destructive':
        return { backgroundColor: theme.error };
      case 'ghost':
        return { backgroundColor: 'transparent' };
    }
  })();

  const textColor = (() => {
    if (isDisabled) return theme.textMuted;
    if (variant === 'primary' || variant === 'destructive') return theme.textInverse;
    if (variant === 'ghost') return theme.accent;
    return theme.textPrimary;
  })();

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic={variant === 'primary' || variant === 'destructive' ? 'medium' : 'light'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[styles.button, variantStyle, style]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <Text style={[styles.text, { color: textColor }]}>{title}</Text>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    minHeight: 48,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...typography.titleSmall,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
