import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TimerSheet } from './TimerSheet';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { layoutV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';

/** Height of the chip (it sits in the reader's control capsule). */
export const TIMER_CHIP_SIZE = 36;

interface TimerChipProps {
  /** "Open the Quran" in the controls; omitted in the reader. */
  onOpenQuran?: () => void;
  /** Crowded: the clock without its icon. */
  compact?: boolean;
}

/**
 * The timer inside the reader's and the session's controls: a stopwatch while
 * idle, the live clock while a session runs or is paused. Tapping opens the
 * timer's controls (TimerSheet).
 */
export function TimerChip({ onOpenQuran, compact }: TimerChipProps) {
  const { palette } = useTheme();
  const { timer } = useReadingTimer();
  const [open, setOpen] = useState(false);
  const running = timer?.runningSince != null;
  const now = useNow(running && !open, 1000);
  const clock = timer ? formatClock(displayMs(timer, now)) : '';

  const label = `${running ? 'Timer running' : 'Timer paused'}, ${clock}. Open timer controls`;

  // A bare stopwatch while idle; while timing, the clock on the accent's tint
  // (running) or the quiet fill (paused). Taps don't buzz.
  const chip = timer ? (
    <Tap
      onPress={() => setOpen(true)}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.pill,
        running
          ? { backgroundColor: palette.accentSubtle, borderColor: palette.accentSubtle }
          : { backgroundColor: palette.fill, borderColor: palette.outline },
        styles.pillV2,
      ]}
      testID={running ? 'timer-chip-running' : 'timer-chip-paused'}
    >
      {!compact && (
        <Ionicons
          name={running ? 'stopwatch-outline' : 'pause'}
          size={14}
          color={running ? palette.accentText : palette.secondary}
        />
      )}
      <Text
        style={[typeV2.numeral, styles.clockV2, { color: running ? palette.accentText : palette.text }]}
        maxFontSizeMultiplier={1.2}
        testID="timer-chip-clock"
      >
        {clock}
      </Text>
    </Tap>
  ) : (
    <Tap
      onPress={() => setOpen(true)}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Open timer"
      style={styles.bare}
      testID="timer-chip-idle"
    >
      <Ionicons name="stopwatch-outline" size={22} color={palette.text} />
    </Tap>
  );

  return (
    <>
      {chip}
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

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: TIMER_CHIP_SIZE,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bare: {
    width: TIMER_CHIP_SIZE,
    height: TIMER_CHIP_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillV2: { borderWidth: layoutV2.hairline },
  clockV2: { ...typeV2.button, fontSize: 14, lineHeight: 18 },
});
