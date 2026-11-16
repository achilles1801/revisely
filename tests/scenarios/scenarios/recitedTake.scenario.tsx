// A take in a day's Recited block (BEHAVIOUR.md, RINS-3): a slip into a similar ayah says so under its line, and a hold
// opens its menu, Show on the page and, while Revo is on, Ask Revo about this take. The real day screen, on an account
// whose takes are on the server, in Revisely Dev (the live check's gate: the Dev app, a tester, the microphone stream).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone } from '../harness/phone';
import { readerStack } from '../harness/screens';
import { plain } from '../harness/words';
import type { Mark } from '../../../src/lib/reciteLive/contract';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));
// What Revo is asked is Revo's own business (its scenarios); here, only that the take goes with the question.
jest.mock('../../../src/lib/revo/open', () => ({ ...jest.requireActual('../../../src/lib/revo/open'), openRevo: jest.fn() }));

const W = 31453; // ٱلْمُتَصَدِّقِينَ, Yusuf 88, on page 246
// ٱلْمُحْسِنِينَ for ٱلْمُتَصَدِّقِينَ: the reciter went on with Yusuf 90, which ends with it.
const slip: Mark = {
  id: `${W}:word:lookalike`,
  w: W,
  ayah: [12, 88],
  kind: 'word',
  detail: 'lookalike',
  heard: 'ٱلْمُحْسِنِينَ',
  heardExact: true,
  t: [41.2, 42],
  sure: 'clear',
  into: { w: W, ayah: [12, 90] },
};

function take(id: string, at: number, day: string, marks: Mark[]): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: false, from: 31413, to: 31458, secs: 100, mistakes: marks.length, tajweed: 0, unclear: 0, accuracy: 1 - marks.length / 124, marks, passed: [], recordingId: null };
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

async function openDay(phone: Phone, day: string): Promise<OpenApp> {
  const app = await phone.open(readerStack);
  await app.untilLoaded();
  const { setQuranWordsForTests } = app.mods.require('src/lib/recite/quranWords');
  setQuranWordsForTests(app.mods.require('src/lib/recite/__fixtures__/quranWords').wordsData());
  await app.act(() => nav(app).current.navigate('ActivityDay', { date: day }));
  await app.until(() => app.screen.queryByTestId('activity-block-recited') != null, 'the Recited block');
  return app;
}

async function hold(app: OpenApp): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent(app.screen.getByTestId('activity-take-head'), 'longPress');
  });
  await app.until(() => app.screen.queryByTestId('sheet-action-show') != null, 'the take’s menu');
}

it('[RINS-3] a slip into a similar ayah says so under the take; a hold offers Show on the page, and Ask Revo about this take while Revo is on', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 19:51');
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  const today = '2026-11-15';
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  await app.act(() => remember(app.uid, take('take1', Date.now(), today, [slip])));
  await app.untilSynced();
  await app.close();

  app = await openDay(phone, today);
  expect(app.screen.getByTestId('activity-take-line').props.children).toBe('7:51 PM · 1 mistake');
  const into = app.screen.getAllByTestId('activity-take-into');
  expect(into.map((t) => plain(t.props.children))).toEqual(['You went on with Yusuf 90, a similar ayah']);
  expect(plain(app.screen.getByTestId('activity-take-head').props.accessibilityLabel)).toContain('You went on with Yusuf 90, a similar ayah');

  // Revo off for the account: the menu has Show on the page alone.
  await hold(app);
  expect(app.screen.getByText('Show on the page')).toBeTruthy();
  expect(app.screen.queryByTestId('sheet-action-ask-revo')).toBeNull();
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('sheet-action-show'));
  });
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'QuranReader', 'the reader');
  expect(nav(app).current.getCurrentRoute()?.params).toMatchObject({ pageNumber: 246, showTake: 'take1' });
  await app.act(() => nav(app).current.goBack());
  await app.until(() => app.screen.queryByTestId('activity-block-recited') != null, 'back on the day');

  // Revo on: Ask Revo about this take, with the take attached; VoiceOver has both as actions.
  await app.act(() => app.mods.require('src/lib/revo/presence').setRevoPresent(true));
  const head = app.screen.getByTestId('activity-take-head');
  expect(head.props.accessibilityActions.map((a: { label: string }) => a.label)).toEqual(['Show on the page', 'Ask Revo about this take']);
  await hold(app);
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('sheet-action-ask-revo'));
  });
  const { openRevo } = app.mods.require<{ openRevo: jest.Mock }>('src/lib/revo/open');
  await app.until(() => openRevo.mock.calls.length === 1, 'Revo to open');
  const attach = openRevo.mock.calls[0][0].attach;
  expect(attach.kind).toBe('reciteTake');
  expect(attach.day).toBe(today);
  expect(attach.facts.mistakes).toBe(1);
  expect(attach.facts.marks[0].into).toMatchObject({ ending: false });
  await app.close();
});
