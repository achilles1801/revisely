import { aliveStreak, buildWidgetSnapshot, juzLabel, WIDGET_DAYS_AHEAD, type WidgetInputs } from '../widgets/snapshot';
import { getQuranData } from '../quranData';
import { generateDailyAssignment } from '../algorithm';
import { getFajrTimeFor } from '../fajrBoundary';
import type { RevisionLog, User, UserPage } from '../../types';

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
  fajrBoundaryEnabled: false,
  locationCoords: null,
  fajrCalculationMethod: 'NorthAmerica',
  scheduleAnchorDate: '2026-10-01T12:00:00Z',
};

// Juz 30 (pages 582–604) memorized.
const pages: UserPage[] = Array.from({ length: 604 }, (_, i) => ({
  pageNumber: i + 1,
  status: i + 1 >= 582 ? 'memorized' : 'not_memorized',
  dateMemorized: i + 1 >= 582 ? '2025-01-01' : null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
})) as UserPage[];

function log(date: string, pagesRevised: number[]): RevisionLog {
  return { id: `${date}-${pagesRevised.join('.')}`, date, assignedPages: pagesRevised, pagesRevised, pagesSkipped: [], weaknessUpdates: [], durationMinutes: 5 };
}

const quranData = getQuranData();
// 3 p.m. local on Oct 27 2026.
const now = new Date(2026, 9, 27, 15, 0, 0);
const todaysPages = generateDailyAssignment(pages, quranData, user, new Date(2026, 9, 27)).pages;

const inputs = (over: Partial<WidgetInputs> = {}): WidgetInputs => ({
  signedIn: true,
  user,
  onboardingComplete: true,
  pages,
  logs: [],
  quranData,
  accent: 'indigo',
  now,
  ...over,
});

