// Recite in a revision session (BEHAVIOUR.md, RECITE-9): the real session screen, opened from Home, in Revisely Dev (the
// live check's gate: the Dev app, a tester, the microphone stream), against the emulators. The checker is a stand-in at
// its socket (lib/reciteLive/socket), the outermost edge of an outside service: the scenario sends what it says.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
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

it('[RECITE-9] [SESS-1] a take in a session turns its pages with the reciter and marks none; a swipe still marks the page it leaves', async () => {
  setZone(ZONES.kolkata);
  setNow('2026-11-17 20:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(setup.uid);
  await setup.until(() => setup.app.user?.previewTester === true, 'the account to be a tester');
  await setup.close();

  setNow('2026-11-17 21:00');
  const app = await phone.open(homeStack);
  const fixture = app.mods.require('src/lib/recite/__fixtures__/quranWords');
  app.mods.require('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
  app.mods.require('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
  // The AI notice was agreed to before; a tap on the mic is Recite (following, no marks).
  app.mods.require('src/lib/reciteCheck/settings').setReciteCheckSettings(setup.uid, { noticeSeen: true, mode: 'recite', markMistakes: false });
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  expect(session.pages()).toEqual([1, 2, 3, 4, 5]);
  expect(session.current()).toBe(1);

  // The reader's mic, in the session's controls (a tap on the page brings them); no eye at the top any more.
  await session.tapPage();
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic in the controls');
  expect(app.screen.getAllByLabelText('Hide the page')).toHaveLength(1);
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-mic'));
  });
  await app.until(() => mockChecker.start != null, 'the take to start');

  // The checker finds the reciter at Al-Fatihah 1 and follows them into Al-Baqarah on the next page: the page turns.
  const words = fixture.quranWords();
  await say(app, { type: 'ready', take: 't1', protocol: 6 });
  await say(app, { type: 'locked', w: words.verseFirstWord(1, 1), s: 1, a: 1 });
  await say(app, { type: 'at', w: words.verseFirstWord(2, 2) });
  await app.until(() => session.current() === 2, 'the take to turn to page 2');

  // A swipe on, during the take: the page it leaves is marked, as always. Page 1, turned by the take, isn't.
  await session.swipe();
  expect(session.current()).toBe(3);
  await session.back();
  await app.untilSynced();
  expect(app.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-17', [2]]]);
  await app.close();
});
