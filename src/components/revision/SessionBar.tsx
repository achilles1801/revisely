import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface SessionBarProps {
  scopeLabel: string;
  revisedCount: number;
  totalCount: number;
  isCurrentPageRevised: boolean;
  onBack: () => void;
  onToggleCurrent: () => void;
  onOverflow: () => void;
}

export function SessionBar({
  scopeLabel,
  revisedCount,
  totalCount,
  isCurrentPageRevised,
  onBack,
  onToggleCurrent,
  onOverflow,
}: SessionBarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.bar}>
      <PressableScale
        onPress={onBack}
        haptic="light"
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={theme.textPrimary} />
      </PressableScale>

      <View style={styles.center}>
        <Text style={styles.text} numberOfLines={1}>
          Revising {scopeLabel}{' '}
          <Text style={styles.count}>
            · {revisedCount}/{totalCount}
          </Text>
        </Text>
      </View>

      <PressableScale
        onPress={onToggleCurrent}
        haptic={isCurrentPageRevised ? 'light' : 'medium'}
        hitSlop={12}
        style={[
          styles.iconBtn,
          isCurrentPageRevised && { backgroundColor: theme.textPrimary },
        ]}
        accessibilityLabel={
          isCurrentPageRevised ? 'Unmark current page' : 'Mark current page as revised'
        }
      >
        <Ionicons
          name={isCurrentPageRevised ? 'checkmark' : 'checkmark-outline'}
          size={18}
          color={isCurrentPageRevised ? theme.textInverse : theme.textPrimary}
        />
      </PressableScale>

      <PressableScale
        onPress={onOverflow}
        haptic="light"
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel="Session menu"
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={18}
          color={theme.textPrimary}
        />
      </PressableScale>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      // Match the Mushaf page background — no card surface, no border, no
      // shadow. Keeps the chrome visually subordinate to the page itself.
      backgroundColor: theme.bg,
      gap: spacing.xs,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      ...typography.titleSmall,
      color: theme.textPrimary,
    },
    count: {
      ...typography.titleSmall,
      color: theme.textSecondary,
      fontWeight: '400',
    },
  });
