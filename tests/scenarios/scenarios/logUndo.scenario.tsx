// A note on a day in Activity (BEHAVIOUR.md ACT-6; Majd, Nov 23 2026: "yes remove that page and build what u suggested",
// the old Today log): a hold opens Edit, Copy and Delete. Delete takes it off at once with Undo, and it is deleted once
// the five seconds pass or the day is left. Edit is the day's own Note sheet, filled in.

import { advance, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { DailyLog, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import type { OpenApp } from '../harness/phone';

type Service = typeof import('../../../src/services/firestoreService');
type Queue = typeof import('../../../src/lib/offline/queue');

async function onServer(app: OpenApp, day: string): Promise<string[]> {
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const days = await app.act(() => svc.getJournalEntries(400, app.uid));
  return days.find((d) => d.date === day)?.entries.map((e) => e.text) ?? [];
}

async function openDay(): Promise<{ app: OpenApp; log: DailyLog }> {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone();
  await (await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } })).close();
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  const log = new DailyLog(app);
  await log.open();
  return { app, log };
}

it('[ACT-6] [LOG-2] Delete on a note takes it off at once, with an Undo that is seen; undone it stays; otherwise it is deleted after five seconds, or on leaving the day', async () => {
  const { app, log } = await openDay();
  // Nothing is confirmed: a dialog would hold the note on screen.
  const { Alert, StyleSheet } = app.mods.require<typeof import('react-native')>('react-native');
  const asked: string[] = [];
  (Alert as { alert: unknown }).alert = (title: string) => void asked.push(title);
  await log.add('first');
  advance(MINUTE);
  await log.add('second');
  advance(MINUTE);
  await log.add('third');
  await app.untilSynced();
  const { fireEvent } = app.mods.rtl;

  // Gone at once, with Undo; Undo brings it back, and the server keeps it.
  await log.delete('first');
  expect(asked).toEqual([]);
  expect(log.entries().map((e) => e.text)).toEqual(['second', 'third']);
  await app.until(() => app.screen.queryByTestId('undo-toast-action') != null, 'Undo');
  // Seen, not only there: fully opaque from its first frame. It used to fade in from 0, and on
  // Android the fade was now and then never applied, leaving an Undo nobody could see (E2E 05).
  for (const id of ['undo-toast', 'undo-toast-bar']) {
    const style = StyleSheet.flatten(app.screen.getByTestId(id).props.style) ?? {};
    expect({ id, opacity: style.opacity ?? 1 }).toEqual({ id, opacity: 1 });
  }
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('undo-toast-action'));
  });
  await app.until(() => log.entries().length === 3, 'Undo to bring the note back');
  expect(log.entries().map((e) => e.text)).toEqual(['first', 'second', 'third']);
  await app.idle(6000);
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['first', 'second', 'third']);

  // Not undone: deleted once the five seconds have passed.
  await log.delete('second');
  expect(log.entries().map((e) => e.text)).toEqual(['first', 'third']);
  expect(await onServer(app, '2026-11-05')).toEqual(['first', 'second', 'third']);
  await app.idle(5500);
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['first', 'third']);

  // Leaving the day saves a delete still waiting.
  await log.delete('third');
  await log.back();
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['first']);
  expect(asked).toEqual([]);
  await app.close();
});

it('[ACT-6] holding a note offers Edit, Copy and Delete; Copy puts its text on the clipboard', async () => {
  const { app, log } = await openDay();
  await log.add('Two pages, steady');
  const rn = app.mods.require<typeof import('react-native')>('react-native');
  const copied: string[] = [];
  const registry = rn.TurboModuleRegistry as { getEnforcing: (name: string) => unknown };
  const real = registry.getEnforcing;
  registry.getEnforcing = (name: string) => (name === 'Clipboard' ? { setString: (t: string) => copied.push(t) } : real(name));
  const { fireEvent, within } = app.mods.rtl;
  const menu = await log.menu('Two pages, steady');
  expect(within(menu).queryByText('Edit')).not.toBeNull();
  expect(within(menu).queryByText('Delete')).not.toBeNull();
  await app.act(async () => {
    fireEvent.press(within(menu).getByText('Copy'));
  });
  await app.until(() => copied.length > 0, 'the note to be copied');
  expect(copied).toEqual(['Two pages, steady']);
  registry.getEnforcing = real;
  await app.close();
});

