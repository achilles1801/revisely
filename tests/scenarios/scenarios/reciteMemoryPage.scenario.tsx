// Recite's memory on the page (BEHAVIOUR.md, RMEM-3): the real reader, on an account whose takes are on the server,
// in Revisely Dev (the live check's gate: the Dev app, a tester, the microphone stream).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone } from '../harness/phone';
import { readerStack } from '../harness/screens';
import { tapPoint } from '../harness/pager';
import { plain } from '../harness/words';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
// The checker sleeps on Cloud Run; nothing here reaches it.
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));

const W = 31453; // ٱلْمُتَصَدِّقِينَ, Yusuf 88, on page 246
const lookalike: Mark = { id: `${W}:word:lookalike`, w: W, ayah: [12, 88], kind: 'word', detail: 'lookalike', heard: 'ٱلْمُحْسِنِينَ', heardExact: true, t: [41.2, 42], sure: 'clear' };

function take(id: string, at: number, day: string, marks: Mark[]): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: id === 'take1', from: 31413, to: 31458, secs: 100, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy: 1 - marks.length / 124, marks, passed: [], recordingId: null };
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

async function openPage246(phone: Phone): Promise<OpenApp> {
  const app = await phone.open(readerStack);
  await app.untilLoaded();
  const { setQuranWordsForTests } = app.mods.require('src/lib/recite/quranWords');
  setQuranWordsForTests(app.mods.require('src/lib/recite/__fixtures__/quranWords').wordsData());
  await app.act(() => nav(app).current.navigate('QuranReader', { pageNumber: 246 }));
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  return app;
}

const past = (app: OpenApp) => app.screen.queryByTestId('past-mark-word');

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

it('[RMEM-3] [RMEM-4] a word missed before stays marked on the page; its card shows its takes and the clear rule; Clear now takes it off, with Undo; See all shows the passage’s progress', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-13 20:12');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  // Friday, with the page hidden: ٱلْمُحْسِنِينَ for ٱلْمُتَصَدِّقِينَ. Sunday: said right.
  await app.act(() => remember(app.uid, take('take1', Date.now(), '2026-11-13', [lookalike])));
  setNow('2026-11-15 19:51');
  await app.act(() => remember(app.uid, take('take2', Date.now(), '2026-11-15', [])));
  await app.untilSynced();
  await app.close();

  app = await openPage246(phone);
  await app.until(() => past(app) != null, 'the remembered mistake on page 246');
  const words = app.mods.require('src/lib/recite/quranWords').getQuranWords();
  expect(past(app)?.props.accessibilityLabel).toBe(`Past mistake: Wrong word, ${words.uthmani(W)}`);
  expect(app.screen.getByTestId('past-highlight-word')).toBeTruthy();

  // A tap on the word: its history.
  const box = app.mods.require('src/lib/reciteLive/geometry').wordBox(words, W);
  await app.act(() => tapPoint((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
  await app.until(() => app.screen.queryByTestId('past-card') != null, 'the word’s card');
  expect(plain(app.screen.getByTestId('past-card-place').props.children)).toBe('Yusuf, ayah 88 · wrong in 1 of 2 takes');
  expect(app.screen.getAllByTestId('past-try-right')).toHaveLength(1);
  expect(app.screen.getAllByTestId('past-try-wrong')).toHaveLength(1);
  expect(app.screen.getByText('Right today. Right again on another day clears it.')).toBeTruthy();
  // No recording of these takes on this phone: nothing to play.
  expect(app.screen.queryByTestId('past-try-play')).toBeNull();

  // Clear now: off the page at once, kept on the account; Undo puts it back.
  await tap(app, 'past-card-clear');
  await app.until(() => past(app) == null && app.screen.queryByTestId('past-card') == null, 'the mark to go');
  await app.untilSynced();
  await tap(app, 'undo-toast-action');
  await app.until(() => past(app) != null, 'Undo to put the mark back');
  await app.untilSynced();

  // See all: the passage's progress, both takes, up since Friday.
  await app.act(() => tapPoint((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
  await tap(app, 'past-card-see-all');
  await app.until(() => app.screen.queryByTestId('progress-sheet') != null, 'the passage’s progress');
  expect(app.screen.getByTestId('progress-line').props.children).toBe('Up from 99.1% on Fri 13 Nov · 2 takes');
  expect(app.screen.getByTestId('progress-latest').props.children).toBe('100%');
  expect(app.screen.getAllByTestId('progress-take')).toHaveLength(2);
  expect(app.screen.getAllByTestId('progress-open-word')).toHaveLength(1);
  await app.close();
});

it('[RMEM-5] a day lists its takes in one Recited row that opens them; Show on the page opens the take with its marks until Done; All activity has Recitations', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 19:51');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  // The revision day (no Fajr boundary on this account): the date.
  const today = '2026-11-15';
  await app.act(() => remember(app.uid, { ...take('take1', Date.now(), today, [lookalike]), hidden: false }));
  await app.untilSynced();
  await app.close();

  app = await phone.open(readerStack);
  await app.untilLoaded();
  const { setQuranWordsForTests } = app.mods.require('src/lib/recite/quranWords');
  setQuranWordsForTests(app.mods.require('src/lib/recite/__fixtures__/quranWords').wordsData());
  await app.act(() => nav(app).current.navigate('ActivityDay', { date: today }));
  await app.until(() => app.screen.queryByTestId('activity-block-recited') != null, 'the Recited row');
  expect(app.screen.getByText('1 take')).toBeTruthy();
  // The day lists the take itself, under Recited: its time, length and mistakes.
  await app.until(() => app.screen.queryByTestId('activity-take-line') != null, 'the day’s take');
  expect(app.screen.getByTestId('activity-take-line').props.children).toBe('7:51 PM · 2 min · 1 mistake');

  // A tap: Show on the page, the reader at page 246 with the take's mark, and its bar.
  await tap(app, 'activity-take-head');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 246, showTake: 'take1' });
  await app.until(() => app.screen.queryByTestId('shown-take-bar') != null && app.screen.queryByTestId('live-mark-word') != null, 'the take on its page');
  expect(past(app)).toBeNull();
  await tap(app, 'shown-take-done');
  await app.until(() => app.screen.queryByTestId('shown-take-bar') == null && past(app) != null, 'the page as it is, with the word still to fix');

  // All activity: Recitations, With mistakes.
  await app.act(() => nav(app).current.navigate('ActivityAll'));
  await tap(app, 'filter-recitation');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 1, 'the take in Recitations');
  await tap(app, 'filter-takes-hidden');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 0, 'no take with the page hidden');
  await tap(app, 'filter-takes-mistakes');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 1, 'the take with mistakes');
  await app.close();
});