describe('buildWidgetSnapshot', () => {
  it('signed out, or no plan yet: no days, so the widget asks to open Revisely', () => {
    expect(buildWidgetSnapshot(inputs({ signedIn: false, user: null }))).toMatchObject({ state: 'signedOut', days: [] });
    expect(buildWidgetSnapshot(inputs({ onboardingComplete: false }))).toMatchObject({ state: 'noPlan', days: [] });
    const nothing = pages.map((p) => ({ ...p, status: 'not_memorized' as const }));
    expect(buildWidgetSnapshot(inputs({ pages: nothing }))).toMatchObject({ state: 'noPlan', days: [] });
  });

  it("today: Home's pages, the juz and surahs, and nothing done yet", () => {
    const snap = buildWidgetSnapshot(inputs());
    expect(snap.state).toBe('ready');
    const today = snap.days[0];
    expect(today).toMatchObject({ day: '2026-10-27', startsAt: now.getTime(), total: 5, done: 0, completed: false, streak: 0 });
    expect(todaysPages).toHaveLength(5);
    expect(today.title).toMatch(/^Pages \d+–\d+$/);
    expect(today.short).toMatch(/^p\. \d+–\d+$/);
    expect(today.where).toMatch(/^Juz 30 · /);
  });

  it('a week ahead, each day starting at the last one’s end (midnight here)', () => {
    const snap = buildWidgetSnapshot(inputs());
    expect(snap.days).toHaveLength(WIDGET_DAYS_AHEAD);
    expect(snap.days.map((d) => d.day)).toEqual([
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ]);
    expect(snap.days[0].endsAt).toBe(new Date(2026, 9, 28).getTime());
    for (let i = 1; i < snap.days.length; i++) expect(snap.days[i].startsAt).toBe(snap.days[i - 1].endsAt);
    // Tomorrow's pages are the scheduler's for tomorrow.
    const tomorrow = generateDailyAssignment(pages, quranData, user, new Date(2026, 9, 28)).pages;
    expect(snap.days[1].total).toBe(tomorrow.length);
  });

  it('partly done, then done; the streak counts today once it has a session', () => {
    const partial = buildWidgetSnapshot(inputs({ logs: [log('2026-10-26', [1]), log('2026-10-27', todaysPages.slice(0, 2))] }));
    expect(partial.days[0]).toMatchObject({ done: 2, completed: false, streak: 2 });
    const done = buildWidgetSnapshot(inputs({ logs: [log('2026-10-26', [1]), log('2026-10-27', todaysPages)] }));
    expect(done.days[0]).toMatchObject({ done: 5, completed: true, streak: 2 });
    // Tomorrow, before it's revised, the streak is still alive; the day after, not.
    expect(done.days[1]).toMatchObject({ done: 0, completed: false, streak: 2 });
    expect(done.days[2].streak).toBe(0);
  });

  it('a streak through yesterday stays alive today', () => {
    const logs = [log('2026-10-24', [1]), log('2026-10-25', [1]), log('2026-10-26', [1])];
    expect(buildWidgetSnapshot(inputs({ logs })).days[0].streak).toBe(3);
  });

  it('with the fajr boundary, the day turns at fajr, and before it is still yesterday', () => {
    // Where solar time matches this machine's time zone, so fajr is early morning
    // wherever the tests run (as in fajrBoundary.test).
    const local: User = {
      ...user,
      fajrBoundaryEnabled: true,
      fajrCalculationMethod: 'MuslimWorldLeague',
      locationCoords: { latitude: 30, longitude: Math.max(-165, Math.min(165, -new Date(2026, 9, 27, 12).getTimezoneOffset() / 4)) },
    };
    const fajr = getFajrTimeFor(new Date(2026, 9, 27, 12), local) as Date;
    const before = new Date(fajr.getTime() - 60_000);
    if (before.getDate() !== 27) return; // fajr this close to midnight: nothing to test
    const snap = buildWidgetSnapshot(inputs({ user: local, now: before }));
    expect(snap.days[0].day).toBe('2026-10-26');
    expect(snap.days[0].endsAt).toBe(fajr.getTime());
    expect(snap.days[1]).toMatchObject({ day: '2026-10-27', startsAt: fajr.getTime() });
    // The next day ends at the next fajr, not at midnight.
    expect(new Date(snap.days[1].endsAt).getDate()).toBe(28);
    expect(new Date(snap.days[1].endsAt).getHours()).toBeGreaterThan(0);
  });

  it('carries the accent’s colours for light and dark', () => {
    expect(buildWidgetSnapshot(inputs()).colors).toEqual({
      light: { accentText: '#624BD5', done: '#624BD5', onDone: '#FFFFFF', primary: '#624BD5', onPrimary: '#FFFFFF' },
      dark: { accentText: '#9789DA', done: '#624BD5', onDone: '#FFFFFF', primary: '#624BD5', onPrimary: '#FFFFFF' },
    });
    const jade = buildWidgetSnapshot(inputs({ accent: 'jade' }));
    expect(jade.accent).toBe('jade');
    expect(jade.colors.light.done).toBe('#0E6B5A');
    // Jade keeps an ink pill: black in light, white in dark.
    expect(jade.colors.light).toMatchObject({ primary: '#1A1A1A' });
    expect(jade.colors.dark).toMatchObject({ primary: '#FFFFFF' });
    // Signed out still knows the accent.
    expect(buildWidgetSnapshot(inputs({ signedIn: false, user: null, accent: 'crimson' })).colors.light.done).toBe('#DC1433');
  });

  it('several ranges: the Lock Screen says how many pages', () => {
    const scattered: UserPage[] = pages.map((p) => ({
      ...p,
      status: [10, 11, 50, 90].includes(p.pageNumber) ? 'memorized' : 'not_memorized',
    })) as UserPage[];
    const snap = buildWidgetSnapshot(inputs({ pages: scattered, user: { ...user, dailyPageCapacity: 4 } }));
    expect(snap.days[0].short).toBe('4 pages');
    expect(snap.days[0].title).toBe('Pages 10–11, 50 and 90');
  });
});

describe('aliveStreak', () => {
  it('counts back from the day, or from the day before', () => {
    const days = new Set(['2026-10-25', '2026-10-26', '2026-10-27']);
    expect(aliveStreak(days, '2026-10-27')).toBe(3);
    expect(aliveStreak(days, '2026-10-28')).toBe(3);
    expect(aliveStreak(days, '2026-10-29')).toBe(0);
    expect(aliveStreak(new Set(), '2026-10-27')).toBe(0);
  });

  it('across a month end', () => {
    expect(aliveStreak(new Set(['2026-10-31', '2026-11-01']), '2026-11-01')).toBe(2);
  });
});

describe('juzLabel', () => {
  it('as on Home', () => {
    expect(juzLabel([{ juz: 26 }])).toBe('Juz 26');
    expect(juzLabel([{ juz: 26 }, { juz: 27 }])).toBe('Juz 26–27');
    expect(juzLabel([{ juz: 3 }, { juz: 7 }])).toBe('Juz 3, 7');
    expect(juzLabel([1, 3, 5, 7].map((juz) => ({ juz })))).toBe('4 juz');
  });
});
