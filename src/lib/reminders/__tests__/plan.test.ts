import { dayTimes } from '../../prayer/times';
import { DEFAULT_PRAYER_PREFS } from '../../prayer/prefs';
import { LATER_DAYS, morningTime, planRevisionReminders, REVISION_REMINDER_PREFIX, type PlanReminderInput } from '../plan';
import { assignedOn, logFor, PLACE, pages, quranData, user as makeUser } from '../__fixtures__/reminderFixtures';
import { getSurah, getSurahsForPage } from '../../quranData';

/** No-break hyphens and spaces as plain ones. */
const plain = (s: string) => s.replace(/\u2011/g, '-').replace(/[\u00a0\u202f]/g, ' ');

const settings = { method: 'NorthAmerica', highLatitude: 'recommended' as const, madhab: 'standard' as const, adjustments: DEFAULT_PRAYER_PREFS.adjustments };
// Wednesday 28 October 2026, the demo day in the mocks.
const day = new Date(2026, 9, 28);
const at = (h: number, m = 0, d = day) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

function plan(overrides: Partial<PlanReminderInput> & { now: Date }) {
  return planRevisionReminders({
    user: makeUser(),
    name: '',
    pages,
    logs: [],
    quranData,
    place: null,
    settings,
    laterDays: LATER_DAYS,
    ...overrides,
  });
}
const todayOf = (list: ReturnType<typeof plan>) => list.filter((r) => r.day === '2026-10-28');
const tomorrowOf = (list: ReturnType<typeof plan>) => list.filter((r) => r.day === '2026-10-29');
/** The days after tomorrow (REMIND-2). */
const laterOf = (list: ReturnType<typeof plan>) => list.filter((r) => r.day > '2026-10-29');
const times = (list: ReturnType<typeof plan>) => list.map((r) => `${r.kind}@${r.at.getDate()}:${r.at.getHours()}:${String(r.at.getMinutes()).padStart(2, '0')}`);

