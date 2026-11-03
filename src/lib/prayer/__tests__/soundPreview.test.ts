// Tapping a prayer sound plays it (#173): a notification that is heard, never
// shown, so it is the phone's own sound, exactly as the prayer will sound.

let mockPermission = { status: 'granted' };
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => mockPermission),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  dismissNotificationAsync: jest.fn(async () => undefined),
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { DAILY: 'daily', DATE: 'date' },
}));

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  isSoundPreview,
  notificationBehavior,
  previewPrayerSound,
  SOUND_PREVIEW_ID,
} from '../soundPreview';
import { PRAYER_CHANNEL_ID } from '../../notificationChannels';

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
const asNotification = (data: Record<string, unknown>) =>
  ({ request: { content: { data } } }) as unknown as Notifications.Notification;

const originalOS = Platform.OS;
const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = { status: 'granted' };
});
afterEach(() => {
  setOS(originalOS);
  jest.useRealTimers();
});

describe('the sound preview', () => {
  it('iOS: posted at once with the default sound, marked as a preview', async () => {
    setOS('ios');
    await expect(previewPrayerSound('standard')).resolves.toBe('played');
    expect(schedule).toHaveBeenCalledTimes(1);
    const req = schedule.mock.calls[0][0];
    expect(req.identifier).toBe(SOUND_PREVIEW_ID);
    expect(req.content).toEqual(expect.objectContaining({ sound: true, data: { soundPreview: true } }));
    expect(req.trigger).toBeNull();
  });

  it('Android: on the prayer channel, whose sound the prayer notification has', async () => {
    setOS('android');
    await previewPrayerSound('standard');
    expect(schedule.mock.calls[0][0].trigger).toEqual({ channelId: PRAYER_CHANNEL_ID });
  });

  it('Silent plays nothing', async () => {
    await expect(previewPrayerSound('silent')).resolves.toBe('silent');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('without notification permission: nothing plays and nothing is asked', async () => {
    mockPermission = { status: 'denied' };
    await expect(previewPrayerSound('standard')).resolves.toBe('no-permission');
    expect(schedule).not.toHaveBeenCalled();
  });

  it('each tap plays again; the delivered preview is cleared afterwards', async () => {
    jest.useFakeTimers();
    await previewPrayerSound('standard');
    await previewPrayerSound('standard');
    expect(schedule).toHaveBeenCalledTimes(2);
    dismiss.mockClear();
    jest.advanceTimersByTime(5000);
    expect(dismiss).toHaveBeenCalledWith(SOUND_PREVIEW_ID);
    // One timer: the first tap's was replaced by the second's.
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('a failure is reported, never thrown', async () => {
    schedule.mockRejectedValueOnce(new Error('no'));
    await expect(previewPrayerSound('standard')).resolves.toBe('failed');
  });
});

describe('the notification handler', () => {
  it('a preview is heard, not shown; every other notification shows with its sound', () => {
    expect(isSoundPreview(asNotification({ soundPreview: true }))).toBe(true);
    expect(notificationBehavior(asNotification({ soundPreview: true }))).toEqual({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    });
    for (const data of [{ kind: 'prayer', prayer: 'fajr' }, {}, { soundPreview: 'yes' }]) {
      expect(notificationBehavior(asNotification(data))).toEqual({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      });
    }
    expect(notificationBehavior(null)).toEqual(expect.objectContaining({ shouldShowBanner: true }));
  });

  it('is the one lib/notifications registers', async () => {
    jest.isolateModules(() => {
      require('../../notifications');
    });
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls.at(-1)[0];
    await expect(handler.handleNotification(asNotification({ soundPreview: true }))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: false, shouldPlaySound: true }),
    );
    await expect(handler.handleNotification(asNotification({ kind: 'prayer' }))).resolves.toEqual(
      expect.objectContaining({ shouldShowBanner: true, shouldShowList: true }),
    );
  });
});
