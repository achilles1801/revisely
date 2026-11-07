// The streak rule (C5, owner-approved Nov 2026): a day counts when every page scheduled for it is
// credited to it, ahead credits included; alive through yesterday until today's revision day ends.
import { aliveStreak, completedDays, previousIsoDay, streakDetailFromLogs, streakFromLogs, streakReading, streakReadingFromLogs } from '../../../src/lib/streak';
import { streakDetailFromItems, streakReadingFromItems } from '../../../src/lib/streakFromItems';
import { withPhoneSessions } from '../../../src/lib/activityHistory';
import type { RevisionLog, User, UserPage } from '../../../src/types';

const log = (date: string, assignedPages: number[], pagesRevised: number[], ahead?: Record<string, number[]>): RevisionLog => ({
  id: date,
  date,
  assignedPages,
  pagesRevised,
  pagesSkipped: [],
  weaknessUpdates: [],
  durationMinutes: null,
  ...(ahead ? { ahead } : {}),
});

describe('the streak rule', () => {
  it('[SESS-2] steps back one calendar day, across months, years and leap days', () => {
    expect(previousIsoDay('2026-11-01')).toBe('2026-10-31');
    expect(previousIsoDay('2027-01-01')).toBe('2026-12-31');
    expect(previousIsoDay('2028-03-01')).toBe('2028-02-29');
  });

  it('[SESS-2] a day counts only when every page scheduled for it is credited to it', () => {
    const credited = new Map([
      ['2026-11-01', new Set([1, 2])], // all of its pages
      ['2026-11-02', new Set([3])], // one of two
    ]);
    const done = completedDays(credited, (d) => (d === '2026-11-01' ? [1, 2] : [3, 4]));
    expect([...done]).toEqual(['2026-11-01']);
  });

  it('[SESS-2] a page revised ahead counts for the day it is scheduled on', () => {
    // Day 2's page 4 was revised on day 3, credited back to day 2.
    const logs = [log('2026-11-02', [3, 4], [3]), log('2026-11-03', [5], [5], { '2026-11-02': [4] })];
    const done = completedDays(
      new Map([
        ['2026-11-02', new Set([3, 4])],
        ['2026-11-03', new Set([5])],
      ]),
      (d) => logs.find((l) => l.date === d)?.assignedPages ?? [],
    );
    expect(done.has('2026-11-02')).toBe(true);
  });

  it('[SESS-2] a day with nothing scheduled never counts', () => {
    expect(completedDays(new Map([['2026-11-02', new Set([1])]]), () => []).size).toBe(0);
  });

  it('[SESS-2] counts today when today is done', () => {
    expect(aliveStreak(new Set(['2026-11-03', '2026-11-02']), '2026-11-03')).toBe(2);
  });

  it('[SESS-2] stays alive through yesterday until today’s revision day ends', () => {
    expect(aliveStreak(new Set(['2026-11-02', '2026-11-01']), '2026-11-03')).toBe(2);
  });

  it('[SESS-2] a gap ends the streak; no done days is zero', () => {
    expect(aliveStreak(new Set(['2026-11-01']), '2026-11-03')).toBe(0);
    expect(aliveStreak(new Set(), '2026-11-03')).toBe(0);
  });

  it('[SESS-2] a partly done day breaks the streak (from the logs)', () => {
    const user = {} as User;
    const pages = [] as UserPage[];
    const logs = [
      log('2026-11-01', [1, 2], [1, 2]),
      log('2026-11-02', [3, 4], [3]), // page 4 not revised: day not done
      log('2026-11-03', [5], [5]),
    ];
    expect(streakFromLogs({ user, pages, logs, today: '2026-11-03' })).toBe(1);
  });
});

