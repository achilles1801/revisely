import {
  KAHF_FALLBACK_MAGHRIB_HOUR,
  KAHF_MINUTE_CHOICES,
  kahfCardState,
  kahfFridayAt,
  kahfMaghribForUser,
  kahfMaghribOf,
  kahfPages,
  kahfPlace,
  kahfReadingSession,
  kahfReadOn,
  MaghribOf,
  nextKahfChange,
  zonePlace,
} from '../kahf';
import { parseHomePrefs } from '../homePrefs';
import { DEFAULT_PRAYER_PREFS } from '../prayer/prefs';
import { prayerSettings } from '../prayer/place';
import { dayTimes } from '../prayer/times';
import type { User } from '../../types';

// 2026-10-16 is a Friday; 10-15 Thursday, 10-17 Saturday.
const THU = '2026-10-15';
const FRI = '2026-10-16';
const SAT = '2026-10-17';

const user: User = {
  id: 'u1',
  createdAt: '2026-01-01T12:00:00Z',
  smartTrackingEnabled: false,
  hasSeenSmartTrackingPreview: false,
  dailyPageCapacity: 5,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  reminderTime: '08:00',
  notificationsEnabled: true,
  currentMemorizationJuz: null,
  currentMemorizationPage: null,
  currentKhatamPage: 1,
  customPlan: null,
  savedPlans: [],
  streak: 0,
  lastRevisionDate: null,
  memorizedSurahs: [],
  fajrBoundaryEnabled: true,
  // Solar time matching this machine's time zone, so fajr is in the early
  // morning wherever the tests run (same trick as fajrBoundary.test.ts).
  locationCoords: {
    latitude: 30,
    longitude: Math.max(-165, Math.min(165, -new Date(2026, 9, 16, 12).getTimezoneOffset() / 4)),
  },
  fajrCalculationMethod: 'MuslimWorldLeague',
  scheduleAnchorDate: '2026-01-01T12:00:00Z',
};

describe('kahfPages', () => {
  it('is Al-Kahf from the surah table: pages 293 to 304', () => {
    const pages = kahfPages();
    expect(pages[0]).toBe(293);
    expect(pages[pages.length - 1]).toBe(304);
    expect(pages).toHaveLength(12);
  });
});

// A maghrib at 17:00 on the phone's clock every day: the window's rules apart from the sun.
const at17: MaghribOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17);
const MIN = 60_000;
const local = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

describe('kahfFridayAt (KAHF-1: Thursday maghrib to Friday maghrib)', () => {
  const window = { day: FRI, start: local(THU, 17).getTime(), end: local(FRI, 17).getTime() };

  it('opens at Thursday’s maghrib, not before', () => {
    expect(kahfFridayAt(local(THU, 16, 59), at17)).toBeNull();
    expect(kahfFridayAt(local(THU, 17), at17)).toEqual(window);
    expect(kahfFridayAt(local(THU, 23, 30), at17)).toEqual(window);
  });

  it('holds through the night and Friday’s day', () => {
    expect(kahfFridayAt(local(FRI, 0, 30), at17)).toEqual(window);
    expect(kahfFridayAt(local(FRI, 9), at17)).toEqual(window);
    expect(kahfFridayAt(new Date(local(FRI, 17).getTime() - MIN), at17)).toEqual(window);
  });

  it('closes at Friday’s maghrib: Friday evening is no longer Friday', () => {
    expect(kahfFridayAt(local(FRI, 17), at17)).toBeNull();
    expect(kahfFridayAt(local(FRI, 21), at17)).toBeNull();
    expect(kahfFridayAt(local(SAT, 1), at17)).toBeNull();
  });

  it('is null the rest of the week', () => {
    for (const day of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']) {
      for (const h of [1, 12, 20]) expect(kahfFridayAt(local(day, h), at17)).toBeNull();
    }
  });

  it('keys the Friday by its own date, across a month and a year', () => {
    // 2027-01-01 is a Friday: Thursday 2026-12-31 evening is its window.
    expect(kahfFridayAt(local('2026-12-31', 20), at17)?.day).toBe('2027-01-01');
    expect(kahfFridayAt(local('2027-01-01', 12), at17)?.day).toBe('2027-01-01');
  });

  it('follows each day’s own maghrib', () => {
    const late: MaghribOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getDay() === 4 ? 19 : 16, 45);
    expect(kahfFridayAt(local(THU, 18), late)).toBeNull();
    expect(kahfFridayAt(local(THU, 19, 45), late)?.day).toBe(FRI);
    expect(kahfFridayAt(local(FRI, 16, 44), late)?.day).toBe(FRI);
    expect(kahfFridayAt(local(FRI, 16, 45), late)).toBeNull();
  });
});

