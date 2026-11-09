// The daily log's swipe and hold (BEHAVIOUR.md ACT-6, Majd's checklist "Daily log: swipe a note
// away, with Undo for 5 seconds; hold a note for Edit and Copy"): a note swiped away goes at once
// with Undo, and is deleted once the five seconds pass, or when the log is left.

import { advance, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { DailyLog, Home, homeStack } from '../harness/screens';
import { Phone } from '../harness/phone';
import type { OpenApp } from '../harness/phone';

type Service = typeof import('../../../src/services/firestoreService');

async function onServer(app: OpenApp, day: string): Promise<string[]> {
  const svc = app.mods.require<Service>('src/services/firestoreService');
  const days = await app.act(() => svc.getJournalEntries(400, app.uid));
  return days.find((d) => d.date === day)?.entries.map((e) => e.text) ?? [];
}

it('[ACT-6] [LOG-2] a note swiped away goes at once, with an Undo that is seen; undone it stays; otherwise it is deleted after five seconds, or on leaving the log', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone();
  await (await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } })).close();
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  // Nothing is confirmed: a dialog would hold the note on screen.
  const { Alert } = app.mods.require<typeof import('react-native')>('react-native');
  const asked: string[] = [];
  const log = new DailyLog(app);
  await log.open();
  (Alert as { alert: unknown }).alert = (title: string) => void asked.push(title);
  await log.add('first');
  advance(MINUTE);
  await log.add('second');
  advance(MINUTE);
  await log.add('third');
  await app.untilSynced();
  const { fireEvent } = app.mods.rtl;
  const swipe = async (text: string) => {
    const row = app.screen
      .queryAllByTestId(/^journal-note-(?!menu)[^-]+$/)
      .find((r) => (r.props.accessibilityLabel ?? '').includes(`, ${text}, `));
    if (!row) throw new Error(`no note "${text}"`);
    await app.act(async () => {
      fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    });
    await app.idle(50);
  };

  // Swiped away: gone at once, with Undo; Undo brings it back, and the server keeps it.
  await swipe('first');
  expect(asked).toEqual([]);
  expect(log.entries().map((e) => e.text)).toEqual(['second', 'third']);
  expect(app.screen.queryByTestId('undo-toast-action')).not.toBeNull();
  // Seen, not only there: fully opaque from its first frame. It used to fade in from 0, and on
  // Android the fade was now and then never applied, leaving an Undo nobody could see (E2E 05).
  const { StyleSheet } = app.mods.require<typeof import('react-native')>('react-native');
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
  await swipe('second');
  expect(log.entries().map((e) => e.text)).toEqual(['first', 'third']);
  expect(await onServer(app, '2026-11-05')).toEqual(['first', 'second', 'third']);
  await app.idle(5500);
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['first', 'third']);

  // Leaving the log saves a delete still waiting.
  await swipe('third');
  await log.back();
  await app.untilSynced();
  expect(await onServer(app, '2026-11-05')).toEqual(['first']);
  expect(asked).toEqual([]);
  await app.close();
});

it('[ACT-6] holding a note offers Edit and Copy; Copy puts its text on the clipboard', async () => {
  setZone(ZONES.chicago);
  setNow('2026-11-05 12:00');
  const phone = new Phone();
  await (await newAccount(phone, { memorized: pagesRange(582, 604), user: { dailyPageCapacity: 5 } })).close();
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  const log = new DailyLog(app);
  await log.open();
  await log.add('Two pages, steady');
  const rn = app.mods.require<typeof import('react-native')>('react-native');
  const copied: string[] = [];
  const registry = rn.TurboModuleRegistry as { getEnforcing: (name: string) => unknown };
  const real = registry.getEnforcing;
  registry.getEnforcing = (name: string) => (name === 'Clipboard' ? { setString: (t: string) => copied.push(t) } : real(name));
  const { fireEvent, within } = app.mods.rtl;
  const row = app.screen.queryAllByTestId(/^journal-note-(?!menu)[^-]+$/)[0];
  await app.act(async () => {
    fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'options' } });
  });
  await app.idle(50);
  const menu = app.screen.getByTestId('journal-note-menu');
  expect(within(menu).queryByText('Edit')).not.toBeNull();
  await app.act(async () => {
    fireEvent.press(within(menu).getByText('Copy'));
  });
  await app.until(() => copied.length > 0, 'the note to be copied');
  expect(copied).toEqual(['Two pages, steady']);
  registry.getEnforcing = real;
  await app.close();
});
