import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../context/ThemeContext';
import { pendingRevisionReminders, ScheduledRemindersRow, type PendingReminder } from '../ScheduledRemindersRow';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
}));
const scheduled = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

const METRICS = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0);
const LIST: PendingReminder[] = [
  { id: 'revision-reminder-2026-11-22-evening', at: at(22, 23), title: 'An hour left today', body: 'Even a page or two of Al-Mulk counts.', away: false },
  { id: 'revision-reminder-2026-11-25-away', at: at(25, 8), title: 'Your revision is ready', body: 'Al-Qalam, whenever you have a few minutes.', away: true },
];

async function open(read: () => Promise<PendingReminder[]>) {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ScheduledRemindersRow read={read} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  // The theme settles first.
  await act(async () => {});
  await act(async () => {
    fireEvent.press(screen.getByTestId('settings-scheduled-reminders'));
  });
}

describe("Revisely Dev's Settings → Testing: the scheduled reminders (REMIND-2)", () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads the revision reminders only, soonest first, from either form of a date trigger', async () => {
    scheduled.mockResolvedValue([
      { identifier: 'prayer-2026-11-22-asr', content: { title: 'Asr', body: '' }, trigger: { type: 'date', value: at(22, 15).getTime() } },
      { identifier: 'revision-reminder-2026-11-25-away', content: { title: 'B', body: 'b' }, trigger: { type: 'date', value: at(25, 8).getTime() } },
      { identifier: 'revision-reminder-2026-11-22-evening', content: { title: 'A', body: 'a' }, trigger: { type: 'date', date: at(22, 23) } },
      { identifier: 'revision-reminder-broken', content: { title: 'C' }, trigger: null },
    ]);
    const list = await pendingRevisionReminders();
    expect(list.map((r) => [r.id, r.at.getTime(), r.away])).toEqual([
      ['revision-reminder-2026-11-22-evening', at(22, 23).getTime(), false],
      ['revision-reminder-2026-11-25-away', at(25, 8).getTime(), true],
    ]);
  });

  it('lists each with its day, time and words, the days away marked', async () => {
    await open(async () => LIST);
    expect(screen.getByText('Your revision is ready')).toBeTruthy();
    expect(screen.getByText('Al-Qalam, whenever you have a few minutes.')).toBeTruthy();
    expect(screen.getByText(/· while away$/)).toBeTruthy();
    expect(screen.getAllByText(/while away/)).toHaveLength(1);
  });

  it('shows a copy of the next one as a real notification, 5 seconds on, under its own identifier', async () => {
    await open(async () => LIST);
    await act(async () => {
      fireEvent.press(screen.getByText('Show the next one in 5 seconds'));
    });
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'reminder-preview',
        content: expect.objectContaining({ title: 'An hour left today', body: 'Even a page or two of Al-Mulk counts.' }),
        trigger: expect.objectContaining({ type: 'timeInterval', seconds: 5 }),
      }),
    );
  });

  it('with none scheduled, says why it may be', async () => {
    await open(async () => []);
    expect(screen.getByTestId('scheduled-reminders-none')).toBeTruthy();
    expect(screen.queryByText('Show the next one in 5 seconds')).toBeNull();
  });
});
