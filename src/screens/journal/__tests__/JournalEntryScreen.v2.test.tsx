import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
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
const mockService = { getJournalEntry: jest.fn() };
jest.mock('../../../services/firestoreService', () => ({
  getJournalEntry: (...a: unknown[]) => mockService.getJournalEntry(...(a as [])),
}));
// Changes go into the outbox (lib/offline), which sends them when it can.
const mockQueue = {
  queueChange: jest.fn(async () => ({})),
  withPendingJournalDay: jest.fn((_date: string, base: unknown) => base ?? null),
};
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
async function chooseMenuAction(key: 'edit' | 'delete') {
  fireEvent.press(await screen.findByTestId(`sheet-action-${key}`));
  await act(async () => {
    screen.UNSAFE_getAllByType(Modal).forEach((m) => m.props.onDismiss?.());
  });
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
  mockApp.user = { createdAt: '2026-01-01T12:00:00.000Z', fajrBoundaryEnabled: false };
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

  it('lists the notes oldest first, each with its kind, its time and its ⋯ menu', async () => {
    mockService.getJournalEntry.mockResolvedValue(journalDayFromEntries('2026-10-20', [rev, memo]));
    await renderScreen();
    expect(screen.getByTestId('journal-note-n1')).toBeTruthy();
    expect(screen.getByTestId('journal-note-n2')).toBeTruthy();
    expect(screen.getByText('7:12 am · 20m')).toBeTruthy();
    expect(screen.getByText('10:12 am')).toBeTruthy();
    expect(screen.getByText('1/2 p3')).toBeTruthy();
    expect(screen.getByLabelText('Revision options')).toBeTruthy();
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
    fireEvent.press(screen.getByLabelText('Memorization options'));
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
    fireEvent.press(screen.getByLabelText('Memorization options'));
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
    fireEvent.press(screen.getByLabelText('Memorization options'));
    await chooseMenuAction('delete');
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

  it("offers the day's session for a revision, filling its text and minutes", async () => {
    mockApp.logs = [{ id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 25 }];
    await renderScreen();
    fireEvent.press(screen.getByText('Revised'));
    const chip = screen.getByTestId('journal-suggestion');
    fireEvent.press(chip);
    // In words, not the old "2p" shorthand.
    expect(screen.getByTestId('journal-text-input').props.value).toMatch(/^2 pages\b/);
    expect(screen.getByLabelText('Minutes').props.value).toBe('25');
  });
});

describe('the session suggestion is added once', () => {
  const SESSION = { id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 25 };
  const SUMMARY = summarizeRevisedPages([3, 4]);

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
        entry: expect.objectContaining({ kind: 'revision', text: SUMMARY, minutes: 25 }),
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
    fireEvent.press(screen.getByLabelText('Memorization options'));
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
    fireEvent.press(screen.getByLabelText('Memorization options'));
    await chooseMenuAction('edit');
    fireEvent.press(screen.getByTestId('journal-cancel-edit'));
    expect(screen.queryByText('Editing memorization')).toBeNull();
    expect(screen.getByTestId('journal-text-input').props.value).toBe('half-written revision');
    expect(mockQueue.queueChange).not.toHaveBeenCalled();
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
