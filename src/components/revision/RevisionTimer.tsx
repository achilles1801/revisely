import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { elapsedMs, formatClock, isRevisionTimer } from '../../lib/readingTimer';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

/**
 * Timer control for the revision top bar. Idle it's a stopwatch icon that
 * starts a revision timer in one tap; once started it shows the live time,
 * and tapping it opens pause/resume/stop controls.
 *
 * Uses a plain Modal rather than a bottom sheet: sheets render outside
 * ReadingTimerProvider, so useReadingTimer() isn't available in them.
 */
export function RevisionTimerButton({ onStop }: { onStop: () => void }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer, start } = useReadingTimer();
  const [controlsOpen, setControlsOpen] = useState(false);

  const running = timer?.runningSince != null;
  const now = useNow(running, 1000);

  if (!timer) {
    return (
      <PressableScale
        onPress={() => start('stopwatch', null, 'revision')}
        haptic="medium"
        hitSlop={12}
        style={styles.iconBtn}
        accessibilityLabel="Start revision timer"
      >
        <Ionicons name="stopwatch-outline" size={20} color={theme.textPrimary} />
      </PressableScale>
    );
  }

  const tint = running ? theme.accent : theme.textSecondary;

  return (
    <>
      <PressableScale
        onPress={() => setControlsOpen(true)}
        haptic="light"
        hitSlop={8}
        style={[
          styles.pill,
          running
            ? { backgroundColor: theme.accent + '22', borderColor: theme.accent + '44' }
            : { backgroundColor: theme.glass, borderColor: theme.border },
        ]}
        accessibilityLabel={`${running ? 'Timer running' : 'Timer paused'}, ${formatClock(
          elapsedMs(timer, now),
        )}. Open timer controls`}
      >
        <Ionicons name={running ? 'stopwatch' : 'pause'} size={14} color={tint} />
        <Text style={[styles.pillText, { color: tint }]}>{formatClock(elapsedMs(timer, now))}</Text>
      </PressableScale>

      <RevisionTimerControls
        visible={controlsOpen}
        onClose={() => setControlsOpen(false)}
        onStop={() => {
          setControlsOpen(false);
          onStop();
        }}
      />
    </>
  );
}

function RevisionTimerControls({
  visible,
  onClose,
  onStop,
}: {
  visible: boolean;
  onClose: () => void;
  onStop: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { timer, pause, resume, discard } = useReadingTimer();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const running = timer?.runningSince != null;
  const now = useNow(visible && running, 250);
  if (!timer) return null;

  const close = () => {
    setConfirmDiscard(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <GlassCard style={StyleSheet.absoluteFillObject} />
          <View style={styles.dragHandle} />

          <Text style={styles.clock} accessibilityRole="timer">
            {formatClock(elapsedMs(timer, now))}
          </Text>
          <Text style={[styles.status, !running && { color: theme.warning }]}>
            {running ? 'Timing your revision' : 'Paused'}
          </Text>

          <View style={styles.actions}>
            <PressableScale
              onPress={running ? pause : resume}
              haptic="medium"
              scale={0.97}
              style={[styles.actionBtn, { backgroundColor: theme.glass, borderColor: theme.border }]}
              accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
            >
              <Ionicons name={running ? 'pause' : 'play'} size={18} color={theme.textPrimary} />
              <Text style={[styles.actionText, { color: theme.textPrimary }]}>
                {running ? 'Pause' : 'Resume'}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={onStop}
              haptic="medium"
              scale={0.97}
              style={[
                styles.actionBtn,
                { backgroundColor: theme.accent + '22', borderColor: theme.accent + '44' },
              ]}
              accessibilityLabel="Stop and save timer"
            >
              <Ionicons name="stop" size={16} color={theme.accent} />
              <Text style={[styles.actionText, { color: theme.accent }]}>Stop & save</Text>
            </PressableScale>
          </View>

          <Text style={styles.footnote}>
            {isRevisionTimer(timer)
              ? 'Stops by itself when today’s pages are done. Leaving the session pauses it — resume here when you’re back.'
              : 'This is the reading timer you started from Home. Revised pages are added to it.'}
          </Text>

          {confirmDiscard ? (
            <View style={styles.discardRow}>
              <Text style={styles.discardPrompt}>Discard this time?</Text>
              <PressableScale onPress={() => setConfirmDiscard(false)} haptic="light" style={styles.discardBtn}>
                <Text style={[styles.discardText, { color: theme.textSecondary }]}>Keep</Text>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  discard();
                  close();
                }}
                haptic="medium"
                style={styles.discardBtn}
                accessibilityLabel="Confirm discard timer"
              >
                <Text style={[styles.discardText, { color: theme.error }]}>Discard</Text>
              </PressableScale>
            </View>
          ) : (
            <PressableScale
              onPress={() => setConfirmDiscard(true)}
              haptic="light"
              style={styles.discardLink}
              accessibilityLabel="Discard timer"
            >
              <Text style={[styles.discardText, { color: theme.error }]}>Discard time</Text>
            </PressableScale>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 30,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    pillText: {
      ...typography.bodySmall,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      paddingHorizontal: spacing.lg,
      overflow: 'hidden',
      alignItems: 'center',
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      marginBottom: spacing.lg,
    },
    clock: {
      fontSize: 56,
      fontWeight: '200',
      color: theme.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -1,
    },
    status: {
      ...typography.label,
      color: theme.accent,
      marginTop: spacing.xxs,
      marginBottom: spacing.lg,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignSelf: 'stretch',
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderRadius: radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    actionText: { ...typography.bodyMedium, fontWeight: '600' },
    footnote: {
      ...typography.bodySmall,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    discardLink: { marginTop: spacing.md, paddingVertical: spacing.xs },
    discardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.md,
    },
    discardPrompt: { ...typography.bodyMedium, color: theme.textPrimary },
    discardBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs },
    discardText: { ...typography.bodyMedium, fontWeight: '600' },
  });
