import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from '../../components/SafeAreaView';
import {
  RouteProp,
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { autoId } from '../../lib/offline/apply';
import { queueChange, withPendingJournalDay } from '../../lib/offline/queue';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import {
  JOURNAL_ENTRIES_PER_DAY,
  JOURNAL_KIND_LABELS,
  formatEntryTime,
  formatJournalDay,
  formatJournalDayRelative,
  formatMinutes,
  journalTextMax,
  journalTotalMinutes,
  parseMinutesInput,
  summarizeRevisedPages,
} from '../../lib/journal';
import { logger } from '../../lib/logger';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { useHaptics } from '../../design/haptics';
import { ActionSheet } from '../../components/v2/ActionSheet';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { RowText, ThreadRow } from '../../components/v2/ThreadRow';
import { Tap } from '../../components/v2/Tap';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, JournalKind, JournalNote } from '../../types';
import { JOURNAL_KIND_ICONS } from './journalKinds';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'JournalEntry'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'JournalEntry'>;

const KIND_OPTIONS: { value: JournalKind; label: string }[] = [
  { value: 'memorization', label: 'Memorized' },
  { value: 'revision', label: 'Revised' },
  { value: 'note', label: 'Note' },
];

const PLACEHOLDER: Record<JournalKind, string> = {
  memorization: 'e.g. Al-Mulk, or pages 562–564',
  revision: 'e.g. Maryam and Taha, or pages 305–321',
  note: 'How did it go? Mistakes to watch, ayat to repeat…',
};

/**
 * A day's log as a thread: each note is a row with its time and its ⋯ menu
 * (edit, delete); the composer at the bottom writes a new note. Every change
 * is saved on the phone at once and reaches the server when it can.
 */