// SESS-6: the grace window. Every day schedules pages 1 and 2 unless a test says otherwise.
describe('the grace window (SESS-6)', () => {
  const scheduled = () => [1, 2];
  /** Credits: day → the pages credited to it. */
  const reading = (credits: Record<string, number[]>, today: string, onTime?: string[]) => {
    const credited = new Map(Object.entries(credits).map(([d, ps]) => [d, new Set(ps)]));
    const done = completedDays(credited, scheduled);
    return streakReading({ done, onTime: new Set(onTime ?? [...done]), scheduled, credited, today });
  };
  const full = (...days: string[]) => Object.fromEntries(days.map((d) => [d, [1, 2]]));

  it('[SESS-6] yesterday missed, and restored today, brings the streak back', () => {
    // Days 1–2 done, day 3 missed, today day 4. Restoring day 3 (its pages) counts it.
    expect(reading({ ...full('2026-11-01', '2026-11-02') }, '2026-11-04')).toEqual({
      streak: 0,
      grace: { previous: 2, progress: { scheduled: 2, credited: 0 } },
    });
    expect(reading({ ...full('2026-11-01', '2026-11-02', '2026-11-03') }, '2026-11-04').streak).toBe(3);
  });

  it('[SESS-6] yesterday partly missed shows the grace ring, not the restored streak', () => {
    expect(reading({ '2026-11-01': [1, 2], '2026-11-02': [1, 2], '2026-11-03': [1] }, '2026-11-04').grace).toEqual({
      previous: 2,
      progress: { scheduled: 2, credited: 1 },
    });
  });

  it('[SESS-6] not restored by the end of the day: the streak is broken, and the next day shows no grace', () => {
    // Day 3 missed, day 4 (today's pages) not restored, today day 5: two missed days in a row.
    const r = reading({ ...full('2026-11-01', '2026-11-02') }, '2026-11-05');
    expect(r).toEqual({ streak: 0, grace: null });
  });

  it('[SESS-6] repeats every day: a missed day restored, then missed again, shows grace again', () => {
    const restored = reading({ ...full('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04') }, '2026-11-06');
    // Day 5 is missed again (today day 6): the run through day 4 is intact.
    expect(restored.grace?.previous).toBe(4);
  });

  it('[SESS-6] a day done late counts itself, but does not carry a run behind it', () => {
    // Days 2 and 3 were done after their own days ended: only day 1 was on time. Restoring day 3
    // counts day 3 alone; day 2 (late) does not extend it.
    const r = reading({ '2026-11-01': [1, 2], ...full('2026-11-02', '2026-11-03') }, '2026-11-04', ['2026-11-01']);
    expect(r.grace).toBeNull();
    expect(r.streak).toBe(1);
  });

  it('[SESS-6] yesterday restored today, then today done: the run before it, yesterday and today', () => {
    // Days 1–2 on time, day 3 missed and restored on day 4 (late), then day 4 done.
    const onTime = ['2026-11-01', '2026-11-02', '2026-11-04'];
    expect(reading({ ...full('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04') }, '2026-11-04', onTime)).toEqual({ streak: 4, grace: null });
    // Today done first, yesterday still missed: today alone, until yesterday's pages are revised.
    expect(reading({ ...full('2026-11-01', '2026-11-02', '2026-11-04'), '2026-11-03': [1] }, '2026-11-04', onTime).streak).toBe(1);
  });

  it('[SESS-2] a day with nothing scheduled yesterday doesn’t end the run, today done or not', () => {
    const scheduledOn = (day: string) => (day === '2026-11-03' ? [] : [1, 2]);
    const read = (days: string[]) => {
      const credited = new Map(days.map((d) => [d, new Set([1, 2])]));
      const done = completedDays(credited, scheduledOn);
      return streakReading({ done, onTime: done, scheduled: scheduledOn, credited, today: '2026-11-04' });
    };
    expect(read(['2026-11-01', '2026-11-02'])).toEqual({ streak: 2, grace: null });
    expect(read(['2026-11-01', '2026-11-02', '2026-11-04'])).toEqual({ streak: 3, grace: null });
  });

  it('[SESS-6] a day done today is the streak, with no grace', () => {
    expect(reading({ ...full('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04') }, '2026-11-04')).toEqual({ streak: 4, grace: null });
  });

  it('[SESS-6] the revision day sets the reading, not the calendar day (Fajr after midnight)', () => {
    // Calendar 2026-11-05 at 02:00 is still the revision day 2026-11-04 before Fajr: same reading.
    const before = reading({ ...full('2026-11-01', '2026-11-02') }, '2026-11-04');
    const sameRevisionDay = reading({ ...full('2026-11-01', '2026-11-02') }, '2026-11-04');
    expect(sameRevisionDay).toEqual(before);
  });
});

