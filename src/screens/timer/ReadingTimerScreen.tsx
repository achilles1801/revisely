import React, { useMemo, useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { PressableScale } from '../../components/PressableScale';
import { GlassCard } from '../../components/GlassCard';
import { LiquidGlassSegmentedControl } from '../../components/LiquidGlassSegmentedControl';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import {
  displayMs,
  elapsedMs,
  formatClock,
  formatPageRanges,
  formatStopwatch,
  TIMER_PRESET_MINUTES,
} from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { ReadingTimerMode } from '../../types';

type Kind = 'stopwatch' | 'timer';
type Direction = 'countUp' | 'countDown';

const RING_SIZE = 280;
const RING_STROKE = 6;

/**
 * Reading timer — iPhone Clock-inspired. Two kinds:
 *  - Stopwatch: open-ended, ends when you tap End.
 *  - Timer: pick a length; it counts up or down and ends by itself, saving
 *    the session and returning you to Home.
 * Shared from both the Home and Read stacks.
 */
export default function ReadingTimerScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer, start, pause, resume, finish, discard } = useReadingTimer();

  const [kind, setKind] = useState<Kind>('stopwatch');
  const [direction, setDirection] = useState<Direction>('countDown');
  const [minutes, setMinutes] = useState(30);

  const running = timer?.runningSince != null;
  const now = useNow(running, timer?.mode === 'stopwatch' ? 50 : 250);

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
    if (await finish()) navigation.navigate('Home', { screen: 'ReadingSessions' });
  };

  const handleDiscard = () => {
    Alert.alert('Discard this session?', "The time won't be logged.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
  };

  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </PressableScale>
        <Text style={styles.title}>Reading timer</Text>
        <PressableScale
          onPress={() => navigation.navigate('Home', { screen: 'ReadingSessions' })}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Reading sessions"
        >
          <Ionicons name="list-outline" size={22} color={theme.textPrimary} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content} bounces={false}>
        {!timer && (
          <View style={styles.segment}>
            <LiquidGlassSegmentedControl<Kind>
              options={[
                { value: 'stopwatch', label: 'Stopwatch' },
                { value: 'timer', label: 'Timer' },
              ]}
              value={kind}
              onChange={setKind}
            />
          </View>
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
            style={[styles.clock, clockText.length > 8 && { fontSize: 56 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
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
            onPress={timer ? handleEnd : handleStart}
            fg={timer ? theme.error : theme.accent}
            bg={(timer ? theme.error : theme.accent) + '26'}
            ring={(timer ? theme.error : theme.accent) + '26'}
          />
        </View>

        {timer ? (
          <View style={styles.runningInfo}>
            <PressableScale
              onPress={() => navigation.navigate('Read', { screen: 'ReadIndex' })}
              haptic="light"
              style={styles.openQuran}
            >
              <Ionicons name="book-outline" size={18} color={theme.accent} />
              <Text style={styles.openQuranText}>Open the Quran</Text>
            </PressableScale>
            <Text style={styles.hint}>
              {timer.pagesVisited.length > 0
                ? `Pages opened so far: ${formatPageRanges(timer.pagesVisited)}`
                : 'The timer keeps running while you read. You can assign the pages you read afterwards.'}
            </Text>
            <PressableScale onPress={handleDiscard} haptic="light" style={styles.discard}>
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
                        { backgroundColor: selected ? theme.accent : theme.glass },
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          { color: selected ? theme.textInverse : theme.textPrimary },
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
            <Text style={styles.footnote}>
              When time's up the session is saved and you're taken back to Home.
            </Text>
          </View>
        ) : (
          <Text style={styles.footnote}>
            Runs until you tap End. Your session is saved to Reading sessions.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RoundButton({
  label,
  onPress,
  fg,
  bg,
  ring,
}: {
  label: string;
  onPress: () => void;
  fg: string;
  bg: string;
  ring: string;
}) {
  return (
    <PressableScale onPress={onPress} haptic="medium" scale={0.94}>
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
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    padding: 3,
  },
  inner: {
    flex: 1,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 17, fontWeight: '500' },
});

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    title: { ...typography.titleMedium, color: theme.textPrimary },
    iconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xxl,
    },
    segment: { marginTop: spacing.xs },
    clockWrap: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: spacing.lg,
    },
    clock: {
      fontSize: 68,
      fontWeight: '200',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
      maxWidth: RING_SIZE - 40,
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
      marginBottom: spacing.xl,
    },
    roundPlaceholder: { width: 84, height: 84 },
    runningInfo: { alignItems: 'center', gap: spacing.md },
    openQuran: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.accent + '22',
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
