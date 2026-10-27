import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
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
import type { ReadingTimerMode } from '../../types';
import { useHaptics } from '../../design/haptics';
import { layoutV2, typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';

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
 * The state and actions behind the timer controls: what is chosen before
 * starting, the clock, and Start, End and Discard.
 */
function useTimerControls({ onClose, onSaved, visible = true }: TimerControlsProps) {
  const haptics = useHaptics();
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
    // The outcome is marked (taps don't buzz).
    haptics.success();
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
          haptics.warning();
          discard();
          onClose();
        },
      },
    ]);
  };

  return {
    timer,
    running,
    kind,
    setKind,
    direction,
    setDirection,
    minutes,
    setMinutes,
    clockText,
    targetSeconds,
    progress,
    pause,
    resume,
    handleStart,
    handleEnd,
    handleDiscard,
  };
}

/** A preset's label: 45m, 1h, 1h 30m. */
function presetLabel(m: number): string {
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

/**
 * The one set of timer controls, in the timer sheet. iPhone Clock-inspired,
 * two kinds:
 *  - Stopwatch: open-ended, ends when you tap End.
 *  - Timer: pick a length; it counts up or down and ends by itself.
 * Revised pages (revision screen) and opened pages (reader) are credited to
 * whatever timer is running. Flat on the sheet: the kind and the clock
 * direction as pills, the clock in a thin ring, and the actions as pills (the
 * one that saves solid).
 */
export function TimerControls(props: TimerControlsProps) {
  const { onOpenQuran } = props;
  const { palette } = useTheme();
  const {
    timer,
    running,
    kind,
    setKind,
    direction,
    setDirection,
    minutes,
    setMinutes,
    clockText,
    targetSeconds,
    progress,
    pause,
    resume,
    handleStart,
    handleEnd,
    handleDiscard,
  } = useTimerControls(props);

  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View testID="timer-controls-v2">
      {!timer && (
        <View style={v2.tabs}>
          <PillTabs<Kind>
            options={[
              { value: 'stopwatch', label: 'Stopwatch' },
              { value: 'timer', label: 'Timer' },
            ]}
            value={kind}
            onChange={setKind}
            testID="timer-kind"
          />
        </View>
      )}

      <View style={v2.clockWrap}>
        {targetSeconds != null && (
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill} testID="timer-ring">
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              stroke={palette.separator}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              stroke={palette.primary}
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - Math.min(1, progress))}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              testID="timer-ring-progress"
            />
          </Svg>
        )}
        {/* A display, like the Clock app's: it fits the ring rather than growing with the text size. */}
        <Text
          style={[v2.clock, typeV2.numeral, { color: palette.text }, clockText.length > 8 && { fontSize: 44 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.2}
          accessibilityRole="timer"
          testID="timer-clock"
        >
          {clockText}
        </Text>
        {targetSeconds != null && (
          <Text style={[typeV2.meta, v2.clockSub, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            {(timer?.mode ?? direction) === 'countDown' ? 'remaining of ' : 'of '}
            {Math.round(targetSeconds / 60)} min
          </Text>
        )}
        {timer && !running && (
          <Text style={[typeV2.meta, v2.clockSub, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
            Paused
          </Text>
        )}
      </View>

      {timer ? (
        <View style={v2.actions}>
          <PillButton
            title={running ? 'Pause' : 'Resume'}
            variant="outline"
            size="lg"
            icon={running ? 'pause' : 'play'}
            onPress={running ? pause : resume}
            accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
            style={v2.action}
            testID="timer-pause"
          />
          <PillButton
            title="End"
            size="lg"
            icon="stop"
            onPress={handleEnd}
            accessibilityLabel="Stop and save timer"
            style={v2.action}
            testID="timer-end"
          />
        </View>
      ) : (
        <PillButton
          title="Start"
          size="lg"
          icon="play"
          onPress={handleStart}
          accessibilityLabel="Start timer"
          testID="timer-start"
        />
      )}

      {timer ? (
        <View style={v2.running}>
          {onOpenQuran && (
            <PillButton title="Open the Quran" variant="outline" icon="book-outline" onPress={onOpenQuran} testID="timer-open-quran" />
          )}
          <Text style={[typeV2.meta, v2.centred, { color: palette.secondary }]}>
            {(timer.pagesRevised?.length ?? 0) > 0
              ? `Pages revised so far: ${formatPageRanges(timer.pagesRevised ?? [])}`
              : timer.pagesVisited.length > 0
                ? `Pages opened so far: ${formatPageRanges(timer.pagesVisited)}`
                : 'Keeps running while you read or revise. Saved sessions are in Activity, where you can add the pages.'}
          </Text>
          <Tap
            onPress={handleDiscard}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Discard timer"
            style={v2.discard}
            testID="timer-discard"
          >
            <Text style={[typeV2.body, { color: palette.red }]}>Discard session</Text>
          </Tap>
        </View>
      ) : kind === 'timer' ? (
        <View testID="timer-setup">
          <Text style={[typeV2.name, v2.header, { color: palette.text }]} accessibilityRole="header">
            Length
          </Text>
          <View style={v2.presets}>
            {TIMER_PRESET_MINUTES.map((m) => {
              const selected = m === minutes;
              const label = presetLabel(m);
              return (
                <PillButton
                  key={m}
                  title={label}
                  size="sm"
                  variant={selected ? 'solid' : 'outline'}
                  onPress={() => setMinutes(m)}
                  accessibilityLabel={`${m} minutes${selected ? ', selected' : ''}`}
                  style={v2.preset}
                  testID={`timer-preset-${m}`}
                />
              );
            })}
          </View>
          <View style={[v2.stepRow, { borderTopColor: palette.separator, borderBottomColor: palette.separator }]}>
            <Text style={[typeV2.body, v2.stepLabel, { color: palette.text }]}>Custom</Text>
            <Tap
              onPress={() => setMinutes((m) => Math.max(5, m - 5))}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="5 minutes less"
              style={[v2.stepBtn, { borderColor: palette.outline }]}
              testID="timer-minus"
            >
              <Ionicons name="remove" size={18} color={palette.text} />
            </Tap>
            <Text style={[typeV2.body, typeV2.numeral, v2.stepValue, { color: palette.text }]} testID="timer-minutes">
              {minutes} min
            </Text>
            <Tap
              onPress={() => setMinutes((m) => Math.min(480, m + 5))}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="5 minutes more"
              style={[v2.stepBtn, { borderColor: palette.outline }]}
              testID="timer-plus"
            >
              <Ionicons name="add" size={18} color={palette.text} />
            </Tap>
          </View>

          <Text style={[typeV2.name, v2.header, { color: palette.text }]} accessibilityRole="header">
            Clock
          </Text>
          <PillTabs<Direction>
            options={[
              { value: 'countDown', label: 'Count down' },
              { value: 'countUp', label: 'Count up' },
            ]}
            value={direction}
            onChange={setDirection}
            testID="timer-direction"
          />
          <Text style={[typeV2.meta, v2.centred, v2.footnote, { color: palette.secondary }]}>
            When time's up the session is saved by itself.
          </Text>
        </View>
      ) : (
        <Text style={[typeV2.meta, v2.centred, v2.footnote, { color: palette.secondary }]}>
          Runs until you tap End, wherever you are in the app. Sessions are saved to Activity.
        </Text>
      )}
    </View>
  );
}

const v2 = StyleSheet.create({
  tabs: { marginTop: 8 },
  clockWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: layoutV2.rowPad,
  },
  clock: {
    fontSize: 54,
    fontWeight: '200',
    letterSpacing: -1,
    maxWidth: RING_SIZE - 32,
  },
  clockSub: { marginTop: 4 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1 },
  running: { alignItems: 'center', gap: layoutV2.rowPad, marginTop: layoutV2.rowPad, paddingBottom: 8 },
  centred: { textAlign: 'center' },
  discard: { paddingVertical: 8 },
  header: { marginTop: 20, marginBottom: 10 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Four to a row on a phone; they wrap rather than shrink with large text.
  preset: { minWidth: 64, flexGrow: 1 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 8,
    marginTop: 12,
    gap: 12,
    borderTopWidth: layoutV2.hairline,
    borderBottomWidth: layoutV2.hairline,
  },
  stepLabel: { flex: 1 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { minWidth: 64, textAlign: 'center' },
  footnote: { marginTop: 12, paddingHorizontal: 8, paddingBottom: 8 },
});
