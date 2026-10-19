import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { PressableScale } from '../PressableScale';
import { GlassCard } from '../GlassCard';
import { LiquidGlassSegmentedControl } from '../LiquidGlassSegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import {
  displayMs,
  elapsedMs,
  formatClock,
  formatPageRanges,
  formatStopwatch,
  MIN_SESSION_SECONDS,
  TIMER_PRESET_MINUTES,
} from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { ReadingTimerMode } from '../../types';

type Kind = 'stopwatch' | 'timer';
type Direction = 'countUp' | 'countDown';

const RING_SIZE = 220;
const RING_STROKE = 6;

interface TimerControlsProps {
  /** Close the surrounding sheet. */
  onClose: () => void;
  /** A session was saved: offer to open its day (to add pages). */
  onSaved?: (date: string, seconds: number) => void;
  /** Shown while running, unless the reader is already open. */
  onOpenQuran?: () => void;
  /** True while the controls are on screen, so the clock only ticks then. */
  visible?: boolean;
}

/**
 * The one set of timer controls, shown by the floating timer. iPhone
 * Clock-inspired, two kinds:
 *  - Stopwatch: open-ended, ends when you tap End.
 *  - Timer: pick a length; it counts up or down and ends by itself.
 * Revised pages (revision screen) and opened pages (reader) are credited to
 * whatever timer is running.
 */
