import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  RouteProp,
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../components/GlassCard';
import { PressableScale } from '../../components/PressableScale';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { getCurrentRevisionDay } from '../../lib/algorithm';
import {
  JOURNAL_NOTES_MAX,
  JOURNAL_TEXT_MAX,
  emptyJournalEntry,
  formatJournalDay,
  formatJournalDayRelative,
  formatMinutes,
  isJournalEntryEmpty,
  journalTotalMinutes,
  parseMinutesInput,
  summarizeRevisedPages,
} from '../../lib/journal';
import { logger } from '../../lib/logger';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { radius } from '../../theme/radius';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry } from '../../types';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'JournalEntry'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'JournalEntry'>;

// Form state keeps minutes as raw text so a half-typed field isn't reformatted
// under the user's cursor.
interface FormState {
  memorization: string;
  memorizationMinutes: string;
  revision: string;
  revisionMinutes: string;
  notes: string;
}

function toForm(entry: JournalEntry): FormState {
  return {
    memorization: entry.memorization,
    memorizationMinutes: entry.memorizationMinutes?.toString() ?? '',
    revision: entry.revision,
    revisionMinutes: entry.revisionMinutes?.toString() ?? '',
    notes: entry.notes,
  };
}

function fromForm(date: string, form: FormState): JournalEntry {
  return {
    date,
    memorization: form.memorization.trim(),
    memorizationMinutes: parseMinutesInput(form.memorizationMinutes),
    revision: form.revision.trim(),
    revisionMinutes: parseMinutesInput(form.revisionMinutes),
    notes: form.notes.trim(),
  };
}

export default function JournalEntryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { user, logs } = useApp();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(theme, isDark), [theme, isDark]);

  const today = getCurrentRevisionDay(user);
  const date = route.params?.date ?? today;

  const [initial, setInitial] = useState<FormState>(toForm(emptyJournalEntry(date)));
  const [form, setForm] = useState<FormState>(initial);
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Set once we've saved/deleted; the effect below then leaves the screen
  // after the unsaved-changes guard has re-rendered as disabled.
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    firestoreService
      .getJournalEntry(date)
      .then((entry) => {
        if (cancelled || !entry) return;
        const loaded = toForm(entry);
        setInitial(loaded);
        setForm(loaded);
        setExists(true);
      })
      .catch((err) => logger.error('Failed to load journal entry', err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const dirty = useMemo(
    () => (Object.keys(form) as (keyof FormState)[]).some((k) => form[k] !== initial[k]),
    [form, initial],
  );

  useEffect(() => {
    if (done) navigation.goBack();
  }, [done, navigation]);

  // Guards the back button and (on native-stack) the swipe-back gesture.
  usePreventRemove(dirty && !done, ({ data }) => {
    Alert.alert('Discard changes?', "You haven't saved this day's log.", [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Offer to fill the revision line from the in-app session logged that day.
  const sessionSuggestion = useMemo(() => {
    const log = logs.find((l) => l.date === date);
    if (!log || log.pagesRevised.length === 0) return null;
    return {
      text: summarizeRevisedPages(log.pagesRevised),
      minutes: log.durationMinutes,
    };
  }, [logs, date]);
  const showSuggestion =
    sessionSuggestion != null && form.revision.trim() === '' && form.revisionMinutes === '';

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const draft = fromForm(date, form);
  const total = journalTotalMinutes(draft);

  const handleSave = useCallback(async () => {
    const entry = fromForm(date, form);
    setSaving(true);
    try {
      if (isJournalEntryEmpty(entry)) {
        // Clearing every field is the same as deleting the day.
        if (exists) await firestoreService.deleteJournalEntry(date);
      } else {
        await firestoreService.saveJournalEntry(entry, !exists);
      }
      setDone(true);
    } catch (err) {
      logger.error('Failed to save journal entry', err);
      Alert.alert("Couldn't save", 'Check your connection and try again.');
      setSaving(false);
    }
  }, [date, form, exists]);

  const handleDelete = () => {
    Alert.alert(`Delete ${formatJournalDay(date)}?`, 'This removes the log for this day.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await firestoreService.deleteJournalEntry(date);
            setDone(true);
          } catch (err) {
            logger.error('Failed to delete journal entry', err);
            Alert.alert("Couldn't delete", 'Check your connection and try again.');
            setSaving(false);
          }
        },
      },
    ]);
  };

  const canSave = dirty && !saving && !loading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          haptic="light"
          hitSlop={12}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={theme.textPrimary} />
        </PressableScale>

        <View style={styles.headerCenter}>
          <Text style={styles.title}>{formatJournalDayRelative(date, today)}</Text>
          <Text style={styles.subtitle}>
            {total != null ? `Total ${formatMinutes(total)}` : formatJournalDay(date)}
          </Text>
        </View>

        {exists && (
          <PressableScale
            onPress={handleDelete}
            haptic="light"
            hitSlop={8}
            disabled={saving}
            style={styles.iconBtn}
            accessibilityLabel="Delete this day's log"
          >
            <Ionicons name="trash-outline" size={18} color={theme.error} />
          </PressableScale>
        )}

        <PressableScale
          onPress={handleSave}
          haptic="medium"
          scale={0.92}
          disabled={!canSave}
          style={[
            styles.iconBtn,
            canSave && { backgroundColor: theme.accent },
          ]}
          accessibilityLabel="Save"
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.textPrimary} />
          ) : (
            <Ionicons
              name="checkmark"
              size={20}
              color={canSave ? theme.textInverse : theme.textMuted}
            />
          )}
        </PressableScale>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <Section title="MEMORIZATION" icon="book-outline" styles={styles} theme={theme}>
            <View style={styles.fieldRow}>
              <TextInput
                value={form.memorization}
                onChangeText={set('memorization')}
                placeholder="e.g. 1/2 p3, 4L p4"
                placeholderTextColor={theme.textMuted}
                maxLength={JOURNAL_TEXT_MAX}
                returnKeyType="next"
                style={[styles.input, styles.textField]}
                accessibilityLabel="What you memorized"
              />
              <MinutesField
                value={form.memorizationMinutes}
                onChange={set('memorizationMinutes')}
                styles={styles}
                theme={theme}
                label="Memorization minutes"
              />
            </View>
          </Section>

          <Section title="REVISION" icon="repeat-outline" styles={styles} theme={theme}>
            <View style={styles.fieldRow}>
              <TextInput
                value={form.revision}
                onChangeText={set('revision')}
                placeholder="e.g. 5p Maryam + Taha"
                placeholderTextColor={theme.textMuted}
                maxLength={JOURNAL_TEXT_MAX}
                returnKeyType="next"
                style={[styles.input, styles.textField]}
                accessibilityLabel="What you revised"
              />
              <MinutesField
                value={form.revisionMinutes}
                onChange={set('revisionMinutes')}
                styles={styles}
                theme={theme}
                label="Revision minutes"
              />
            </View>
            {showSuggestion && sessionSuggestion && (
              <PressableScale
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    revision: sessionSuggestion.text,
                    revisionMinutes: sessionSuggestion.minutes?.toString() ?? '',
                  }))
                }
                haptic="light"
                scale={0.97}
                style={styles.suggestion}
                accessibilityLabel="Fill revision from your session"
              >
                <Ionicons name="sparkles-outline" size={14} color={theme.accent} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  From your session: {sessionSuggestion.text}
                  {sessionSuggestion.minutes != null
                    ? ` · ${formatMinutes(sessionSuggestion.minutes)}`
                    : ''}
                </Text>
              </PressableScale>
            )}
          </Section>

          <Section title="NOTES" icon="document-text-outline" optional styles={styles} theme={theme}>
            <TextInput
              value={form.notes}
              onChangeText={set('notes')}
              placeholder="How did it go? Mistakes to watch, ayat to repeat…"
              placeholderTextColor={theme.textMuted}
              multiline
              maxLength={JOURNAL_NOTES_MAX}
              textAlignVertical="top"
              style={[styles.input, styles.notesField]}
              accessibilityLabel="Personal notes"
            />
          </Section>

          <Text style={styles.legend}>p = page · L = line · write it however you like</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({
  title,
  icon,
  optional,
  children,
  styles,
  theme,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  optional?: boolean;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
  theme: ThemeColors;
}) {
  return (
    <GlassCard glassStyle="clear" style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={14} color={theme.accent} />
        <Text style={styles.sectionLabel}>{title}</Text>
        {optional && <Text style={styles.optional}>optional</Text>}
      </View>
      {children}
    </GlassCard>
  );
}

