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
import { useDesign } from '../../design/DesignContext';
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
 * The timer inside the reader's controls (where the floating button would sit
 * over the page): a stopwatch while idle, the live clock while a session runs or
 * is paused. Tapping opens the same controls as the floating button.
 */
export function TimerChip({ onOpenQuran, compact }: TimerChipProps) {
  const { theme, palette } = useTheme();
  const { isNew } = useDesign();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer } = useReadingTimer();
  const [open, setOpen] = useState(false);
  const running = timer?.runningSince != null;
  const now = useNow(running && !open, 1000);
  const clock = timer ? formatClock(displayMs(timer, now)) : '';

  const label = `${running ? 'Timer running' : 'Timer paused'}, ${clock}. Open timer controls`;

  let chip: React.ReactNode;
  if (isNew) {
    // The new design: a bare stopwatch while idle; while timing, the clock on
    // the accent's tint (running) or the quiet fill (paused). Taps don't buzz.
    chip = timer ? (
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
  } else {
    chip = timer ? (
      <PressableScale
        onPress={() => setOpen(true)}
        haptic="light"
        scale={0.95}
        hitSlop={4}
        style={[
          styles.pill,
          { backgroundColor: running ? theme.accent + '22' : theme.glass, borderColor: running ? theme.accent + '55' : theme.border },
        ]}
        accessibilityLabel={label}
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
    );
  }

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
    // The new design.
    bare: {
      width: TIMER_CHIP_SIZE,
      height: TIMER_CHIP_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillV2: { borderWidth: layoutV2.hairline },
    clockV2: { ...typeV2.button, fontSize: 14, lineHeight: 18 },
  });