export default function JournalEntryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { user, logs } = useApp();
  const { palette } = useTheme();
  const haptics = useHaptics();

  // Fixed when the screen opens, so a note being written across fajr (or
  // midnight) still belongs to the day it was started on.
  const [today] = useState(() => getRevisionDayForUser(user));
  const date = route.params?.date ?? today;

  // The day as Firestore has it, and the same day with the changes still
  // waiting on this phone laid over it.
  const [base, setBase] = useState<JournalEntry | null>(null);
  const [day, setDay] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Offline, a day Firestore hasn't seen in this run can't be read: adding to
  // it then could leave out what the server has, so it waits for a connection
  // (a change still waiting on this phone shows, though).
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The composer: a new note, or the note being edited.
  const [kind, setKind] = useState<JournalKind>('memorization');
  const [text, setText] = useState('');
  const [minutesText, setMinutesText] = useState('');
  const [editing, setEditing] = useState<JournalNote | null>(null);
  // The note whose ⋯ menu is open.
  const [menuNote, setMenuNote] = useState<JournalNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    firestoreService
      .getJournalEntry(date)
      .then((entry) => {
        if (cancelled) return;
        setBase(entry);
        setDay(withPendingJournalDay(date, entry));
      })
      .catch((err) => {
        if (cancelled) return;
        const waiting = withPendingJournalDay(date, null);
        if (waiting) return setDay(waiting);
        logger.warn('Failed to load journal day', err);
        setLoadFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date, attempt]);

  // After a change is queued: show the day again with it laid over.
  const refreshDay = () => setDay(withPendingJournalDay(date, base));

  const notes = useMemo(() => day?.entries ?? [], [day]);
  const total = day ? journalTotalMinutes(day) : null;
  const composerDirty = text.trim() !== '' || minutesText !== '';

  // Guards the back button and (on native-stack) the swipe-back gesture.
  usePreventRemove(composerDirty && !saving, ({ data }) => {
    Alert.alert('Discard changes?', "You haven't saved this note.", [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Offer to fill a revision from the in-app session logged that day.
  const sessionSuggestion = useMemo(() => {
    const log = logs.find((l) => l.date === date);
    if (!log || log.pagesRevised.length === 0) return null;
    return {
      text: summarizeRevisedPages(log.pagesRevised),
      minutes: log.durationMinutes,
    };
  }, [logs, date]);
  const showSuggestion =
    kind === 'revision' && sessionSuggestion != null && text.trim() === '' && minutesText === '' && !editing;

  const resetComposer = () => {
    setText('');
    setMinutesText('');
    setEditing(null);
  };

  const startEdit = (note: JournalNote) => {
    setEditing(note);
    setKind(note.kind);
    setText(note.text);
    setMinutesText(note.minutes?.toString() ?? '');
  };

  const handleSend = async () => {
    const trimmed = text.trim().slice(0, journalTextMax(kind));
    // The minutes are for memorization and revision; a note has none.
    const minutes = kind === 'note' ? null : parseMinutesInput(minutesText);
    setSaving(true);
    try {
      if (trimmed === '' && minutes == null) {
        // Clearing an edited note deletes it.
        if (editing) await queueChange({ kind: 'journal.entry.delete', date, id: editing.id });
      } else if (editing) {
        const entry: JournalNote = { ...editing, kind, text: trimmed, minutes };
        await queueChange({ kind: 'journal.entry.edit', date, entry });
      } else {
        if ((day?.entries.length ?? 0) >= JOURNAL_ENTRIES_PER_DAY) {
          Alert.alert('This day is full', `A day holds up to ${JOURNAL_ENTRIES_PER_DAY} entries.`);
          setSaving(false);
          return;
        }
        const entry: JournalNote = { id: autoId(), at: Date.now(), kind, text: trimmed, minutes };
        await queueChange({ kind: 'journal.entry.add', date, entry });
      }
      haptics.success();
      resetComposer();
      refreshDay();
    } catch (err) {
      logger.error('Failed to save journal note', err);
      Alert.alert("Couldn't save", 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = (note: JournalNote) => {
    Alert.alert('Delete this entry?', 'It is removed from the log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await queueChange({ kind: 'journal.entry.delete', date, id: note.id });
            if (editing?.id === note.id) resetComposer();
            refreshDay();
          } catch (err) {
            logger.error('Failed to delete journal note', err);
            Alert.alert("Couldn't delete", 'Please try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const deleteDay = () => {
    Alert.alert(`Delete ${formatJournalDay(date)}?`, 'This removes every entry for this day.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            for (const n of notes) await queueChange({ kind: 'journal.entry.delete', date, id: n.id });
            resetComposer();
            refreshDay();
          } catch (err) {
            logger.error('Failed to delete journal day', err);
            Alert.alert("Couldn't delete", 'Please try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const fillFromSession = () => {
    if (!sessionSuggestion) return;
    setText(sessionSuggestion.text);
    setMinutesText(sessionSuggestion.minutes?.toString() ?? '');
  };

  // Saving an edited note with nothing left in it deletes it.
  const canSend = (editing != null || text.trim() !== '' || minutesText !== '') && !saving && !loading && !loadFailed;
  const field = [typeV2.body, v2.field, { color: palette.text }];
  const menuActions = menuNote
    ? [
        { key: 'edit', label: 'Edit', icon: 'create-outline' as const, onPress: () => startEdit(menuNote) },
        {
          key: 'delete',
          label: 'Delete',
          icon: 'trash-outline' as const,
          destructive: true,
          onPress: () => deleteNote(menuNote),
        },
      ]
    : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <TopBar
        onBack={() => navigation.goBack()}
        center={
          <View style={v2.titleBox}>
            <Text
              style={[typeV2.barTitle, { color: palette.text }]}
              numberOfLines={1}
              accessibilityRole="header"
              maxFontSizeMultiplier={1.4}
            >
              {formatJournalDayRelative(date, today)}
            </Text>
            <Text style={[typeV2.meta, { color: palette.secondary }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
              {total != null ? `Total ${formatMinutes(total)}` : formatJournalDay(date)}
            </Text>
          </View>
        }
        separator
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.secondary} />
        </View>
      ) : loadFailed ? (
        <View style={[styles.center, styles.failed]} testID="journal-offline">
          <Text style={[typeV2.name, { color: palette.text, textAlign: 'center' }]}>
            {"Couldn't load this day's log"}
          </Text>
          <Text style={[typeV2.body, { color: palette.secondary, textAlign: 'center' }]}>
            Connect to the internet to see and add to it.
          </Text>
          <PillButton
            title="Try again"
            variant="outline"
            onPress={() => {
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
            testID="journal-retry"
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={v2.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          testID="journal-v2"
        >
          {notes.map((n) => {
            const time = formatEntryTime(n.at, date);
            const text = n.text.trim();
            return (
              <ThreadRow
                key={n.id}
                mark={<Mark icon={JOURNAL_KIND_ICONS[n.kind]} />}
                name={JOURNAL_KIND_LABELS[n.kind]}
                meta={n.minutes != null ? `${time} · ${formatMinutes(n.minutes)}` : time}
                onMenu={() => setMenuNote(n)}
                menuLabel={`${JOURNAL_KIND_LABELS[n.kind]} options`}
                lineAbove
                lineBelow
                separator={false}
                testID={`journal-note-${n.id}`}
              >
                {text ? <RowText numberOfLines={12}>{text}</RowText> : null}
              </ThreadRow>
            );
          })}

          <ThreadRow
            mark={<Mark icon={editing ? 'create-outline' : 'add-outline'} />}
            name={editing ? `Editing ${JOURNAL_KIND_LABELS[editing.kind].toLowerCase()}` : 'New entry'}
            meta={editing ? formatEntryTime(editing.at, date) : undefined}
            lineAbove
            separator={false}
            testID="journal-composer"
            footer={
              showSuggestion && sessionSuggestion ? (
                <Tap
                  onPress={fillFromSession}
                  style={[v2.suggestion, { borderColor: palette.outline }]}
                  accessibilityRole="button"
                  accessibilityLabel="Fill from your session"
                  testID="journal-suggestion"
                >
                  <Ionicons name="sparkles-outline" size={14} color={palette.text} />
                  <Text style={[typeV2.meta, v2.suggestionText, { color: palette.text }]} numberOfLines={1}>
                    From your session: {sessionSuggestion.text}
                    {sessionSuggestion.minutes != null ? ` · ${formatMinutes(sessionSuggestion.minutes)}` : ''}
                  </Text>
                </Tap>
              ) : undefined
            }
          >
            <PillTabs options={KIND_OPTIONS} value={kind} onChange={setKind} testID="journal-kind" />
            <View style={v2.fieldRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={PLACEHOLDER[kind]}
                placeholderTextColor={palette.secondary}
                selectionColor={palette.accentText}
                multiline={kind === 'note'}
                maxLength={journalTextMax(kind)}
                textAlignVertical="top"
                style={[field, kind === 'note' && v2.notes]}
                accessibilityLabel={kind === 'note' ? 'Note' : `What you ${kind === 'memorization' ? 'memorized' : 'revised'}`}
                testID="journal-text-input"
              />
              {kind !== 'note' && (
                <MinutesFieldV2 value={minutesText} onChange={setMinutesText} label="Minutes" />
              )}
            </View>
            <View style={v2.actions}>
              {editing && (
                <PillButton
                  title="Cancel"
                  size="sm"
                  variant="outline"
                  onPress={resetComposer}
                  testID="journal-cancel-edit"
                />
              )}
              <PillButton
                title={editing ? 'Save' : 'Add'}
                size="sm"
                onPress={handleSend}
                disabled={!canSend}
                busy={saving}
                accessibilityLabel={editing ? 'Save entry' : 'Add entry'}
                testID="journal-send"
              />
            </View>
          </ThreadRow>

          {notes.length > 0 && (
            <Tap
              onPress={deleteDay}
              disabled={saving}
              style={[v2.deleteRow, { borderTopColor: palette.separator }]}
              accessibilityRole="button"
              accessibilityLabel="Delete this day's log"
              testID="journal-delete"
            >
              <Ionicons name="trash-outline" size={24} color={palette.red} />
              <Text style={[typeV2.body, { color: palette.red }]}>Delete this day's log</Text>
            </Tap>
          )}
        </ScrollView>
      )}

      <ActionSheet
        visible={menuNote != null}
        onClose={() => setMenuNote(null)}
        title={menuNote ? JOURNAL_KIND_LABELS[menuNote.kind] : undefined}
        actions={menuActions}
        testID="journal-note-menu"
      />
    </SafeAreaView>
  );
}

/** Minutes beside a field (new design): a quiet chip that grows with its text. */
function MinutesFieldV2({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={[v2.minutes, { backgroundColor: palette.fill }]}>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={palette.secondary}
        selectionColor={palette.accentText}
        keyboardType="number-pad"
        maxLength={4}
        style={[typeV2.body, typeV2.numeral, v2.minutesInput, { color: palette.text }]}
        accessibilityLabel={label}
      />
      <Text style={[typeV2.meta, { color: palette.secondary }]}>min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { gap: 12, paddingHorizontal: 32 },
  scroll: { flex: 1 },
});

// The new design: rows on the ground, the fields borderless like a composer.
const v2 = StyleSheet.create({
  titleBox: { alignItems: 'center' },
  content: { paddingBottom: 48 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  field: { flex: 1, paddingVertical: 6, paddingHorizontal: 0 },
  // A minimum, not a height: the field grows with its text and with Dynamic Type.
  notes: { minHeight: 96 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 },
  minutes: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 76,
    paddingHorizontal: 10,
    borderRadius: radiusV2.chip,
    gap: 4,
  },
  minutesInput: { flexGrow: 1, minWidth: 28, textAlign: 'right', paddingVertical: 6 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radiusV2.pill,
    borderWidth: 1,
  },
  suggestionText: { flexShrink: 1 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: layoutV2.gutter,
    borderTopWidth: layoutV2.hairline,
  },
});
