import React, { useState } from 'react';
import { Alert, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import {
  displayMs,
  elapsedMs,
  formatClock,
  formatPageRanges,
  formatStopwatch,
  MIN_SESSION_SECONDS,
} from '../../lib/readingTimer';
import type { ReadingTimerMode } from '../../types';
import { useHaptics } from '../../design/haptics';
import { typeV2 } from '../../theme/v2';
import { PillButton } from '../v2/PillButton';
import { PillTabs } from '../v2/PillTabs';
import { Tap } from '../v2/Tap';

type Kind = 'stopwatch' | 'timer';
type Direction = 'countUp' | 'countDown';

const PROGRESS_WIDTH = 160;

/** A timer's length, a step longer or shorter: 5 minutes up to an hour, then 15, then 30 (5 min to 8 h). */
export function stepLength(minutes: number, direction: 1 | -1): number {
  if (direction === 1) return Math.min(480, minutes < 60 ? minutes + 5 : minutes < 120 ? minutes + 15 : minutes + 30);
  return Math.max(5, minutes <= 60 ? minutes - 5 : minutes <= 120 ? minutes - 15 : minutes - 30);
}

/** Typed minutes: 1 to 480 (8 h, the longest a step reaches), or null. */
export const MIN_TYPED = 1;
export const MAX_TYPED = 480;
export function parseMinutes(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= MIN_TYPED && n <= MAX_TYPED ? n : null;
}

/** "45 min", "1 h", "1 h 30 min". */
export function lengthLabel(m: number): string {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

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
  // Typing the length instead of stepping to it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [entryError, setEntryError] = useState(false);
  // Empty, the current length as its placeholder: typing starts afresh.
  const beginEdit = () => {
    setDraft('');
    setEntryError(false);
    setEditing(true);
  };
  /** The typed length, applied; false (and a hint) if it isn't 1 to 480. */
  const commitEdit = (): number | null => {
    const n = parseMinutes(draft);
    if (n == null) {
      setEntryError(true);
      return null;
    }
    setMinutes(n);
    setEditing(false);
    setEntryError(false);
    Keyboard.dismiss();
    return n;
  };
  // Leaving the field: a valid length is kept, anything else goes back.
  const endEdit = () => {
    if (parseMinutes(draft) != null) commitEdit();
    else {
      setEditing(false);
      setEntryError(false);
    }
  };

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
    // Start while typing: what was typed, if it's a length.
    let length = minutes;
    if (kind === 'timer' && editing) {
      const typed = commitEdit();
      if (typed == null) return;
      length = typed;
    }
    start(mode, kind === 'timer' ? length * 60 : null);
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
    editing,
    draft,
    setDraft,
    entryError,
    beginEdit,
    commitEdit,
    endEdit,
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

/**
 * The one set of timer controls, in the timer sheet: small, so the page stays
 * in view. Two kinds:
 *  - Stopwatch: open-ended, ends when you tap End.
 *  - Timer: pick a length; it counts down or up and ends by itself.
 * Revised pages (revision screen) and opened pages (reader) are credited to
 * whatever timer is running. The clock light and large, a line under it, and
 * one row of controls.
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
    editing,
    draft,
    setDraft,
    entryError,
    beginEdit,
    commitEdit,
    endEdit,
    clockText,
    targetSeconds,
    progress,
    pause,
    resume,
    handleStart,
    handleEnd,
    handleDiscard,
  } = useTimerControls(props);
  // A timer not started yet: its length can be typed (tap the clock or the length).
  const typeable = !timer && kind === 'timer';

  const mode = timer?.mode ?? (kind === 'stopwatch' ? 'stopwatch' : direction);
  // One line under the clock: what it does, or where it is.
  const caption = timer
    ? !running
      ? 'Paused'
      : targetSeconds != null
        ? `${mode === 'countDown' ? 'remaining of ' : 'of '}${lengthLabel(Math.round(targetSeconds / 60))}`
        : (timer.pagesRevised?.length ?? 0) > 0
          ? `Pages revised: ${formatPageRanges(timer.pagesRevised ?? [])}`
          : timer.pagesVisited.length > 0
            ? `Pages opened: ${formatPageRanges(timer.pagesVisited)}`
            : 'Saved to Activity when you end it'
    : kind === 'stopwatch'
      ? 'Runs until you end it'
      : editing
        ? entryError
          ? `${MIN_TYPED} to ${MAX_TYPED} minutes`
          : 'Type the minutes'
        : 'Ends by itself and is saved';

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

      <View style={v2.clockBlock}>
        {typeable && editing ? (
          <View style={v2.entry}>
            <TextInput
              value={draft}
              onChangeText={(t) => setDraft(t.replace(/[^0-9]/g, '').slice(0, 3))}
              onBlur={endEdit}
              onSubmitEditing={() => commitEdit()}
              keyboardType="number-pad"
              returnKeyType="done"
              autoFocus
              placeholder={String(minutes)}
              placeholderTextColor={palette.secondary}
              maxLength={3}
              style={[v2.clock, v2.entryInput, typeV2.numeral, { color: palette.text, borderColor: entryError ? palette.red : palette.outline }]}
              maxFontSizeMultiplier={1.2}
              accessibilityLabel="Minutes"
              accessibilityHint={`${MIN_TYPED} to ${MAX_TYPED}`}
              testID="timer-minutes-input"
            />
            <Text style={[typeV2.body, { color: palette.secondary }]} maxFontSizeMultiplier={1.4}>
              min
            </Text>
            <PillButton
              title="Set"
              variant="outline"
              onPress={() => commitEdit()}
              accessibilityLabel="Set the length"
              style={v2.set}
              testID="timer-minutes-set"
            />
          </View>
        ) : (
          <Tap
            onPress={typeable ? beginEdit : undefined}
            disabled={!typeable}
            accessibilityRole={typeable ? 'button' : undefined}
            accessibilityLabel={typeable ? `${clockText}. Type the length` : undefined}
            testID="timer-clock-tap"
          >
            <Text
              style={[v2.clock, typeV2.numeral, { color: palette.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.2}
              accessibilityRole="timer"
              testID="timer-clock"
            >
              {clockText}
            </Text>
          </Tap>
        )}
        <Text
          style={[typeV2.meta, v2.centred, { color: entryError ? palette.red : palette.secondary }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          testID="timer-caption"
        >
          {caption}
        </Text>
        {timer && targetSeconds != null ? (
          <View style={[v2.track, { backgroundColor: palette.separator }]} testID="timer-progress">
            <View
              style={[v2.fill, { width: PROGRESS_WIDTH * Math.min(1, Math.max(0, progress)), backgroundColor: palette.primary }]}
            />
          </View>
        ) : null}
      </View>

      {!timer && kind === 'timer' ? (
        <View style={v2.row} testID="timer-setup">
          <Tap
            onPress={() => setMinutes((m) => stepLength(m, -1))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Shorter"
            style={[v2.step, { borderColor: palette.outline }]}
            testID="timer-minus"
          >
            <Ionicons name="remove" size={18} color={palette.text} />
          </Tap>
          <Tap
            onPress={beginEdit}
            accessibilityRole="button"
            accessibilityLabel={`${lengthLabel(minutes)}. Type the length`}
            style={v2.lengthTap}
            testID="timer-minutes-tap"
          >
            <Text
              style={[typeV2.body, typeV2.numeral, v2.length, { color: palette.text }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              testID="timer-minutes"
            >
              {lengthLabel(minutes)}
            </Text>
          </Tap>
          <Tap
            onPress={() => setMinutes((m) => stepLength(m, 1))}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Longer"
            style={[v2.step, { borderColor: palette.outline }]}
            testID="timer-plus"
          >
            <Ionicons name="add" size={18} color={palette.text} />
          </Tap>
          <View style={v2.direction}>
            <PillTabs<Direction>
              options={[
                { value: 'countDown', label: 'Down', icon: 'arrow-down' },
                { value: 'countUp', label: 'Up', icon: 'arrow-up' },
              ]}
              value={direction}
              onChange={setDirection}
              testID="timer-direction"
            />
          </View>
        </View>
      ) : null}

      {timer ? (
        <View style={v2.row}>
          <Tap
            onPress={handleDiscard}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Discard timer"
            style={[v2.step, v2.discard, { borderColor: palette.outline }]}
            testID="timer-discard"
          >
            <Ionicons name="trash-outline" size={17} color={palette.red} />
          </Tap>
          <PillButton
            title={running ? 'Pause' : 'Resume'}
            variant="outline"
            icon={running ? 'pause' : 'play'}
            onPress={running ? pause : resume}
            accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
            style={v2.action}
            testID="timer-pause"
          />
          <PillButton
            title="End"
            icon="stop"
            onPress={handleEnd}
            accessibilityLabel="Stop and save timer"
            style={v2.action}
            testID="timer-end"
          />
        </View>
      ) : (
        <View style={v2.row}>
          <PillButton
            title="Start"
            icon="play"
            onPress={handleStart}
            accessibilityLabel="Start timer"
            style={v2.action}
            testID="timer-start"
          />
        </View>
      )}

      {timer && onOpenQuran ? (
        <Tap
          onPress={onOpenQuran}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open the Quran"
          style={v2.link}
          testID="timer-open-quran"
        >
          <Ionicons name="book-outline" size={15} color={palette.link} />
          <Text style={[typeV2.meta, { color: palette.link }]} maxFontSizeMultiplier={1.4}>
            Open the Quran
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

const v2 = StyleSheet.create({
  tabs: { marginTop: 2 },
  clockBlock: { alignItems: 'center', paddingTop: 22, paddingBottom: 20, gap: 4 },
  // Light and large, like the Clock app's: the one big thing on the card.
  clock: { fontSize: 60, fontWeight: '200', letterSpacing: -1 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryInput: {
    minWidth: 96,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  set: { marginLeft: 4, paddingHorizontal: 14 },
  lengthTap: { paddingVertical: 6 },
  centred: { textAlign: 'center' },
  track: { width: PROGRESS_WIDTH, height: 2, borderRadius: 1, marginTop: 8, overflow: 'hidden' },
  fill: { height: 2, borderRadius: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  step: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discard: { borderWidth: StyleSheet.hairlineWidth },
  length: { minWidth: 76, textAlign: 'center' },
  direction: { flex: 1, marginLeft: 4 },
  action: { flex: 1 },
  link: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, paddingTop: 12, paddingBottom: 4 },
});
