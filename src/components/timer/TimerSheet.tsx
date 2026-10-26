import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { TimerControls } from './TimerControls';
import { alertSessionSaved } from './sessionSavedAlert';
import { useTheme } from '../../context/ThemeContext';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

interface TimerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "Open the Quran" in the controls; omitted where the Quran is already open. */
  onOpenQuran?: () => void;
}

/**
 * The timer's controls, in a plain Modal: bottom sheets render outside
 * ReadingTimerProvider, so useReadingTimer() isn't available in them. Opened by
 * the floating timer button and by the timer chip in the reader's controls.
 */
export function TimerSheet({ visible, onClose, onOpenQuran }: TimerSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Timer</Text>
            <PressableScale
              onPress={onClose}
              haptic="light"
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityLabel="Close timer"
            >
              <Ionicons name="close" size={18} color={theme.textSecondary} />
            </PressableScale>
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <TimerControls
              visible={visible}
              onClose={onClose}
              onSaved={(date, seconds) => alertSessionSaved(date, seconds)}
              onOpenQuran={onOpenQuran}
            />
          </ScrollView>
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
      maxHeight: '90%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      overflow: 'hidden',
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      marginBottom: spacing.sm,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sheetTitle: { ...typography.titleMedium, color: theme.textPrimary },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
  });
