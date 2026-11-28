// Friday's Al-Kahf card (BEHAVIOUR.md, KAHF-*): on Home for the Islamic Friday, from Thursday's maghrib
// to Friday's maghrib where the user is (Majd, Nov 21 2026). Before, it followed the revision day: it
// showed on Friday evening after maghrib and never on Thursday evening.

import { dayOf, local, setNow, setZone, MINUTE, ZONES } from '../harness/clock';
import { CITIES, newAccount, pagesRange } from '../harness/account';
import { Home, homeStack } from '../harness/screens';
import { OpenApp, Phone } from '../harness/phone';
import { listServerDocs } from '../harness/serverDocs';
import { dayTimes } from '../../../src/lib/prayer/times';
import { DEFAULT_PRAYER_PREFS } from '../../../src/lib/prayer/prefs';
import type { User } from '../../../src/types';

// 2026-11-19 is a Thursday, 11-20 the Friday.
const THU = '2026-11-19';
const FRI = '2026-11-20';
const NEXT_THU = '2026-11-26';
const KAHF = pagesRange(293, 304);

// The Prayer sheet's maghrib for the account's method and this phone's (default) settings.
function maghribOn(day: string, place: { latitude: number; longitude: number }): Date {
  const { adjustments, highLatitude, madhab } = DEFAULT_PRAYER_PREFS;
  const m = dayTimes(place, local(`${day} 12:00`), { method: 'NorthAmerica', adjustments, highLatitude, madhab }).maghrib;
  if (!m || dayOf(m) !== day) throw new Error(`no maghrib on ${day}`);
  return m;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE);

async function account(phone: Phone, user: Partial<User>): Promise<void> {
  const app = await newAccount(phone, { memorized: pagesRange(1, 20), user: { dailyPageCapacity: 5, fajrCalculationMethod: 'NorthAmerica', ...user } });
  await app.close();
}

async function home(phone: Phone): Promise<{ app: OpenApp; home: Home }> {
  const app = await phone.open(homeStack);
  const h = new Home(app);
  await h.ready();
  return { app, home: h };
}

/** Back in front at `at` (DAY-5): what Home shows now. */
async function returnAt(app: OpenApp, at: Date): Promise<void> {
  await app.background();
  setNow(at);
  await app.foreground();
}

/** A reading the reader's timer saves (REC-2): Al-Kahf's pages, ended `at`, on the revision day `date`. */
async function timedReading(app: OpenApp, id: string, date: string, at: Date): Promise<void> {
  const { queueChange } = app.mods.require<{ queueChange: (op: unknown) => Promise<void> }>('src/lib/offline/queue');
  const endedAt = at.getTime();
  await app.act(async () => {
    await queueChange({
      kind: 'reading.add',
      id,
      session: { date, startedAt: endedAt - 25 * MINUTE, endedAt, durationSeconds: 1500, mode: 'stopwatch', targetSeconds: null, pages: [], pagesVisited: KAHF },
    });
  });
  await app.untilSynced();
}

/**
 * Auth's launch check of the saved sign-in (accounts:lookup) answered `ms` late, until restored: Home opens on the
 * account's copy first (AUTH_GRACE_MS), before Auth has a user, as on a slow phone or network. CI's runners did this
 * now and then on their own (#822).
 */
function slowAuthCheck(ms: number): () => void {
  const routed = global.fetch;
  global.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (/\/v1\/accounts:lookup/.test(url)) await new Promise((r) => setTimeout(r, ms));
    return routed(input, init);
  }) as typeof fetch;
  return () => (global.fetch = routed);
}

async function press(app: OpenApp, el: unknown): Promise<void> {
  const { fireEvent } = app.mods.rtl;
  await app.act(async () => {
    fireEvent.press(el as never);
  });
  await app.idle(50);
}

