import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { TopSafeAreaView } from '../../components/SafeAreaView';
import { SwipeRow } from '../../components/v2/SwipeRow';
import { copyText } from '../../lib/clipboard';
import {
  RouteProp,
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import * as firestoreService from '../../services/firestoreService';
import { autoId } from '../../lib/offline/apply';
import { queueChange, withPendingJournalDay } from '../../lib/offline/queue';
import { subscribeOutbox } from '../../lib/offline/outbox';
import { onApplied } from '../../lib/offline/sync';
import type { OutboxEntry, OutboxOp } from '../../lib/offline/ops';
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

type Draft = { text: string; minutes: string };
const EMPTY_DRAFT: Draft = { text: '', minutes: '' };
const EMPTY_DRAFTS: Record<JournalKind, Draft> = {
  memorization: EMPTY_DRAFT,
  revision: EMPTY_DRAFT,
  note: EMPTY_DRAFT,
};

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
// Re-reading the day while the server's copy is behind: after 1.5 s, 3 s, …
const REREAD_MS = 1500;
const MAX_REREADS = 6;

/** The note a change of `date`'s log is about, or null for any other change. */
export function journalNoteIdOf(op: OutboxOp, date: string): string | null {
  if (op.kind === 'journal.entry.add' || op.kind === 'journal.entry.edit') return op.date === date ? op.entry.id : null;
  if (op.kind === 'journal.entry.delete') return op.date === date ? op.id : null;
  return null;
}

/** Whether the server's copy of the day already shows a written change. */
export function journalChangeShown(e: OutboxEntry, day: JournalEntry | null): boolean {
  const op = e.op;
  const notes = day?.entries ?? [];
  if (op.kind === 'journal.entry.add' || op.kind === 'journal.entry.edit') {
    const n = notes.find((x) => x.id === op.entry.id);
    return n != null && n.text === op.entry.text && n.minutes === op.entry.minutes && n.kind === op.entry.kind;
  }
  if (op.kind === 'journal.entry.delete') return !notes.some((x) => x.id === op.id);
  return true;
}

export default function JournalEntryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { user, logs } = useApp();
  const { palette } = useTheme();
  const haptics = useHaptics();
  // This screen hides the tab bar, so the bottom is the home indicator's room
  // plus one margin, counted once.
  const insets = useSafeAreaInsets();

  // Fixed when the screen opens, so a note being written across fajr (or
  // midnight) still belongs to the day it was started on.
  const [today] = useState(() => getRevisionDayForUser(user));
  const date = route.params?.date ?? today;

  // The day as Firestore has it, and the same day with the changes still
  // waiting on this phone laid over it.
  const [, setBaseState] = useState<JournalEntry | null>(null);
  // The latest copy read from the server, for the handlers below (their closures can be older).
  const baseRef = useRef<JournalEntry | null>(null);
  const setBase = (entry: JournalEntry | null) => {
    baseRef.current = entry;
    setBaseState(entry);
  };
  const [day, setDay] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Offline, a day Firestore hasn't seen in this run can't be read: adding to
  // it then could leave out what the server has, so it waits for a connection
  // (a change still waiting on this phone shows, though).
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The composer. Each kind keeps its own unsaved draft, so switching tabs never
  // carries text across, and Add saves only the kind that is showing.
  const [kind, setKind] = useState<JournalKind>('memorization');
  const [drafts, setDrafts] = useState<Record<JournalKind, Draft>>(EMPTY_DRAFTS);
  // A note being edited has a draft of its own, and its kind stays locked.
  const [editing, setEditing] = useState<{ note: JournalNote; draft: Draft } | null>(null);
  // The note whose ⋯ menu is open.
  const [menuNote, setMenuNote] = useState<JournalNote | null>(null);

  // Reads of the day can overlap (the first load, and one after each outbox
  // change) and answer out of order: a read started before a note reached the
  // server can answer after one started once it had. An answer older than the
  // one shown is dropped, or the note just sent would drop out of view (seen in
  // E2E on a slow Android emulator: the second note of a day vanished after
  // sending). A newer read that fails (offline) leaves an older answer standing.
  const readSeq = useRef(0);
  const shownSeq = useRef(0);
  // Changes to this day already written, until a read of the day shows them. A
  // read started just after a change was written can still answer with the day
  // as it was before (seen in E2E on iOS: a note added, or one deleted, came
  // back as it was once the change was sent, and stayed so). These stay laid
  // over the server's copy until it has caught up, and the day is read again.
  const sentRef = useRef<OutboxEntry[]>([]);
  const rereads = useRef(0);
  const rereadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const withChanges = (entry: JournalEntry | null) =>
    withPendingJournalDay(date, entry, undefined, sentRef.current);
  const showRead = (seq: number, entry: JournalEntry | null) => {
    if (seq < shownSeq.current) return;
    shownSeq.current = seq;
    sentRef.current = sentRef.current.filter((e) => !journalChangeShown(e, entry));
    setBase(entry);
    setDay(withChanges(entry));
    if (sentRef.current.length === 0) {
      rereads.current = 0;
    } else if (!rereadTimer.current && rereads.current < MAX_REREADS) {
      // The server's copy is behind what this phone wrote: read it again soon.
      rereads.current += 1;
      rereadTimer.current = setTimeout(() => {
        rereadTimer.current = null;
        readDayRef.current();
      }, REREAD_MS * rereads.current);
    }
  };
  const readDay = () => {
    const seq = ++readSeq.current;
    firestoreService
      .getJournalEntry(date)
      .then((entry) => showRead(seq, entry))
      .catch(() => undefined); // offline: the changes still waiting stay laid over the last copy
  };
  const readDayRef = useRef(readDay);
  readDayRef.current = readDay;
  useEffect(
    () => () => {
      if (rereadTimer.current) clearTimeout(rereadTimer.current);
      rereadTimer.current = null;
    },
    [date],
  );

  useEffect(() => {
    let cancelled = false;
    const seq = ++readSeq.current;
    setLoadFailed(false);
    firestoreService
      .getJournalEntry(date)
      .then((entry) => {
        if (!cancelled) showRead(seq, entry);
      })
      .catch((err) => {
        if (cancelled || seq < shownSeq.current) return;
        const waiting = withChanges(null);
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
  const refreshDay = () => setDay(withChanges(baseRef.current));

  // A change leaves the outbox once it is written, and then only the server's
  // copy of the day has it. So whenever the outbox changes, read the day again:
  // otherwise the note just saved drops out of view and the next Add looks like
  // it replaced it.
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    return subscribeOutbox((changed) => {
      if (changed === uid) readDayRef.current();
    });
  }, [uid, date]);

  // A change of this day is written (it leaves the outbox right after): keep it
  // laid over until a read shows it. Only the newest change of a note is kept.
  useEffect(() => {
    if (!uid) return;
    return onApplied((changed, e) => {
      if (changed !== uid) return;
      const id = journalNoteIdOf(e.op, date);
      if (id == null) return;
      sentRef.current = [...sentRef.current.filter((s) => journalNoteIdOf(s.op, date) !== id), e];
    });
  }, [uid, date]);

  const notes = useMemo(() => day?.entries ?? [], [day]);
  const total = day ? journalTotalMinutes(day) : null;
  // What the composer shows: the kind being edited, or the kind's own draft.
  const composingKind: JournalKind = editing ? editing.note.kind : kind;
  const draft = editing ? editing.draft : drafts[kind];
  const text = draft.text;
  const minutesText = draft.minutes;
  const setDraft = (patch: Partial<Draft>) => {
    if (editing) setEditing({ ...editing, draft: { ...editing.draft, ...patch } });
    else setDrafts((all) => ({ ...all, [kind]: { ...all[kind], ...patch } }));
  };
  const setText = (value: string) => setDraft({ text: value });
  const setMinutesText = (value: string) => setDraft({ minutes: value });

  const unsavedDraft =
    (editing != null) ||
    Object.values(drafts).some((d) => d.text.trim() !== '' || d.minutes !== '');

  // Guards the back button and (on native-stack) the swipe-back gesture.
  usePreventRemove(unsavedDraft && !saving, ({ data }) => {
    Alert.alert('Discard changes?', "You haven't saved this note.", [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Offer to fill a revision from the in-app session logged that day, until
  // a revision with the same text is in the log: a session is added once.
  const sessionSuggestion = useMemo(() => {
    const log = logs.find((l) => l.date === date);
    if (!log || log.pagesRevised.length === 0) return null;
    return {
      text: summarizeRevisedPages(log.pagesRevised),
      minutes: log.durationMinutes,
    };
  }, [logs, date]);
  const suggestionAdded =
    sessionSuggestion != null &&
    (day?.entries ?? []).some((n) => n.kind === 'revision' && n.text.trim() === sessionSuggestion.text);
  const showSuggestion =
    composingKind === 'revision' &&
    sessionSuggestion != null &&
    !suggestionAdded &&
    text.trim() === '' &&
    minutesText === '' &&
    !editing;

  // Editing locks the tabs to the note's kind; Cancel or Save returns to the tab
  // that was showing, with its draft as it was.
  const startEdit = (note: JournalNote) => {
    setEditing({
      note,
      draft: { text: note.text, minutes: note.minutes?.toString() ?? '' },
    });
  };

  const handleSend = async () => {
    const sendKind = composingKind;
    const trimmed = text.trim().slice(0, journalTextMax(sendKind));
    // The minutes are for memorization and revision; a note has none.
    const minutes = sendKind === 'note' ? null : parseMinutesInput(minutesText);
    setSaving(true);
    try {
      if (editing) {
        if (trimmed === '' && minutes == null) {
          // Clearing an edited note deletes it.
          await queueChange({ kind: 'journal.entry.delete', date, id: editing.note.id });
        } else {
          const entry: JournalNote = { ...editing.note, kind: sendKind, text: trimmed, minutes };
          await queueChange({ kind: 'journal.entry.edit', date, entry });
        }
        setEditing(null);
      } else {
        if (trimmed === '' && minutes == null) return;
        if ((day?.entries.length ?? 0) >= JOURNAL_ENTRIES_PER_DAY) {
          Alert.alert('This day is full', `A day holds up to ${JOURNAL_ENTRIES_PER_DAY} entries.`);
          setSaving(false);
          return;
        }
        // Always a new note with its own id and time: Add never replaces one.
        const entry: JournalNote = { id: autoId(), at: Date.now(), kind: sendKind, text: trimmed, minutes };
        await queueChange({ kind: 'journal.entry.add', date, entry });
        setDrafts((all) => ({ ...all, [sendKind]: EMPTY_DRAFT }));
      }
      haptics.success();
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
            if (editing?.note.id === note.id) setEditing(null);
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
            setEditing(null);
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

  // Fills the Revised draft only; the other kinds' drafts are left as they are.
  const fillFromSession = () => {
    if (!sessionSuggestion) return;
    setDrafts((all) => ({
      ...all,
      revision: { text: sessionSuggestion.text, minutes: sessionSuggestion.minutes?.toString() ?? '' },
    }));
  };

  // Saving an edited note with nothing left in it deletes it.
  const canSend = (editing != null || text.trim() !== '' || minutesText !== '') && !saving && !loading && !loadFailed;
  const field = [typeV2.body, v2.field, { color: palette.text }];
  // A hold on a note (or its VoiceOver action) opens this menu. Delete is the
  // swipe: it confirms before it removes the note.
  const openMenu = (note: JournalNote) => {
    haptics.selection();
    setMenuNote(note);
  };
  const menuActions = menuNote
    ? [
        { key: 'edit', label: 'Edit', icon: 'create-outline' as const, onPress: () => startEdit(menuNote) },
        ...(menuNote.text.trim() !== ''
          ? [
              {
                key: 'copy',
                label: 'Copy',
                icon: 'copy-outline' as const,
                onPress: () => {
                  copyText(menuNote.text.trim());
                  haptics.selection();
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <TopSafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
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
        // iOS would add the home indicator's inset again: the padding below is the only one.
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          testID="journal-v2"
        >
          {notes.map((n) => {
            const time = formatEntryTime(n.at, date);
            const body = n.text.trim();
            const label = JOURNAL_KIND_LABELS[n.kind];
            return (
              <SwipeRow
                key={n.id}
                testID={`journal-note-${n.id}`}
                accessibilityLabel={`${label}${body ? `, ${body}` : ''}, ${time}`}
                actions={[{ name: 'options', label: 'Options', onPress: () => openMenu(n) }]}
                onHold={() => openMenu(n)}
                onDelete={() => deleteNote(n)}
              >
                <ThreadRow
                  mark={<Mark icon={JOURNAL_KIND_ICONS[n.kind]} />}
                  name={label}
                  meta={n.minutes != null ? `${time} · ${formatMinutes(n.minutes)}` : time}
                  lineAbove
                  lineBelow
                  separator={false}
                >
                  {body ? <RowText numberOfLines={12}>{body}</RowText> : null}
                </ThreadRow>
              </SwipeRow>
            );
          })}

          <ThreadRow
            mark={<Mark icon={editing ? 'create-outline' : 'add-outline'} />}
            name={editing ? `Editing ${JOURNAL_KIND_LABELS[composingKind].toLowerCase()}` : 'New entry'}
            meta={editing ? formatEntryTime(editing.note.at, date) : undefined}
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
            <PillTabs
              options={KIND_OPTIONS}
              value={composingKind}
              onChange={setKind}
              disabled={editing != null}
              testID="journal-kind"
            />
            <View style={v2.fieldRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={PLACEHOLDER[composingKind]}
                placeholderTextColor={palette.secondary}
                selectionColor={palette.accentText}
                multiline={composingKind === 'note'}
                maxLength={journalTextMax(composingKind)}
                textAlignVertical="top"
                inputAccessoryViewID={KEYBOARD_DONE_ID}
                style={[field, composingKind === 'note' && v2.notes]}
                accessibilityLabel={
                  composingKind === 'note'
                    ? 'Note'
                    : `What you ${composingKind === 'memorization' ? 'memorized' : 'revised'}`
                }
                testID="journal-text-input"
              />
              {composingKind !== 'note' && (
                <MinutesFieldV2 value={minutesText} onChange={setMinutesText} label="Minutes" />
              )}
            </View>
            <View style={v2.actions}>
              {editing && (
                <PillButton
                  title="Cancel"
                  size="sm"
                  variant="outline"
                  onPress={() => setEditing(null)}
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

      {Platform.OS === 'ios' && (
        // The bar above the keyboard: one Done key puts the keyboard away for
        // a note or the minutes, whichever is typing.
        <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
          <View style={[styles.doneBar, { backgroundColor: palette.bg, borderTopColor: palette.separator }]}>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel="Done"
              testID="journal-keyboard-done"
              hitSlop={8}
            >
              <Text style={[typeV2.body, { color: palette.accentText, fontWeight: '600' }]}>Done</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}

      <ActionSheet
        visible={menuNote != null}
        onClose={() => setMenuNote(null)}
        title={menuNote ? JOURNAL_KIND_LABELS[menuNote.kind] : undefined}
        actions={menuActions}
        testID="journal-note-menu"
      />
    </TopSafeAreaView>
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
        inputAccessoryViewID={KEYBOARD_DONE_ID}
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
  doneBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: layoutV2.gutter,
    paddingVertical: 8,
    borderTopWidth: layoutV2.hairline,
  },
});

/** The iOS keyboard bar with Done, shown above the note and minutes fields. */
const KEYBOARD_DONE_ID = 'journal-keyboard-done';

// The new design: rows on the ground, the fields borderless like a composer.
const v2 = StyleSheet.create({
  titleBox: { alignItems: 'center' },
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
