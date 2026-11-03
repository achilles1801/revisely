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
import { JOURNAL_ENTRIES_PER_DAY, journalDayFromEntries } from '../../../lib/journal';
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
  mockQueue.withPendingJournalDay.mockImplementation((_date: string, base: unknown) => base ?? null);
});

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
