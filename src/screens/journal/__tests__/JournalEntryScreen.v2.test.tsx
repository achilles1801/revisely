import React from 'react';
import { Alert, Keyboard, Modal } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), dispatch: jest.fn() };
const mockRoute: { key: string; params: { date?: string } } = { key: 'j1', params: { date: '2026-10-20' } };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
  usePreventRemove: jest.fn(),
}));

const mockApp: any = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
const mockService = { getJournalEntry: jest.fn(), readingsForDay: jest.fn((..._args: unknown[]) => Promise.resolve([] as { id: string; pages: number[] }[])) };
jest.mock('../../../services/firestoreService', () => ({
  getJournalEntry: (...a: unknown[]) => mockService.getJournalEntry(...(a as [])),
  getReadingSessionsForDay: (...a: unknown[]) => mockService.readingsForDay(...(a as [])),
}));
// Changes go into the outbox (lib/offline), which sends them when it can.
const mockQueue = {
  queueChange: jest.fn(async () => ({})),
  withPendingJournalDay: jest.fn((_date: string, base: unknown) => base ?? null),
};
jest.mock('../../../lib/clipboard', () => ({ copyText: jest.fn() }));
// The outbox tells the screen when a change has been written (see emitOutbox).
let mockOutboxListeners: ((uid: string) => void)[] = [];
jest.mock('../../../lib/offline/outbox', () => ({
  subscribeOutbox: (fn: (uid: string) => void) => {
    mockOutboxListeners.push(fn);
    return () => {
      mockOutboxListeners = mockOutboxListeners.filter((l) => l !== fn);
    };
  },
}));
async function emitOutbox(uid: string) {
  await act(async () => {
    mockOutboxListeners.forEach((l) => l(uid));
  });
}
// The sync loop tells the screen a change was written, before it leaves the outbox.
let mockAppliedListeners: ((uid: string, e: unknown) => void)[] = [];
jest.mock('../../../lib/offline/sync', () => ({
  onApplied: (fn: (uid: string, e: unknown) => void) => {
    mockAppliedListeners.push(fn);
    return () => {
      mockAppliedListeners = mockAppliedListeners.filter((l) => l !== fn);
    };
  },
}));
async function emitApplied(uid: string, e: unknown) {
  await act(async () => {
    mockAppliedListeners.forEach((l) => l(uid, e));
  });
}
jest.mock('../../../lib/offline/queue', () => ({
  queueChange: (...a: unknown[]) => mockQueue.queueChange(...(a as [])),
  withPendingJournalDay: (...a: unknown[]) => mockQueue.withPendingJournalDay(...(a as [string, unknown])),
}));

import JournalEntryScreen from '../JournalEntryScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { JOURNAL_ENTRIES_PER_DAY, journalDayFromEntries, summarizeRevisedPages } from '../../../lib/journal';
import type { JournalNote } from '../../../types';
import { copyText } from '../../../lib/clipboard';

const palette = paletteV2(false, DEFAULT_ACCENT);
const AT = new Date(2026, 9, 20, 7, 12).getTime();
const memo: JournalNote = { id: 'n1', at: AT, kind: 'memorization', text: '1/2 p3', minutes: 20 };
const rev: JournalNote = { id: 'n2', at: AT + 3 * 3_600_000, kind: 'revision', text: '5p Maryam', minutes: null };

async function renderScreen() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <JournalEntryScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

// An ActionSheet runs its action once the sheet has closed.
async function chooseMenuAction(key: 'edit' | 'copy' | 'delete') {
  fireEvent.press(await screen.findByTestId(`sheet-action-${key}`));
  await act(async () => {
    screen.UNSAFE_getAllByType(Modal).forEach((m) => m.props.onDismiss?.());
  });
}

// A press and hold on a note (VoiceOver's "Options") opens its menu.
function holdNote(id: string) {
  fireEvent(screen.getByTestId(`journal-note-${id}`), 'accessibilityAction', { nativeEvent: { actionName: 'options' } });
}