export function TimerControls({ onClose, onSaved, onOpenQuran, visible = true }: TimerControlsProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer, start, pause, resume, finish, discard } = useReadingTimer();

  const [kind, setKind] = useState<Kind>('stopwatch');
  const [direction, setDirection] = useState<Direction>('countDown');
  const [minutes, setMinutes] = useState(30);

  const running = timer?.runningSince != null;
  const now = useNow(visible && running, timer?.mode === 'stopwatch' ? 50 : 250);

  // Idle preview of what the clock will look like once started.
  const clockText = timer
    ? timer.mode === 'stopwatch'
      ? formatStopwatch(elapsedMs(timer, now))
      : formatClock(displayMs(timer, now))
    : kind === 'stopwatch'
      ? formatStopwatch(0)
      : formatClock(direction === 'countDown' ? minutes * 60_000 : 0);

  const targetSeconds = timer ? timer.targetSeconds : kind === 'timer' ? minutes * 60 : null;
  const progress =
    targetSeconds != null && timer ? elapsedMs(timer, now) / (targetSeconds * 1000) : 0;

  const handleStart = () => {
    const mode: ReadingTimerMode = kind === 'stopwatch' ? 'stopwatch' : direction;
    start(mode, kind === 'timer' ? minutes * 60 : null);
  };

  const handleEnd = async () => {
    if (!timer) return;
    const date = timer.date;
    const seconds = Math.round(elapsedMs(timer, Date.now()) / 1000);
    if (!(await finish())) return;
    onClose();
    if (seconds >= MIN_SESSION_SECONDS) onSaved?.(date, seconds);
  };

  const handleDiscard = () => {
    Alert.alert('Discard this session?', "The time won't be logged.", [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discard();
          onClose();
        },
      },
    ]);
  };

  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View>
      {!timer && (
        <LiquidGlassSegmentedControl<Kind>
          options={[
            { value: 'stopwatch', label: 'Stopwatch' },
            { value: 'timer', label: 'Timer' },
          ]}
          value={kind}
          onChange={setKind}
        />
      )}

      <View style={styles.clockWrap}>
        {targetSeconds != null && (
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              stroke={theme.border}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              stroke={theme.accent}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - Math.min(1, progress))}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            />
          </Svg>
        )}
        <Text
          style={[styles.clock, clockText.length > 8 && { fontSize: 44 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityRole="timer"
        >
          {clockText}
        </Text>
        {targetSeconds != null && (
          <Text style={styles.clockSub}>
            {(timer?.mode ?? direction) === 'countDown' ? 'remaining of ' : 'of '}
            {Math.round(targetSeconds / 60)} min
          </Text>
        )}
        {timer && !running && <Text style={styles.pausedTag}>Paused</Text>}
      </View>

      {/* Big round controls, like the iPhone stopwatch. */}
      <View style={styles.controls}>
        {timer ? (
          <RoundButton
            label={running ? 'Pause' : 'Resume'}
            accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
            onPress={running ? pause : resume}
            fg={theme.textPrimary}
            bg={theme.glass}
            ring={theme.border}
          />
        ) : (
          <View style={styles.roundPlaceholder} />
        )}
        <RoundButton
          label={timer ? 'End' : 'Start'}
          accessibilityLabel={timer ? 'Stop and save timer' : 'Start timer'}
          onPress={timer ? handleEnd : handleStart}
          fg={timer ? theme.error : theme.accent}
          bg={(timer ? theme.error : theme.accent) + '26'}
          ring={(timer ? theme.error : theme.accent) + '26'}
        />
      </View>

      {timer ? (
        <View style={styles.runningInfo}>
          {onOpenQuran && (
            <PressableScale onPress={onOpenQuran} haptic="light" style={styles.openQuran}>
              <Ionicons name="book-outline" size={18} color={theme.accent} />
              <Text style={styles.openQuranText}>Open the Quran</Text>
            </PressableScale>
          )}
          <Text style={styles.hint}>
            {(timer.pagesRevised?.length ?? 0) > 0
              ? `Pages revised so far: ${formatPageRanges(timer.pagesRevised ?? [])}`
              : timer.pagesVisited.length > 0
                ? `Pages opened so far: ${formatPageRanges(timer.pagesVisited)}`
                : 'Keeps running while you read or revise. Saved sessions are in Activity, where you can add the pages.'}
          </Text>
          <PressableScale
            onPress={handleDiscard}
            haptic="light"
            style={styles.discard}
            accessibilityLabel="Discard timer"
          >
            <Text style={styles.discardText}>Discard session</Text>
          </PressableScale>
        </View>
      ) : kind === 'timer' ? (
        <View style={styles.setup}>
          <Text style={styles.groupLabel}>LENGTH</Text>
          <View style={styles.group}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <View style={styles.presetGrid}>
              {TIMER_PRESET_MINUTES.map((m) => {
                const selected = m === minutes;
                return (
                  <PressableScale
                    key={m}
                    onPress={() => setMinutes(m)}
                    haptic="selection"
                    style={[
                      styles.preset,
                      selected
                        ? { backgroundColor: theme.accent + '22', borderColor: theme.accent }
                        : { backgroundColor: theme.glass, borderColor: theme.border },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: selected ? theme.accent : theme.textPrimary },
                      ]}
                    >
                      {m < 60 ? `${m}m` : `${m / 60}h${m % 60 ? ` ${m % 60}m` : ''}`}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <View style={styles.divider} />
            <View style={styles.stepRow}>
              <Text style={styles.rowLabel}>Custom</Text>
              <PressableScale
                onPress={() => setMinutes((m) => Math.max(5, m - 5))}
                haptic="selection"
                style={styles.stepBtn}
                accessibilityLabel="5 minutes less"
              >
                <Ionicons name="remove" size={18} color={theme.textPrimary} />
              </PressableScale>
              <Text style={styles.stepValue}>{minutes} min</Text>
              <PressableScale
                onPress={() => setMinutes((m) => Math.min(480, m + 5))}
                haptic="selection"
                style={styles.stepBtn}
                accessibilityLabel="5 minutes more"
              >
                <Ionicons name="add" size={18} color={theme.textPrimary} />
              </PressableScale>
            </View>
          </View>

          <Text style={styles.groupLabel}>CLOCK</Text>
          <LiquidGlassSegmentedControl<Direction>
            options={[
              { value: 'countDown', label: 'Count down' },
              { value: 'countUp', label: 'Count up' },
            ]}
            value={direction}
            onChange={setDirection}
          />
          <Text style={styles.footnote}>When time's up the session is saved by itself.</Text>
        </View>
      ) : (
        <Text style={styles.footnote}>
          Runs until you tap End, wherever you are in the app. Sessions are saved to Activity.
        </Text>
      )}
    </View>
  );
}

function RoundButton({
  label,
  accessibilityLabel,
  onPress,
  fg,
  bg,
  ring,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  fg: string;
  bg: string;
  ring: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="medium"
      scale={0.94}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[roundStyles.outer, { borderColor: ring }]}>
        <View style={[roundStyles.inner, { backgroundColor: bg }]}>
          <Text style={[roundStyles.label, { color: fg }]}>{label}</Text>
        </View>
      </View>
    </PressableScale>
  );
}

const roundStyles = StyleSheet.create({
  outer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    padding: 3,
  },
  inner: {
    flex: 1,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 17, fontWeight: '500' },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    clockWrap: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: spacing.md,
    },
    clock: {
      fontSize: 54,
      fontWeight: '200',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
      maxWidth: RING_SIZE - 32,
    },
    clockSub: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginTop: spacing.xxs,
    },
    pausedTag: {
      ...typography.label,
      color: theme.warning,
      marginTop: spacing.xs,
    },
    controls: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    roundPlaceholder: { width: 80, height: 80 },
    runningInfo: { alignItems: 'center', gap: spacing.md },
    openQuran: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.accent + '22',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accent + '55',
    },
    openQuranText: { ...typography.titleSmall, color: theme.accent, fontWeight: '600' },
    hint: {
      ...typography.bodySmall,
      color: theme.textSecondary,
      textAlign: 'center',
      paddingHorizontal: spacing.md,
    },
    discard: { paddingVertical: spacing.xs },
    discardText: { ...typography.bodyMedium, color: theme.error },
    setup: { gap: spacing.xs },
    groupLabel: {
      ...typography.label,
      color: theme.textMuted,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    group: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    presetGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      padding: spacing.sm,
    },
    preset: {
      width: '23%',
      flexGrow: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
    },
    presetText: { ...typography.bodyMedium, fontWeight: '600', fontVariant: ['tabular-nums'] },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginLeft: spacing.md,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      minHeight: 52,
      gap: spacing.sm,
    },
    rowLabel: { ...typography.bodyMedium, color: theme.textPrimary, flex: 1 },
    stepBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    stepValue: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
      minWidth: 64,
      textAlign: 'center',
    },
    footnote: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
  });
