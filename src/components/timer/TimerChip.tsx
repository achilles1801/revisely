import React, { useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../PressableScale';
import { TimerSheet } from './TimerSheet';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

/** Height of the chip (it sits in the reader's control capsule). */
export const TIMER_CHIP_SIZE = 36;

interface TimerChipProps {
  /** "Open the Quran" in the controls; omitted in the reader. */
  onOpenQuran?: () => void;
  /** Crowded: the clock without its icon. */
  compact?: boolean;
}

/**
 * The timer inside the reader's controls (where the floating button would sit
 * over the page): a stopwatch while idle, the live clock while a session runs or
 * is paused. Tapping opens the same controls as the floating button.
 */
export function TimerChip({ onOpenQuran, compact }: TimerChipProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer } = useReadingTimer();
  const [open, setOpen] = useState(false);
  const running = timer?.runningSince != null;
  const now = useNow(running && !open, 1000);
  const clock = timer ? formatClock(displayMs(timer, now)) : '';

  return (
    <>
      {timer ? (
        <PressableScale
          onPress={() => setOpen(true)}
          haptic="light"
          scale={0.95}
          hitSlop={4}
          style={[
            styles.pill,
            { backgroundColor: running ? theme.accent + '22' : theme.glass, borderColor: running ? theme.accent + '55' : theme.border },
          ]}
          accessibilityLabel={`${running ? 'Timer running' : 'Timer paused'}, ${clock}. Open timer controls`}
        >
          {!compact && (
            <Ionicons name={running ? 'stopwatch' : 'pause'} size={14} color={running ? theme.accent : theme.warning} />
          )}
          <Text
            style={[styles.clock, { color: running ? theme.accent : theme.textPrimary }]}
            maxFontSizeMultiplier={1.2}
          >
            {clock}
          </Text>
        </PressableScale>
      ) : (
        <PressableScale
          onPress={() => setOpen(true)}
          haptic="light"
          scale={0.92}
          hitSlop={4}
          style={styles.round}
          accessibilityLabel="Open timer"
        >
          <Ionicons name="stopwatch-outline" size={18} color={theme.textPrimary} />
        </PressableScale>
      )}
      <TimerSheet
        visible={open}
        onClose={() => setOpen(false)}
        onOpenQuran={
          onOpenQuran
            ? () => {
                // The sheet closes first, or it would stay open over the Quran.
                setOpen(false);
                onOpenQuran();
              }
            : undefined
        }
      />
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    round: {
      width: TIMER_CHIP_SIZE,
      height: TIMER_CHIP_SIZE,
      borderRadius: TIMER_CHIP_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: TIMER_CHIP_SIZE,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    clock: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
