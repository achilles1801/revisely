import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Frame, TimerCard } from './TimerCard';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, elapsedMs, formatClock } from '../../lib/readingTimer';
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
 * idle, the live clock while a session runs or is paused (with a thin line of
 * progress for a timed one). Tapping grows it into the timer's card
 * (TimerCard), which shrinks back into it when closed: the chip is the bubble.
 */
export function TimerChip({ onOpenQuran, compact }: TimerChipProps) {
  const { palette } = useTheme();
  const { timer } = useReadingTimer();
  const [open, setOpen] = useState(false);
  // While the card is out (or shrinking back) the chip is hidden: the card is it.
  const [away, setAway] = useState(false);
  const [origin, setOrigin] = useState<Frame | null>(null);
  const anchor = useRef<View>(null);
  const running = timer?.runningSince != null;
  const now = useNow(running && !open, 1000);
  const clock = timer ? formatClock(displayMs(timer, now)) : '';
  const progress =
    timer && timer.targetSeconds ? Math.min(1, elapsedMs(timer, now) / (timer.targetSeconds * 1000)) : null;

  const openCard = () => {
    // Where the chip is on screen, for the card to grow from.
    anchor.current?.measureInWindow?.((x, y, width, height) => {
      if (width > 0 && height > 0) setOrigin({ x, y, width, height });
    });
    setAway(true);
    setOpen(true);
  };

  const label = `${running ? 'Timer running' : 'Timer paused'}, ${clock}. Open timer controls`;

  // A bare stopwatch while idle; while timing, the clock on the accent's tint
  // (running) or the quiet fill (paused). Taps don't buzz.
  const chip = timer ? (
    <Tap
      onPress={openCard}
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
      {progress != null ? (
        <View style={styles.track} pointerEvents="none" testID="timer-chip-progress">
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: running ? palette.accentText : palette.secondary }]} />
        </View>
      ) : null}
    </Tap>
  ) : (
    <Tap
      onPress={openCard}
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
      <View ref={anchor} collapsable={false} style={away && styles.away}>
        {chip}
      </View>
      <TimerCard
        visible={open}
        origin={origin}
        onClose={() => setOpen(false)}
        onHidden={() => setAway(false)}
        onOpenQuran={
          onOpenQuran
            ? () => {
                // The card closes first, or it would stay open over the Quran.
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
  pillV2: { borderWidth: layoutV2.hairline, overflow: 'hidden' },
  away: { opacity: 0 },
  track: { position: 'absolute', left: 10, right: 10, bottom: 3, height: 2, borderRadius: 1, opacity: 0.35 },
  fill: { height: 2, borderRadius: 1 },
  clockV2: { ...typeV2.button, fontSize: 14, lineHeight: 18 },
});
