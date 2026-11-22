import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
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
import type { OutboxEntry } from '../../lib/offline/ops';
import { journalNoteIdOf, unshownChanges } from '../../lib/journalLocal';
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
import { UndoQueue, memorizeSuggestion, missedFromSession } from '../../lib/activityAdd';
import { UndoToast } from '../../components/revision/UndoToast';
import { parsePageRange } from '../../lib/memorizationLog';
import { RangePickerSheet } from '../../components/memorization/RangePickerSheet';
import { describePassage, plainText } from '../../lib/passages';
import { revealAboveKeyboard } from '../../lib/revealAboveKeyboard';
import { tagFor } from '../../lib/noteTags';
import { layoutV2, radiusV2, typeV2 } from '../../theme/v2';
import { useHaptics } from '../../design/haptics';
import { ContextMenu } from '../../components/v2/ContextMenu';
import { TopBar } from '../../components/v2/TopBar';
import { Mark } from '../../components/v2/Mark';
import { PillButton } from '../../components/v2/PillButton';
import { PillTabs } from '../../components/v2/PillTabs';
import { RowText, ThreadRow } from '../../components/v2/ThreadRow';
import { Tap } from '../../components/v2/Tap';
import type { HomeStackParamList } from '../../navigation/MainNavigator';
import type { JournalEntry, JournalKind, JournalNote } from '../../types';
import { JOURNAL_KIND_ICONS } from './journalKinds';
import { t, formatTime } from '../../i18n';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'JournalEntry'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'JournalEntry'>;

const kindOptions = (): { value: JournalKind; label: string }[] => [
  { value: 'memorization', label: t('journal.kinds.memorization') },
  { value: 'revision', label: t('journal.kinds.revision') },
  { value: 'note', label: t('journal.kinds.note') },
];

type Draft = { text: string; minutes: string; tag?: string | null; from?: string; to?: string };
const EMPTY_DRAFT: Draft = { text: '', minutes: '' };
const EMPTY_DRAFTS: Record<JournalKind, Draft> = {
  memorization: EMPTY_DRAFT,
  revision: EMPTY_DRAFT,
  note: EMPTY_DRAFT,
};

const placeholder = (kind: JournalKind): string => t(`journal.placeholder.${kind}`);

/**
 * A day's log as a thread: each note is a row with its time and its ⋯ menu
 * (edit, delete); the composer at the bottom writes a new note. Every change
 * is saved on the phone at once and reaches the server when it can.
 */
// Re-reading the day while the server's copy is behind: after 1.5 s, 3 s, …
const REREAD_MS = 1500;
const MAX_REREADS = 6;

