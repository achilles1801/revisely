import {
  isKahfDay,
  isKahfDayForUser,
  KAHF_MINUTE_CHOICES,
  kahfCardState,
  kahfPages,
  kahfReadingSession,
  kahfReadOn,
} from '../kahf';
import { getFajrTimeFor } from '../fajrBoundary';
import { parseHomePrefs } from '../homePrefs';
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
const noBoundary: User = { ...user, fajrBoundaryEnabled: false };

describe('kahfPages', () => {
  it('is Al-Kahf from the surah table: pages 293 to 304', () => {
    const pages = kahfPages();
    expect(pages[0]).toBe(293);
    expect(pages[pages.length - 1]).toBe(304);
    expect(pages).toHaveLength(12);
  });
});

describe('isKahfDay', () => {
  it('is true only for Fridays', () => {
    expect(isKahfDay(FRI)).toBe(true);
    expect(isKahfDay(THU)).toBe(false);
    expect(isKahfDay(SAT)).toBe(false);
    expect(isKahfDay('2026-10-23')).toBe(true);
  });

  it('parses the day as a local date in any time zone', () => {
    // new Date('2026-10-16') would be Thursday evening west of Greenwich.
    expect(isKahfDay('2026-10-16')).toBe(true);
    expect(isKahfDay('2027-01-01')).toBe(true); // Friday across a year boundary
  });

  it('is false for malformed input', () => {
    expect(isKahfDay('')).toBe(false);
    expect(isKahfDay('Friday')).toBe(false);
  });
});

describe('isKahfDayForUser (revision day, fajr-aware)', () => {
  const fridayFajr = getFajrTimeFor(new Date(2026, 9, 16, 12), user) as Date;
  const MIN = 60_000;

  it('Thursday night after maghrib is still Thursday', () => {
    expect(isKahfDayForUser(user, new Date(2026, 9, 15, 20, 0))).toBe(false);
    expect(isKahfDayForUser(noBoundary, new Date(2026, 9, 15, 20, 0))).toBe(false);
  });

  it('after midnight but before fajr on Friday is still Thursday with the boundary on', () => {
    const beforeFajr = new Date(fridayFajr.getTime() - MIN);
    if (beforeFajr.getDate() !== 16) return; // fajr too close to midnight here
    expect(isKahfDayForUser(user, beforeFajr)).toBe(false);
    // Without the boundary the calendar day is already Friday.
    expect(isKahfDayForUser(noBoundary, beforeFajr)).toBe(true);
  });

  it('is Friday from fajr on, all day', () => {
    expect(isKahfDayForUser(user, new Date(fridayFajr.getTime() + MIN))).toBe(true);
    expect(isKahfDayForUser(user, new Date(2026, 9, 16, 23, 30))).toBe(true);
  });

  it('after midnight but before fajr on Saturday is still Friday', () => {
    const satFajr = getFajrTimeFor(new Date(2026, 9, 17, 12), user) as Date;
    const beforeFajr = new Date(satFajr.getTime() - MIN);
    if (beforeFajr.getDate() !== 17) return;
    expect(isKahfDayForUser(user, beforeFajr)).toBe(true);
    expect(isKahfDayForUser(noBoundary, beforeFajr)).toBe(false);
  });

  it('Saturday daytime is not', () => {
    expect(isKahfDayForUser(user, new Date(2026, 9, 17, 12))).toBe(false);
  });

  it('without a user it is the calendar day', () => {
    expect(isKahfDayForUser(null, new Date(2026, 9, 16, 1))).toBe(true);
  });
});

describe('kahfReadOn', () => {
  const all = kahfPages();
  const session = (date: string, pages: number[], pagesVisited: number[] = []) => ({
    date,
    pages,
    pagesVisited,
  });

  it('is true when one session today covers every page', () => {
    expect(kahfReadOn(FRI, [session(FRI, all)])).toBe(true);
    expect(kahfReadOn(FRI, [session(FRI, [1, 2, ...all, 400])])).toBe(true);
  });

  it('combines several sessions and the reader pages visited', () => {
    const half = all.slice(0, 6);
    const rest = all.slice(6);
    expect(kahfReadOn(FRI, [session(FRI, half), session(FRI, [], rest)])).toBe(true);
  });

  it('counts revision logs from today', () => {
    expect(kahfReadOn(FRI, [session(FRI, all.slice(0, 6))], [{ date: FRI, pagesRevised: all.slice(6) }])).toBe(true);
  });

  it('is false for a partial read', () => {
    expect(kahfReadOn(FRI, [session(FRI, all.slice(1))])).toBe(false);
    expect(kahfReadOn(FRI, [])).toBe(false);
  });

  it('ignores other days', () => {
    expect(kahfReadOn(FRI, [session(THU, all)])).toBe(false);
    expect(kahfReadOn(FRI, [], [{ date: '2026-10-09', pagesRevised: all }])).toBe(false);
  });

  it('tolerates sessions without pagesVisited', () => {
    expect(kahfReadOn(FRI, [{ date: FRI, pages: all } as any])).toBe(true);
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

  it('counts as read once saved', () => {
    expect(kahfReadOn(FRI, [kahfReadingSession(FRI, 15, NOW)])).toBe(true);
  });
});

describe('kahfCardState', () => {
  const base = { enabled: true, today: FRI, dismissedDay: null, done: false };

  it('prompts on a Friday', () => {
    expect(kahfCardState(base)).toBe('prompt');
  });

  it('shows done once read', () => {
    expect(kahfCardState({ ...base, done: true })).toBe('done');
  });

  it('hides when turned off or on other days', () => {
    expect(kahfCardState({ ...base, enabled: false })).toBe('hidden');
    expect(kahfCardState({ ...base, today: THU })).toBe('hidden');
    expect(kahfCardState({ ...base, today: SAT, done: true })).toBe('hidden');
  });

  it('"Not today" hides it for that day only', () => {
    expect(kahfCardState({ ...base, dismissedDay: FRI })).toBe('hidden');
    expect(kahfCardState({ ...base, dismissedDay: FRI, done: true })).toBe('hidden');
    expect(kahfCardState({ ...base, today: '2026-10-23', dismissedDay: FRI })).toBe('prompt');
  });
});

describe('parseHomePrefs (Al-Kahf fields)', () => {
  it('defaults the reminder on for new and older installs', () => {
    expect(parseHomePrefs(null).fridayKahfReminder).toBe(true);
    const old = parseHomePrefs(JSON.stringify({ showProgressCard: false, metrics: ['juz'] }));
    expect(old).toEqual({
      showProgressCard: false,
      metrics: ['juz'],
      fridayKahfReminder: true,
      kahfDismissedDay: null,
      keepScreenOn: true,
    });
  });

  it('keeps saved values and drops bad ones', () => {
    const p = parseHomePrefs(
      JSON.stringify({ fridayKahfReminder: false, kahfDismissedDay: FRI, metrics: ['bogus', 'pages'] }),
    );
    expect(p.fridayKahfReminder).toBe(false);
    expect(p.kahfDismissedDay).toBe(FRI);
    expect(p.metrics).toEqual(['pages']);
    expect(parseHomePrefs('{not json').fridayKahfReminder).toBe(true);
    expect(parseHomePrefs(JSON.stringify({ kahfDismissedDay: 5 })).kahfDismissedDay).toBeNull();
  });
});