describe('Al-Kahf on the Islamic Friday', () => {
  it('[KAHF-1] [KAHF-2] [DAY-9] from Thursday’s maghrib to Friday’s, and read on Thursday evening it is done for Friday', async () => {
    setZone(ZONES.chicago);
    setNow(`${THU} 09:00`);
    const phone = new Phone();
    await account(phone, { fajrBoundaryEnabled: true, locationCoords: CITIES.chicago });
    const thuMaghrib = maghribOn(THU, CITIES.chicago);
    const friMaghrib = maghribOn(FRI, CITIES.chicago);
    // Chicago's sunset in late November.
    expect(hhmm(thuMaghrib)).toMatch(/^16:[1-3]\d$/);

    // Thursday afternoon: no card. Al-Kahf read in the reader now is Thursday's, not Friday's.
    setNow(plus(thuMaghrib, -40));
    let { app, home: h } = await home(phone);
    expect(h.kahf()).toBeNull();
    await timedReading(app, 'kahf-thursday-afternoon', THU, plus(thuMaghrib, -10));

    // After Thursday's maghrib: Friday has begun. Still to read (the afternoon's reading doesn't count).
    await returnAt(app, plus(thuMaghrib, 5));
    await app.until(() => h.kahf() != null, 'the Al-Kahf card after Thursday’s maghrib');
    expect(h.kahf()).toContain('Friday began at maghrib. Read Surah Al-Kahf.');
    expect(app.screen.queryByTestId('kahf-mark')).not.toBeNull();

    // Mark as read, 20 minutes: done for this Friday.
    await press(app, app.screen.getByTestId('kahf-mark'));
    await app.until(() => app.screen.queryByLabelText('20 minutes, Usual') != null, 'the minutes sheet');
    await press(app, app.screen.getByLabelText('20 minutes, Usual'));
    await app.until(() => (h.kahf() ?? '').includes('Done for this Friday.'), 'the card to show Al-Kahf read');
    await app.untilSynced();
    // The reading itself is Thursday's revision day, like any reading (DAY-9): Activity lists it on Thursday.
    const readings = await listServerDocs(`users/${app.uid}/readingSessions`);
    const marked = readings.filter((r) => r.id !== 'kahf-thursday-afternoon');
    expect(marked.map((r) => [r.date, r.pages])).toEqual([[THU, KAHF]]);
    await app.close();

    // Friday morning, after Fajr: still done, counted for this Friday. Home opens before Auth has checked the saved
    // sign-in; the readings are read once it has (they were read without a user, failed, and showed "Read").
    setNow(`${FRI} 09:00`);
    const restore = slowAuthCheck(4000);
    try {
      ({ app, home: h } = await home(phone));
      await app.until(() => h.kahf() != null, 'the Al-Kahf card on Friday morning');
    } finally {
      restore();
    }
    expect(h.kahf()).toContain('Done for this Friday.');
    expect(app.screen.queryByTestId('kahf-mark')).toBeNull();

    // Friday's maghrib: the Islamic Friday is over.
    await returnAt(app, plus(friMaghrib, -1));
    expect(h.kahf()).toContain('Done for this Friday.');
    await returnAt(app, plus(friMaghrib, 1));
    await app.until(() => h.kahf() == null, 'the card to go at Friday’s maghrib');
    await app.close();
  });

  it('[KAHF-1] [KAHF-2] a reading that ends after Thursday’s maghrib counts, and Friday evening has no card', async () => {
    setZone(ZONES.london);
    setNow(`${THU} 09:00`);
    const phone = new Phone();
    await account(phone, { fajrBoundaryEnabled: false, locationCoords: CITIES.london });
    const thuMaghrib = maghribOn(THU, CITIES.london);
    const friMaghrib = maghribOn(FRI, CITIES.london);

    setNow(plus(thuMaghrib, 50));
    let { app, home: h } = await home(phone);
    await app.until(() => h.kahf() != null, 'the Al-Kahf card on Thursday evening');
    expect(h.kahf()).toContain('Friday began at maghrib.');
    // Read in the reader on Thursday evening, with the timer; Home is opened again after it.
    await timedReading(app, 'kahf-thursday-evening', THU, plus(thuMaghrib, 45));
    await app.close();
    setNow(plus(thuMaghrib, 55));
    ({ app, home: h } = await home(phone));
    await app.until(() => (h.kahf() ?? '').includes('Done for this Friday.'), 'the reader’s Thursday-evening reading to count');

    // Friday after midnight (boundary off: the revision day is Friday now): "It's Friday", done.
    await returnAt(app, local(`${FRI} 08:00`));
    await app.until(() => (h.kahf() ?? '').includes('Done for this Friday.'), 'the card on Friday');
    // Friday evening, after maghrib: none, though the calendar day is still Friday.
    await returnAt(app, plus(friMaghrib, 120));
    await app.until(() => h.kahf() == null, 'no card on Friday evening');
    await app.close();
  });

  it('[KAHF-3] "Not today" on Thursday evening hides it through Friday, and it is back the next Thursday evening', async () => {
    setZone(ZONES.chicago);
    setNow(`${THU} 09:00`);
    const phone = new Phone();
    await account(phone, { fajrBoundaryEnabled: false, locationCoords: CITIES.chicago });
    const thuMaghrib = maghribOn(THU, CITIES.chicago);

    setNow(plus(thuMaghrib, 30));
    let { app, home: h } = await home(phone);
    await app.until(() => h.kahf() != null, 'the Al-Kahf card on Thursday evening');
    await press(app, app.screen.getByLabelText('Al-Kahf options'));
    await app.until(() => app.screen.queryByLabelText('Not today') != null, 'the card’s menu');
    await press(app, app.screen.getByLabelText('Not today'));
    await app.until(() => h.kahf() == null, 'the card to go');
    await app.close();

    // Friday noon: still hidden (it was this Friday's "Not today").
    setNow(`${FRI} 12:00`);
    ({ app, home: h } = await home(phone));
    await app.settle(600);
    expect(h.kahf()).toBeNull();
    await app.close();

    // The next Thursday after maghrib: a new Friday, a new card.
    setNow(plus(maghribOn(NEXT_THU, CITIES.chicago), 10));
    ({ app, home: h } = await home(phone));
    await app.until(() => h.kahf() != null, 'the card for the next Friday');
    expect(h.kahf()).toContain('Friday began at maghrib.');
    await app.close();
  });

  it.each([
    { zone: ZONES.chicago, what: 'the time zone’s city (Chicago)', maghrib: () => maghribOn(THU, CITIES.chicago) },
    { zone: ZONES.bakerIsland, what: '18:00 (no city for Etc/GMT+12)', maghrib: () => local(`${THU} 18:00`) },
  ])('[KAHF-1] with no location saved, maghrib is $what', async ({ zone, maghrib }) => {
    setZone(zone);
    setNow(`${THU} 09:00`);
    const phone = new Phone();
    await account(phone, { fajrBoundaryEnabled: false, locationCoords: null });
    const at = maghrib();

    setNow(plus(at, -5));
    const { app, home: h } = await home(phone);
    await app.settle(600);
    expect(h.kahf()).toBeNull();
    await returnAt(app, plus(at, 5));
    await app.until(() => h.kahf() != null, 'the card after the stand-in maghrib');
    expect(h.kahf()).toContain('Friday began at maghrib.');
    await app.close();
  });
});