// A swipe to the left reveals Delete; VoiceOver's "Delete" does the same, and it asks first.
function swipeDeleteNote(id: string) {
  fireEvent(screen.getByTestId(`journal-note-${id}`), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
}

async function pressSend() {
  await act(async () => {
    fireEvent.press(screen.getByTestId('journal-send'));
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockOutboxListeners = [];
  mockAppliedListeners = [];
  mockApp.user = { id: 'u1', createdAt: '2026-01-01T12:00:00.000Z', fajrBoundaryEnabled: false };
  mockApp.logs = [];
  mockService.getJournalEntry.mockResolvedValue(null);
  mockQueue.queueChange.mockImplementation(async () => ({}));
  mockQueue.withPendingJournalDay.mockImplementation((_date: string, base: unknown) => base ?? null);
});

type QueuedOp = { kind: string; date: string; entry?: JournalNote; id?: string };
/** The changes queued so far, in order. */
function queuedOps(): QueuedOp[] {
  return mockQueue.queueChange.mock.calls.map((c) => (c as unknown as [QueuedOp])[0]);
}

describe('the daily log: notes with their times', () => {
  it('a new day: the composer only, no rows and no delete row', async () => {
    await renderScreen();
    expect(screen.getByTestId('journal-v2')).toBeTruthy();
    expect(screen.getByTestId('journal-composer')).toBeTruthy();
    expect(screen.queryByTestId('journal-delete')).toBeNull();
    // No shorthand hint under the notes (#172).
    expect(screen.queryByText(/p = page/)).toBeNull();
    expect(screen.getByTestId('journal-send').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Memorized and Revised suggest in words, never the p/L shorthand', async () => {
    await renderScreen();
    const placeholder = () => screen.getByTestId('journal-text-input').props.placeholder as string;
    const shorthand = /\bp ?=|\bL ?=|\b\d+ ?[pL]\b|\bp\.? ?\d|\bL ?\d|\d\/\d/;
    expect(placeholder()).toBe('e.g. Al-Mulk, or pages 562–564');
    expect(placeholder()).not.toMatch(shorthand);
    fireEvent.press(screen.getByText('Revised'));
    expect(placeholder()).toBe('e.g. Maryam and Taha, or pages 305–321');
    expect(placeholder()).not.toMatch(shorthand);
  });

  it('lists the notes oldest first, each with its kind and its time', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [rev, memo]));
    await renderScreen();
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-n2')).toBeTruthy();
    expect(screen.getByText('7:12 am · 20m')).toBeTruthy();
    expect(screen.getByText('10:12 am')).toBeTruthy();
    expect(screen.getByText('1/2 p3')).toBeTruthy();
    expect(screen.getByLabelText('Revision, 5p Maryam, 10:12 am')).toBeTruthy();
    expect(screen.getByTestId('journal-delete')).toBeTruthy();
  });

  it('a note from before the day (after midnight, before fajr) shows its weekday', async () => {
    const late = new Date(2026, 9, 21, 0, 40).getTime();
    mockService.getJournalEntry.mockResolvedValue(
      journalDayFromEntries('2026-10-20', [{ id: 'late', at: late, kind: 'note', text: 'Tired', minutes: null }]),
    );
    await renderScreen();
    expect(screen.getByText('12:40 am Wed')).toBeTruthy();
  });
});

