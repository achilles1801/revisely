// The daily reminder must leave every other scheduled notification alone: it is
// rescheduled at each launch (AppContext), and it used to cancel them all, so a
// timed reading session closed and reopened never said "session complete".

const mockScheduled = new Map<string, { content: unknown; trigger: unknown }>();
let mockListFails = false;

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
  scheduleNotificationAsync: jest.fn(async (req: { identifier?: string; content: unknown; trigger: unknown }) => {
    // Like expo-notifications: no identifier → a random UUID.
    const id = req.identifier ?? require('crypto').randomUUID();
    mockScheduled.set(id, { content: req.content, trigger: req.trigger });
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockScheduled.delete(id);
  }),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => mockScheduled.clear()),
  getAllScheduledNotificationsAsync: jest.fn(async () => {
    if (mockListFails) throw new Error('unavailable');
    return [...mockScheduled].map(([identifier, r]) => ({ identifier, ...r }));
  }),
}));

import * as Notifications from 'expo-notifications';
import { DAILY_REMINDER_ID, scheduleDailyReminder } from '../notifications';

const TIMER_ID = 'reading-timer-complete'; // ReadingTimerContext's NOTIFICATION_ID

async function startTimer() {
  await Notifications.scheduleNotificationAsync({
    identifier: TIMER_ID,
    content: { title: 'Reading session complete', body: '20m logged. Nice work.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 60_000) },
  });
}

const ids = () => [...mockScheduled.keys()].sort();

beforeEach(() => {
  mockScheduled.clear();
  mockListFails = false;
  jest.clearAllMocks();
});

describe('scheduleDailyReminder', () => {
  it('schedules one daily reminder, by name, at the time given', async () => {
    await scheduleDailyReminder('07:30', true);
    expect(ids()).toEqual([DAILY_REMINDER_ID]);
    // channelId: Android's Reminders channel (iOS ignores it).
    expect(mockScheduled.get(DAILY_REMINDER_ID)!.trigger).toEqual({ type: 'daily', hour: 7, minute: 30, channelId: 'default' });
  });

  it("keeps a running reading timer's notification (the launch reschedule used to cancel it)", async () => {
    await startTimer();
    await scheduleDailyReminder('07:30', true);
    expect(ids()).toEqual([DAILY_REMINDER_ID, TIMER_ID].sort());
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });

  it("turned off: cancels the reminder only, the timer's stays", async () => {
    await scheduleDailyReminder('07:30', true);
    await startTimer();
    await scheduleDailyReminder('07:30', false);
    expect(ids()).toEqual([TIMER_ID]);
  });

  it('replaces the reminder an older version scheduled without a name, so there is never a second one', async () => {
    // Before this change: no identifier, so a UUID.
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Revisely', body: 'Time for your daily Quran revision', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0 },
    });
    await startTimer();
    expect(mockScheduled.size).toBe(2);

    await scheduleDailyReminder('07:30', true);
    expect(ids()).toEqual([DAILY_REMINDER_ID, TIMER_ID].sort());
    expect(mockScheduled.get(DAILY_REMINDER_ID)!.trigger).toEqual({ type: 'daily', hour: 7, minute: 30, channelId: 'default' });
  });

  it('changing the time keeps one reminder', async () => {
    await scheduleDailyReminder('07:30', true);
    await scheduleDailyReminder('20:15', true);
    expect(ids()).toEqual([DAILY_REMINDER_ID]);
    expect(mockScheduled.get(DAILY_REMINDER_ID)!.trigger).toEqual({ type: 'daily', hour: 20, minute: 15, channelId: 'default' });
  });

  it("can't list what's scheduled: still schedules by name (which replaces the last one)", async () => {
    await scheduleDailyReminder('07:30', true);
    await startTimer();
    mockListFails = true;
    await scheduleDailyReminder('08:00', true);
    expect(ids()).toEqual([DAILY_REMINDER_ID, TIMER_ID].sort());
  });
});
