import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTabBarFootprint } from '../LiquidGlassTabBar';
import { TimerControls } from './TimerControls';
import { alertSessionSaved } from './sessionSavedAlert';
import { FLOATING_TIMER_SIZE, useFloatingTimerOffsets } from './floatingTimerOffset';
import { useTheme } from '../../context/ThemeContext';
import { useNow, useReadingTimer } from '../../context/ReadingTimerContext';
import { displayMs, formatClock } from '../../lib/readingTimer';
import { navigationRef } from '../../navigation/navigationRef';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';

/** Editing and settings screens: no timer button over forms. */
export const FLOATING_TIMER_HIDDEN_ON = new Set([
  'Settings',
  'PlanEdit',
  'PlanDayEdit',
  'Memorization',
  'JournalEntry',
]);

/** Screens without the tab bar; they own the bottom edge and set an offset. */
const NO_TAB_BAR = new Set(['QuranReader', 'ActiveRevision']);

// ---------------------------------------------------------------------------
// The button
// ---------------------------------------------------------------------------

/** The focused screen, from anywhere (the timer is rendered outside the navigators). */
function readFocusedRoute(): { key: string; name: string } | undefined {
  if (!navigationRef.isReady()) return undefined;
  const r = navigationRef.getCurrentRoute();
  return r ? { key: r.key, name: r.name } : undefined;
}

// Before the container reports a route (first render) this is undefined and
// the button sits as on a tab screen, which the app opens on.
function useFocusedRoute(): { key: string; name: string } | undefined {
  const [route, setRoute] = useState(readFocusedRoute);
  useEffect(() => {
    const update = () =>
      setRoute((prev) => {
        const next = readFocusedRoute();
        return prev?.key === next?.key && prev?.name === next?.name ? prev : next;
      });
    update();
    return navigationRef.addListener('state', update);
  }, []);
  return route;
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/**
 * The app's one timer entry point, floating bottom-right on every screen
 * except editors/settings. Idle it is a round stopwatch button; while a
 * session runs (or is paused) it shows the live clock. Tapping opens the
 * controls in a plain Modal: bottom sheets render outside
 * ReadingTimerProvider, so useReadingTimer() isn't available in them.
 */
export function FloatingTimer() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const tabFootprint = useTabBarFootprint();
  const route = useFocusedRoute();
  const offsets = useFloatingTimerOffsets();
  const keyboardOpen = useKeyboardOpen();
  const { timer } = useReadingTimer();
  const [open, setOpen] = useState(false);

  const running = timer?.runningSince != null;
  const now = useNow(running && !open, 1000);

  const name = route?.name;
  const hidden = keyboardOpen || (name != null && FLOATING_TIMER_HIDDEN_ON.has(name));
  const custom = route ? offsets?.[route.key] : undefined;
  const bottom =
    custom ??
    (name != null && NO_TAB_BAR.has(name) ? insets.bottom + spacing.md : tabFootprint + spacing.sm);

  const close = () => setOpen(false);
  const openQuran =
    name === 'QuranReader'
      ? undefined
      : () => {
          close();
          // Just the Read tab as it is: a reader already open there stays open
          // (naming ReadIndex would push a second index on top of it).
          if (navigationRef.isReady()) navigationRef.navigate('Read');
        };

  const clock = timer ? formatClock(displayMs(timer, now)) : '';

  return (
    <>
      {!hidden && (
        <View pointerEvents="box-none" style={[styles.wrap, { bottom }]} testID="floating-timer">
          {timer ? (
            <PressableScale
              onPress={() => setOpen(true)}
              haptic="light"
              scale={0.95}
              hitSlop={6}
              accessibilityLabel={`${running ? 'Timer running' : 'Timer paused'}, ${clock}. Open timer controls`}
            >
              <GlassCard
                elevated
                tintColor={running ? theme.accent + '22' : undefined}
                style={[styles.pill, { borderColor: running ? theme.accent + '55' : theme.border }]}
              >
                <Ionicons
                  name={running ? 'stopwatch' : 'pause'}
                  size={16}
                  color={running ? theme.accent : theme.warning}
                />
                <Text style={[styles.clock, { color: running ? theme.accent : theme.textPrimary }]}>
                  {clock}
                </Text>
              </GlassCard>
            </PressableScale>
          ) : (
            <PressableScale
              onPress={() => setOpen(true)}
              haptic="light"
              scale={0.92}
              hitSlop={6}
              accessibilityLabel="Open timer"
            >
              <GlassCard elevated style={styles.round}>
                <Ionicons name="stopwatch-outline" size={22} color={theme.textPrimary} />
              </GlassCard>
            </PressableScale>
          )}
        </View>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          >
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <View style={styles.dragHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Timer</Text>
              <PressableScale
                onPress={close}
                haptic="light"
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityLabel="Close timer"
              >
                <Ionicons name="close" size={18} color={theme.textSecondary} />
              </PressableScale>
            </View>
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <TimerControls
                visible={open}
                onClose={close}
                onSaved={(date, seconds) => alertSessionSaved(date, seconds)}
                onOpenQuran={openQuran}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      right: spacing.md,
    },
    round: {
      width: FLOATING_TIMER_SIZE,
      height: FLOATING_TIMER_SIZE,
      borderRadius: FLOATING_TIMER_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
    },
    clock: {
      ...typography.bodyMedium,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '90%',
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      overflow: 'hidden',
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      marginBottom: spacing.sm,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    sheetTitle: { ...typography.titleMedium, color: theme.textPrimary },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
  });
