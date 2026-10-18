import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { PressableScale } from './PressableScale';
import { useTheme } from '../context/ThemeContext';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { radius } from '../theme/radius';
import { shadows } from '../theme/shadows';
import { CarryOverMode, DEFAULT_CARRY_OVER_MODE } from '../lib/carryOver';

const OPTIONS: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }> = [
  {
    icon: 'swap-horizontal-outline',
    title: 'On — keep daily amount',
    body: 'Yesterday’s unrevised pages go first today. To keep today the usual size, the end of today’s pages moves to tomorrow, and the rest of your plan shifts back the same number of pages.',
  },
  {
    icon: 'add-circle-outline',
    title: 'Off — add on top',
    body: 'Yesterday’s unrevised pages are added to today’s pages, so today is longer. The rest of your plan stays as it is.',
  },
];

/**
 * Settings row: how "Add to today" (yesterday's leftovers) makes room. The info
 * button explains both choices.
 */
export function CarryOverSetting({
  mode,
  onChange,
}: {
  mode: CarryOverMode | undefined;
  onChange: (mode: CarryOverMode) => void;
}) {
  const { theme } = useTheme();
  const [infoOpen, setInfoOpen] = useState(false);
  const keepAmount = (mode ?? DEFAULT_CARRY_OVER_MODE) === 'shift';

  return (
    <>
      <View style={styles.row}>
        <View style={[styles.rowIcon, { backgroundColor: theme.accent + '20' }]}>
          <Ionicons name="arrow-redo-outline" size={16} color={theme.accent} />
        </View>
        <View style={styles.label}>
          <Text style={[typography.bodyMedium, { color: theme.textPrimary }]}>
            Keep daily amount
          </Text>
          <Pressable
            onPress={() => setInfoOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="What does Keep daily amount do?"
          >
            <Ionicons name="information-circle-outline" size={18} color={theme.textMuted} />
          </Pressable>
        </View>
        <Switch
          value={keepAmount}
          onValueChange={(v) => onChange(v ? 'shift' : 'add')}
          trackColor={{ false: theme.border, true: theme.accent }}
          thumbColor={Platform.OS === 'android' ? theme.bg : undefined}
        />
      </View>

      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setInfoOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.card}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <Text style={[typography.titleLarge, { color: theme.textPrimary }]}>
              Keep daily amount
            </Text>
            <Text style={[typography.bodySmall, styles.intro, { color: theme.textSecondary }]}>
              When you didn’t finish yesterday, Home offers to add the pages you missed to
              today. This decides how they fit in.
            </Text>
            <View style={styles.options}>
              {OPTIONS.map((o) => (
                <View key={o.title} style={styles.option}>
                  <View style={[styles.optionIcon, { backgroundColor: theme.accent + '20' }]}>
                    <Ionicons name={o.icon} size={18} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.titleSmall, { color: theme.textPrimary, marginBottom: 2 }]}>
                      {o.title}
                    </Text>
                    <Text style={[typography.bodySmall, { color: theme.textSecondary }]}>{o.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <PressableScale
              onPress={() => setInfoOpen(false)}
              haptic="light"
              scale={0.98}
              style={[styles.doneBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={[typography.bodySmall, { color: '#fff', fontWeight: '700' }]}>Got it</Text>
            </PressableScale>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    gap: spacing.sm,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.lg,
  },
  intro: { marginTop: spacing.xs, marginBottom: spacing.md },
  options: { gap: spacing.md, marginBottom: spacing.lg },
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    alignItems: 'center',
  },
});
