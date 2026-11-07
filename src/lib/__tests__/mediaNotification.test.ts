const mockShown: { request: { identifier: string; content: { data: Record<string, unknown> } } }[] = [];
const mockDismiss = jest.fn((_id: string) => Promise.resolve());
jest.mock('expo-notifications', () => ({
  getPresentedNotificationsAsync: () => Promise.resolve(mockShown),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
}));
// expo-audio's native module: its constants are what the binary carries.
const mockAudioModule: Record<string, unknown> = {};
jest.mock('expo-audio', () => ({
  get AudioModule() {
    return mockAudioModule;
  },
}));

import {
  dismissNotifications,
  foreignNotificationId,
  javaStringHash,
  mediaControlsLevel,
  onTrackCommand,
  ORPHAN_NOTIFICATION_ID,
  readMediaNotifications,
  stillOnLockScreen,
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

  it("reads which of the expo-audio patch's fixes the binary carries: none before 1.0.4", () => {
    delete mockAudioModule.reviselyMediaControls;
    expect(mediaControlsLevel()).toBe(0);
    mockAudioModule.reviselyMediaControls = 1;
    expect(mediaControlsLevel()).toBe(1);
    mockAudioModule.reviselyMediaControls = 'yes';
    expect(mediaControlsLevel()).toBe(0);
    delete mockAudioModule.reviselyMediaControls;
  });

  it('listens for previous and next only where the binary has them (level 2)', () => {
    const listeners: Array<(e: { command?: unknown }) => void> = [];
    mockAudioModule.addListener = (event: string, l: (e: { command?: unknown }) => void) => {
      expect(event).toBe('reviselyRemoteCommand');
      listeners.push(l);
      return { remove() {} };
    };
    const got: number[] = [];
    mockAudioModule.reviselyMediaControls = 1;
    expect(onTrackCommand((d) => got.push(d))).toBeNull();
    mockAudioModule.reviselyMediaControls = 2;
    expect(onTrackCommand((d) => got.push(d))).not.toBeNull();
    listeners.forEach((l) => l({ command: 'next' }));
    listeners.forEach((l) => l({ command: 'previous' }));
    listeners.forEach((l) => l({ command: 'stop' }));
    expect(got).toEqual([1, -1]);
    delete mockAudioModule.addListener;
    delete mockAudioModule.reviselyMediaControls;
  });

  it("asks a player whether its controls are still on, and assumes so where it can't say", () => {
    expect(stillOnLockScreen({ reviselyIsActiveForLockScreen: false })).toBe(false);
    expect(stillOnLockScreen({ reviselyIsActiveForLockScreen: true })).toBe(true);
    expect(stillOnLockScreen({})).toBe(true);
  });
});
