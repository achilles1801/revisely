import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecorderPhase, useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import { formatRecordingTime } from '../../lib/recordingFormat';
import { useTheme } from '../../context/ThemeContext';
import { typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import { LiveWaveform, type LiveLevels } from './LiveWaveform';

type Recorder = ReturnType<typeof useVoiceRecorder>;

interface RecordButtonProps {
  recorder: Recorder;
  /**
   * Where it sits. `capsule` (the reader's and the session's controls): while
   * recording it is the whole capsule (recorderTakesCapsule). `inline` (the
   * hidden mode's panel): a pill beside the other controls.
   */
  layout?: 'capsule' | 'inline';
  /** The timer beside it: no red dot, tighter. */
  crowded?: boolean;
}

/** Recorded time now: what was saved plus the stretch in progress. */
export function recordedMs(baseMs: number, segmentStartedAt: number | null, now: number): number {
  return baseMs + (segmentStartedAt != null ? Math.max(0, now - segmentStartedAt) : 0);
}

/** Ticks while recording, for the time shown. */
function useRecordingNow(phase: string): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [phase]);
  return now;
}

/** Whether the recording shows (not while a first start is under way). */
const pillShown = (phase: string, baseMs: number, segmentStartedAt: number | null) =>
  !(phase === 'idle' || (phase === 'starting' && baseMs === 0 && segmentStartedAt == null));

/**
 * While recording (and resuming, and saving after Stop) the recorder is the
 * reader's whole capsule (Variant B): the recitation is stopped anyway. Paused,
 * the player comes back and the recording waits in a pill after it.
 */
export function recorderTakesCapsule(r: { phase: RecorderPhase; baseMs: number; segmentStartedAt: number | null }): boolean {
  if (r.phase === 'recording' || r.phase === 'finishing') return true;
  return r.phase === 'starting' && pillShown(r.phase, r.baseMs, r.segmentStartedAt);
}

/** The recorder's readings for the live bars (none on a recorder without them). */
export function levelsOf(r: Partial<Pick<Recorder, 'subscribeLevel' | 'recentLevels'>>): LiveLevels {
  return {
    subscribe: r.subscribeLevel ?? (() => () => undefined),
    recent: r.recentLevels ?? (() => []),
  };
}

/**
 * The session's recording control (Variant B). Idle: a round mic. Recording:
 * the whole capsule, a red dot, the time, the voice arriving as bars, pause
 * and a red stop. Paused (or interrupted): a pill outlined in red after the
 * player, the mic and the time (resume) and a stop square. Saving: the
 * recording's capsule, dimmed, "Saving…". Taps don't buzz; the recorder marks
 * start and stop (design/haptics).
 */