export default function JournalEntryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { user, logs, pages: allPages, updatePages } = useApp();
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
  // Opened from the Activity add menu on that kind's tab (C4); the default is Memorized.
  const [kind, setKind] = useState<JournalKind>(route.params?.kind ?? 'memorization');
  const [drafts, setDrafts] = useState<Record<JournalKind, Draft>>(EMPTY_DRAFTS);
  // A note being edited has a draft of its own, and its kind stays locked.
  const [editing, setEditing] = useState<{ note: JournalNote; draft: Draft } | null>(null);
  // The note whose ⋯ menu is open.
  const [menuNote, setMenuNote] = useState<JournalNote | null>(null);

  // The keyboard. While it is up for the composer, the top bar has Done, which puts it away: the bar
  // above the keyboard (InputAccessoryView) didn't show on iOS 26, and a tap outside the field doesn't
  // blur it in this list, so nothing on screen closed the keyboard. As it opens, the list scrolls once
  // so the composer's buttons sit above it: on an iPhone SE an edited note's Save was under it (E2E,
  // Nov 16 2026). Android doesn't resize the window for the keyboard, so the list gets room under it.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [typing, setTyping] = useState(false);
  const typingRef = useRef(false);
  const onFieldFocus = () => {
    typingRef.current = true;
    setTyping(true);
  };
  const onFieldBlur = () => {
    typingRef.current = false;
    setTyping(false);
  };
  const listRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const composerRef = useRef<View>(null);
  const actionsRef = useRef<View>(null);
  const scrollY = useRef(0);
  const [reveal, setReveal] = useState<{ keyboardTop: number } | null>(null);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0)),
      // Once a keyboard has opened for a composer field: not on every keystroke.
      Keyboard.addListener('keyboardDidShow', (e) => {
        if (typingRef.current) setReveal({ keyboardTop: e.endCoordinates.screenY });
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);
  // After the render that gave Android its room: the composer's buttons above the keyboard.
  useEffect(() => {
    if (!reveal) return;
    const list = listRef.current;
    const listView = list?.getNativeScrollRef();
    const composer = composerRef.current;
    const actions = actionsRef.current;
    if (!list || !listView || !composer || !actions) return;
    actions.measureInWindow((_ax, actionsTop, _aw, actionsHeight) => {
      composer.measureInWindow((_cx, composerTop) => {
        listView.measureInWindow((_lx, listTop) => {
          const y = revealAboveKeyboard({
            offset: scrollY.current,
            targetBottom: actionsTop + actionsHeight,
            blockTop: composerTop,
            listTop,
            keyboardTop: reveal.keyboardTop,
          });
          if (y != null) list.scrollTo({ y, animated: true });
        });
      });
    });
  }, [reveal]);

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
    sentRef.current = unshownChanges(entry, sentRef.current);
    // The last re-read still doesn't show a change: another phone changed that
    // note since. The server's copy is the truth then.
    if (sentRef.current.length > 0 && rereads.current >= MAX_REREADS && !rereadTimer.current) sentRef.current = [];
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
      sentRef.current = [];
      rereads.current = 0;
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
      rereads.current = 0; // a new change gets its own re-reads
    });
  }, [uid, date]);

  // A note swiped away goes at once, with Undo; its delete is saved once the undo window has
  // passed (ACT-6), and leaving the screen saves any delete still waiting.
  const undoQueue = useRef(new UndoQueue());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [undoNote, setUndoNote] = useState<string | null>(null);
  useEffect(() => {
    const queue = undoQueue.current;
    return () => queue.flush();
  }, []);

  const notes = useMemo(() => (day?.entries ?? []).filter((n) => !gone.has(n.id)), [day, gone]);
  const total = day ? journalTotalMinutes({ ...day, entries: notes }) : null;
  // What the composer shows: the kind being edited, or the kind's own draft.
  const composingKind: JournalKind = editing ? editing.note.kind : kind;
  const draft = editing ? editing.draft : drafts[kind];
  const noteTag = draft.tag ?? null;
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
    Alert.alert(t('journal.discard.title'), t('journal.discard.body'), [
      { text: t('journal.discard.keepEditing'), style: 'cancel' },
      {
        text: t('journal.discard.discard'),
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Offer to fill a revision from the in-app session logged that day, until
  // a revision with the same text is in the log: a session is added once.
  // Only what the session missed (its skipped pages, not revised): the pages it did
  // are already in the day's Revised block, so copying them would be a second entry.
  const sessionSuggestion = useMemo(() => {
    const log = logs.find((l) => l.date === date);
    if (!log) return null;
    const memorized = new Set((allPages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
    const missed = missedFromSession(log, memorized);
    if (missed.length === 0) return null;
    return { text: summarizeRevisedPages(missed), minutes: null as number | null };
  }, [logs, date, allPages]);
  const suggestionAdded =
    sessionSuggestion != null &&
    (day?.entries ?? []).some((n) => n.kind === 'revision' && n.text.trim() === sessionSuggestion.text);
  // The items a note can be tagged to (d8): the day's Revised, its memorizations and its reads.
  const [tagOptions, setTagOptions] = useState<{ tag: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => firestoreService.getActivityItemsForDay(date))
      .then((items) => {
        if (cancelled) return;
        setTagOptions([
          ...(items.revisions.some((r) => r.countsFor === date) ? [{ tag: tagFor('revision', date), label: t('journal.tags.revised') }] : []),
          ...items.memorized.map((m) => ({ tag: tagFor('memorization', m.id), label: t('journal.tags.memorized') })),
          ...items.reads.map((r) => ({ tag: tagFor('read', r.id), label: t('journal.tags.read') })),
        ]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [date]);
  // The Memorized suggestion (C4): pages read today that aren't memorized yet.
  const [readToday, setReadToday] = useState<number[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    firestoreService
      .getReadingSessionsForDay(date)
      .then((list) => !cancelled && setReadToday(list.flatMap((r) => r.pages)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [date]);
  const memorizeSugg = useMemo(() => {
    const memorized = new Set((allPages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
    return memorizeSuggestion(readToday, memorized);
  }, [readToday, allPages]);
  const showMemorizeSuggestion =
    composingKind === 'memorization' && memorizeSugg.length > 0 && text.trim() === '' && !editing;
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
    // A Memorized entry names pages (From and To): those pages are marked memorized today.
    const range = sendKind === 'memorization' && !editing ? parsePageRange(draft.from, draft.to) : null;
    if (sendKind === 'memorization' && !editing && (draft.from || draft.to) && !range) {
      Alert.alert(t('journal.checkPages.title'), t('journal.checkPages.body'));
      return;
    }
    // Named by surah and juz, not page numbers (lib/passages); stored as plain text.
    const rangeLabel = range ? plainText(describePassage(range)) : '';
    setSaving(true);
    try {
      if (editing) {
        if (trimmed === '' && minutes == null) {
          // Clearing an edited note deletes it.
          await queueChange({ kind: 'journal.entry.delete', date, id: editing.note.id });
        } else {
          const entry: JournalNote = {
            ...editing.note,
            kind: sendKind,
            text: trimmed,
            minutes,
            ...(sendKind === 'note' && noteTag ? { tag: noteTag } : {}),
          };
          await queueChange({ kind: 'journal.entry.edit', date, entry });
        }
        setEditing(null);
      } else {
        if (trimmed === '' && minutes == null && !range) return;
        if ((day?.entries.length ?? 0) >= JOURNAL_ENTRIES_PER_DAY) {
          Alert.alert(t('journal.full.title'), t('journal.full.body', { count: JOURNAL_ENTRIES_PER_DAY }));
          setSaving(false);
          return;
        }
        // Always a new note with its own id and time: Add never replaces one.
        if (range && user) {
          const memorizedNow = new Set((allPages ?? []).filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
          const changed = range.filter((p) => !memorizedNow.has(p));
          if (changed.length > 0) {
            const inRange = new Set(range);
            await updatePages(
              (allPages ?? []).map((p) =>
                inRange.has(p.pageNumber) && p.status !== 'memorized'
                  ? { ...p, status: 'memorized' as const, dateMemorized: new Date().toISOString() }
                  : p,
              ),
              changed,
            );
          }
          await queueChange({ kind: 'memorization.mark', day: getRevisionDayForUser(user), pages: range, at: Date.now() });
        }
        const entry: JournalNote = {
          id: autoId(),
          at: Date.now(),
          kind: sendKind,
          text: range ? trimmed || rangeLabel : trimmed,
          minutes,
          ...(sendKind === 'note' && noteTag ? { tag: noteTag } : {}),
        };
        await queueChange({ kind: 'journal.entry.add', date, entry });
        setDrafts((all) => ({ ...all, [sendKind]: EMPTY_DRAFT }));
      }
      haptics.success();
      refreshDay();
    } catch (err) {
      logger.error('Failed to save journal note', err);
      Alert.alert(t('journal.saveFailed'), t('common.pleaseTryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = (note: JournalNote) => {
    if (editing?.note.id === note.id) setEditing(null);
    setGone((g) => new Set(g).add(note.id));
    setUndoNote(note.id);
    undoQueue.current.schedule(`note-${note.id}`, () => {
      queueChange({ kind: 'journal.entry.delete', date, id: note.id }).catch((err) => {
        logger.error('Failed to delete journal note', err);
      });
    });
  };

  const undoDelete = () => {
    const id = undoNote;
    setUndoNote(null);
    if (!id) return;
    undoQueue.current.undo(`note-${id}`);
    setGone((g) => {
      const next = new Set(g);
      next.delete(id);
      return next;
    });
  };

  const deleteDay = () => {
    Alert.alert(t('journal.deleteDay.title', { day: formatJournalDay(date) }), t('journal.deleteDay.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            for (const n of notes) await queueChange({ kind: 'journal.entry.delete', date, id: n.id });
            setEditing(null);
            refreshDay();
          } catch (err) {
            logger.error('Failed to delete journal day', err);
            Alert.alert(t('journal.deleteFailed'), t('common.pleaseTryAgain'));
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
  const canSend = (editing != null || text.trim() !== '' || minutesText !== '' || parsePageRange(draft.from, draft.to) != null) && !saving && !loading && !loadFailed;
  const field = [typeV2.body, v2.field, { color: palette.text }];
  // A hold on a note (or its VoiceOver action) opens this menu. Delete is the
  // swipe: the note goes at once, with Undo.
  const openMenu = (note: JournalNote) => {
    haptics.selection();
    setMenuNote(note);
  };
  const menuActions = menuNote
    ? [
        { key: 'edit', label: t('common.edit'), icon: 'create-outline' as const, onPress: () => startEdit(menuNote) },
        ...(menuNote.text.trim() !== ''
          ? [
              {
                key: 'copy',
                label: t('common.copy'),
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
              {total != null ? t('journal.total', { minutes: formatMinutes(total) }) : formatJournalDay(date)}
            </Text>
          </View>
        }
        right={
          typing && keyboardHeight > 0 ? (
            <Tap
              onPress={() => Keyboard.dismiss()}
              accessibilityRole="button"
              accessibilityLabel={t('common.done')}
              accessibilityHint={t('journal.keyboardDoneHint')}
              hitSlop={8}
              testID="journal-keyboard-done"
            >
              <Text style={[typeV2.body, styles.done, { color: palette.accentText }]} maxFontSizeMultiplier={1.4}>
                {t('common.done')}
              </Text>
            </Tap>
          ) : null
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
            {t('journal.offline.title')}
          </Text>
          <Text style={[typeV2.body, { color: palette.secondary, textAlign: 'center' }]}>
            {t('journal.offline.body')}
          </Text>
          <PillButton
            title={t('common.tryAgain')}
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
          ref={listRef}
          style={styles.scroll}
          // iOS adds the keyboard's inset itself (automaticallyAdjustKeyboardInsets); Android, whose
          // window keeps its size, gets the room here.
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 + (Platform.OS === 'android' ? keyboardHeight : 0) }}
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
          }}
          testID="journal-v2"
        >
          {notes.map((n) => {
            const time = formatEntryTime(n.at, date, user);
            const body = n.text.trim();
            const label = JOURNAL_KIND_LABELS[n.kind];
            return (
              <SwipeRow
                key={n.id}
                testID={`journal-note-${n.id}`}
                accessibilityLabel={`${label}${body ? `, ${body}` : ''}, ${time}`}
                actions={[{ name: 'options', label: t('journal.options'), onPress: () => openMenu(n) }]}
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

          <View ref={composerRef} collapsable={false} testID="journal-composer-frame">
          <ThreadRow
            mark={<Mark icon={editing ? 'create-outline' : 'add-outline'} />}
            name={editing ? t(`journal.editing.${composingKind}`) : t('journal.newEntry')}
            meta={editing ? formatEntryTime(editing.note.at, date, user) : undefined}
            lineAbove
            separator={false}
            testID="journal-composer"
            footer={
              showSuggestion && sessionSuggestion ? (
                <Tap
                  onPress={fillFromSession}
                  style={[v2.suggestion, { borderColor: palette.outline }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('journal.fillFromSession')}
                  testID="journal-suggestion"
                >
                  <Ionicons name="sparkles-outline" size={14} color={palette.text} />
                  <Text style={[typeV2.meta, v2.suggestionText, { color: palette.text }]} numberOfLines={1}>
                    {t('journal.fromSession', { text: sessionSuggestion.text })}
                    {sessionSuggestion.minutes != null ? ` · ${formatMinutes(sessionSuggestion.minutes)}` : ''}
                  </Text>
                </Tap>
              ) : showMemorizeSuggestion ? (
                <Tap
                  onPress={() => setDraft({ text: plainText(describePassage(memorizeSugg)) })}
                  style={[v2.suggestion, { borderColor: palette.outline }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('journal.fillRead')}
                  testID="journal-memorize-suggestion"
                >
                  <Ionicons name="sparkles-outline" size={14} color={palette.text} />
                  <Text style={[typeV2.meta, v2.suggestionText, { color: palette.text }]} numberOfLines={1}>
                    {t('journal.readNotMemorized', { what: describePassage(memorizeSugg, { form: 'short' }) })}
                  </Text>
                </Tap>
              ) : composingKind === 'note' && tagOptions.length > 0 && !editing ? (
                <View style={v2.tagRow} testID="journal-tag-picker">
                  {[{ tag: null as string | null, label: t('journal.tags.untagged') }, ...tagOptions].map((o) => {
                    const chosen = noteTag === o.tag;
                    return (
                      <Tap
                        key={o.tag ?? 'untagged'}
                        onPress={() => setDraft({ tag: o.tag })}
                        style={[v2.suggestion, { borderColor: chosen ? palette.primary : palette.outline }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: chosen }}
                        accessibilityLabel={t('journal.tags.label', { tag: o.label })}
                      >
                        <Text style={[typeV2.meta, { color: palette.text }]}>{o.label}</Text>
                      </Tap>
                    );
                  })}
                </View>
              ) : undefined
            }
          >
            <RangePickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onUse={(r) => setDraft({ from: String(r.from), to: String(r.to) })} />
            <PillTabs
              options={kindOptions()}
              value={composingKind}
              onChange={setKind}
              disabled={editing != null}
              testID="journal-kind"
            />
            {composingKind === 'memorization' && !editing && (
              <View style={v2.fieldRow}>
                <PillButton
                  size="sm"
                  variant="outline"
                  title={t('journal.surahOrJuz')}
                  onPress={() => setPickerOpen(true)}
                  testID="memorize-pick"
                />
                <TextInput
                  value={draft.from ?? ''}
                  onChangeText={(v) => setDraft({ from: v.replace(/[^0-9]/g, '') })}
                  placeholder={t('journal.fromPage')}
                  placeholderTextColor={palette.secondary}
                  keyboardType="number-pad"
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                  style={[field, { flex: 1 }]}
                  accessibilityLabel={t('journal.fromPage')}
                  testID="memorize-from"
                />
                <TextInput
                  value={draft.to ?? ''}
                  onChangeText={(v) => setDraft({ to: v.replace(/[^0-9]/g, '') })}
                  placeholder={t('journal.toPage')}
                  placeholderTextColor={palette.secondary}
                  keyboardType="number-pad"
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                  style={[field, { flex: 1 }]}
                  accessibilityLabel={t('journal.toPage')}
                  testID="memorize-to"
                />
              </View>
            )}
            <View style={v2.fieldRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={placeholder(composingKind)}
                placeholderTextColor={palette.secondary}
                selectionColor={palette.accentText}
                multiline={composingKind === 'note'}
                maxLength={journalTextMax(composingKind)}
                textAlignVertical="top"
                onFocus={onFieldFocus}
                onBlur={onFieldBlur}
                style={[field, composingKind === 'note' && v2.notes]}
                accessibilityLabel={
                  composingKind === 'note'
                    ? t('journal.noteLabel')
                    : composingKind === 'memorization'
                      ? t('journal.whatMemorized')
                      : t('journal.whatRevised')
                }
                testID="journal-text-input"
              />
              {composingKind !== 'note' && (
                <MinutesFieldV2
                  value={minutesText}
                  onChange={setMinutesText}
                  label={t('journal.minutes')}
                  onFocus={onFieldFocus}
                  onBlur={onFieldBlur}
                />
              )}
            </View>
            <View ref={actionsRef} collapsable={false} style={v2.actions} testID="journal-actions">
              {editing && (
                <PillButton
                  title={t('common.cancel')}
                  size="sm"
                  variant="outline"
                  onPress={() => setEditing(null)}
                  testID="journal-cancel-edit"
                />
              )}
              <PillButton
                title={editing ? t('common.save') : t('journal.add')}
                size="sm"
                onPress={handleSend}
                disabled={!canSend}
                busy={saving}
                accessibilityLabel={editing ? t('journal.saveEntry') : t('journal.addEntry')}
                testID="journal-send"
              />
            </View>
          </ThreadRow>
          </View>

          {notes.length > 0 && (
            <Tap
              onPress={deleteDay}
              disabled={saving}
              style={[v2.deleteRow, { borderTopColor: palette.separator }]}
              accessibilityRole="button"
              accessibilityLabel={t('journal.deleteLog')}
              testID="journal-delete"
            >
              <Ionicons name="trash-outline" size={24} color={palette.red} />
              <Text style={[typeV2.body, { color: palette.red }]}>{t('journal.deleteLog')}</Text>
            </Tap>
          )}
        </ScrollView>
      )}


      <ContextMenu
        visible={menuNote != null}
        onClose={() => setMenuNote(null)}
        preview={
          menuNote
            ? {
                label: `${JOURNAL_KIND_LABELS[menuNote.kind]} · ${formatTime(new Date(menuNote.at))}`,
                text: menuNote.text.trim() || undefined,
              }
            : undefined
        }
        actions={menuActions}
        testID="journal-note-menu"
      />
    <RangePickerSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} onUse={(r) => setDraft({ from: String(r.from), to: String(r.to) })} />
      <UndoToast
        visible={undoNote != null}
        message={t('journal.noteDeleted')}
        actionLabel={t('common.undo')}
        onUndo={undoDelete}
        onDismiss={() => setUndoNote(null)}
        duration={5000}
        bottomInset={insets.bottom}
      />
    </TopSafeAreaView>
  );
}

/** Minutes beside a field (new design): a quiet chip that grows with its text. */
function MinutesFieldV2({
  value,
  onChange,
  label,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={[v2.minutes, { backgroundColor: palette.fill }]}>
      <TextInput
        value={value}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
        placeholder="0"
        placeholderTextColor={palette.secondary}
        selectionColor={palette.accentText}
        keyboardType="number-pad"
        onFocus={onFocus}
        onBlur={onBlur}
        maxLength={4}
        style={[typeV2.body, typeV2.numeral, v2.minutesInput, { color: palette.text }]}
        accessibilityLabel={label}
      />
      <Text style={[typeV2.meta, { color: palette.secondary }]}>{t('journal.min')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  failed: { gap: 12, paddingHorizontal: 32 },
  scroll: { flex: 1 },
  done: { fontWeight: '600' },
});

// The new design: rows on the ground, the fields borderless like a composer.
const v2 = StyleSheet.create({
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: layoutV2.gutter, paddingVertical: 8 },
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
