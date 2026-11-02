import React, { ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { CAPSULE_HEIGHT } from '../reader/PlayerCapsule';
import type { ListenStatus } from './usePauseListener';
import type { FollowStatus } from './useReciteFollow';

/** What the panel says about listening. */
export function listenLabel(status: ListenStatus, hearing: boolean): string {
  switch (status) {
    case 'listening':
      return hearing ? 'Hearing you' : 'Listening';
    case 'starting':
      return 'Starting…';
    case 'paused':
      return 'Paused · tap the mic';
    case 'denied':
      return 'Microphone is off';
    case 'error':
      return 'Microphone busy';
    default:
      return 'Mic off';
  }
}

/** What the panel says while following word by word. */
export function followLabel(status: FollowStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting…';
    case 'finding':
      return 'Start reciting';
    case 'following':
      return 'Following';
    case 'paused':
      return 'Paused · tap the mic';
    case 'denied':
      return 'Microphone is off';
    case 'error':
      return 'Couldn’t listen · tap the mic';
    default:
      return 'Mic off';
  }
}

/** "Word by word": the speech model to download (its progress while it does). */
export function WordByWordChip({ progress, onPress }: { progress: number | null; onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[styles.next, { borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={progress == null ? 'Follow word by word' : `Downloading the speech model, ${Math.round(progress * 100)}%`}
      testID="recite-word-by-word"
    >
      <Text style={[typography.caption, styles.nextText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.2}>
        {progress == null ? 'Word by word' : `${Math.round(progress * 100)}%`}
      </Text>
    </Pressable>
  );
}

/**
 * The hidden recite mode's controls, in the player capsule's place under the
 * page: the microphone (reveal when you pause; on while listening), what it is
 * doing, Next verse, then recording, the timer and Submit as in the capsule.
 */
export function RecitePanel({
  status,
  hearing,
  label,
  on: onOverride,
  accessory,
  onToggleListening,
  onNextVerse,
  nextDisabled,
  record,
  timer,
  trailing,
  compact,
  surface,
}: {
  status: ListenStatus;
  hearing: boolean;
  /** What it says, in place of the pause listener's (word by word). */
  label?: string;
  /** Whether the mic shows on, in place of the pause listener's. */
  on?: boolean;
  /** Beside the label: "Word by word" (the speech model to download). */
  accessory?: ReactNode;
  onToggleListening: () => void;
  onNextVerse: () => void;
  /** Every verse on the page shown. */
  nextDisabled: boolean;
  record?: ReactNode;
  timer?: ReactNode;
  trailing?: ReactNode;
  compact?: boolean;
  surface: { background: string; border: string };
}) {
  const { theme } = useTheme();
  const on = onOverride ?? (status === 'listening' || status === 'starting');
  const pressMic = () => {
    if (status === 'denied') {
      Alert.alert(
        'Microphone access is off',
        'Allow Revisely to use the microphone in Settings to show each verse when you pause.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    onToggleListening();
  };
  return (
    <View
      style={[
        styles.capsule,
        { backgroundColor: surface.background, borderColor: surface.border, borderWidth: StyleSheet.hairlineWidth },
      ]}
      testID="recite-panel"
    >
      <Pressable
        onPress={pressMic}
        hitSlop={6}
        style={[
          styles.mic,
          on ? { backgroundColor: theme.accent } : { borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth * 2 },
          on && !hearing && styles.quiet,
        ]}
        accessibilityRole="switch"
        accessibilityLabel="Show each verse when you pause"
        accessibilityState={{ checked: on }}
        testID="recite-mic"
      >
        <Ionicons name={on ? 'mic' : 'mic-off-outline'} size={18} color={on ? theme.onAccent : theme.textPrimary} />
      </Pressable>
      <Text
        style={[typography.bodySmall, styles.text, { color: theme.textPrimary }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        accessibilityLiveRegion="polite"
        testID="recite-status"
      >
        {label ?? listenLabel(status, hearing)}
      </Text>
      {accessory}
      <Pressable
        onPress={onNextVerse}
        disabled={nextDisabled}
        hitSlop={6}
        style={[styles.next, { borderColor: theme.border, opacity: nextDisabled ? 0.4 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Show the next verse"
        accessibilityState={{ disabled: nextDisabled }}
        testID="recite-next"
      >
        {compact ? (
          <Ionicons name="eye-outline" size={16} color={theme.textPrimary} />
        ) : (
          <Text style={[typography.caption, styles.nextText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.2}>
            Next verse
          </Text>
        )}
      </Pressable>
      {(record || timer || trailing) && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
      {record}
      {timer}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    height: CAPSULE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // Listening, nothing heard: a little quieter, so speaking visibly lights it.
  quiet: { opacity: 0.7 },
  text: { flex: 1, paddingHorizontal: spacing.xs, minWidth: 0 },
  next: {
    height: 30,
    minWidth: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 22, marginHorizontal: 2 },
});
