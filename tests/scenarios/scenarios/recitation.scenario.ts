// Recitation's notification on Android (BEHAVIOUR.md, AUDIO-*): the app's own
// recitation engine, with the phone's notification shade and expo-audio's
// lock-screen service stood in by harness/androidMedia (as an emulator showed
// them). A closed tester's Samsung kept a dead notification after closing the app
// (Nov 3 2026); the emulator also showed the app being closed 30 s later.
jest.mock('expo-audio', () => require('../harness/androidMedia').expoAudio);
jest.mock('expo-notifications', () => {
  const { notifications } = require('../harness/androidMedia');
  return new Proxy(notifications, {
    get: (t: Record<string, unknown>, k: string) =>
      k in t ? t[k] : k.startsWith('add') && k.endsWith('Listener') ? () => ({ remove: () => undefined }) : async () => undefined,
  });
});

import type { androidMedia as AndroidMedia } from '../harness/androidMedia';
import type * as RecitationModule from '../../../src/lib/recitation';

const v = (sura: number, ayah: number) => ({ sura, ayah });
// Lets the app's checks of the shade run (they await native calls; the clock
// doesn't move by itself in a scenario).
const settle = async () => {
  for (let i = 0; i < 400; i++) await Promise.resolve();
};

// A fresh phone and app per test: the app has one recitation engine, listening
// to the app's state; one left from an earlier test would act on this one's shade.
let app: { __emit(state: string): void };
let androidMedia: typeof AndroidMedia;
let Recitation: typeof RecitationModule.Recitation;
let verseTitle: typeof RecitationModule.verseTitle;

beforeEach(() => {
  jest.resetModules();
  const rn = require('react-native');
  jest.replaceProperty(rn.Platform, 'OS', 'android');
  app = rn.AppState;
  ({ androidMedia } = require('../harness/androidMedia'));
  ({ Recitation, verseTitle } = require('../../../src/lib/recitation'));
  app.__emit('active');
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('recitation on Android', () => {
  it('[AUDIO-1] swiped away from recents while a verse plays: no notification is left behind, and the app is not closed', async () => {
    const r = new Recitation();
    r.play(v(79, 8));
    expect(androidMedia.shown()).toEqual([expect.objectContaining({ title: verseTitle(v(79, 8)), session: true })]);

    app.__emit('background');
    androidMedia.swipeAway();
    // The screens unmount, and MainNavigator stops the recitation.
    r.stop();
    await settle();

    expect(androidMedia.shown()).toEqual([]);
    expect(androidMedia.crashes()).toEqual([]);
  });

  it('[AUDIO-1] swiped away while paused: nothing left behind either', async () => {
    const r = new Recitation();
    r.play(v(2, 255));
    r.pause();
    app.__emit('background');
    androidMedia.swipeAway();
    r.stop();
    await settle();
    expect(androidMedia.shown()).toEqual([]);
    expect(androidMedia.crashes()).toEqual([]);
  });

  it('[AUDIO-1] ■ in the app, and the end of the range, take the notification away at once', () => {
    const r = new Recitation();
    r.play(v(1, 1));
    expect(androidMedia.shown()).toHaveLength(1);
    r.stop();
    expect(androidMedia.shown()).toEqual([]);

    // Al-Fatihah's last verse, and no further.
    r.play(v(1, 7), () => null);
    expect(androidMedia.shown()).toHaveLength(1);
    androidMedia.player()?.emit({ didJustFinish: true });
    expect(r.getState().status).toBe('idle');
    expect(androidMedia.shown()).toEqual([]);
    expect(androidMedia.crashes()).toEqual([]);
  });

  it('[AUDIO-1] a notification left by an earlier run goes when the app starts', async () => {
    androidMedia.leftFromBefore(verseTitle(v(79, 8)));
    new Recitation();
    await settle();
    expect(androidMedia.shown()).toEqual([]);
  });

  it('[AUDIO-2] Pause and ▶ on the notification with the app away: it stays, and the app follows', async () => {
    const r = new Recitation();
    r.play(v(18, 10));
    app.__emit('background');

    androidMedia.press('pause');
    expect(r.getState().status).toBe('paused');
    expect(androidMedia.shown()).toEqual([expect.objectContaining({ title: verseTitle(v(18, 10)), session: true })]);

    // Back in the app and out again: still the same notification.
    app.__emit('active');
    await settle();
    app.__emit('background');
    expect(androidMedia.shown()).toEqual([expect.objectContaining({ session: true })]);

    androidMedia.press('play');
    expect(r.getState().status).toBe('playing');
  });
});
