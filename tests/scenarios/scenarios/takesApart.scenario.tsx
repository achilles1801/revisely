// Takes kept apart from recordings (BEHAVIOUR.md, RMEM-6; Majd, Nov 16 2026: "separate normal recordings from those
// recorded with mistake detection because it's clobbering the journals"). The real day screen and All activity, on an
// account whose takes are on the server, with this phone's files: one recording of the user's own, a take's audio, and
// a take saved before as a plain recording. In Revisely Dev (the live check's gate: the Dev app, a tester, the
// microphone stream).

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { OpenApp, Phone } from '../harness/phone';
import { readerStack } from '../harness/screens';
import type { TakeRecord } from '../../../src/lib/reciteMemory/record';

jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/lib/recite/micSource', () => ({ ...jest.requireActual('../../../src/lib/recite/micSource'), isMicStreamAvailable: () => true }));
jest.mock('../../../src/lib/reciteCheck/service', () => ({ ...jest.requireActual('../../../src/lib/reciteCheck/service'), warmUpReciteCheck: jest.fn() }));

type Recordings = typeof import('../../../src/lib/recordings');

function take(id: string, at: number, day: string, recordingId: string): TakeRecord {
  return { id, kind: 'take', take: null, createdAt: at, rev: at, day, level: 'words', hidden: false, from: 31413, to: 31458, secs: 100, mistakes: 0, tajweed: 0, unclear: 0, accuracy: 1, marks: [], passed: [], recordingId };
}

const nav = (app: OpenApp) => app.mods.require<{ navigation: { current: any } }>('./navRef').navigation;

/** A file in the phone's caches, kept as a recording of `day` (lib/recordings), as the recorder or a take leaves it. */
async function keep(app: OpenApp, name: string, day: string, opts: { take?: boolean; localOnly?: boolean }): Promise<string> {
  const rec = app.mods.require<Recordings>('src/lib/recordings');
  const fs = jest.requireActual<typeof import('fs')>('fs');
  const path = jest.requireActual<typeof import('path')>('path');
  const temp = path.join(app.phone.folder, 'Caches', name);
  fs.mkdirSync(path.dirname(temp), { recursive: true });
  fs.writeFileSync(temp, Buffer.alloc(4096, 1));
  const kept = await app.act(() =>
    rec.appendSegment(null, `file://${temp}`, { kind: 'reading', day, segmentMs: 8000, pageMarks: [{ atMs: 0, page: 246 }], ...opts }),
  );
  expect(kept.kept).toBe(true);
  return kept.id as string;
}

async function tap(app: OpenApp, testID: string): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.until(() => app.screen.queryByTestId(testID) != null, testID);
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId(testID));
  });
  await app.idle(50);
}

it('[RMEM-6] a take is never a recording: the day’s Read and All activity’s recordings list only the user’s own; the takes, an old one sorted out of the recordings, are in the day’s Recited, ▶ their audio', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 19:51');
  const today = '2026-11-15';
  const phone = new Phone('phone');
  let app = await newAccount(phone, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  await markPreviewTester(app.uid);
  await app.until(() => app.app.user?.previewTester === true, 'the account to be a tester');
  // The user's own recording; a take's audio, as a take keeps it now; a take's audio saved before, as a plain recording.
  const mine = await keep(app, 'mine.m4a', today, {});
  const audio = await keep(app, 'take-new.wav', today, { take: true, localOnly: true });
  const old = await keep(app, 'take-old.wav', today, { localOnly: true });
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  await app.act(() => remember(app.uid, take('take-old', Date.now() - 600_000, today, old)));
  await app.act(() => remember(app.uid, take('take-new', Date.now(), today, audio)));
  await app.untilSynced();
  await app.close();

  app = await phone.open(readerStack);
  await app.untilLoaded();
  const { setQuranWordsForTests } = app.mods.require('src/lib/recite/quranWords');
  setQuranWordsForTests(app.mods.require('src/lib/recite/__fixtures__/quranWords').wordsData());
  await app.act(() => nav(app).current.navigate('ActivityDay', { date: today }));
  await app.until(() => app.screen.queryByTestId('activity-block-recited') != null, 'the Recited row');

  // The day: Read holds the user's recording alone; the takes are in their own block, Recited.
  await app.until(() => app.screen.queryByTestId(`recording-${mine}`) != null, 'the user’s recording under Read');
  expect(app.screen.queryByTestId(`recording-${audio}`)).toBeNull();
  expect(app.screen.queryByTestId(`recording-${old}`)).toBeNull();
  expect(app.screen.getByText('2 takes')).toBeTruthy();
  const rec = app.mods.require<Recordings>('src/lib/recordings');
  expect((await app.act(() => rec.listRecordings())).map((r) => r.id)).toEqual([mine]);
  expect((await app.act(() => rec.listRecordings('takes'))).map((r) => r.id).sort()).toEqual([audio, old].sort());

  // Each take is a row of its own, with ▶ its audio (RMEM-5).
  await app.until(() => app.screen.queryAllByTestId('activity-take-head').length === 2, 'the day’s two takes');
  expect(app.screen.getAllByTestId('activity-take-play')).toHaveLength(2);

  // All activity's Recitations: both takes. Its recordings: the user's own alone.
  await app.act(() => nav(app).current.navigate('ActivityAll', { kind: 'recitation' }));
  await app.until(() => nav(app).current.getCurrentRoute()?.name === 'ActivityAll', 'All activity');
  await app.until(() => app.screen.queryAllByTestId('activity-all-take').length === 2, 'both takes in Recitations');
  await tap(app, 'filter-recording');
  await app.until(() => app.screen.queryAllByTestId(/^item-recording-/).length === 1, 'one recording in All activity');
  expect(app.screen.getByTestId(`item-recording-${mine}`)).toBeTruthy();
  await app.close();
});