it('[ACT-6] [LOG-2] Edit opens the Note sheet filled in, and Save changes only that note, keeping its time', async () => {
  const { app, log } = await openDay();
  await log.add('keep me');
  advance(MINUTE);
  await log.add('change me');
  const before = log.rows().find((r) => r.text === 'change me')!.time;
  const { fireEvent, within } = app.mods.rtl;
  const menu = await log.menu('change me');
  await app.act(async () => {
    fireEvent.press(within(menu).getByText('Edit'));
  });
  await app.until(() => app.screen.queryByTestId('add-note-text') != null, 'the Note sheet');
  expect(app.screen.getByTestId('add-note-text').props.value).toBe('change me');
  await app.act(async () => {
    fireEvent.changeText(app.screen.getByTestId('add-note-text'), 'changed');
  });
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('add-note-add'));
  });
  await app.until(() => log.entries().some((e) => e.text === 'changed'), 'the edit to show');
  expect(log.entries().map((e) => e.text)).toEqual(['keep me', 'changed']);
  expect(log.rows().find((r) => r.text === 'changed')!.time).toBe(before);
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['keep me', 'changed']);
  await app.close();
});

it('[ACT-6] an older Revised log entry keeps its kind and minutes through an edit, and can go', async () => {
  const { app, log } = await openDay();
  const { queueChange } = app.mods.require<Queue>('src/lib/offline/queue');
  await log.back();
  await app.act(() => queueChange({ kind: 'journal.entry.add', date: '2026-11-05', entry: { id: 'old1', at: Date.now(), kind: 'revision', text: 'Maryam', minutes: 25 } }));
  await app.untilSynced();
  await log.open('2026-11-05');
  await app.until(() => log.entries().length === 1, 'the older entry');
  expect(log.entries()).toEqual([{ kind: 'Revision', text: 'Maryam' }]);
  const { fireEvent, within } = app.mods.rtl;
  const menu = await log.menu('Maryam');
  await app.act(async () => {
    fireEvent.press(within(menu).getByText('Edit'));
  });
  await app.until(() => app.screen.queryByTestId('add-note-minutes') != null, 'its minutes in the sheet');
  expect(app.screen.getByTestId('add-note-minutes').props.value).toBe('25');
  await app.act(async () => {
    fireEvent.changeText(app.screen.getByTestId('add-note-text'), 'Maryam and Taha');
    fireEvent.changeText(app.screen.getByTestId('add-note-minutes'), '30');
  });
  await app.act(async () => {
    fireEvent.press(app.screen.getByTestId('add-note-add'));
  });
  await app.until(() => log.entries().some((e) => e.text === 'Maryam and Taha'), 'the edit to show');
  await app.untilSynced();
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const day = await app.act(() => svc.getJournalEntry('2026-11-05', app.uid));
  expect(day?.entries.map((e) => [e.kind, e.text, e.minutes])).toEqual([['revision', 'Maryam and Taha', 30]]);
  await app.idle(400);
  await log.delete('Maryam and Taha');
  await log.back();
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual([]);
  await app.close();
});

it('[ACT-6] the Notes header deletes all the day’s notes, confirmed first', async () => {
  const { app, log } = await openDay();
  await log.add('one');
  advance(MINUTE);
  await log.add('two');
  await app.untilSynced();
  const { fireEvent } = app.mods.rtl;
  const header = app.screen.getAllByLabelText(/^Notes/).find((el) => (el.props.accessibilityActions ?? []).some((a: { name: string }) => a.name === 'delete-all'))!;
  await app.act(async () => {
    fireEvent(header, 'accessibilityAction', { nativeEvent: { actionName: 'delete-all' } });
  });
  await app.until(() => log.entries().length === 0, 'the notes to go');
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual([]);
  await app.close();
});
