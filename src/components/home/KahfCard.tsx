import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../GlassCard';
import { PressableScale } from '../PressableScale';
import { useTheme } from '../../context/ThemeContext';
import { useDesign } from '../../design/DesignContext';
import { KahfPost } from './feed/KahfPost';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import { KAHF_DEFAULT_MINUTES, KAHF_MINUTE_CHOICES, kahfPages } from '../../lib/kahf';

interface KahfCardProps {
  state: 'prompt' | 'done';
  saving?: boolean;
  onRead: () => void;
  /** Record it as a reading session of this many minutes. */
  onMarkRead: (minutes: number) => void;
  onDismiss: () => void;
}

/**
 * Friday suggestion on Home: read Surah Al-Kahf, optionally log it. In the new
 * design it is a post in Home's feed (feed/KahfPost): no card, the minutes in
 * a menu.
 */
export function KahfCard(props: KahfCardProps) {
  const { isNew } = useDesign();
  return isNew ? <KahfPost {...props} /> : <ClassicKahfCard {...props} />;
}

function ClassicKahfCard({ state, saving = false, onRead, onMarkRead, onDismiss }: KahfCardProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [picking, setPicking] = useState(false);
  const [minutes, setMinutes] = useState(KAHF_DEFAULT_MINUTES);
  const pages = kahfPages();
  const range = `Pages ${pages[0]}–${pages[pages.length - 1]}`;

  if (state === 'done') {
    return (
      <View style={styles.card}>
        <GlassCard style={StyleSheet.absoluteFillObject} />
        <View style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Surah Al-Kahf</Text>
            <Text style={styles.doneText}>Read ✓</Text>
          </View>
          <PressableScale
            onPress={onRead}
            haptic="light"
            style={styles.chip}
            accessibilityLabel="Open Surah Al-Kahf"
          >
            <Text style={styles.chipText}>Open</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <GlassCard style={StyleSheet.absoluteFillObject} />
      <Text style={styles.eyebrow}>JUMU&apos;AH</Text>
      <Text style={styles.title}>It&apos;s Friday — read Surah Al-Kahf</Text>
      <Text style={styles.meta}>{range}</Text>

      <View style={styles.actions}>
        <PressableScale
          onPress={onRead}
          haptic="medium"
          style={[styles.chip, styles.chipActive]}
          accessibilityLabel="Read Surah Al-Kahf"
        >
          <Ionicons name="book-outline" size={15} color={theme.accent} />
          <Text style={[styles.chipText, { color: theme.accent }]}>Read</Text>
        </PressableScale>
        <PressableScale
          onPress={() => setPicking(true)}
          haptic="light"
          disabled={saving}
          style={[styles.chip, saving && { opacity: 0.5 }]}
          accessibilityLabel="Mark Surah Al-Kahf as read"
        >
          <Ionicons name="checkmark" size={15} color={theme.textPrimary} />
          <Text style={styles.chipText}>{saving ? 'Saving…' : 'Mark as read'}</Text>
        </PressableScale>
        <PressableScale
          onPress={onDismiss}
          haptic="light"
          hitSlop={8}
          style={styles.dismiss}
          accessibilityLabel="Hide the Al-Kahf reminder for today"
        >
          <Text style={styles.dismissText}>Not today</Text>
        </PressableScale>
      </View>

      <Modal
        visible={picking}
        transparent
        animationType="fade"
        onRequestClose={() => setPicking(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPicking(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
            <GlassCard style={StyleSheet.absoluteFillObject} />
            <Text style={styles.sheetTitle}>How long did it take?</Text>
            <Text style={styles.sheetBody}>
              Saved as a reading session of Al-Kahf ({range.toLowerCase()}).
            </Text>
            <View style={styles.minutes}>
              {KAHF_MINUTE_CHOICES.map((m) => {
                const active = m === minutes;
                return (
                  <PressableScale
                    key={m}
                    onPress={() => setMinutes(m)}
                    haptic="selection"
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${m} minutes`}
                  >
                    <Text style={[styles.chipText, active && { color: theme.accent }]}>
                      {m} min
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <View style={styles.sheetActions}>
              <PressableScale
                onPress={() => setPicking(false)}
                haptic="light"
                style={styles.chip}
              >
                <Text style={styles.chipText}>Cancel</Text>
              </PressableScale>
              <PressableScale
                onPress={() => {
                  setPicking(false);
                  onMarkRead(minutes);
                }}
                haptic="medium"
                style={[styles.chip, styles.chipActive]}
                accessibilityLabel="Save reading session"
              >
                <Text style={[styles.chipText, { color: theme.accent }]}>Save</Text>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    eyebrow: { ...typography.label, color: theme.accent, letterSpacing: 0.8 },
    title: { ...typography.titleSmall, color: theme.textPrimary, marginTop: 2 },
    meta: { ...typography.bodySmall, color: theme.textSecondary, marginTop: 2 },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: spacing.sm,
      paddingVertical: 7,
      borderRadius: radius.full,
      backgroundColor: theme.glass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    chipActive: {
      backgroundColor: theme.accent + '22',
      borderColor: theme.accent + '55',
    },
    chipText: { ...typography.bodySmall, color: theme.textPrimary, fontWeight: '600' },
    dismiss: { marginLeft: 'auto', paddingHorizontal: spacing.xs, paddingVertical: 7 },
    dismissText: { ...typography.bodySmall, color: theme.textMuted },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    doneText: { ...typography.bodySmall, color: theme.accent, fontWeight: '600', marginTop: 2 },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    sheet: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      padding: spacing.lg,
    },
    sheetTitle: { ...typography.titleMedium, color: theme.textPrimary },
    sheetBody: { ...typography.bodySmall, color: theme.textSecondary, marginTop: spacing.xxs },
    minutes: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.md,
    },
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.xs,
      marginTop: spacing.lg,
    },
  });
