// The daily log (BEHAVIOUR.md, LOG-*): notes kept, edited and deleted, on this phone and the next.

import { advance, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { DailyLog, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';

it('[LOG-1] [LOG-2] [SYNC-3] S3 (PR #197): notes stay, one each; an edit or a delete touches only that note, on every phone', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  let app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await app.close();

  setNow('2026-11-03 21:00');
  app = await phone.open(homeStack);
  await new Home(app).ready();
  let log = new DailyLog(app);
  await log.open();
  // A minute between notes (the scenario's clock stands still otherwise).
  await log.add('first');
  advance(MINUTE);
  await log.add('second');
  advance(MINUTE);
  await log.add('third');
  advance(MINUTE);
  expect(log.entries()).toEqual([
    { kind: 'Note', text: 'first' },
    { kind: 'Note', text: 'second' },
    { kind: 'Note', text: 'third' },
  ]);
  await log.edit('second', 'second, edited');
  await log.delete('first');
  expect(log.entries().map((e) => e.text)).toEqual(['second, edited', 'third']);
  await log.back();
  await app.untilSynced();
  await app.close();

  // Reopened: the same two.
  app = await phone.open(homeStack);
  await new Home(app).ready();
  log = new DailyLog(app);
  await log.open('2026-11-03');
  await app.until(() => log.entries().length === 2, 'the day to load');
  expect(log.entries().map((e) => e.text)).toEqual(['second, edited', 'third']);
  await app.close();

  // Another phone: the same two.
  const other = new Phone('second phone');
  const second = await other.open(homeStack);
  await second.signIn(phone.email!);
  await new Home(second).ready();
  const theirs = new DailyLog(second);
  await theirs.open('2026-11-03');
  await second.until(() => theirs.entries().length === 2, 'the day to load on the second phone');
  expect(theirs.entries().map((e) => e.text)).toEqual(['second, edited', 'third']);
  await second.close();
});

it('[LOG-3] [DAY-2] after midnight, before Fajr, a note goes to the revision day', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  let app = await newAccount(phone, {
    memorized: pagesRange(1, 20),
    user: { dailyPageCapacity: 5, fajrBoundaryEnabled: true, locationCoords: { latitude: 41.88, longitude: -87.63 } },
  });
  await app.close();
  setNow('2026-11-03 00:40');
  app = await phone.open(homeStack);
  await new Home(app).ready();
  const log = new DailyLog(app);
  await log.open();
  await log.add('late night');
  await log.back();
  await app.untilSynced();
  await app.close();
  // Read as Monday's (the revision day), not Tuesday's.
  app = await phone.open(homeStack);
  await new Home(app).ready();
  const monday = new DailyLog(app);
  await monday.open('2026-11-02');
  await app.until(() => monday.entries().length === 1, 'Monday to hold the note');
  await monday.back();
  const tuesday = new DailyLog(app);
  await tuesday.open('2026-11-03');
  await app.idle(500);
  expect(tuesday.entries()).toEqual([]);
  await app.close();
});

it('[LOG-1] two notes sent back to back, the second before the first has shown: both stay', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await app.close();

  setNow('2026-11-03 21:00');
  const opened = await phone.open(homeStack);
  await new Home(opened).ready();
  const log = new DailyLog(opened);
  await log.open();
  const { fireEvent, within } = opened.mods.rtl;
  const send = async (text: string) => {
    fireEvent.press(within(opened.screen.getByTestId('journal-kind')).getByText('Note'));
    await opened.act(async () => {
      fireEvent.changeText(opened.screen.getByTestId('journal-text-input'), text);
    });
    fireEvent.press(opened.screen.getByTestId('journal-send'));
    await opened.act(async () => {});
  };
  await send('first');
  await send('second');
  await opened.until(() => log.entries().length === 2, 'both notes in the log');
  await opened.untilSynced();
  // The clock stands still, so both notes share a time: the order is by id, not checked here.
  expect(log.entries().map((e) => e.text).sort()).toEqual(['first', 'second']);
  await log.back();
  await opened.close();
});
