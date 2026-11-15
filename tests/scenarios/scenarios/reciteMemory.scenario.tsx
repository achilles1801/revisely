// Recite's memory (BEHAVIOUR.md, RMEM-*): each take with Mark mistakes is kept on the account, through the outbox and
// the real rules, so another phone of the account has it.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { Booted, OpenApp, Phone } from '../harness/phone';
import type { MemoryRecord, TakeRecord } from '../../../src/lib/reciteMemory/record';
import type { Mark } from '../../../src/lib/reciteLive/contract';

const lookalike: Mark = {
  id: '31453:word:lookalike',
  w: 31453,
  ayah: [12, 88],
  kind: 'word',
  detail: 'lookalike',
  heard: 'ٱلْمُحْسِنِينَ',
  heardExact: true,
  t: [41.2, 42],
  sure: 'clear',
};
const skipped: Mark = { id: '31440:skipped:', w: 31440, ayah: [12, 88], kind: 'skipped', sure: 'clear' };

/** What a screen showing the memory sees on this launch. */
const seen: { records: MemoryRecord[] } = { records: [] };

/** A screen that shows Recite's memory, as the reader does (on for this account). */
function memoryScreen(mods: Booted) {
  const { useApp } = mods.require('src/context/AppContext');
  const { useMemoryRecords } = mods.require('src/lib/reciteMemory/store');
  function Memory() {
    const { user } = useApp();
    seen.records = useMemoryRecords(user?.id, true);
    return null;
  }
  return mods.React.createElement(Memory);
}

function take(now: number, marks: Mark[], over: Partial<TakeRecord> = {}): TakeRecord {
  return {
    id: 'TakeYusuf87to90abcde',
    kind: 'take',
    take: 'take-1',
    createdAt: now,
    rev: now,
    day: '2026-11-15',
    level: 'words',
    hidden: true,
    from: 31413,
    to: 31458,
    secs: 102,
    mistakes: marks.length,
    tajweed: 0,
    unclear: 0,
    accuracy: 1 - marks.length / 124,
    marks,
    passed: [],
    recordingId: 'recording-on-phone-a',
    ...over,
  };
}

async function rememberOn(app: OpenApp, record: MemoryRecord) {
  const { remember } = app.mods.require('src/lib/reciteMemory/store');
  await app.act(() => remember(app.uid, record));
  await app.untilSynced();
}

async function memoryOn(phone: Phone, until: (records: MemoryRecord[]) => boolean, what: string): Promise<MemoryRecord[]> {
  const app = await phone.open(memoryScreen);
  await app.untilLoaded();
  await app.until(() => until(seen.records), what);
  const records = seen.records;
  await app.close();
  return records;
}

it('[RMEM-1] a take is kept on the account: another phone has it, follows Not a mistake after the take, and drops it once forgotten', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-15 19:51');
  const a = new Phone('phone A');
  let app = await newAccount(a, { memorized: pagesRange(240, 250), user: { dailyPageCapacity: 5 } });
  const first = take(Date.now(), [lookalike, skipped]);
  await rememberOn(app, first);
  await app.close();

  const b = new Phone('phone B');
  const other = await b.open();
  await other.signIn(a.email!);
  await other.close();
  let records = await memoryOn(b, (rs) => rs.length > 0, "phone B to have phone A's take");
  expect(records).toEqual([first]);

  // Not a mistake on the summary after the take: phone A writes the take again, without that mark.
  setNow('2026-11-15 19:53');
  app = await a.open();
  await app.untilLoaded();
  const fewer = { ...first, rev: Date.now(), marks: [lookalike], mistakes: 1, accuracy: 1 - 1 / 124 };
  await rememberOn(app, fewer);
  await app.close();
  records = await memoryOn(b, (rs) => (rs[0] as TakeRecord | undefined)?.marks.length === 1, 'phone B to have the take without the skipped word');
  expect(records).toEqual([fewer]);

  // Forgotten on phone A: gone from phone B's memory too (a tombstone, so B's next read drops it).
  setNow('2026-11-15 20:10');
  app = await a.open();
  await app.untilLoaded();
  await rememberOn(app, { ...fewer, rev: Date.now(), deleted: true });
  await app.close();
  records = await memoryOn(b, (rs) => rs[0]?.deleted === true, 'phone B to drop the forgotten take');
  const { wordMemories } = jest.requireActual('../../../src/lib/reciteMemory/memory');
  expect(wordMemories(records).size).toBe(0);
});