export function RecordButton({ recorder, layout = 'capsule', crowded = false }: RecordButtonProps) {
  const { palette } = useTheme();
  const { phase, baseMs, segmentStartedAt, interrupted } = recorder;
  const now = useRecordingNow(phase);
  const { subscribeLevel, recentLevels } = recorder;
  const levels = useMemo(() => levelsOf({ subscribeLevel, recentLevels }), [subscribeLevel, recentLevels]);

  if (!pillShown(phase, baseMs, segmentStartedAt)) {
    return (
      <Tap
        onPress={recorder.start}
        disabled={phase === 'starting'}
        hitSlop={8}
        style={[styles.round, { backgroundColor: palette.fill, borderColor: palette.separator }]}
        accessibilityRole="button"
        accessibilityLabel="Record your recitation"
        accessibilityState={{ disabled: phase === 'starting', busy: phase === 'starting' }}
        testID="record-start"
      >
        {phase === 'starting' ? (
          <ActivityIndicator size="small" color={palette.secondary} />
        ) : (
          <Ionicons name="mic-outline" size={18} color={palette.text} />
        )}
      </Tap>
    );
  }

  const time = formatRecordingTime(recordedMs(baseMs, segmentStartedAt, now));
  const recording = phase === 'recording';
  const saving = phase === 'finishing';
  const busy = phase === 'starting' || saving;

  // ===== Recording, resuming or saving: the whole capsule =====
  if (layout === 'capsule' && recorderTakesCapsule(recorder)) {
    return (
      <View
        style={[styles.live, crowded ? styles.liveCrowded : null]}
        testID={saving ? 'recorder-saving' : 'record-pill-recording'}
      >
        {busy ? (
          <ActivityIndicator size="small" color={palette.text} style={styles.spinner} />
        ) : crowded ? null : (
          <View style={styles.dotBox} testID="recorder-dot">
            <View style={[styles.halo, { backgroundColor: palette.red }]} />
            <View style={[styles.dot, { backgroundColor: palette.red }]} />
          </View>
        )}
        {saving ? (
          <Text style={[styles.liveTime, { color: palette.secondary }]} maxFontSizeMultiplier={1.2}>
            Saving…
          </Text>
        ) : (
          <Text
            style={[styles.liveTime, typeV2.numeral, { color: palette.text }]}
            maxFontSizeMultiplier={1.2}
            testID="recorder-time"
          >
            {time}
          </Text>
        )}
        <View style={[styles.bars, saving && styles.dimBars]}>
          <LiveWaveform levels={levels} color={palette.text} maxHeight={26} frozen={!recording} testID="recorder-bars" />
        </View>
        <Tap
          onPress={recorder.pause}
          disabled={busy}
          hitSlop={4}
          style={[
            styles.circle,
            { backgroundColor: palette.bg, borderColor: palette.outline, borderWidth: StyleSheet.hairlineWidth },
            busy && styles.disabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Pause recording, ${time} recorded`}
          accessibilityState={{ disabled: busy, busy }}
          testID="record-toggle"
        >
          <Ionicons name="pause" size={16} color={palette.text} />
        </Tap>
        <Tap
          onPress={recorder.finish}
          disabled={busy}
          hitSlop={4}
          style={[styles.circle, { backgroundColor: palette.redFill }, busy && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          accessibilityState={{ disabled: busy }}
          testID="record-stop"
        >
          <View style={[styles.stopBig, { backgroundColor: palette.onRedFill }]} />
        </Tap>
      </View>
    );
  }

  // ===== Recording in the hidden mode's panel: a solid red pill =====
  if (layout === 'inline' && recorderTakesCapsule(recorder)) {
    const fg = palette.bg;
    return (
      <View style={[styles.pill, { backgroundColor: palette.red }]} testID="record-pill-recording">
        <Tap
          onPress={recorder.pause}
          disabled={busy}
          hitSlop={{ top: 6, bottom: 6, left: 6 }}
          style={styles.segment}
          accessibilityRole="button"
          accessibilityLabel={`Pause recording, ${time} recorded`}
          accessibilityState={{ disabled: busy, busy }}
          testID="record-toggle"
        >
          {busy ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <View style={[styles.dot, { backgroundColor: fg }]} />
          )}
          <Text style={[typeV2.numeral, styles.pillTime, { color: fg }]} maxFontSizeMultiplier={1.2}>
            {time}
          </Text>
          <Ionicons name="pause" size={13} color={fg} />
        </Tap>
        <View style={[styles.pillDivider, { backgroundColor: fg }]} />
        <Tap
          onPress={recorder.finish}
          disabled={busy}
          hitSlop={{ top: 6, bottom: 6, right: 6 }}
          style={styles.stopBtn}
          accessibilityRole="button"
          accessibilityLabel="Stop recording"
          accessibilityState={{ disabled: busy }}
          testID="record-stop"
        >
          <View style={[styles.stopSquare, { backgroundColor: fg }]} />
        </Tap>
      </View>
    );
  }

  // ===== Paused (or interrupted): the recording waits in a red pill =====
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]} testID="record-pill-paused">
      {/* The outline: red at 55% (a border can't take an opacity of its own). */}
      <View pointerEvents="none" style={[styles.pillRing, { borderColor: palette.red }]} testID="record-pill-ring" />
      <Tap
        onPress={recorder.resume}
        hitSlop={{ top: 6, bottom: 6, left: 6 }}
        style={styles.segment}
        accessibilityRole="button"
        accessibilityLabel={`${interrupted ? 'Recording was paused by an interruption. ' : ''}Resume recording, ${time} recorded`}
        testID="record-toggle"
      >
        <Ionicons name="mic" size={15} color={palette.red} />
        <Text style={[typeV2.numeral, styles.pillTime, { color: palette.red }]} maxFontSizeMultiplier={1.2}>
          {time}
        </Text>
      </Tap>
      <View style={[styles.pillDivider, { backgroundColor: palette.red }]} />
      <Tap
        onPress={recorder.finish}
        hitSlop={{ top: 6, bottom: 6, right: 6 }}
        style={styles.stopBtn}
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
        testID="record-stop"
      >
        <View style={[styles.stopSquare, { backgroundColor: palette.red }]} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The whole capsule while recording.
  live: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 8 },
  liveCrowded: { gap: 8, paddingLeft: 14 },
  // The red dot (8) in its 4pt halo of red at 18%.
  dotBox: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center', marginHorizontal: -4 },
  halo: { position: 'absolute', width: 16, height: 16, borderRadius: 8, opacity: 0.18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  spinner: { transform: [{ scale: 0.8 }] },
  liveTime: { fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 38 },
  bars: { flex: 1, minWidth: 0 },
  dimBars: { opacity: 0.3 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  stopBig: { width: 12, height: 12, borderRadius: 3 },
  // The pills (paused; recording in the hidden mode's panel).
  pill: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 17, overflow: 'hidden' },
  pillRing: { ...StyleSheet.absoluteFillObject, borderRadius: 17, borderWidth: 1, opacity: 0.55 },
  segment: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 12, paddingRight: 8 },
  pillTime: { fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 14 },
  pillDivider: { width: 1, height: 18, opacity: 0.4 },
  stopBtn: { height: 34, paddingLeft: 9, paddingRight: 12, justifyContent: 'center' },
  stopSquare: { width: 11, height: 11, borderRadius: 2.5 },
});
