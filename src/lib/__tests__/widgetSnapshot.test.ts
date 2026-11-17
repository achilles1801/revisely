import { plainText } from '../passages';
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
    // By surah and juz, never page numbers (CLAUDE.md, lib/passages).
    expect(plainText(today.title)).toBe('At-Tin to Al-Fil');
    expect(plainText(today.short)).toBe('At-Tin to Al-Fil');
    expect(today.where).toBe('Juz 30');
    for (const t of [today.title, today.short, today.where]) expect(t).not.toMatch(/\bp{1,2}\.\s|\bPages? \d/);
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

  // AHEAD-3: revising ahead goes on past the cycle's end; a day of the next cycle revised in a new round
  // (its pages repeat today's) is done when it comes, as on Home (AHEAD-2, AHEAD-4).
  it('a day of the next cycle done ahead in a new round is done; the days before it are not', () => {
    const pagesOn = (d: number) => generateDailyAssignment(pages, quranData, user, new Date(2026, 9, 27 + d)).pages;
    const later = pagesOn(5);
    expect(later.some((p) => pagesOn(0).includes(p))).toBe(true);
    const todays: RevisionLog = { ...log('2026-10-27', [...new Set([...pagesOn(0), ...later])]), assignedPages: pagesOn(0), ahead: { '2026-11-01': later } };
    const snap = buildWidgetSnapshot(inputs({ logs: [todays] }));
    expect(snap.days[0]).toMatchObject({ completed: true });
    expect(snap.days[5]).toMatchObject({ day: '2026-11-01', completed: true });
    expect(snap.days[4].completed).toBe(false);
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
      light: {
        accentText: '#624BD5',
        done: '#624BD5',
        onDone: '#FFFFFF',
        primary: '#624BD5',
        onPrimary: '#FFFFFF',
        accentSubtle: '#EFECFB',
        subtleText: '#624BD5',
      },
      dark: {
        accentText: '#9789DA',
        done: '#624BD5',
        onDone: '#FFFFFF',
        primary: '#624BD5',
        onPrimary: '#FFFFFF',
        accentSubtle: '#16113A',
        subtleText: '#9789DA',
      },
    });
    // Android's 4×1 prayer widget tints the next prayer's cell: the theme's own pair, ≥ 4.5:1.
    const crimson = buildWidgetSnapshot(inputs({ accent: 'crimson' }));
    expect(crimson.colors.light).toMatchObject({ accentSubtle: '#FCE8EB', subtleText: '#B30F28' });
    expect(crimson.colors.dark).toMatchObject({ accentSubtle: '#2E0E15', subtleText: '#F03C56' });
    const jade = buildWidgetSnapshot(inputs({ accent: 'jade' }));
    expect(jade.accent).toBe('jade');
    expect(jade.colors.light.done).toBe('#0E6B5A');
    // Jade keeps an ink pill: black in light, white in dark.
    expect(jade.colors.light).toMatchObject({ primary: '#1A1A1A' });
    expect(jade.colors.dark).toMatchObject({ primary: '#FFFFFF' });
    // Signed out still knows the accent.
    expect(buildWidgetSnapshot(inputs({ signedIn: false, user: null, accent: 'crimson' })).colors.light.done).toBe('#DC1433');
  });

  it('several ranges: the title names the first two and how many more; the Lock Screen, where the day starts', () => {
    const scattered: UserPage[] = pages.map((p) => ({
      ...p,
      status: [10, 11, 50, 90].includes(p.pageNumber) ? 'memorized' : 'not_memorized',
    })) as UserPage[];
    const snap = buildWidgetSnapshot(inputs({ pages: scattered, user: { ...user, dailyPageCapacity: 4 } }));
    expect(plainText(snap.days[0].title)).toBe('Al-Baqarah 62–76, then 2 more');
    expect(plainText(snap.days[0].short)).toBe('Al-Baqarah 62');
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

describe('the Qibla in the snapshot', () => {
  it('from the position given, signed in or not; none without one', () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    expect(buildWidgetSnapshot(inputs({ qiblaFrom: london })).qibla).toMatchObject({ bearing: 119, label: '119° SE' });
    expect(buildWidgetSnapshot(inputs({ signedIn: false, user: null, qiblaFrom: london })).qibla?.bearing).toBe(119);
    expect(buildWidgetSnapshot(inputs()).qibla).toBeNull();
  });
});

describe('widget snapshot: prayer times (for the prayer widgets)', () => {
  const LONDON = { latitude: 51.51, longitude: -0.13 };
  const settings = {
    method: 'MoonsightingCommittee',
    highLatitude: 'recommended' as const,
    madhab: 'standard' as const,
    adjustments: { fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
  };

  it('with a place: a week of the six times, as the app works them out', () => {
    const { dayTimes } = require('../prayer/times');
    const snap = buildWidgetSnapshot(inputs({ prayer: { from: LONDON, settings, place: 'London' } }));
    expect(snap.prayer!.place).toBe('London');
    expect(snap.prayer!.days).toHaveLength(7);
    const first = snap.prayer!.days[0];
    const t = dayTimes(LONDON, inputs().now, settings);
    expect(first).toEqual({
      day: t.day,
      fajr: t.fajr.getTime(),
      sunrise: t.sunrise.getTime(),
      dhuhr: t.dhuhr.getTime(),
      asr: t.asr.getTime(),
      maghrib: t.maghrib.getTime(),
      isha: t.isha.getTime(),
    });
  });

  it('without (not a tester, no place): no prayer key at all, so nothing else changes', () => {
    expect('prayer' in buildWidgetSnapshot(inputs())).toBe(false);
    expect('prayer' in buildWidgetSnapshot(inputs({ prayer: null }))).toBe(false);
  });
});

describe('a partly memorized page on the widget (MEM-4)', () => {
  it('is in the day, named by its memorized ayahs', () => {
    // Pages 1–4, and An-Nas alone on the last page: five pages at five a day.
    const some: UserPage[] = pages.map((p) =>
      p.pageNumber <= 4
        ? { ...p, status: 'memorized' as const, dateMemorized: '2025-01-01' }
        : p.pageNumber === 604
          ? { ...p, status: 'in_progress' as const, dateMemorized: '2025-01-01', verses: [114001, 114002, 114003, 114004, 114005, 114006] }
          : { ...p, status: 'not_memorized' as const, dateMemorized: null },
    );
    const snap = buildWidgetSnapshot(inputs({ pages: some }));
    expect(snap.state).toBe('ready');
    const day = snap.days[0];
    expect(day.total).toBe(5);
    expect(plainText(day.title)).toBe('Al-Fatihah to Al-Baqarah, then An-Nas');
    expect(plainText(day.title)).not.toMatch(/Ikhlas/);
  });
});
