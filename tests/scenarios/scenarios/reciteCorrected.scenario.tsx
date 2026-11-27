// A word said wrong and corrected straight away (BEHAVIOUR.md, RECITE-33; Majd, Nov 27 2026: "show as corrected i
// think"). The checker sends the mark, then the same mark again with `corrected` once it is sure the first saying was
// wrong. The real session screen, opened from Home, in Revisely Dev (the live check's gate: the Dev app, a tester, the
// microphone stream), against the emulators. The checker is a stand-in at its socket (lib/reciteLive/socket), the
// outermost edge of an outside service.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { setServerDoc } from '../harness/serverDocs';
import { Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import type { LiveEvent, Mark } from '../../../src/lib/reciteLive/contract';

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
const plain = (x: unknown) => String(Array.isArray(x) ? x.join('') : x).replace(/[ ‑⁨⁩]/g, (c) => (c === ' ' ? ' ' : c === '‑' ? '-' : ''));

it('[RECITE-33] a word said wrong, then right straight away, turns Corrected: green, never counted, not remembered on the page', async () => {
  setZone(ZONES.kolkata);
  setNow('2026-11-27 20:00');
  const phone = new Phone();
  const setup = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(setup.uid);
  await setup.until(() => setup.app.user?.previewTester === true, 'the account to be a tester');
  // It has Mark mistakes: Premium, as Revisely Dev's Get Premium gives it (written by the server, never the app).
  await setServerDoc(`entitlements/${setup.uid}`, { premium: { source: 'dev', grantedAt: Date.now(), until: null } });
  await setup.close();

  setNow('2026-11-27 21:00');
  const app = await phone.open(homeStack);
  const fixture = app.mods.require('src/lib/recite/__fixtures__/quranWords');
  app.mods.require('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
  app.mods.require('expo-audio').getRecordingPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: false });
  app.mods.require('src/lib/reciteCheck/settings').setReciteCheckSettings(setup.uid, { noticeSeen: true });
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  const { fireEvent } = app.mods.rtl;
  const words = fixture.quranWords();
  const mic = () => app.screen.getByTestId('recite-mic', { includeHiddenElements: true });

  await session.tapPage();
  await app.until(() => app.screen.queryByTestId('recite-mic') != null, 'the mic in the controls');
  await app.act(async () => {
    fireEvent.press(mic());
  });
  await app.until(() => mockChecker.start != null, 'the take to start');
  expect(mockChecker.start).toMatchObject({ follow: false });

  // Al-Fatihah 1: its second word said as another word. A mistake, red, counted.
  const first = words.verseFirstWord(1, 1);
  const wrong: Mark = { id: 'c', w: first + 1, ayah: [1, 1], kind: 'word', detail: 'lookalike', sure: 'clear', heard: 'ٱللَّهُ', heardExact: true };
  await say(app, { type: 'ready', take: 't1', protocol: 10 });
  await say(app, { type: 'locked', w: first, s: 1, a: 1 });
  await say(app, { type: 'at', w: first + 3 });
  await say(app, { type: 'mark', mark: wrong });
  await say(app, { type: 'score', score: { reached: 4, mistakes: 1, tajweed: 0, unclear: 0, corrected: 0, accuracy: 0.75 } });
  const target = () => app.screen.getByTestId('live-mark-word', { includeHiddenElements: true });
  await app.until(() => app.screen.queryByTestId('live-mark-word', { includeHiddenElements: true }) != null, 'the mark on the page');
  expect(target().props.accessibilityLabel).toBe(`Wrong word, ${words.uthmani(first + 1)}`);
  expect(app.screen.queryByTestId('live-highlight-word', { includeHiddenElements: true })).toBeTruthy();

  // They went back and said it right: the checker sends the same mark again, corrected. One mark, now green, uncounted.
  await say(app, { type: 'mark', mark: { ...wrong, corrected: true } });
  await say(app, { type: 'score', score: { reached: 4, mistakes: 0, tajweed: 0, unclear: 0, corrected: 1, accuracy: 1 } });
  await app.until(() => app.screen.queryByTestId('live-highlight-corrected', { includeHiddenElements: true }) != null, 'the corrected highlight');
  expect(app.screen.queryByTestId('live-highlight-word', { includeHiddenElements: true })).toBeNull();
  expect(app.screen.queryAllByTestId(/^live-mark-/, { includeHiddenElements: true })).toHaveLength(1);
  expect(target().props.accessibilityLabel).toBe(`Corrected, ${words.uthmani(first + 1)}`);

  // The end: no mistakes, and the summary lists it on its own line and row.
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-stop'));
  });
  await say(app, {
    type: 'done',
    result: { v: 2, take: 't1', from: first, to: first + 7, secs: 20, marks: [{ ...wrong, corrected: true }], score: { reached: 7, mistakes: 0, tajweed: 0, unclear: 0, corrected: 1, accuracy: 1 }, start: first },
  });
  await app.until(() => app.screen.queryByTestId('recite-result') != null, 'the take’s result in the bar');
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('recite-result'));
  });
  await app.until(() => app.screen.queryByTestId('take-summary-mistakes') != null, 'the summary');
  expect(plain(app.screen.getByTestId('take-summary-mistakes').props.children)).toBe('No mistakes');
  expect(app.screen.getByText('1 corrected')).toBeTruthy();
  expect(plain(app.screen.getByTestId('take-summary-finding-title').props.children)).toMatch(/^Corrected · /);
  expect(app.screen.getByTestId('take-summary-swatch-corrected')).toBeTruthy();

  // Kept as the take's, uncounted, and never remembered on the page as a word to fix.
  const store = app.mods.require('src/lib/reciteMemory/store');
  const { wordMemories } = app.mods.require('src/lib/reciteMemory/memory');
  await app.until(() => store.memoryRecords(setup.uid).some((r: { kind: string }) => r.kind === 'take'), 'the take to be kept');
  const take = store.memoryRecords(setup.uid).find((r: { kind: string }) => r.kind === 'take');
  expect(take).toMatchObject({ mistakes: 0, marks: [{ id: 'c', corrected: true }] });
  expect([...wordMemories(store.memoryRecords(setup.uid)).values()].filter((m: { open: boolean }) => m.open)).toEqual([]);
  await app.close();
});
