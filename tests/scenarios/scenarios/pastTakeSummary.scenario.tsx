// A finished take's summary opens again from its card (BEHAVIOUR.md, RMEM-8; Majd, Nov 22 2026: "make that take card
// clickable and have it open that days summary popup sheet"): the real Activity and reader, on an account whose takes
// are on the server, in Revisely Dev (the live check's gate: the Dev app, a tester, the microphone stream).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone } from '../harness/phone';
import { readerStack } from '../harness/screens';
import { plain } from '../harness/words';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import type { MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
// The checker sleeps on Cloud Run; nothing here reaches it (Put back's label included).
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn(), sendLabel: jest.fn() }));

const W = 31453; // ٱلْمُتَصَدِّقِينَ, Yusuf 88, on page 246
const lookalike: Mark = { id: `${W}:word:lookalike`, w: W, ayah: [12, 88], kind: 'word', detail: 'lookalike', heard: 'ٱلْمُحْسِنِينَ', heardExact: true, t: [41.2, 42], sure: 'clear' };
// Called Not a mistake during the take: kept apart, so it can still be put back.
const slip: Mark = { id: '31443:harakat:', w: 31443, ayah: [12, 88], kind: 'harakat', heard: 'بِبِضَـٰعَةٌ', heardExact: true, slip: { expected: 'ٍ', heard: 'ٌ' }, sure: 'clear' };

function take(id: string, at: number, day: string, marks: Mark[], over: Partial<TakeRecord> = {}): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: false, from: 31413, to: 31458, secs: 100, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy: 1 - marks.length / 124, marks, passed: [], recordingId: null, ...over };
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  // The first of them (All activity lists a row per take, newest first).
  await app.until(() => app.screen.queryAllByTestId(testID).length > 0, testID);
  const el = app.screen.getAllByTestId(testID)[0];
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

it('[RMEM-8] [RECITE-25] a take shown on its page: its card, under the page in the player’s place, opens its summary from the record, with its history, its peeks and Put back; All activity shows the take the same way', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-13 20:12');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  // Friday: the same stretch, clean. Sunday: one wrong word, a haraka called Not a mistake, a word peeked.
  await app.act(() => remember(app.uid, take('take1', Date.now(), '2026-11-13', [])));
  setNow('2026-11-15 19:51');
  const today = '2026-11-15';
  await app.act(() => remember(app.uid, take('take2', Date.now(), today, [lookalike], { removed: [slip], peeked: [31420] })));
  await app.untilSynced();
  await app.close();

  app = await phone.open(readerStack);
  await app.untilLoaded();
  const { setQuranWordsForTests } = app.mods.require('src/lib/recite/quranWords');
  setQuranWordsForTests(app.mods.require('src/lib/recite/__fixtures__/quranWords').wordsData());

  // The day's take: a tap still shows it on its page, with its card (RMEM-5).
  await app.act(() => nav(app).current.navigate('ActivityDay', { date: today }));
  await tap(app, 'activity-take-head');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 246, showTake: 'take2' });
  await app.until(() => app.screen.queryByTestId('shown-take-bar') != null, 'the take on its page');
  // The card is the reader's footer, in the room the page leaves under it: never over the page's last lines.
  const { within } = app.mods.rtl;
  expect(within(app.screen.getByTestId('reader-footer')).getByTestId('shown-take-bar')).toBeTruthy();
  expect(app.screen.queryByTestId('mushaf-scrubber')).toBeNull();

  // Its card opens the summary, as it said when the take ended.
  await tap(app, 'shown-take-open');
  await app.until(() => app.screen.queryByTestId('take-summary') != null, 'the take’s summary');
  expect(app.screen.getByTestId('take-summary-when').props.children).toBe('Today, 7:51 PM');
  expect(app.screen.getByTestId('take-summary-score').props.children).toBe('99.1%');
  expect(app.screen.getByTestId('take-summary-mistakes').props.children).toBe('1 mistake');
  expect(app.screen.getAllByTestId('take-summary-finding-word')).toHaveLength(1);
  // Friday's take of the same stretch (RMEM-7), and the word peeked.
  expect(app.screen.getAllByTestId('take-summary-history-row')).toHaveLength(1);
  expect(app.screen.getAllByTestId('take-summary-peeked-row')).toHaveLength(1);
  // A past take is looked at, not recited again from here: no Recite again.
  expect(app.screen.queryByTestId('take-summary-again')).toBeNull();

  // Put back: the haraka is the take's again, on the account, and the summary counts it.
  await tap(app, 'take-summary-removed-toggle');
  expect(plain(app.screen.getByTestId('take-summary-removed-toggle').props.accessibilityLabel)).toMatch(/1 marked not a mistake/);
  await tap(app, 'take-summary-put-back');
  // This app's own store (the one before closed with its app).
  const { memoryRecords } = app.mods.require('src/lib/reciteMemory/store');
  const take2 = () => (memoryRecords(app.uid) as MemoryRecord[]).find((r) => r.id === 'take2') as TakeRecord | undefined;
  await app.until(() => take2()?.marks.length === 2, 'the mark put back on the take');
  expect(take2()).toMatchObject({ mistakes: 2 });
  expect(take2()?.removed).toBeUndefined();
  await app.until(() => app.screen.queryByTestId('take-summary-mistakes')?.props.children === '2 mistakes', 'the summary to count it');
  await app.untilSynced();

  // Done: back to the take on its page.
  await tap(app, 'take-summary-done');
  await app.until(() => app.screen.queryByTestId('take-summary') == null, 'the summary to close');
  expect(app.screen.getByTestId('shown-take-bar')).toBeTruthy();
  await tap(app, 'shown-take-done');

  // All activity's Recitations: a take shows on its page as a day's does, so its card is one tap away.
  await app.act(() => nav(app).current.navigate('ActivityAll'));
  await tap(app, 'filter-recitation');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 2, 'both takes in Recitations');
  await tap(app, 'activity-all-take');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 246, showTake: 'take2' });
  await app.until(() => app.screen.queryByTestId('shown-take-open') != null, 'the take’s card');
  await app.close();
});
