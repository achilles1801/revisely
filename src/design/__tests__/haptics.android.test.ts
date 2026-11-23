// Android: the system's short haptics, not the vibrator (Majd, Nov 22 2026: choppy on Android, not on iOS).
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Segment_Tick: 'segment-tick',
    Confirm: 'confirm',
    Reject: 'reject',
    Context_Click: 'context-click',
    Keyboard_Tap: 'keyboard-tap',
  },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));

import * as Haptics from 'expo-haptics';
import { makeHaptics } from '../haptics';

describe('haptics on Android', () => {
  it('each kind is a system haptic, and the vibrator is never used', () => {
    const h = makeHaptics(true);
    h.selection();
    h.success();
    h.warning();
    h.impact();
    h.light();
    expect((Haptics.performAndroidHapticsAsync as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      'segment-tick',
      'confirm',
      'reject',
      'context-click',
      'keyboard-tap',
    ]);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });
});