describe('nextKahfChange', () => {
  it('is the next Thursday or Friday maghrib', () => {
    expect(nextKahfChange(local('2026-10-12', 9), at17)).toEqual(local(THU, 17));
    expect(nextKahfChange(local(THU, 17), at17)).toEqual(local(FRI, 17));
    expect(nextKahfChange(local(FRI, 9), at17)).toEqual(local(FRI, 17));
    expect(nextKahfChange(local(FRI, 17), at17)).toEqual(local('2026-10-22', 17));
  });
});

describe('where maghrib comes from (KAHF-1)', () => {
  const prefs = { ...DEFAULT_PRAYER_PREFS };
  const settings = prayerSettings(user, prefs);

  it('is the Prayer sheet’s maghrib at the Prayer sheet’s place', () => {
    const maghribOf = kahfMaghribForUser(user, prefs, 'UTC');
    const want = dayTimes(user.locationCoords!, local(THU, 12), settings).maghrib!;
    expect(maghribOf(local(THU, 3))).toEqual(want);
    // In the evening where the tests run (the coordinates follow this machine's zone).
    expect(want.getHours()).toBeGreaterThanOrEqual(15);
    expect(want.getHours()).toBeLessThanOrEqual(20);
    // The phone's adjustment to maghrib moves it, as on the Prayer sheet.
    const adjusted = { ...prefs, adjustments: { ...prefs.adjustments, maghrib: 5 } };
    expect(kahfMaghribForUser(user, adjusted, 'UTC')(local(THU, 12)).getTime() - want.getTime()).toBe(5 * MIN);
  });

  it('prefers the phone’s last position, then the saved Fajr location, then the time zone’s city', () => {
    const phone = { latitude: 51.51, longitude: -0.13 };
    expect(kahfPlace(user, { place: phone }, 'America/Chicago')).toEqual(phone);
    expect(kahfPlace(user, { place: null }, 'America/Chicago')).toEqual(user.locationCoords);
    const chicago = kahfPlace({ ...user, locationCoords: null }, { place: null }, 'America/Chicago');
    expect(chicago?.latitude).toBeCloseTo(41.88, 1);
    expect(chicago?.longitude).toBeCloseTo(-87.63, 1);
    expect(kahfPlace(null, { place: null }, 'America/Chicago')).toEqual(chicago);
  });

  it('names a zone’s city from the bundled list, or nothing', () => {
    expect(zonePlace('America/New_York')?.latitude).toBeCloseTo(40.71, 1);
    expect(zonePlace('Asia/Riyadh')?.longitude).toBeCloseTo(46.68, 1);
    expect(zonePlace('Asia/Kolkata')).not.toBeNull();
    expect(zonePlace('Etc/GMT+12')).toBeNull();
    expect(zonePlace('UTC')).toBeNull();
    expect(zonePlace(undefined)).toBeNull();
    expect(zonePlace('')).toBeNull();
  });

  it('is 18:00 on the phone’s clock with no place at all', () => {
    const maghribOf = kahfMaghribOf(null, settings);
    expect(maghribOf(local(THU, 9))).toEqual(local(THU, KAHF_FALLBACK_MAGHRIB_HOUR));
    expect(kahfFridayAt(local(THU, 17, 59), maghribOf)).toBeNull();
    expect(kahfFridayAt(local(THU, 18), maghribOf)?.day).toBe(FRI);
    expect(kahfFridayAt(local(FRI, 18), maghribOf)).toBeNull();
    expect(kahfMaghribForUser({ ...user, locationCoords: null }, prefs, 'Etc/GMT+12')(local(FRI, 9))).toEqual(local(FRI, 18));
  });
});

describe('kahfReadOn (KAHF-2: read inside the window)', () => {
  const all = kahfPages();
  const friday = { day: FRI, start: local(THU, 17).getTime(), end: local(FRI, 17).getTime() };
  const session = (endedAt: Date, pages: number[], pagesVisited: number[] = [], date = FRI) => ({
    date,
    endedAt: endedAt.getTime(),
    pages,
    pagesVisited,
  });

  it('is true when one session in the window covers every page', () => {
    expect(kahfReadOn(friday, [session(local(FRI, 9), all)])).toBe(true);
    expect(kahfReadOn(friday, [session(local(FRI, 9), [1, 2, ...all, 400])])).toBe(true);
  });

  it('counts Thursday evening, after maghrib: the session is Thursday’s, the read is Friday’s', () => {
    expect(kahfReadOn(friday, [session(local(THU, 20), all, [], THU)])).toBe(true);
  });

  it('doesn’t count Thursday before maghrib, or after Friday’s', () => {
    expect(kahfReadOn(friday, [session(local(THU, 16, 30), all, [], THU)])).toBe(false);
    expect(kahfReadOn(friday, [session(local(FRI, 17), all)])).toBe(false);
  });

  it('combines several sessions and the reader pages visited', () => {
    const half = all.slice(0, 6);
    const rest = all.slice(6);
    expect(kahfReadOn(friday, [session(local(THU, 21), half, [], THU), session(local(FRI, 10), [], rest)])).toBe(true);
  });

  it('counts the revision log of Friday’s revision day, not Thursday’s', () => {
    expect(kahfReadOn(friday, [session(local(FRI, 9), all.slice(0, 6))], [{ date: FRI, pagesRevised: all.slice(6) }])).toBe(true);
    expect(kahfReadOn(friday, [], [{ date: THU, pagesRevised: all }])).toBe(false);
    expect(kahfReadOn(friday, [], [{ date: '2026-10-09', pagesRevised: all }])).toBe(false);
  });

  it('is false for a partial read', () => {
    expect(kahfReadOn(friday, [session(local(FRI, 9), all.slice(1))])).toBe(false);
    expect(kahfReadOn(friday, [])).toBe(false);
  });

  it('tolerates sessions without pagesVisited, and goes by the day without a time', () => {
    expect(kahfReadOn(friday, [{ date: FRI, endedAt: local(FRI, 9).getTime(), pages: all } as any])).toBe(true);
    expect(kahfReadOn(friday, [{ date: FRI, pages: all } as any])).toBe(true);
    expect(kahfReadOn(friday, [{ date: THU, pages: all } as any])).toBe(false);
  });
});

