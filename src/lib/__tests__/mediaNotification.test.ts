const mockShown: { request: { identifier: string; content: { data: Record<string, unknown> } } }[] = [];
const mockDismiss = jest.fn((_id: string) => Promise.resolve());
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: () => Promise.resolve(mockShown),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
}));

import {
  dismissNotifications,
  foreignNotificationId,
  javaStringHash,
  ORPHAN_NOTIFICATION_ID,
  readMediaNotifications,
} from '../mediaNotification';

const foreign = (id: number, tag?: string) =>
  `expo-notifications://foreign_notifications?${tag ? `tag=${tag}&` : ''}id=${id}`;
const media = { 'android.template': 'android.app.Notification$MediaStyle' };

beforeEach(() => {
  mockShown.length = 0;
  mockDismiss.mockClear();
});

describe('mediaNotification', () => {
  it('computes ids as Java does', () => {
    expect(javaStringHash('hello')).toBe(99162322);
    expect(javaStringHash('')).toBe(0);
    // expo-audio's fallback id: CHANNEL_ID.hashCode().
    expect(ORPHAN_NOTIFICATION_ID).toBe(369280525);
  });

  it('reads the id of a notification the app posted elsewhere', () => {
    expect(foreignNotificationId(foreign(-12))).toEqual({ id: -12, tagged: false });
    expect(foreignNotificationId(foreign(7, 'x'))).toEqual({ id: 7, tagged: true });
    expect(foreignNotificationId('daily-reminder')).toBeNull();
  });

  it('finds expo-audio\'s media notifications and its orphans, and ignores everything else', async () => {
    expect(await readMediaNotifications()).toEqual({ media: [], orphans: [] });
    mockShown.push(
      { request: { identifier: 'daily-reminder', content: { data: {} } } },
      { request: { identifier: foreign(42), content: { data: { 'android.template': 'android.app.Notification$BigTextStyle' } } } },
      { request: { identifier: foreign(43, 'tagged'), content: { data: media } } },
    );
    expect(await readMediaNotifications()).toEqual({ media: [], orphans: [] });
    mockShown.push({ request: { identifier: foreign(ORPHAN_NOTIFICATION_ID), content: { data: media } } });
    expect(await readMediaNotifications()).toEqual({ media: [], orphans: [foreign(ORPHAN_NOTIFICATION_ID)] });
    // As the emulator showed it: id = the player's hash, the platform MediaStyle template.
    mockShown.push({ request: { identifier: foreign(79963736), content: { data: media } } });
    expect(await readMediaNotifications()).toEqual({
      media: [foreign(79963736)],
      orphans: [foreign(ORPHAN_NOTIFICATION_ID)],
    });
  });

  it('dismisses by identifier', async () => {
    await dismissNotifications(['a', 'b']);
    expect(mockDismiss.mock.calls).toEqual([['a'], ['b']]);
  });
});
