// Scheduling: only the revision reminders (and the old daily one) are replaced;
// the reading timer's and the prayer notifications' are left alone.

const mockScheduled = new Map<string, { content: any; trigger: any }>();
let mockPresented: { request: { identifier: string } }[] = [];

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  scheduleNotificationAsync: jest.fn(async (req: { identifier?: string; content: any; trigger: any }) => {
    const id = req.identifier ?? require('crypto').randomUUID();
    mockScheduled.set(id, { content: req.content, trigger: req.trigger });
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockScheduled.delete(id);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => [...mockScheduled].map(([identifier, r]) => ({ identifier, ...r }))),
  getPresentedNotificationsAsync: jest.fn(async () => mockPresented),
  dismissNotificationAsync: jest.fn(async () => undefined),
}));

import * as Notifications from 'expo-notifications';
import { clearRevisionReminders, dismissPresentedRevisionReminders, syncRevisionReminders } from '../sync';
import { REVISION_REMINDER_PREFIX, type PlannedReminder } from '../plan';

const TIMER_ID = 'reading-timer-complete';
const PRAYER_ID = 'prayer-2026-10-28-asr';
const ids = () => [...mockScheduled.keys()].sort();

const reminder = (kind: PlannedReminder['kind'], hour: number, interruption: PlannedReminder['interruption'] = 'active'): PlannedReminder => ({
  id: `${REVISION_REMINDER_PREFIX}2026-10-28-${kind}`,
  at: new Date(2026, 9, 28, hour),
  title: 'Title',
  body: 'Body',
  interruption,
  kind,
  day: '2026-10-28',
});

beforeEach(() => {
  mockScheduled.clear();
  mockPresented = [];
  jest.clearAllMocks();
});

describe('syncRevisionReminders', () => {
  it('schedules each planned reminder by its name, at its time, on the reminder channel', async () => {
    await syncRevisionReminders([reminder('morning', 8), reminder('midday', 15)]);
    expect(ids()).toEqual([`${REVISION_REMINDER_PREFIX}2026-10-28-midday`, `${REVISION_REMINDER_PREFIX}2026-10-28-morning`]);
    const morning = mockScheduled.get(`${REVISION_REMINDER_PREFIX}2026-10-28-morning`)!;
    expect(morning.content).toMatchObject({ title: 'Title', body: 'Body', sound: true, interruptionLevel: 'active' });
    expect(morning.trigger).toEqual({ type: 'date', date: new Date(2026, 9, 28, 8), channelId: 'default' });
  });

  it('a passive reminder is silent, on the silent channel', async () => {
    await syncRevisionReminders([reminder('congrat', 23, 'passive')]);
    const n = mockScheduled.get(`${REVISION_REMINDER_PREFIX}2026-10-28-congrat`)!;
    expect(n.content).toMatchObject({ sound: false, interruptionLevel: 'passive' });
    expect(n.trigger.channelId).toBe('reminders-silent');
  });

  it("leaves the reading timer's and the prayer notifications alone, and clears the old daily reminder", async () => {
    mockScheduled.set(TIMER_ID, { content: {}, trigger: {} });
    mockScheduled.set(PRAYER_ID, { content: {}, trigger: {} });
    mockScheduled.set('daily-reminder', { content: {}, trigger: {} });
    mockScheduled.set('0f1e2d3c-4b5a-4968-8777-665544332211', { content: {}, trigger: {} });
    await syncRevisionReminders([reminder('morning', 8)]);
    expect(ids()).toEqual([PRAYER_ID, TIMER_ID, `${REVISION_REMINDER_PREFIX}2026-10-28-morning`].sort());
    expect(Notifications.cancelAllScheduledNotificationsAsync).toBeUndefined();
  });

  it('replaces the earlier plan: a reminder no longer planned goes', async () => {
    await syncRevisionReminders([reminder('morning', 8), reminder('midday', 15)]);
    await syncRevisionReminders([reminder('evening', 23)]);
    expect(ids()).toEqual([`${REVISION_REMINDER_PREFIX}2026-10-28-evening`]);
  });

  it('clear removes the revision reminders only', async () => {
    mockScheduled.set(TIMER_ID, { content: {}, trigger: {} });
    await syncRevisionReminders([reminder('morning', 8)]);
    await clearRevisionReminders();
    expect(ids()).toEqual([TIMER_ID]);
  });

  it('a failed schedule does not stop the others', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockImplementationOnce(async () => {
      throw new Error('full');
    });
    await syncRevisionReminders([reminder('morning', 8), reminder('midday', 15)]);
    expect(ids()).toEqual([`${REVISION_REMINDER_PREFIX}2026-10-28-midday`]);
  });
});

describe('dismissPresentedRevisionReminders', () => {
  it('lifts only this app\'s revision reminders off the lock screen', async () => {
    mockPresented = [
      { request: { identifier: `${REVISION_REMINDER_PREFIX}2026-10-28-morning` } },
      { request: { identifier: PRAYER_ID } },
    ];
    await dismissPresentedRevisionReminders();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(`${REVISION_REMINDER_PREFIX}2026-10-28-morning`);
  });
});