describe('adding, editing and deleting notes', () => {
  it('Add writes a timestamped entry and stays on the screen, with the composer cleared', async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByTestId('journal-text-input'), '  1/2 p3  ');
    fireEvent.changeText(screen.getByLabelText('Minutes'), '2a0');
    expect(screen.getByLabelText('Minutes').props.value).toBe('20');
    await pressSend();
    expect(mockQueue.queueChange).toHaveBeenCalledTimes(1);
    const [op] = mockQueue.queueChange.mock.calls[0] as unknown as [{ kind: string; date: string; entry: JournalNote }];
    expect(op).toMatchObject({
      kind: 'journal.entry.add',
      date: '2026-10-20',
      entry: { kind: 'memorization', text: '1/2 p3', minutes: 20 },
    });
    expect(typeof op.entry.id).toBe('string');
    expect(op.entry.at).toEqual(expect.any(Number));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('journal-text-input').props.value).toBe('');
  });

  it('a note has no minutes field, and its text is the note cap', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Note'));
    expect(screen.queryByLabelText('Minutes')).toBeNull();
    expect(screen.getByTestId('journal-text-input').props.maxLength).toBe(5000);
    fireEvent.press(screen.getByText('Revised'));
    expect(screen.getByTestId('journal-text-input').props.maxLength).toBe(200);
  });

  it('Edit from a note\'s ⋯ loads it into the composer and saves the same id and time', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    holdNote('n1');
    await chooseMenuAction('edit');
    expect(screen.getByText('Editing memorization')).toBeTruthy();
    expect(screen.getByTestId('journal-text-input').props.value).toBe('1/2 p3');
    fireEvent.changeText(screen.getByTestId('journal-text-input'), '2/3 p3');
    await pressSend();
    expect(mockQueue.queueChange).toHaveBeenCalledWith({
      kind: 'journal.entry.edit',
      date: '2026-10-20',
      entry: { ...memo, text: '2/3 p3' },
    });
  });

  it('clearing an edited note deletes it', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    holdNote('n1');
    await chooseMenuAction('edit');
    fireEvent.changeText(screen.getByTestId('journal-text-input'), '');
    fireEvent.changeText(screen.getByLabelText('Minutes'), '');
    await pressSend();
    expect(mockQueue.queueChange).toHaveBeenCalledWith({ kind: 'journal.entry.delete', date: '2026-10-20', id: 'n1' });
  });

  it('Delete on a note asks first, then queues its delete', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    const alert = jest.spyOn(Alert, 'alert');
    await renderScreen();
    swipeDeleteNote('n1');
    const buttons = alert.mock.calls.at(-1)?.[2] ?? [];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    expect(mockQueue.queueChange).toHaveBeenCalledWith({ kind: 'journal.entry.delete', date: '2026-10-20', id: 'n1' });
    alert.mockRestore();
  });

  it('a day already holding the most notes refuses another, without a write', async () => {
    const notes = Array.from({ length: JOURNAL_ENTRIES_PER_DAY }, (_, i) => ({
      id: `x${i}`,
      at: AT + i,
      kind: 'note' as const,
      text: 'n',
      minutes: null,
    }));
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', notes));
    const alert = jest.spyOn(Alert, 'alert');
    await renderScreen();
    fireEvent.changeText(screen.getByTestId('journal-text-input'), 'one more');
    await pressSend();
    expect(alert).toHaveBeenCalledWith('This day is full', expect.any(String));
    expect(mockQueue.queueChange).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it("offers what the day's session missed for a revision (its skipped pages), filling its text", async () => {
    mockApp.pages = [3, 4, 5, 6].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    mockApp.logs = [{ id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [5, 6], weaknessUpdates: [], durationMinutes: 25 }];
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    const chip = screen.getByTestId('journal-suggestion');
    fireEvent.press(chip);
    // In words, not the old "2p" shorthand. The session's own pages and minutes are not copied.
    expect(screen.getByTestId('journal-text-input').props.value).toMatch(/^2 pages\b/);
    expect(screen.getByLabelText('Minutes').props.value).toBe('');
  });

  it('a session that missed nothing offers no chip', async () => {
    mockApp.pages = [3, 4].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    mockApp.logs = [{ id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 25 }];
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    expect(screen.queryByTestId('journal-suggestion')).toBeNull();
  });
});

