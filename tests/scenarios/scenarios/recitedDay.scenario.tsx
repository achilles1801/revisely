// A take is where the day is looked at (RMEM-5; Majd, Nov 20 2026: "after I finished my recording, I go to my journal
// to go take a look at it ... today is Thursday, so I'll go to Thursday to see what I did"). Activity opens on Overview
// with today picked: its preview lists the day's takes beside what was revised, and the row opens the day at them,
// where each take is a row of its own. Before, the preview had no takes at all, and the day one quiet "1 take ›" row.
// His account had been reset that evening (Reset my data), as here.

import { withAuthRetry } from '../harness/authRetry';
import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone, type Booted } from '../harness/phone';
import { activityStack } from '../harness/screens';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));

type TesterReset = typeof import('../../../src/lib/testerReset');

const W = 31453; // ٱلْمُتَصَدِّقِينَ, Yusuf 88, on page 246
const lookalike: Mark = { id: `${W}:word:lookalike`, w: W, ayah: [12, 88], kind: 'word', detail: 'lookalike', heard: 'ٱلْمُحْسِنِينَ', heardExact: true, t: [41.2, 42], sure: 'clear' };

function take(id: string, at: number, day: string, fields: Partial<TakeRecord> = {}): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: false, from: 31413, to: 31458, secs: 100, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1, marks: [], passed: [], recordingId: null, ...fields };
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

function stack(mods: Booted) {
  const { setQuranWordsForTests } = mods.require<typeof import('../../../src/lib/recite/quranWords')>('src/lib/recite/quranWords');
  setQuranWordsForTests(mods.require<{ wordsData: () => never }>('src/lib/recite/__fixtures__/quranWords').wordsData());
  return activityStack(mods);
}

it('[RMEM-5] [RMEM-6] after Reset my data, a take on Thursday evening is in Overview’s preview of Thursday; its row opens the day, where the take is a row of its own', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-19 20:00');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const { remember } = app.mods.require<typeof import('../../../src/lib/reciteMemory/store')>('src/lib/reciteMemory/store');
  // A take from before the reset, on Wednesday.
  await app.act(() => remember(app.uid, take('take-before', Date.now() - 86_400_000, '2026-11-18', { marks: [lookalike], mistakes: 1 })));
  await app.untilSynced();

  // Settings → Reset my data.
  const { resetMyData } = app.mods.require<TesterReset>('src/lib/testerReset');
  await app.act(async () => {
    await withAuthRetry(() => resetMyData());
  });
  await app.until(() => !app.app.onboardingComplete && app.app.user?.previewTester === true, 'the reset account');

  // 9:41 PM: Yusuf recited with Mark mistakes and the page hidden: one wrong word, two Not clear.
  setNow('2026-11-19 21:41');
  await app.act(() =>
    remember(app.uid, take('take-thu', Date.now(), '2026-11-19', { marks: [lookalike], mistakes: 1, unclear: 2, secs: 243, hidden: true, accuracy: 0.99 })),
  );
  await app.untilSynced();
  await app.close();

  // Activity: Overview, today picked. The preview lists the take beside what was revised.
  setNow('2026-11-19 21:46');
  app = await phone.open(stack);
  await app.untilLoaded();
  await app.act(async () => nav(app).current.navigate('Activity'));
  await app.until(() => app.screen.queryByTestId('preview-row-recited') != null, 'Thursday’s Recited row in the preview');
  const value = String(app.screen.getByTestId('preview-value-recited').props.children);
  expect(value).toMatch(/^Yusuf.* · 1 take$/);
  // The take from before the reset went with it, on this phone too, once the phone knows of the reset; Thursday's stays.
  const store = app.mods.require<typeof import('../../../src/lib/reciteMemory/store')>('src/lib/reciteMemory/store');
  await app.until(() => store.memoryRecords(app.uid).map((r) => r.id).join() === 'take-thu', 'only Thursday’s take on the phone');

  // The row opens Thursday at its takes: the take itself, with its time, length, mistakes and Not clear.
  await tap(app, 'preview-row-recited');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'ActivityDay', 'Thursday');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ date: '2026-11-19', focusBlock: 'recited' });
  await app.until(() => app.screen.queryByTestId('activity-take-head') != null, 'the take, in the day');
  expect(app.screen.getByTestId('activity-take-line').props.children).toBe('9:41 PM · 4 min · 1 mistake · 2 not clear · page hidden');
  expect(app.screen.getByTestId('activity-take-score').props.children).toBe('99.0%');
  expect(app.screen.getByText('1 take')).toBeTruthy();
  // A tap shows it on the page, with its marks.
  await tap(app, 'activity-take-head');
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 246, showTake: 'take-thu' });
  await app.close();
});
