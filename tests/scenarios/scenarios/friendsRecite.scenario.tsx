// What friends hit on Recite, Nov 25 2026 (BEHAVIOUR.md, RECITE-31, RECITE-32): Mark mistakes was off until Majd said
// "yeah toggle on mark mistakes", and nothing said what an amber mark is ("Whats does yellow mean?"). The real session
// screen, opened from Home, in Revisely Dev (the live check's gate: the Dev app, a tester, the microphone stream), against
// the emulators. The checker is a stand-in at its socket (lib/reciteLive/socket), the outermost edge of an outside service.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import type { LiveEvent } from '../../../src/lib/reciteLive/contract';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({
  ...jest.requireActual('../../../src/lib/recite/micSource'),
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async () => ({ stop: jest.fn(async () => undefined) })),
}));
// The checker sleeps on Cloud Run; nothing here reaches it.
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));
const mockChecker: { start?: Record<string, unknown>; onEvent?: (e: LiveEvent) => void } = {};
jest.mock('../../../src/lib/reciteLive/socket', () => ({
  ...jest.requireActual('../../../src/lib/reciteLive/socket'),
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: LiveEvent) => void }) => {
    mockChecker.start = start;
    mockChecker.onEvent = handlers.onEvent;
    return { sendAudio: () => undefined, send: () => undefined, close: () => undefined, audioClip: () => new Int16Array(0) };
  },
}));

const say = (app: OpenApp, e: LiveEvent) => app.act(async () => mockChecker.onEvent?.(e));
const NOTE = 'Amber: a wrong haraka or letter, or not clear. Tap a mark to see.';

it('[RECITE-32] [RECITE-31] Mark mistakes is on from the start; the first amber mark explains itself once, and never again; turned off, the switch stays off', async () => {
  setZone(ZONES.kolkata);
  setNow('2026-11-25 20:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(setup.uid);
  await setup.until(() => setup.app.user?.previewTester === true, 'the account to be a tester');
  // It has Mark mistakes: Premium, as Revisely Dev's Get Premium gives it (written by the server, never the app).
  await setServerDoc(`entitlements/${setup.uid}`, { premium: { source: 'dev', grantedAt: Date.now(), until: null } });
  await setup.close();

  setNow('2026-11-25 21:00');
  const app = await phone.open(homeStack);
  const fixture = app.mods.require('src/lib/recite/__fixtures__/quranWords');
  app.mods.require('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
  app.mods.require('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
  // The AI notice was agreed to before. Nothing else is set: Mark mistakes is as it starts.
  app.mods.require('src/lib/reciteCheck/settings').setReciteCheckSettings(setup.uid, { noticeSeen: true });
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  const { fireEvent } = app.mods.rtl;
  const words = fixture.quranWords();
  const mic = () => app.screen.getByTestId('recite-mic', { includeHiddenElements: true });

  // RECITE-32: the mic says it marks mistakes, and a tap starts a take that does (not one that only follows).
  await session.tapPage();
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic in the controls');
  expect(mic().props.accessibilityLabel).toBe('Recite and mark mistakes');
  await app.act(async () => {
    fireEvent.press(mic());
  });
  await app.until(() => mockChecker.start != null, 'the take to start');
  expect(mockChecker.start).toMatchObject({ follow: false });

  // RECITE-31: a red mark says nothing; the first amber one explains itself in the bar's line.
  const first = words.verseFirstWord(1, 1);
  await say(app, { type: 'ready', take: 't1', protocol: 6 });
  await say(app, { type: 'locked', w: first, s: 1, a: 1 });
  await say(app, { type: 'at', w: first + 3 });
  await say(app, { type: 'mark', mark: { id: 'r', w: first + 1, ayah: [1, 1], kind: 'word', sure: 'clear', heard: 'ٱللَّهُ', heardExact: true } });
  await app.idle(50);
  expect(app.screen.queryByTestId('recite-note')).toBeNull();
  await say(app, { type: 'mark', mark: { id: 'h', w: first + 2, ayah: [1, 1], kind: 'harakat', sure: 'clear', slip: { expected: 'ِ', heard: 'ُ' } } });
  await app.until(() => app.screen.queryByTestId('recite-note') != null, 'the amber note');
  expect(app.screen.getByText(NOTE)).toBeTruthy();

  // The take ends; the next one's amber mark says nothing: the note was once, for this account on this phone.
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-stop'));
  });
  await say(app, { type: 'done', result: { v: 2, take: 't1', from: first, to: first + 7, secs: 20, marks: [], score: null, start: first } });
  await app.until(() => app.screen.queryByTestId('recite-close') != null, 'the take to end');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-close'));
  });
  mockChecker.start = undefined;
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic again');
  await app.act(async () => {
    fireEvent.press(mic());
  });
  await app.until(() => mockChecker.start != null, 'the second take to start');
  await say(app, { type: 'ready', take: 't2', protocol: 6 });
  await say(app, { type: 'locked', w: first, s: 1, a: 1 });
  await say(app, { type: 'at', w: first + 3 });
  await say(app, { type: 'mark', mark: { id: 'h2', w: first + 2, ayah: [1, 1], kind: 'harakat', sure: 'clear', slip: { expected: 'ِ', heard: 'ُ' } } });
  await app.idle(200);
  // A new take, well inside the first note's 6 seconds: it never carries the note over either.
  expect(app.screen.queryByTestId('recite-note') == null).toBe(true);
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-stop'));
  });
  await say(app, { type: 'done', result: { v: 2, take: 't2', from: first, to: first + 7, secs: 20, marks: [], score: null, start: first } });
  await app.until(() => app.screen.queryByTestId('recite-close') != null, 'the second take to end');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-close'));
  });

  // RECITE-32: holding the mic turns it off, and it stays off: the next take only follows.
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic, a third time');
  await app.act(async () => {
    fireEvent(mic(), 'longPress');
  });
  await app.until(() => app.screen.queryByTestId('recite-mistakes-on') != null, 'Mark mistakes, on');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-mistakes'));
  });
  await app.until(() => app.screen.queryByTestId('recite-mistakes-off') != null, 'Mark mistakes, off');
  const { parseReciteCheckSettings } = app.mods.require('src/lib/reciteCheck/settings');
  const AsyncStorage = app.mods.require('@react-native-async-storage/async-storage');
  const kept = await (AsyncStorage.default ?? AsyncStorage).getItem(`@revisely_recite_check:v1:${setup.uid}`);
  expect(parseReciteCheckSettings(kept)).toMatchObject({ markMistakes: false, amberExplained: true });
  mockChecker.start = undefined;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-mode-recite'));
  });
  await app.until(() => mockChecker.start != null, 'a plain take');
  expect(mockChecker.start).toMatchObject({ follow: true });
  await app.close();
});