function MinutesField({
  value,
  onChange,
  label,
  styles,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  theme: ThemeColors;
}) {
  return (
    <View style={[styles.input, styles.minutesWrap]}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={theme.textMuted}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.minutesInput}
        accessibilityLabel={label}
      />
      <Text style={styles.minutesSuffix}>min</Text>
    </View>
  );
}

const makeStyles = (theme: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    title: { ...typography.titleLarge, color: theme.textPrimary },
    subtitle: { ...typography.caption, color: theme.textMuted, marginTop: 2 },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bgAlt,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    section: {
      padding: spacing.md,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginBottom: spacing.sm,
    },
    sectionLabel: { ...typography.label, color: theme.textMuted },
    optional: { ...typography.caption, color: theme.textMuted, fontStyle: 'italic' },
    fieldRow: { flexDirection: 'row', gap: spacing.xs },
    input: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
    },
    textField: { flex: 1 },
    minutesWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 88,
      paddingVertical: 0,
    },
    minutesInput: {
      ...typography.bodyMedium,
      color: theme.textPrimary,
      flex: 1,
      textAlign: 'right',
      paddingVertical: spacing.sm,
      fontVariant: ['tabular-nums'],
    },
    minutesSuffix: {
      ...typography.bodySmall,
      color: theme.textMuted,
      marginLeft: spacing.xxs,
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.xxs,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 2,
      borderRadius: radius.full,
      backgroundColor: theme.accentSoft,
      maxWidth: '100%',
    },
    suggestionText: { ...typography.bodySmall, color: theme.accent, flexShrink: 1 },
    notesField: { minHeight: 120 },
    legend: {
      ...typography.caption,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