describe('the session suggestion is added once', () => {
  const SESSION = { id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [5, 6], weaknessUpdates: [], durationMinutes: 25 };
  const SUMMARY = summarizeRevisedPages([5, 6]);
  beforeEach(() => {
    mockApp.pages = [3, 4, 5, 6].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
  });

  it('Add from the chip hides it: the same revision is not offered twice', async () => {
    mockApp.logs = [SESSION];
    // The day shows what was queued, as it does on the phone.
    const pending: JournalNote[] = [];
    mockQueue.queueChange.mockImplementation(async (...args: unknown[]) => {
      const change = args[0] as QueuedOp;
      if (change.entry) pending.push(change.entry);
      return {};
    });
    mockQueue.withPendingJournalDay.mockImplementation((date: string, base: unknown) => {
      const notes = [...((base as { entries?: JournalNote[] } | null)?.entries ?? []), ...pending];
      return notes.length > 0 ? journalDayFromEntries(date, notes) : null;
    });
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    fireEvent.press(screen.getByTestId('journal-suggestion'));
    await pressSend();
    expect(queuedOps()).toEqual([
      expect.objectContaining({
        kind: 'journal.entry.add',
        entry: expect.objectContaining({ kind: 'revision', text: SUMMARY, minutes: null }),
      }),
    ]);
    // The log now holds that revision: the chip is gone.
    expect(screen.queryByTestId('journal-suggestion')).toBeNull();
  });

  it('a day that already has the same revision does not offer the chip', async () => {
    mockApp.logs = [SESSION];
    mockService.getJournalEntry.mockResolvedValue(
      journalDayFromEntries('2026-10-20', [{ id: 'r1', at: AT, kind: 'revision', text: SUMMARY, minutes: 25 }]),
    );
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    expect(screen.queryByTestId('journal-suggestion')).toBeNull();
  });

  it('switching to Note leaves the Revised draft behind: Note starts empty', async () => {
    mockApp.logs = [SESSION];
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    fireEvent.press(screen.getByTestId('journal-suggestion'));
    fireEvent.press(screen.getByText('Note'));
    expect(screen.getByTestId('journal-text-input').props.value).toBe('');
    // Back on Revised, its own draft is still there.
    fireEvent.press(screen.getByText('Revised'));
    expect(screen.getByTestId('journal-text-input').props.value).toBe(SUMMARY);
  });
});

describe('each kind has its own draft', () => {
  it('Add saves only the kind showing, and never carries its text into another kind', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Note'));
    fireEvent.changeText(screen.getByTestId('journal-text-input'), 'Watch the Maryam ayat');
    fireEvent.press(screen.getByText('Revised'));
    fireEvent.changeText(screen.getByTestId('journal-text-input'), '5p Maryam');
    fireEvent.changeText(screen.getByLabelText('Minutes'), '15');
    await pressSend();
    expect(queuedOps()).toHaveLength(1);
    expect(queuedOps()[0]).toMatchObject({
      kind: 'journal.entry.add',
      entry: { kind: 'revision', text: '5p Maryam', minutes: 15 },
    });
    // The note's unsaved text is untouched; the revision draft was cleared by its Add.
    expect(screen.getByTestId('journal-text-input').props.value).toBe('');
    fireEvent.press(screen.getByText('Note'));
    expect(screen.getByTestId('journal-text-input').props.value).toBe('Watch the Maryam ayat');
  });

  it('every Add of a note creates a new entry; none replaces an earlier one', async () => {
    await renderScreen();
    fireEvent.press(screen.getByText('Note'));
    fireEvent.changeText(screen.getByTestId('journal-text-input'), 'first');
    await pressSend();
    fireEvent.changeText(screen.getByTestId('journal-text-input'), 'second');
    await pressSend();
    const ops = queuedOps();
    expect(ops.map((o) => o.kind)).toEqual(['journal.entry.add', 'journal.entry.add']);
    expect(ops[0].entry?.id).not.toBe(ops[1].entry?.id);
    expect(ops.map((o) => o.entry?.text)).toEqual(['first', 'second']);
  });

  it('while a note is being edited the kind tabs are locked, and Save edits that note only', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    holdNote('n1');
    await chooseMenuAction('edit');
    fireEvent.press(screen.getByText('Note'));
    expect(screen.getByText('Editing memorization')).toBeTruthy();
    expect(screen.getByTestId('journal-text-input').props.value).toBe('1/2 p3');
    fireEvent.changeText(screen.getByTestId('journal-text-input'), '2/3 p3');
    await pressSend();
    expect(mockQueue.queueChange).toHaveBeenCalledTimes(1);
    expect(mockQueue.queueChange).toHaveBeenCalledWith({
      kind: 'journal.entry.edit',
      date: '2026-10-20',
      entry: { ...memo, text: '2/3 p3' },
    });
  });

  it("cancelling an edit leaves the other kinds' unsaved drafts as they were", async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    fireEvent.changeText(screen.getByTestId('journal-text-input'), 'half-written revision');
    holdNote('n1');
    await chooseMenuAction('edit');
    fireEvent.press(screen.getByTestId('journal-cancel-edit'));
    expect(screen.queryByText('Editing memorization')).toBeNull();
    expect(screen.getByTestId('journal-text-input').props.value).toBe('half-written revision');
    expect(mockQueue.queueChange).not.toHaveBeenCalled();
  });
});