describe('kahfReadingSession', () => {
  const NOW = Date.UTC(2026, 9, 16, 9, 0);

  it('records Al-Kahf ending now for the chosen minutes', () => {
    const s = kahfReadingSession(FRI, 20, NOW);
    expect(s).toEqual({
      date: FRI,
      startedAt: NOW - 20 * 60_000,
      endedAt: NOW,
      durationSeconds: 1200,
      mode: 'stopwatch',
      targetSeconds: null,
      pages: kahfPages(),
      pagesVisited: [],
    });
  });

  it('always fits the readingSessions rules', () => {
    for (const m of [...KAHF_MINUTE_CHOICES, 0, -5, 0.4, 2.6, 5000, NaN]) {
      const s = kahfReadingSession(FRI, m, NOW);
      expect(Number.isInteger(s.durationSeconds)).toBe(true);
      expect(s.durationSeconds).toBeGreaterThanOrEqual(60);
      expect(s.durationSeconds).toBeLessThanOrEqual(86400);
      expect(s.endedAt).toBeGreaterThanOrEqual(s.startedAt);
      expect(['stopwatch', 'countUp', 'countDown']).toContain(s.mode);
      expect(s.targetSeconds).toBeNull();
      expect(s.pages.length).toBeLessThanOrEqual(604);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('counts as read once saved, Thursday evening included', () => {
    const thursdayEvening = local(THU, 20).getTime();
    const friday = kahfFridayAt(new Date(thursdayEvening), at17)!;
    expect(kahfReadOn(friday, [kahfReadingSession(THU, 15, thursdayEvening)])).toBe(true);
  });
});

describe('kahfCardState', () => {
  const base = { enabled: true, friday: FRI, dismissedDay: null, done: false };

  it('prompts on the Islamic Friday', () => {
    expect(kahfCardState(base)).toBe('prompt');
  });

  it('shows done once read', () => {
    expect(kahfCardState({ ...base, done: true })).toBe('done');
  });

  it('hides when turned off or outside the window', () => {
    expect(kahfCardState({ ...base, enabled: false })).toBe('hidden');
    expect(kahfCardState({ ...base, friday: null })).toBe('hidden');
    expect(kahfCardState({ ...base, friday: null, done: true })).toBe('hidden');
  });

  it('[KAHF-3] "Not today" hides it for that Friday only', () => {
    expect(kahfCardState({ ...base, dismissedDay: FRI })).toBe('hidden');
    expect(kahfCardState({ ...base, dismissedDay: FRI, done: true })).toBe('hidden');
    expect(kahfCardState({ ...base, friday: '2026-10-23', dismissedDay: FRI })).toBe('prompt');
  });
});

describe('parseHomePrefs (Al-Kahf fields)', () => {
  it('defaults the reminder on for new and older installs', () => {
    expect(parseHomePrefs(null).fridayKahfReminder).toBe(true);
    const old = parseHomePrefs(JSON.stringify({ showProgressCard: false, metrics: ['juz'] }));
    expect(old).toEqual({ fridayKahfReminder: true, kahfDismissedDay: null });
  });

  it('keeps saved values and drops bad ones', () => {
    const p = parseHomePrefs(
      JSON.stringify({ fridayKahfReminder: false, kahfDismissedDay: FRI }),
    );
    expect(p.fridayKahfReminder).toBe(false);
    expect(p.kahfDismissedDay).toBe(FRI);
    expect(parseHomePrefs('{not json').fridayKahfReminder).toBe(true);
    expect(parseHomePrefs(JSON.stringify({ kahfDismissedDay: 5 })).kahfDismissedDay).toBeNull();
  });
});
