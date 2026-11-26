// Spot tests in All activity (RMEM-5, ACT-34; Majd, Nov 26 2026: "why are spot tests not searchable under all activity? they
// should be"). A spot test is its own kind of entry (ACT-34, Nov 23 2026: "its own thing like recited or memorized"), so All
// activity lists it as one: a row in All that the search finds by its surah, its date, "spot test" and how it ended, and a
// Spot tests filter after Recitations, which then lists the other takes alone. Before, a spot test showed only inside
// Recitations, so All and its search never found one.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone, type Booted } from '../harness/phone';
import { readerStack } from '../harness/screens';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));

// Word indexes in the word data: Yusuf 87–89 on page 246, and Ar-Ra'd 1–4, from page 249.
const YUSUF = { from: 31413, to: 31458 };
const RAAD = { from: 31805, to: 31896 };

function take(id: string, at: number, day: string, fields: Partial<TakeRecord> = {}): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: false, ...YUSUF, secs: 100, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1, marks: [], passed: [], recordingId: null, ...fields };
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getByTestId(testID);
  await app.act(async () => {
    fireEvent.press(el);
  });
}

async function search(app: OpenApp, text: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.changeText(app.screen.getByTestId('activity-search'), text);
  });
}

const spotRow = (app: OpenApp) => app.screen.queryByTestId('item-spot-take-test');
const nothingMatches = (app: OpenApp) => app.screen.queryByTestId('all-empty') != null;

function stack(mods: Booted) {
  const { setQuranWordsForTests } = mods.require<typeof import('../../../src/lib/recite/quranWords')>('src/lib/recite/quranWords');
  setQuranWordsForTests(mods.require<{ wordsData: () => never }>('src/lib/recite/__fixtures__/quranWords').wordsData());
  return readerStack(mods);
}

it('[RMEM-5] [ACT-34] a spot test is in All activity: a row in All that the search finds, and a Spot tests filter apart from Recitations', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-19 20:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const { remember } = app.mods.require<typeof import('../../../src/lib/reciteMemory/store')>('src/lib/reciteMemory/store');
  // Yusuf recited on Wednesday; on Thursday a spot test on Ar-Ra'd, stopped early with one mistake.
  await app.act(() => remember(app.uid, take('take-plain', Date.now() - 86_400_000, '2026-11-18')));
  await app.act(() => remember(app.uid, take('take-test', Date.now(), '2026-11-19', { ...RAAD, mistakes: 1, accuracy: 0.98, spotTest: { pages: 0.5, finished: false } })));
  await app.untilSynced();
  await app.close();

  setNow('2026-11-19 20:10');
  app = await phone.open(stack);
  await app.untilLoaded();
  await app.act(async () => nav(app).current.navigate('ActivityAll'));
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'ActivityAll', 'All activity');

  // All: the spot test is a row of its own, how it ended, then its ayat and mistakes.
  await app.until(() => spotRow(app) != null, 'the spot test in All');
  expect(app.screen.getByText('Spot test · Stopped early')).toBeTruthy();
  // Its place, page first (NAME-1), then its mistakes.
  expect(app.screen.getByText("Ar\u2011Ra'd, 1st page · start · 1 mistake")).toBeTruthy();

  // The search finds it by its surah, by what it is, by how it ended and by its date; not by another surah or day.
  for (const words of ["Ra'd", 'spot test', 'stopped', 'nov 19']) {
    await search(app, words);
    await app.until(() => spotRow(app) != null, `the spot test found by "${words}"`);
  }
  for (const words of ['kahf', 'nov 18', 'finished']) {
    await search(app, words);
    await app.until(() => spotRow(app) == null && nothingMatches(app), `nothing found by "${words}"`);
  }
  await search(app, '');

  // Its own filter, after Recitations: the spot test alone.
  await tap(app, 'filter-spotTest');
  await app.until(() => spotRow(app) != null, 'the spot test under Spot tests');
  // Recitations then lists the other take alone.
  await tap(app, 'filter-recitation');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 1, 'the Yusuf take alone in Recitations');
  expect(app.screen.getByTestId('activity-all-takes-count').props.children).toBe('1 take · 0 mistakes');

  // A tap on the spot test shows it on its page with its marks, as a take does.
  await tap(app, 'filter-spotTest');
  await tap(app, 'item-spot-take-test');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 249, showTake: 'take-test' });
  await app.close();
});
