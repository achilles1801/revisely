// A similar ayah opened from Recite comes back to where you were (BEHAVIOUR.md READ-2). Majd, Nov 21 2026:
// "opprnring similar phrases and clicking one takes me to that page but if i swipe out i lose where i was in the
// previous page/surah so going back should take me back to that exact page i was on". The real reader, in Revisely
// Dev, on an account whose take marked a word that has a similar ayah.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone } from '../harness/phone';
import { readerStack } from '../harness/screens';
import { tapPoint } from '../harness/pager';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
// The checker sleeps on Cloud Run; nothing here reaches it.
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;
const routes = (app: OpenApp): { key: string; name: string; params?: any }[] => nav(app).current.getRootState().routes;

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  const el = app.screen.getAllByTestId(testID).pop();
  await app.act(async () => {
    fireEvent.press(el);
  });
  await app.idle(50);
}

it('[READ-2] a similar ayah opens over the reader, highlighted, and Back returns to the page you left', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-21 10:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(370, 385), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');

  // A take that marked وَأُوتِيَتْ in An-Naml 23, a phrase An-Naml 16 shares.
  const fixture = app.mods.require('src/lib/recite/__fixtures__/quranWords');
  const words = fixture.quranWords();
  const a23 = words.verseFirstWord(27, 23);
  const w = a23 + 4;
  const page = words.pageOf(w);
  const similarPage = words.pageOf(words.verseFirstWord(27, 16));
  const mark: Mark = { id: `${w}:word`, w, ayah: [27, 23], kind: 'word', heard: 'وَأُوهِيَتْ', heardExact: false, t: [10, 11], sure: 'clear' };
  const take: TakeRecord = {
    id: 'take1', kind: 'take', take: null, createdAt: Date.now(), rev: Date.now(), day: '2026-11-21', level: 'words', hidden: false,
    from: a23, to: a23 + 10, secs: 40, mistakes: 1, tajweed: 0, unclear: 0, accuracy: 0.9, marks: [mark], passed: [], recordingId: null,
  };
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  await app.act(() => remember(app.uid, take));
  await app.untilSynced();
  await app.close();

  app = await phone.open(readerStack);
  try {
    await app.untilLoaded();
    app.mods.require('src/lib/recite/quranWords').setQuranWordsForTests(fixture.wordsData());
    await app.act(() => nav(app).current.navigate('QuranReader', { pageNumber: page }));
    await app.until(() => app.screen.queryByTestId('past-mark-word') != null, 'the marked word on its page');
    const left = routes(app).at(-1)!;
    expect(left).toMatchObject({ name: 'QuranReader', params: { pageNumber: page } });

    // The word's card → Similar phrases → An-Naml 16.
    const box = app.mods.require('src/lib/reciteLive/geometry').wordBox(words, w);
    await app.act(() => tapPoint((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
    await tap(app, 'past-card-similar');
    await tap(app, 'similar-27-16');

    // A reader of its own over the one left, the similar ayah highlighted; the one left is still there, on its page.
    await app.until(() => routes(app).length >= 3, 'the similar ayah’s reader');
    expect(routes(app).at(-1)).toMatchObject({ name: 'QuranReader', params: { pageNumber: similarPage, highlight: { sura: 27, ayah: 16 } } });
    expect(routes(app).at(-2)).toMatchObject({ key: left.key, params: { pageNumber: page } });

    // Back: the reader left, as it was.
    await app.act(() => nav(app).current.goBack());
    await app.until(() => routes(app).at(-1)?.key === left.key, 'the reader left');
    expect(routes(app).at(-1)?.params).toMatchObject({ pageNumber: page });
  } finally {
    await app.close();
  }
});
