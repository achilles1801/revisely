// Recite in a revision session (BEHAVIOUR.md, RECITE-9, RECITE-30): the real session screen, opened from Home, in Revisely Dev (the
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
const mockChecker: { start?: Record<string, unknown>; onEvent?: (e: LiveEvent) => void; sent: Record<string, unknown>[] } = { sent: [] };
jest.mock('../../../src/lib/reciteLive/socket', () => ({
  ...jest.requireActual('../../../src/lib/reciteLive/socket'),
  socketFeed: () => (start: Record<string, unknown>, handlers: { onEvent: (e: LiveEvent) => void }) => {
    mockChecker.start = start;
    mockChecker.onEvent = handlers.onEvent;
    mockChecker.sent = [];
    return {
      sendAudio: () => undefined,
      send: (frame: Record<string, unknown>) => void mockChecker.sent.push(frame),
      close: () => undefined,
      audioClip: () => new Int16Array(0),
    };
  },
}));

const say = (app: OpenApp, e: LiveEvent) => app.act(async () => mockChecker.onEvent?.(e));

it('[RECITE-9] [RECITE-30] [SESS-1] a take in a session turns its pages with the reciter and marks each page they finish, the last page onto the end card; a swipe still marks the page it leaves', async () => {
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

  // The checker finds the reciter at Al-Fatihah 1. They finish the page and wait: in a noisy room the checker's `said`
  // stays one word short of the last (Majd, Nov 26 2026: "homie it didn't work"), so page 2 shows once their place has
  // stayed on the last word a moment, before a word of it (RECITE-30), and page 1, finished, is marked revised (RECITE-9).
  const words = fixture.quranWords();
  await say(app, { type: 'ready', take: 't1', protocol: 6 });
  await say(app, { type: 'locked', w: words.verseFirstWord(1, 1), s: 1, a: 1 });
  const last1 = words.pageRange(1)[1] - 1;
  await say(app, { type: 'said', upTo: last1 - 1 });
  await say(app, { type: 'at', w: last1 });
  expect(session.current()).toBe(1);
  await app.until(() => session.current() === 2, 'the take to turn to page 2');

  // A swipe on, during the take: the page it leaves is marked, as always.
  await session.swipe();
  expect(session.current()).toBe(3);
  // On to the session's last page by hand, and its last ayah said: the end card, the page marked as a swipe onto it
  // would.
  await session.swipe();
  await session.swipe();
  expect(session.current()).toBe(5);
  const last5 = words.pageRange(5)[1] - 1;
  await say(app, { type: 'at', w: last5 });
  await say(app, { type: 'said', upTo: last5 });
  await app.idle(30);
  await session.back();
  await app.untilSynced();
  expect(app.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-17', [1, 2, 3, 4, 5]]]);
  await app.close();
});

// Majd's take of Nov 26 2026 (01:27Z) in his revision session, as the checker sent it: the end of Al-Hajj on page 341,
// word ids and the audio's seconds (no audio, no words). The checker finds him in Al-Hajj 78 at 7 s; he goes back once
// (to وَٱعۡتَصِمُوا, at 11 s), and `said` reaches the page's last word at 21.5 s. Scores as the contract sends them.
const MAJD_341: LiveEvent[] = [
  { type: 'guess', w: 43849, t: 4.0 },
  { type: 'guess', w: 43850, t: 5.0 },
  { type: 'guess', w: 43851, t: 6.0 },
  { type: 'locked', w: 43849, s: 22, a: 78, t: 7.0, where: 'page' },
  { type: 'at', w: 43852, t: 7.0 },
  { type: 'word', w: 43849, v: 0, s: 16000, e: 54720, t: 7.0 },
  { type: 'word', w: 43850, v: 1, s: 54720, e: 72000, t: 7.0 },
  { type: 'word', w: 43851, v: 2, s: 72000, e: 87040, t: 7.0 },
  { type: 'said', upTo: 43851 },
  { type: 'score', score: { reached: 3, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43853, t: 7.5 },
  { type: 'word', w: 43852, v: 3, s: 87040, e: 104960, t: 7.5 },
  { type: 'at', w: 43854, t: 8.5 },
  { type: 'word', w: 43853, v: 4, s: 104960, e: 128640, t: 8.5 },
  { type: 'said', upTo: 43852 },
  { type: 'score', score: { reached: 4, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'said', upTo: 43853 },
  { type: 'score', score: { reached: 5, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43853, t: 11.0 },
  { type: 'word', w: 43854, v: 5, s: 128640, e: 150400, t: 11.0 },
  { type: 'said', upTo: 43854 },
  { type: 'score', score: { reached: 6, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43854, t: 12.0 },
  { type: 'word', w: 43853, v: 6, s: 150400, e: 184320, t: 12.0 },
  { type: 'at', w: 43855, t: 13.0 },
  { type: 'word', w: 43854, v: 7, s: 184320, e: 201920, t: 13.0 },
  { type: 'at', w: 43856, t: 13.5 },
  { type: 'word', w: 43855, v: 8, s: 201920, e: 209600, t: 13.5 },
  { type: 'said', upTo: 43855 },
  { type: 'score', score: { reached: 7, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43857, t: 16.0 },
  { type: 'word', w: 43856, v: 9, s: 209920, e: 233280, t: 16.0 },
  { type: 'at', w: 43858, t: 16.5 },
  { type: 'word', w: 43857, v: 10, s: 233280, e: 259200, t: 16.5 },
  { type: 'said', upTo: 43856 },
  { type: 'score', score: { reached: 8, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43859, t: 17.5 },
  { type: 'word', w: 43858, v: 11, s: 259200, e: 276160, t: 17.5 },
  { type: 'said', upTo: 43857 },
  { type: 'score', score: { reached: 9, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'at', w: 43860, t: 19.0 },
  { type: 'word', w: 43859, v: 12, s: 276480, e: 290240, t: 19.0 },
  { type: 'said', upTo: 43858 },
  { type: 'score', score: { reached: 10, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'said', upTo: 43859 },
  { type: 'score', score: { reached: 11, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1.0, helped: 0 } },
  { type: 'word', w: 43860, v: 13, s: 290560, e: 327040, t: 21.5 },
  { type: 'said', upTo: 43860 },
];

it('[RECITE-30] [RECITE-9] a session whose pages jump from one surah to another: the page’s last ayah said shows the session’s next page, which waits for the reciter, and marks the page left (Majd’s take, Nov 26 2026)', async () => {
  // Majd's memorized pages run on from Al-Hajj's end (341) to Al-Mulk (562): his session held 341, then 562. The take
  // turned to 342, which the session doesn't hold, so nothing turned (J6).
  setZone(ZONES.kolkata);
  setNow('2026-11-25 20:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: [341, ...pagesRange(562, 565)], user: { dailyPageCapacity: 5 } });
  await markPreviewTester(setup.uid);
  await setup.until(() => setup.app.user?.previewTester === true, 'the account to be a tester');
  await setup.close();

  setNow('2026-11-25 21:00');
  const app = await phone.open(homeStack);
  const fixture = app.mods.require('src/lib/recite/__fixtures__/quranWords');
  app.mods.require('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
  app.mods.require('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
  app.mods.require('src/lib/reciteCheck/settings').setReciteCheckSettings(setup.uid, { noticeSeen: true, mode: 'recite', markMistakes: false });
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  expect(session.pages()).toEqual([341, 562, 563, 564, 565]);
  expect(session.current()).toBe(341);

  await session.tapPage();
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic in the controls');
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-mic'));
  });
  await app.until(() => mockChecker.start != null, 'the take to start');
  expect(mockChecker.start).toMatchObject({ startBy: [22, 78] });

  await say(app, { type: 'ready', take: '20261126-012723-903951', protocol: 12, words: true });
  for (const e of MAJD_341) await say(app, e);
  // The session's next page shows at once, and the checker is sent to look for him on it (as after a page turned by
  // hand): Al-Mulk isn't what follows Al-Hajj, so it can't read on into it.
  await app.until(() => session.current() === 562, 'the take to show the session’s next page');
  const words = fixture.quranWords();
  expect(mockChecker.sent).toContainEqual(expect.objectContaining({ type: 'seek', w: words.pageRange(562)[0] }));

  // Page 341, finished, is marked revised (RECITE-9).
  await session.back();
  await app.untilSynced();
  expect(app.app.logs.map((l) => [l.date, l.pagesRevised])).toEqual([['2026-11-25', [341]]]);
  await app.close();
});
