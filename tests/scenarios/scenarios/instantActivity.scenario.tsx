// Activity and Insights filled on first show after a cold start (BEHAVIOUR.md ACT-36; Majd, Nov 26 2026: "ideally someone
// just hops on the app swipes to insights and everything's already loaded"). The tab draws from what the phone kept from
// its last reads, before the server answers; here the second start is offline, so the server never does.

import { setNow, setZone, ZONES } from '../harness/clock';
import { newAccount, pagesRange } from '../harness/account';
import { activityStack, Home } from '../harness/screens';
import { Phone, type OpenApp } from '../harness/phone';

const DAY = '2026-11-24';

async function openActivity(app: OpenApp): Promise<void> {
  const nav = app.mods.require<{ navigation: { current: { navigate: (name: string) => void } | null } }>('./navRef');
  await app.act(async () => nav.navigation.current?.navigate('Activity'));
}

const revisedLabel = (app: OpenApp): string =>
  (app.screen.queryByTestId(`calendar-day-${DAY}`)?.props.accessibilityLabel as string | undefined) ?? '';

/** Milliseconds from now until `pred` holds (letting the app run): 0 when it already does; -1 after 15 s. */
async function msUntil(app: OpenApp, pred: () => boolean): Promise<number> {
  if (pred()) return 0;
  const started = performance.now();
  for (;;) {
    if (pred()) return Math.round(performance.now() - started);
    if (performance.now() - started > 15_000) return -1;
    await app.idle(10);
  }
}

it('[ACT-36] after a cold start, Activity is filled the moment it shows, from what the phone kept, before the server answers', async () => {
  setZone(ZONES.chicago);
  setNow(`${DAY} 18:00`);
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5 } });
  await first.close();

  // Today's 5 pages revised, then Activity read online: the day shows revised.
  let app = await phone.open(activityStack);
  const home = new Home(app);
  await home.ready();
  const session = await home.startSession();
  await session.ready();
  await session.swipeThrough();
  await session.back();
  await home.ready();
  await app.untilSynced();
  await openActivity(app);
  await app.until(() => revisedLabel(app).includes('revised'), 'the day revised in Activity', 45_000);
  await app.close();

  // A cold start with no connection: the tab draws from the phone's copy at once.
  await phone.goOffline();
  app = await phone.open(activityStack);
  await new Home(app).ready();
  await openActivity(app);
  const filled = await msUntil(app, () => app.screen.queryByTestId('activity-v2') != null && revisedLabel(app).includes('revised'));
  console.log(`[ACT-36] Activity filled ${filled} ms after it was opened`); // i18n-ignore (a test's log)
  expect(filled).toBe(0);
});
