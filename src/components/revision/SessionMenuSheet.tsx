import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

export interface SessionMenuAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface SessionMenuSheetProps {
  visible: boolean;
  actions: SessionMenuAction[];
  onClose: () => void;
}

export function SessionMenuSheet({
  visible,
  actions,
  onClose,
}: SessionMenuSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.sheet}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />
          {actions.map((action, i) => (
            <PressableScale
              key={action.key}
              onPress={() => {
                onClose();
                // Defer the action so the sheet animation completes first.
                setTimeout(action.onPress, 220);
              }}
              haptic="light"
              scale={0.98}
              style={[
                styles.row,
                i < actions.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name={action.icon}
                size={20}
                color={action.destructive ? theme.error : theme.textPrimary}
              />
              <Text
                style={[
                  styles.label,
                  action.destructive && { color: theme.error },
                ]}
              >
                {action.label}
              </Text>
            </PressableScale>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      overflow: 'hidden',
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    label: {
      ...typography.bodyLarge,
      color: theme.textPrimary,
    },
  });
