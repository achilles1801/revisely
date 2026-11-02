import React from 'react';
import { Alert, StyleSheet } from 'react-native';
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
const mockService = {
  getJournalEntry: jest.fn(),
  saveJournalEntry: jest.fn(async () => undefined),
  deleteJournalEntry: jest.fn(async () => undefined),
};
jest.mock('../../../services/firestoreService', () => ({
  getJournalEntry: (...a: unknown[]) => mockService.getJournalEntry(...(a as [])),
}));
// Saves go into the outbox (lib/offline), which sends them when it can.
const mockQueue = { queueChange: jest.fn(async () => ({})), pendingJournalEntry: jest.fn(() => undefined) };
jest.mock('../../../lib/offline/queue', () => ({
  queueChange: (...a: unknown[]) => mockQueue.queueChange(...(a as [])),
  pendingJournalEntry: (...a: unknown[]) => mockQueue.pendingJournalEntry(...(a as [])),
}));

import JournalEntryScreen from '../JournalEntryScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import { emptyJournalEntry } from '../../../lib/journal';

const palette = paletteV2(false, DEFAULT_ACCENT);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (style: unknown): Record<string, any> => StyleSheet.flatten(style as never) ?? {};

async function renderV2() {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <JournalEntryScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockApp.user = { createdAt: '2026-01-01T12:00:00.000Z', fajrBoundaryEnabled: false };
  mockApp.logs = [];
  mockService.getJournalEntry.mockResolvedValue(null);
});

describe('the daily log in the new design', () => {
  it('a thread being written: three rows joined by the line, no cards, the fields in ink', async () => {
    await renderV2();
    expect(screen.getByTestId('journal-v2')).toBeTruthy();
    expect(screen.getByTestId('journal-memorization')).toBeTruthy();
    expect(screen.getByTestId('journal-revision')).toBeTruthy();
    expect(screen.getByTestId('journal-notes')).toBeTruthy();
    // Memorization → revision → notes: the line leaves the first two and reaches the last two.
    expect(screen.getAllByTestId('thread-line')).toHaveLength(4);
    const input = screen.getByTestId('journal-memorization-input');
    expect(flat(input.props.style).color).toBe(palette.text);
    expect(input.props.placeholderTextColor).toBe(palette.secondary);
    // The notes are reading text: they grow with Dynamic Type, uncapped.
    expect(screen.getByTestId('journal-notes-input').props.maxFontSizeMultiplier).toBeUndefined();
    // Nothing to delete on a new day.
    expect(screen.queryByTestId('journal-delete')).toBeNull();
  });

  it('Save is the one solid pill: off until something changes, then saves and leaves', async () => {
    await renderV2();
    const save = () => screen.getByTestId('journal-save');
    expect(save().props.accessibilityState).toMatchObject({ disabled: true });
    expect(flat(save().props.style).backgroundColor).toBe(palette.primary);
    fireEvent.changeText(screen.getByTestId('journal-memorization-input'), '1/2 p3');
    fireEvent.changeText(screen.getByLabelText('Memorization minutes'), '2a0');
    expect(screen.getByLabelText('Memorization minutes').props.value).toBe('20');
    expect(save().props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => {
      fireEvent.press(save());
    });
    expect(mockQueue.queueChange).toHaveBeenCalledWith({
      kind: 'journal.save',
      entry: expect.objectContaining({ date: '2026-10-20', memorization: '1/2 p3', memorizationMinutes: 20 }),
      isNew: true,
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("offers the day's session for the revision line, as an outline pill", async () => {
    mockApp.logs = [{ id: 'l1', date: '2026-10-20', pagesRevised: [3, 4], pagesSkipped: [], weaknessUpdates: [], durationMinutes: 25 }];
    await renderV2();
    const chip = screen.getByTestId('journal-suggestion');
    expect(flat(chip.props.style)).toMatchObject({ borderColor: palette.outline, borderWidth: 1 });
    fireEvent.press(chip);
    expect(screen.getByLabelText('Revision minutes').props.value).toBe('25');
    expect(screen.queryByTestId('journal-suggestion')).toBeNull();
  });

  it('a saved day can be deleted from a red row at the end', async () => {
    mockService.getJournalEntry.mockResolvedValue({ ...emptyJournalEntry('2026-10-20'), notes: 'Good day' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await renderV2();
    expect(screen.getByTestId('journal-notes-input').props.value).toBe('Good day');
    const del = screen.getByTestId('journal-delete');
    expect(screen.getByText("Delete this day's log").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: palette.red })]),
    );
    fireEvent.press(del);
    const buttons = alert.mock.calls.at(-1)![2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')!.onPress!();
    });
    expect(mockQueue.queueChange).toHaveBeenCalledWith({ kind: 'journal.delete', date: '2026-10-20' });
    alert.mockRestore();
  });

  it("offline, a day it can't read isn't editable (a save could overwrite the server's), and Try again reads it again", async () => {
    mockService.getJournalEntry.mockRejectedValueOnce(
      Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }),
    );
    await renderV2();
    expect(screen.getByTestId('journal-offline')).toBeTruthy();
    expect(screen.getByText('Connect to the internet to see and edit it.')).toBeTruthy();
    expect(screen.getByTestId('journal-save').props.accessibilityState).toMatchObject({ disabled: true });
    mockService.getJournalEntry.mockResolvedValueOnce({ ...emptyJournalEntry('2026-10-20'), notes: 'Back' });
    await act(async () => {
      fireEvent.press(screen.getByTestId('journal-retry'));
    });
    expect(screen.getByTestId('journal-notes-input').props.value).toBe('Back');
  });

  it('offline, a change still waiting on this phone shows (and stays editable)', async () => {
    mockService.getJournalEntry.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    mockQueue.pendingJournalEntry.mockReturnValueOnce({ ...emptyJournalEntry('2026-10-20'), notes: 'Typed offline' } as never);
    await renderV2();
    expect(screen.queryByTestId('journal-offline')).toBeNull();
    expect(screen.getByTestId('journal-notes-input').props.value).toBe('Typed offline');
  });
});