// C5: the streak from the Activity items, not the logs (lib/streakFromItems). Same answers on the same
// history; a day done late doesn't carry a run behind it.
describe('the streak from items (C5)', () => {
  const user = { id: 'u1', dailyPageCapacity: 2, scheduleMode: 'pages' } as unknown as User;
  const dayMs = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd, 20, 0).getTime();
  };
  const item = (day: string, pages: number[], occurredAt: number | null) => ({
    day,
    countsFor: day,
    pages,
    assigned: pages,
    occurredAt,
  });

  it('[SESS-2] the items give the same streak as the logs on the same history', () => {
    const logs = [
      { id: 'a', date: '2026-11-01', assignedPages: [1, 2], pagesRevised: [1, 2], pagesSkipped: [], weaknessUpdates: [], durationMinutes: null },
      { id: 'b', date: '2026-11-02', assignedPages: [3, 4], pagesRevised: [3, 4], pagesSkipped: [], weaknessUpdates: [], durationMinutes: null },
    ] as unknown as RevisionLog[];
    const items = [item('2026-11-01', [1, 2], dayMs('2026-11-01')), item('2026-11-02', [3, 4], dayMs('2026-11-02'))];
    const fromLogs = streakReadingFromLogs({ user, pages: [], logs, today: '2026-11-03' });
    const fromItems = streakReadingFromItems({ user, pages: [], items, today: '2026-11-03' });
    expect(fromItems).toEqual(fromLogs);
    expect(fromItems.streak).toBe(2);
  });

  it('[SESS-6] a missed day restored late brings back the run before it (items only)', () => {
    // Day 1 on time; day 2 missed on its own day, restored the next day. Restoring it brings back day 1.
    const items = [item('2026-11-01', [1, 2], dayMs('2026-11-01')), item('2026-11-02', [3, 4], dayMs('2026-11-03'))];
    expect(streakReadingFromItems({ user, pages: [], items, today: '2026-11-03' }).streak).toBe(2);
  });

  it('[SESS-6] two days done late do not carry each other (items only)', () => {
    // Day 1 on time; days 2 and 3 both restored late. Only the first restoration brings back day 1.
    const items = [
      item('2026-11-01', [1, 2], dayMs('2026-11-01')),
      item('2026-11-02', [3, 4], dayMs('2026-11-03')),
      item('2026-11-03', [5, 6], dayMs('2026-11-04')),
    ];
    expect(streakReadingFromItems({ user, pages: [], items, today: '2026-11-04' }).streak).toBe(1);
  });

  it('[SESS-2] a session saved on the phone counts at once, before its items reach the server', () => {
    // The server has day 1; day 2's session is on the phone only (just saved, or offline).
    const server = [{ ...item('2026-11-01', [1, 2], dayMs('2026-11-01')), id: '2026-11-01' }];
    const logs = [log('2026-11-01', [1, 2], [1, 2]), log('2026-11-02', [3, 4], [3, 4])];
    expect(streakReadingFromItems({ user, pages: [], items: server, today: '2026-11-02' }).streak).toBe(1);
    const shown = withPhoneSessions(server, logs, dayMs('2026-11-02'));
    expect(streakReadingFromItems({ user, pages: [], items: shown, today: '2026-11-02' }).streak).toBe(2);
  });

  it('[SESS-6] yesterday’s pages caught up in today’s session restore it at once; a session deleted on the phone stops counting', () => {
    // Days 1–2 on the server; day 3 left at one page of two; today (day 4) catches its page 6 up.
    const server = [
      { ...item('2026-11-01', [1, 2], dayMs('2026-11-01')), id: '2026-11-01' },
      { ...item('2026-11-02', [3, 4], dayMs('2026-11-02')), id: '2026-11-02' },
      { id: '2026-11-03', day: '2026-11-03', countsFor: '2026-11-03', pages: [5], assigned: [5, 6], occurredAt: dayMs('2026-11-03') },
    ];
    const before = [log('2026-11-01', [1, 2], [1, 2]), log('2026-11-02', [3, 4], [3, 4]), log('2026-11-03', [5, 6], [5])];
    expect(streakReadingFromItems({ user, pages: [], items: withPhoneSessions(server, before, dayMs('2026-11-04')), today: '2026-11-04' }).grace).toEqual({
      previous: 2,
      progress: { scheduled: 2, credited: 1 },
    });
    const caughtUp = [...before, log('2026-11-04', [7, 8], [], { '2026-11-03': [6] })];
    expect(streakReadingFromItems({ user, pages: [], items: withPhoneSessions(server, caughtUp, dayMs('2026-11-04')), today: '2026-11-04' })).toEqual({
      streak: 3,
      grace: null,
    });
    // Day 2's session deleted on the phone: the server's item for it no longer counts.
    const deleted = caughtUp.filter((l) => l.date !== '2026-11-02');
    expect(streakReadingFromItems({ user, pages: [], items: withPhoneSessions(server, deleted, dayMs('2026-11-04')), today: '2026-11-04' }).streak).toBe(1);
  });

  // D1 (Majd, Nov 7 2026): Keep daily amount filled 11-03 with 11-02's pages 3 and 4. They are
  // credited to 11-02 (SESS-7) and are what 11-03 needs: revising them finishes 11-03.
  it('[SESS-7] [SESS-2] a day filled with carried pages is done once they are revised, from the logs and from the items', () => {
    const before = [log('2026-11-01', [1, 2], [1, 2]), log('2026-11-02', [3, 4], [])];
    const half = [...before, log('2026-11-03', [3, 4], [], { '2026-11-02': [3] })];
    const whole = [...before, log('2026-11-03', [3, 4], [], { '2026-11-02': [3, 4] })];
    expect(streakDetailFromLogs({ user, pages: [], logs: half, today: '2026-11-03' }).done.has('2026-11-03')).toBe(false);
    const fromLogs = streakDetailFromLogs({ user, pages: [], logs: whole, today: '2026-11-03' });
    expect(fromLogs.done.has('2026-11-03')).toBe(true);
    // 11-02 is restored too (SESS-6, in its grace window): 11-01, 11-02 and today.
    expect(fromLogs.reading).toEqual({ streak: 3, grace: null });
    // The server holds no item of 11-03's own for it (it revised no page of its own), only its credit
    // for 11-02; the phone's session keeps 11-03's assignment, at the time the server gave the session.
    const server = [
      { ...item('2026-11-01', [1, 2], dayMs('2026-11-01')), id: '2026-11-01' },
      { id: '2026-11-03-ahead-2026-11-02', day: '2026-11-03', countsFor: '2026-11-02', pages: [3, 4], assigned: [], occurredAt: dayMs('2026-11-03') },
    ];
    const items = (logs: RevisionLog[]) => withPhoneSessions(server, logs, dayMs('2026-11-05'));
    const partly = streakDetailFromItems({ user, pages: [], items: items(half), today: '2026-11-03' });
    expect(partly.done.has('2026-11-03')).toBe(false);
    const detail = streakDetailFromItems({ user, pages: [], items: items(whole), today: '2026-11-03' });
    expect(detail.done.has('2026-11-03')).toBe(true);
    // Today counts: one more than with a page still to revise.
    expect(detail.reading.streak).toBe(partly.reading.streak + 1);
    // Two days on, after 11-04 is done too: 11-03 was done on its own day (the time the server gave
    // its session), so it carries 11-04's run.
    const later = [...server, { ...item('2026-11-04', [5, 6], dayMs('2026-11-04')), id: '2026-11-04' }];
    const withNext = withPhoneSessions(later, [...whole, log('2026-11-04', [5, 6], [5, 6])], dayMs('2026-11-05'));
    expect(streakReadingFromItems({ user, pages: [], items: withNext, today: '2026-11-05' }).streak).toBe(2);
  });

  it('[SESS-7] a day with pages of its own is not finished by a catch-up page, even one that is also its own', () => {
    // A small plan wraps round: page 3 is 11-02's and 11-03's. Caught up on 11-03 for 11-02, it
    // counts for 11-02 only; 11-03 still needs its own revision of it.
    const logs = [log('2026-11-03', [3, 4], [4], { '2026-11-02': [3] })];
    const detail = streakDetailFromLogs({ user, pages: [], logs, today: '2026-11-03' });
    expect(detail.done.has('2026-11-03')).toBe(false);
    const fromItems = streakDetailFromItems({ user, pages: [], items: withPhoneSessions([], logs, dayMs('2026-11-03')), today: '2026-11-03' });
    expect(fromItems.done.has('2026-11-03')).toBe(false);
  });

  it('[SESS-6] a session at 00:30 before Fajr is still the day before (Fajr on)', () => {
    // Revision day 2026-11-03 ends at Fajr on 11-04, not at midnight: 00:30 on 11-04 is on time for it.
    const fajrUser = {
      ...user,
      fajrBoundaryEnabled: true,
      // Chicago: its Fajr on 11-04 is well after 00:30 local, in any time zone the tests run in.
      locationCoords: { latitude: 41.8781, longitude: -87.6298 },
      fajrCalculationMethod: 'NorthAmerica',
    } as unknown as User;
    const at0030 = new Date(2026, 10, 4, 0, 30).getTime();
    const items = [
      item('2026-11-02', [1, 2], new Date(2026, 10, 2, 12).getTime()),
      item('2026-11-03', [3, 4], at0030),
      item('2026-11-04', [5, 6], new Date(2026, 10, 4, 12).getTime()),
    ];
    // With Fajr: 11-03 is on time, so the run is 11-04, 11-03, 11-02.
    expect(streakReadingFromItems({ user: fajrUser, pages: [], items, today: '2026-11-05' }).streak).toBe(3);
    // Without the boundary (midnight), 11-03 is late and carries nothing: the streak is just 11-04.
    expect(streakReadingFromItems({ user, pages: [], items, today: '2026-11-05' }).streak).toBe(1);
  });
});
