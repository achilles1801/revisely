// The Activity day's footer says which window the revision day covers (DAY-2, DAY-9). With the Fajr
// boundary it names the next day for the Fajr that ends it: "Tuesday runs Fajr to Fajr, 5:07 AM to
// 5:08 AM" read as a one-minute window (Nov 2026). Without it, midnight to midnight.

import { setNow, setZone, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { markPreviewTester } from '../harness/admin';
import { ActivityDayView, flatText, Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import type { User } from '../../../src/types';

const TUESDAY = '2026-11-03';

async function dayFooter(user: Partial<User>): Promise<{ app: OpenApp; text: string }> {
  setZone(ZONES.chicago);
  setNow('2026-11-02 20:00');
  const phone = new Phone();
  const first = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5, ...user } });
  const uid = first.uid;
  await first.untilSynced();
  await first.close();
  // The day's blocks (and their footer) are for preview testers.
  await markPreviewTester(uid);
  setNow(`${TUESDAY} 21:00`);
  const app = await phone.open(homeStack);
  await new Home(app).ready();
  await new ActivityDayView(app).open(TUESDAY);
  await app.until(() => app.screen.queryByTestId('activity-day-footer') != null, 'the day’s footer');
  return { app, text: flatText(app.screen.getByTestId('activity-day-footer')) };
}

describe('the Activity day’s footer (DAY-2, DAY-9)', () => {
  it('[DAY-2] [DAY-9] with the Fajr boundary: from Tuesday’s Fajr to Wednesday’s Fajr, each with its time', async () => {
    const { app, text } = await dayFooter({ fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
    // Chicago's Fajr is about 5 AM in early November; the two times are a day apart, so they differ by a minute or so.
    expect(text).toMatch(/Tuesday: Fajr [5-6]:\d\d.AM to Wednesday’s Fajr [5-6]:\d\d.AM$/);
    await app.close();
  });

  it('[DAY-9] without it: midnight to midnight', async () => {
    const { app, text } = await dayFooter({});
    expect(text).toMatch(/Tuesday: midnight to midnight$/);
    await app.close();
  });
});