describe('a note: hold for its menu, swipe for Delete', () => {
  it('the hold menu offers Edit and Copy; Delete is the swipe, not a menu item', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    holdNote('n1');
    expect(await screen.findByTestId('sheet-action-edit')).toBeTruthy();
    expect(screen.getByTestId('sheet-action-copy')).toBeTruthy();
    expect(screen.queryByTestId('sheet-action-delete')).toBeNull();
  });

  it('Copy puts the note text on the clipboard', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    holdNote('n1');
    await chooseMenuAction('copy');
    expect(copyText).toHaveBeenCalledWith('1/2 p3');
    expect(mockQueue.queueChange).not.toHaveBeenCalled();
  });

  it('a note with only minutes has no Copy', async () => {
    const minutesOnly: JournalNote = { id: 'm1', at: AT, kind: 'memorization', text: '', minutes: 15 };
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [minutesOnly]));
    await renderScreen();
    holdNote('m1');
    expect(await screen.findByTestId('sheet-action-edit')).toBeTruthy();
    expect(screen.queryByTestId('sheet-action-copy')).toBeNull();
  });

  it('the swipe Delete confirms before it queues the delete', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    const alert = jest.spyOn(Alert, 'alert');
    await renderScreen();
    swipeDeleteNote('n1');
    expect(alert).toHaveBeenCalledWith('Delete this entry?', expect.any(String), expect.any(Array));
    expect(mockQueue.queueChange).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('no ⋯ button is left on a note', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    expect(screen.queryByLabelText(/options$/)).toBeNull();
  });
});

describe('offline', () => {
  it("a day it can't read isn't editable, and Try again reads it again", async () => {
    mockService.getJournalEntry.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    await renderScreen();
    expect(screen.getByTestId('journal-offline')).toBeTruthy();
    expect(screen.queryByTestId('journal-composer')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('journal-retry'));
    });
    expect(screen.getByTestId('journal-composer')).toBeTruthy();
    expect(mockService.getJournalEntry).toHaveBeenCalledTimes(2);
  });

  it('a note still waiting on this phone shows, even when the day cannot be read', async () => {
    mockService.getJournalEntry.mockRejectedValueOnce(new Error('offline'));
    mockQueue.withPendingJournalDay.mockImplementation((_date: string, base: unknown) =>
      base ?? journalDayFromEntries('2026-10-20', [memo]),
    );
    await renderScreen();
    expect(screen.queryByTestId('journal-offline')).toBeNull();
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
  });
});

