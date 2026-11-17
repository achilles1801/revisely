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
import { t } from '../../i18n';

/** What the panel says about listening. */
export function listenLabel(status: ListenStatus, hearing: boolean): string {
  switch (status) {
    case 'listening':
      return hearing ? t('recite.panel.hearing') : t('recite.panel.listening');
    case 'starting':
      return t('recite.panel.starting');
    case 'paused':
      return t('recite.panel.paused');
    case 'denied':
      return t('recite.panel.micDenied');
    case 'error':
      return t('recite.panel.micBusy');
    default:
      return t('recite.panel.micOff');
  }
}

/** What the panel says while following word by word. */
export function followLabel(status: FollowStatus): string {
  switch (status) {
    case 'starting':
      return t('recite.panel.starting');
    case 'finding':
      return t('recite.panel.startReciting');
    case 'following':
      return t('recite.panel.following');
    case 'paused':
      return t('recite.panel.paused');
    case 'denied':
      return t('recite.panel.micDenied');
    case 'error':
      return t('recite.panel.couldNotListen');
    default:
      return t('recite.panel.micOff');
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
      accessibilityLabel={
        progress == null
          ? t('recite.panel.followWordByWord')
          : t('recite.panel.downloadingModel', { percent: Math.round(progress * 100) })
      }
      testID="recite-word-by-word"
    >
      <Text style={[typography.caption, styles.nextText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.2}>
        {progress == null ? t('recite.panel.wordByWord') : t('recite.panel.percent', { percent: Math.round(progress * 100) })}
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
        t('recite.panel.micAccessOff'),
        t('recite.panel.micAccessBody'),
        [
          { text: t('common.notNow'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
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
        accessibilityLabel={t('recite.panel.showWhenPause')}
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
        accessibilityLabel={t('recite.panel.showNext')}
        accessibilityState={{ disabled: nextDisabled }}
        testID="recite-next"
      >
        {compact ? (
          <Ionicons name="eye-outline" size={16} color={theme.textPrimary} />
        ) : (
          <Text style={[typography.caption, styles.nextText, { color: theme.textPrimary }]} maxFontSizeMultiplier={1.2}>
            {t('recite.panel.nextVerse')}
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
