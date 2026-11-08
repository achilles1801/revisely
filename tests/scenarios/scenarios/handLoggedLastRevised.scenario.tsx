// Pages logged as revised elsewhere are revised that day (ACT-16): each page's last revised day and
// number of revisions take them at once, and keep them after a cold start (the self-heal re-derives
// pages from the sessions and these logs), so Pages by strength, Coverage and weakest-first plans see
// revision done elsewhere. Deleting the log takes them back. On Nov 7 2026 the self-heal read the
// sessions alone, so a log never moved a page's last revised day.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { ActivityDayView, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { getServerDoc } from '../harness/serverDocs';
import { AddToDay } from '../harness/addToDay';

// The plan starts on Monday Nov 2 2026, 5 pages a day from 1–20 memorized: Mon 1–5, Tue 6–10.
const TODAY = '2026-11-03';

async function page(app: OpenApp, n: number) {
  return getServerDoc(`users/${app.uid}/pages/${n}`);
}

/** Waits until the server's page `n` passes `ok` (the re-derive reads the server, then saves). */
async function untilPage(app: OpenApp, n: number, ok: (p: Record<string, unknown> | null) => boolean, what: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (ok(await page(app, n))) return;
    await app.idle(250);
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(await page(app, n))}`);
}

it('[ACT-16] pages 9–10 logged as revised elsewhere on Tuesday: revised that day, once; still so after a cold start; deleted, back', async () => {
  setZone(ZONES.london);
  setNow('2026-11-02 08:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();
  // An App Store account, not a tester: this is everyone's since the November 2026 release.

  // Monday's session, so there are sessions to re-derive the pages from.
  setNow('2026-11-02 20:00');
  let app = await phone.open(homeStack);
  let home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.swipeThrough(session.pages().length);
  await app.untilSynced();
  await app.close();

  setNow(`${TODAY} 21:00`);
  app = await phone.open(homeStack);
  home = new Home(app);
  await home.ready();
  await new ActivityDayView(app).open(TODAY);
  await new AddToDay(app).revisedElsewhere([9, 10]);
  await untilPage(app, 9, (p) => String(p?.lastRevisedAt).startsWith(TODAY), 'page 9 to be revised today');
  expect((await page(app, 9))?.totalRevisionCount).toBe(1);
  expect(String((await page(app, 6))?.lastRevisedAt)).toBe('null');
  await app.untilSynced();
  await app.close();

  // A cold start: the self-heal keeps it.
  setNow(`${TODAY} 21:30`);
  app = await phone.open(homeStack);
  await new Home(app).ready();
  await app.idle(1500);
  await app.untilSynced();
  expect(String((await page(app, 9))?.lastRevisedAt)).toMatch(/^2026-11-03/);
  expect((await page(app, 9))?.totalRevisionCount).toBe(1);
  expect(String((await page(app, 1))?.lastRevisedAt)).toMatch(/^2026-11-02/);

  // Deleted from the Revised block's menu (VoiceOver's action, confirmed): page 9 is unrevised again.
  await new ActivityDayView(app).open(TODAY);
  const { fireEvent } = app.mods.rtl;
  const { Alert } = app.mods.require<typeof import('react-native')>('react-native');
  (Alert as { alert: unknown }).alert = (_t: string, _m?: string, buttons?: { style?: string; onPress?: () => void }[]) =>
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  type A11y = { name: string };
  const header = () =>
    app.screen.queryAllByLabelText(/^Revised(,|$)/).find((el) => (el.props.accessibilityActions ?? []).some((a: A11y) => a.name.startsWith('delete-manual-')));
  await app.until(() => header() != null, 'the Revised header with the log’s Delete');
  const action = (header()!.props.accessibilityActions as A11y[]).find((a) => a.name.startsWith('delete-manual-'))!.name;
  await app.act(async () => {
    fireEvent(header()!, 'accessibilityAction', { nativeEvent: { actionName: action } });
  });
  await untilPage(app, 9, (p) => String(p?.lastRevisedAt) === 'null', 'page 9 to be unrevised again');
  expect((await page(app, 9))?.totalRevisionCount).toBe(0);
  await app.close();
});