// A fake server: a change written to it is visible to the next read of the day,
// and the outbox then says so, as it does when a queued change is sent.
function serverWithOutbox() {
  const saved: JournalNote[] = [];
  mockService.getJournalEntry.mockImplementation(async () =>
    saved.length > 0 ? journalDayFromEntries('2026-10-20', [...saved]) : null,
  );
  mockQueue.queueChange.mockImplementation(async (...args: unknown[]) => {
    const op = args[0] as QueuedOp;
    if (op.kind === 'journal.entry.add' && op.entry) saved.push(op.entry);
    await emitOutbox('u1');
    return {};
  });
  return saved;
}

async function addNote(kind: 'memorization' | 'revision' | 'note', text: string) {
  fireEvent.press(screen.getByTestId(`pill-${kind}`));
  fireEvent.changeText(screen.getByTestId('journal-text-input'), text);
  await pressSend();
}

describe('adding notes one after another: each one stays', () => {
  it('a note saved stays in the list when the next one is added', async () => {
    serverWithOutbox();
    await renderScreen();
    await addNote('note', 'first');
    await addNote('note', 'second');
    await waitFor(() => expect(screen.getAllByTestId(/^journal-note-[A-Za-z0-9]+$/)).toHaveLength(2));
    expect(screen.getByText('first')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('second')).toBeTruthy());
  });
});

describe('reads of the day that answer out of order', () => {
  it('[LOG-1] a note just sent stays when an older read of the day answers last', async () => {
    // The outbox changes twice for one note: queued, then sent. The read that
    // started when it was queued is slow and answers last, with the day as it
    // was before (no note); the read after it was sent has it.
    const later: ((v: unknown) => void)[] = [];
    let reads = 0;
    mockService.getJournalEntry.mockImplementation(() => {
      reads += 1;
      if (reads === 1) return Promise.resolve(null); // the first load
      if (reads === 2) return new Promise((resolve) => later.push(resolve)); // slow, stale
      return Promise.resolve(journalDayFromEntries('2026-10-20', [memo]));
    });
    await renderScreen();
    await emitOutbox('u1'); // queued
    await emitOutbox('u1'); // sent
    await waitFor(() => expect(screen.getByTestId('journal-note-n1')).toBeTruthy());
    await act(async () => {
      later.forEach((resolve) => resolve(null));
    });
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
  });

  it('[LOG-1] an older read still shows when the newer one fails (offline)', async () => {
    // The first load is slow; a read started after it (the outbox changed)
    // fails. The first load's answer is still the newest there is, so it shows.
    const later: ((v: unknown) => void)[] = [];
    let reads = 0;
    mockService.getJournalEntry.mockImplementation(() => {
      reads += 1;
      if (reads === 1) return new Promise((resolve) => later.push(resolve)); // the first load, slow
      return Promise.reject(new Error('offline'));
    });
    await renderScreen();
    await emitOutbox('u1');
    await act(async () => {
      later.forEach((resolve) => resolve(journalDayFromEntries('2026-10-20', [memo])));
    });
    await waitFor(() => expect(screen.getByTestId('journal-note-n1')).toBeTruthy());
  });
});