describe('planRevisionReminders', () => {
  it('plans morning, midday (3 PM without a place) and an hour before midnight, then the same for tomorrow', () => {
    const list = plan({ now: at(7) });
    expect(times(todayOf(list))).toEqual(['morning@28:8:00', 'midday@28:15:00', 'evening@28:23:00']);
    expect(times(tomorrowOf(list))).toEqual(['morning@29:8:00', 'midday@29:15:00', 'evening@29:23:00']);
    expect(list).toHaveLength(6 + LATER_DAYS);
    expect(list.every((r) => r.id.startsWith(REVISION_REMINDER_PREFIX))).toBe(true);
    expect(new Set(list.map((r) => r.id)).size).toBe(6 + LATER_DAYS);
  });

  it('the days after tomorrow get one each, in the morning, for a week counting today, then none (REMIND-2)', () => {
    const list = plan({ now: at(7) });
    expect(LATER_DAYS).toBe(6);
    expect(times(laterOf(list))).toEqual(['morning@30:8:00', 'morning@31:8:00', 'morning@1:8:00', 'morning@2:8:00', 'morning@3:8:00', 'morning@4:8:00']);
    expect(laterOf(list).map((r) => r.day)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']);
    for (const r of laterOf(list)) {
      expect(r.interruption).toBe('active');
      expect(r.title).not.toMatch(/\d+ (pages?|days)/);
    }
    // Each names where that day's own pages start.
    for (const r of laterOf(list)) {
      const [y, m, d] = r.day.split('-').map(Number);
      const first = assignedOn(makeUser(), new Date(y, m - 1, d))[0];
      const surah = getSurah(getSurahsForPage(first)[0].number)!.name;
      expect(plain(r.body)).toContain(plain(surah));
    }
  });

  it('without later days (the store app until the release): today and tomorrow only', () => {
    const list = plan({ now: at(7), laterDays: 0 });
    expect(list).toHaveLength(6);
    expect(laterOf(list)).toEqual([]);
    expect(plan({ now: at(7), laterDays: undefined })).toHaveLength(6);
  });

  it('the wording of the days after tomorrow alternates from one day to the next', () => {
    const bodies = laterOf(plan({ now: at(7), name: 'Amina' })).map((r) => r.body);
    for (let i = 1; i < bodies.length; i++) {
      const kind = (b: string) => (b.startsWith('Today starts with') ? 'starts' : 'range');
      expect(kind(bodies[i])).not.toBe(kind(bodies[i - 1]));
    }
  });

  it('done for today, the days after tomorrow are still planned', () => {
    const u = makeUser();
    const logs = [logFor('2026-10-28', assignedOn(u, day))];
    expect(laterOf(plan({ now: at(12, 50), user: u, logs }))).toHaveLength(LATER_DAYS);
  });

  it('morning is 8:00 AM when the account has no time (Settings no longer offers one)', () => {
    for (const reminderTime of [undefined, '', 'soon', '25:00', '8:75']) {
      const u = { ...makeUser(), reminderTime } as unknown as PlanReminderInput['user'];
      expect(times(todayOf(plan({ now: at(7), user: u })))[0]).toBe('morning@28:8:00');
    }
  });

  it('a time picked before is kept, with no setting for it', () => {
    const list = plan({ now: at(6), user: makeUser({ reminderTime: '06:30' }) });
    expect(times(todayOf(list))).toEqual(['morning@28:6:30', 'midday@28:15:00', 'evening@28:23:00']);
  });

  it('midday is 20 minutes after Asr at the prayer place', () => {
    const list = plan({ now: at(7), place: PLACE });
    const asr = dayTimes(PLACE, at(12), settings).asr!;
    const midday = todayOf(list).find((r) => r.kind === 'midday')!;
    expect(midday.at.getTime()).toBe(asr.getTime() + 20 * 60_000);
  });

  it('drops reminders that have already passed', () => {
    const list = plan({ now: at(16) });
    expect(times(todayOf(list))).toEqual(['evening@28:23:00']);
  });

  it('merges two due within 30 minutes into one (the later stays)', () => {
    const list = plan({ now: at(7), user: makeUser({ reminderTime: '14:50' }) });
    expect(times(todayOf(list))).toEqual(['midday@28:15:00', 'evening@28:23:00']);
  });

  it('done for today: the next reminder becomes one silent congratulation, the rest go', () => {
    const u = makeUser();
    const logs = [logFor('2026-10-28', assignedOn(u, day))];
    const list = plan({ now: at(12, 50), user: u, logs });
    const today = todayOf(list);
    expect(today).toHaveLength(1);
    expect(today[0].kind).toBe('congrat');
    expect(today[0].at).toEqual(at(15));
    expect(today[0].interruption).toBe('passive');
    // Tomorrow is still planned.
    expect(list.filter((r) => r.day === '2026-10-29')).toHaveLength(3);
  });

  it('done after the last reminder of the day: nothing more today', () => {
    const u = makeUser();
    const logs = [logFor('2026-10-28', assignedOn(u, day))];
    expect(todayOf(plan({ now: at(23, 30), user: u, logs }))).toEqual([]);
  });

  it('done before the morning one: the morning one congratulates', () => {
    const u = makeUser();
    const logs = [logFor('2026-10-28', assignedOn(u, day))];
    const today = todayOf(plan({ now: at(6), user: u, logs }));
    expect(today.map((r) => r.kind)).toEqual(['congrat']);
    expect(today[0].at).toEqual(at(8));
  });

  it('with Start day at fajr: the evening reminder lands overnight, passive, and is the last of the day', () => {
    const u = makeUser({ fajrBoundaryEnabled: true, locationCoords: PLACE });
    const list = plan({ now: at(20), user: u });
    const evening = list.find((r) => r.kind === 'evening' && r.day === '2026-10-28')!;
    expect(evening.at.getDate()).toBe(29);
    expect(evening.at.getHours()).toBeLessThan(6);
    expect(evening.interruption).toBe('passive');
  });

  it('with Start day at fajr: finished at 6:58 PM, the next one is overnight, so none is sent', () => {
    const u = makeUser({ fajrBoundaryEnabled: true, locationCoords: PLACE });
    const logs = [logFor('2026-10-28', assignedOn(u, day))];
    expect(todayOf(plan({ now: at(18, 58), user: u, logs }))).toEqual([]);
  });

  it('the copy for a juz plan names the juz, never a page', () => {
    const list = plan({ now: at(7), user: makeUser({ scheduleMode: 'juz' }) });
    expect(todayOf(list).map((r) => r.body).join(' ')).toMatch(/Juz \d+/);
  });

  it('plans nothing when no pages are assigned', () => {
    expect(plan({ now: at(7), pages: [] })).toEqual([]);
  });
});

describe('morningTime', () => {
  it('reads HH:mm and falls back to 8:00', () => {
    expect(morningTime({ reminderTime: '07:15' })).toEqual({ hour: 7, minute: 15 });
    expect(morningTime({ reminderTime: '7:05' })).toEqual({ hour: 7, minute: 5 });
    expect(morningTime({})).toEqual({ hour: 8, minute: 0 });
    expect(morningTime({ reminderTime: null })).toEqual({ hour: 8, minute: 0 });
    expect(morningTime({ reminderTime: '24:00' })).toEqual({ hour: 8, minute: 0 });
  });
});
