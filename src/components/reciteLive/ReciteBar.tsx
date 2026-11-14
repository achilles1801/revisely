import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { arabicV2, typeV2 } from '../../theme/v2';
import { Tap } from '../v2/Tap';
import type { BarWord } from '../../lib/reciteLive/view';
import type { ScoreLevel } from '../../lib/reciteLive/score';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A round icon button on the bar; `active` fills it (the eye while the page is hidden). */
export function BarButton({
  icon,
  label,
  onPress,
  active,
  disabled,
  testID,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  testID?: string;
  children?: React.ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <Tap
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.round, active && { backgroundColor: palette.done }, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active, disabled } : { disabled }}
      testID={testID}
    >
      {children ?? (icon ? <Ionicons name={icon} size={active ? 20 : 22} color={active ? palette.onDone : palette.text} /> : null)}
    </Tap>
  );
}

/** ‹‹: two chevrons, overlapping. */
function DoubleChevron({ color }: { color: string }) {
  return (
    <View style={styles.double}>
      <Ionicons name="chevron-back" size={18} color={color} />
      <Ionicons name="chevron-back" size={18} color={color} style={styles.second} />
    </View>
  );
}

/** The eye; while the page is hidden, with ‹ (the next word) and ‹‹ (the whole ayah) beside it, in one pill. */
export function EyeGroup({
  hidden,
  onToggle,
  onNextWord,
  onWholeAyah,
}: {
  hidden: boolean;
  onToggle: () => void;
  onNextWord: () => void;
  onWholeAyah: () => void;
}) {
  const { palette } = useTheme();
  if (!hidden) {
    return <BarButton icon="eye-off-outline" label="Hide the page" onPress={onToggle} testID="recite-eye" />;
  }
  return (
    <View style={[styles.group, { backgroundColor: palette.bubble }]} testID="recite-eye-group">
      <BarButton icon="eye-outline" label="Show the page" onPress={onToggle} active testID="recite-eye" />
      <BarButton icon="chevron-back" label="Show the next word" onPress={onNextWord} testID="recite-next-word" />
      <BarButton label="Show the whole ayah" onPress={onWholeAyah} testID="recite-whole-ayah">
        <DoubleChevron color={palette.text} />
      </BarButton>
    </View>
  );
}

export function ScorePill({ text, level }: { text: string; level: ScoreLevel }) {
  const { palette } = useTheme();
  const fg = level === 'good' ? palette.good : level === 'warn' ? palette.warn : palette.onRedSubtle;
  const bg = level === 'good' ? palette.goodSubtle : level === 'warn' ? palette.warnSubtle : palette.redSubtle;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID="recite-score">
      <Text style={[styles.pillText, typeV2.numeral, { color: fg }]} maxFontSizeMultiplier={1.2}>
        {text}
      </Text>
    </View>
  );
}

/**
 * The reader's bar while reciting (Revisely Dev), in the player's place: the eye (with ‹ and ‹‹ while hidden), the
 * score (Check), then the time with the last words heard to its right, then Stop. After Stop: a spinner until the
 * checker's final answer; then ✕ closes.
 */
export function ReciteBar({
  hidden,
  onToggleHidden,
  onNextWord,
  onWholeAyah,
  score,
  seconds,
  recording,
  words,
  status,
  phase,
  onStop,
  onClose,
  surface,
}: {
  hidden: boolean;
  onToggleHidden: () => void;
  onNextWord: () => void;
  onWholeAyah: () => void;
  score: { text: string; level: ScoreLevel } | null;
  seconds: number;
  /** A recording is being kept (the red dot). */
  recording: boolean;
  words: BarWord[];
  /** Shown in the words' place while there are none ("Listening…"). */
  status: string;
  /** live: reciting; checking: stopped, the final answer coming; done: finished (✕). */
  phase: 'live' | 'checking' | 'done';
  onStop: () => void;
  onClose: () => void;
  surface: { background: string; border: string };
}) {
  const { palette } = useTheme();
  const spoken = words.map((w) => w.text).join(' ');
  return (
    <View
      style={[styles.capsule, { backgroundColor: surface.background, borderColor: surface.border }]}
      testID="recite-bar"
    >
      <EyeGroup hidden={hidden} onToggle={onToggleHidden} onNextWord={onNextWord} onWholeAyah={onWholeAyah} />
      {score ? <ScorePill text={score.text} level={score.level} /> : null}
      <View style={styles.middle} accessibilityLiveRegion="polite" accessible accessibilityLabel={`${clock(seconds)}. ${spoken || status}`}>
        <View style={styles.time}>
          {recording && phase === 'live' ? <View style={[styles.dot, { backgroundColor: palette.red }]} /> : null}
          <Text style={[styles.timeText, typeV2.numeral, { color: palette.secondary }]} maxFontSizeMultiplier={1.2} testID="recite-time">
            {clock(seconds)}
          </Text>
        </View>
        {words.length ? (
          <Text style={[arabicV2(20), styles.words]} numberOfLines={1} maxFontSizeMultiplier={1.3} testID="recite-words">
            {words.map((w, i) => (
              <Text
                key={w.w}
                style={{
                  color: w.tone === 'wrong' ? palette.red : w.tone === 'current' ? palette.accentText : palette.text,
                  textDecorationLine: w.tone === 'wrong' ? 'underline' : 'none',
                  textDecorationStyle: 'dotted',
                }}
              >
                {i > 0 ? ' ' : ''}
                {w.text}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2} testID="recite-status">
            {status}
          </Text>
        )}
      </View>
      {phase === 'done' ? (
        <BarButton icon="close" label="Close" onPress={onClose} testID="recite-close" />
      ) : (
        <Tap
          onPress={onStop}
          disabled={phase === 'checking'}
          hitSlop={6}
          style={[styles.stop, { backgroundColor: palette.primary }]}
          accessibilityRole="button"
          accessibilityLabel={phase === 'checking' ? 'Checking' : 'Stop'}
          accessibilityState={{ busy: phase === 'checking' }}
          testID="recite-stop"
        >
          {phase === 'checking' ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <View style={[styles.square, { backgroundColor: palette.onPrimary }]} />
          )}
        </Tap>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  round: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  group: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 2 },
  double: { flexDirection: 'row', alignItems: 'center' },
  second: { marginLeft: -10 },
  pill: { height: 30, paddingHorizontal: 11, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 14, fontWeight: '600' },
  middle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  timeText: { fontSize: 14, fontWeight: '600' },
  words: { writingDirection: 'rtl', flexShrink: 1 },
  stop: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  square: { width: 13, height: 13, borderRadius: 3.5 },
});