describe('[LOG-1, LOG-2] a change already written stays until the server shows it', () => {
  // The real overlay, so changes laid over the server's copy show.
  const { overlayJournal } = jest.requireActual('../../../lib/offline/ops');
  beforeEach(() => {
    mockQueue.withPendingJournalDay.mockImplementation(
      (date: string, base: unknown, _uid?: unknown, sent?: unknown[]) =>
        overlayJournal(base ? [base] : [], sent ?? [], date)[0] ?? null,
    );
  });
  const added = { id: 'o1', at: AT, op: { kind: 'journal.entry.add', date: '2026-10-20', entry: memo } };
  const deleted = { id: 'o2', at: AT, op: { kind: 'journal.entry.delete', date: '2026-10-20', id: 'n1' } };

  it('[LOG-1] a note written stays when the read after it answers with the day as it was', async () => {
    let fresh = false;
    mockService.getJournalEntry.mockImplementation(() =>
      Promise.resolve(fresh ? journalDayFromEntries('2026-10-20', [memo]) : null),
    );
    await renderScreen();
    await emitApplied('u1', added); // written
    await emitOutbox('u1'); // it leaves the outbox; this read answers without it
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
    // The day is read again until the server's copy has it.
    fresh = true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    await waitFor(() => expect(mockService.getJournalEntry.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
  });

  it('[LOG-2] a note deleted stays gone when the read after it still has it', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [memo]));
    await renderScreen();
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
    await emitApplied('u1', deleted);
    await emitOutbox('u1'); // this read still has the note
    expect(screen.queryByTestId('journal-note-n1')).toBeNull();
  });

  it('a change the server never shows (another phone changed that note) gives way after the re-reads', async () => {
    jest.useFakeTimers();
    try {
      mockService.getJournalEntry.mockResolvedValue(null); // another phone deleted it right after
      await renderScreen();
      await emitApplied('u1', added);
      await emitOutbox('u1');
      expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
      for (let i = 0; i < 8; i++) {
        await act(async () => {
          jest.advanceTimersByTime(10_000);
        });
      }
      expect(screen.queryByTestId('journal-note-n1')).toBeNull();
      // A later change still gets re-read: its own count starts again.
      const calls = mockService.getJournalEntry.mock.calls.length;
      await emitApplied('u1', { ...added, id: 'o3', op: { ...added.op, entry: { ...memo, id: 'n9' } } });
      await emitOutbox('u1');
      await act(async () => {
        jest.advanceTimersByTime(2_000);
      });
      expect(mockService.getJournalEntry.mock.calls.length).toBeGreaterThan(calls + 1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('another day\'s change, or another account\'s, is not laid over this day', async () => {
    await renderScreen();
    await emitApplied('u2', added);
    await emitApplied('u1', { ...added, op: { ...added.op, date: '2026-10-21' } });
    await emitOutbox('u1');
    expect(screen.queryByTestId('journal-note-n1')).toBeNull();
  });
});

describe('the keyboard: a Done key puts it away', () => {
  it('the text and minutes fields carry the Done bar, which dismisses the keyboard', async () => {
    await renderScreen();
    expect(screen.getByTestId('journal-text-input').props.inputAccessoryViewID).toBe('journal-keyboard-done');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    fireEvent.press(screen.getByTestId('journal-keyboard-done'));
    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });
});

describe('the bottom of the log: one margin, not iOS’s inset on top of it', () => {
  it('the list leaves the inset to its own padding (iOS would add the home indicator again)', async () => {
    await renderScreen();
    expect(screen.getByTestId('journal-v2').props.contentInsetAdjustmentBehavior).toBe('never');
  });
});

describe('the Memorized suggestion (C4)', () => {
  it('offers the pages read today that are not memorized yet, and fills the draft', async () => {
    mockApp.pages = [1, 2, 3].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    mockService.readingsForDay.mockResolvedValue([{ id: 'r1', pages: [2, 7, 8] }]);
    await renderScreen();
    const chip = await screen.findByTestId('journal-memorize-suggestion');
    fireEvent.press(chip);
    expect(screen.getByTestId('journal-text-input').props.value).toMatch(/7/);
    expect(screen.getByTestId('journal-text-input').props.value).not.toMatch(/\b2\b/);
  });

  it('no chip when everything read today is memorized already', async () => {
    mockApp.pages = [1, 2].map((pageNumber) => ({ pageNumber, status: 'memorized' }));
    mockService.readingsForDay.mockResolvedValue([{ id: 'r1', pages: [2] }]);
    await renderScreen();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('journal-memorize-suggestion')).toBeNull();
  });
});

