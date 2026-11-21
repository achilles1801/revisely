import { build } from './aggregate';
import { lastFullDay, retention, weekOf } from './retention';
import type { ActivityRow } from './sources';

const AS_OF = '2026-11-20'; // a Friday

describe('retention', () => {
  it('weeks start on Monday; the last full day is yesterday in UTC', () => {
    expect(weekOf('2026-11-02')).toBe('2026-11-02');
    expect(weekOf('2026-11-08')).toBe('2026-11-02');
    expect(weekOf('2026-11-09')).toBe('2026-11-09');
    expect(lastFullDay(Date.UTC(2026, 10, 21, 0, 30))).toBe('2026-11-20');
  });

  it('counts day N exactly, "day N or later" too, and only once the cohort has reached it', () => {
    const r = retention(
      [
        { signedUp: '2026-11-02', onboarded: true, days: ['2026-11-02', '2026-11-03', '2026-11-09'] }, // day 0, 1, 7
        { signedUp: '2026-11-03', onboarded: true, days: ['2026-11-03', '2026-11-12'] }, // day 0, 9
        { signedUp: '2026-11-04', onboarded: false, days: [] },
        { signedUp: '2026-11-19', onboarded: true, days: ['2026-11-19', '2026-11-20'] }, // day 7 not reached
      ],
      AS_OF,
    );
    expect(r.accounts).toBe(4);
    expect(r.onboarded).toBe(3);
    const nov2 = r.cohorts.find((c) => c.week === '2026-11-02')!;
    expect(nov2.signedUp).toBe(3);
    expect(nov2.day[1]).toEqual({ n: 1, of: 3 });
    expect(nov2.day[7]).toEqual({ n: 1, of: 3 });
    expect(nov2.rolling[7]).toEqual({ n: 2, of: 3 });
    expect(nov2.day[30]).toBeNull();
    const nov16 = r.cohorts.find((c) => c.week === '2026-11-16')!;
    expect(nov16.day[1]).toEqual({ n: 1, of: 1 });
    expect(nov16.day[7]).toBeNull();
  });

  it("starts an account on its first local day when that is within a day of its UTC sign-up", () => {
    // Signed up at 01:00 UTC on Nov 3, 8 pm Nov 2 in Chicago: its first session is Nov 2, and Nov 3 is day 1.
    const west = retention([{ signedUp: '2026-11-03', firstDay: '2026-11-02', onboarded: true, days: ['2026-11-02', '2026-11-03'] }], AS_OF);
    expect(west.cohorts[0].day[1]).toEqual({ n: 1, of: 1 });
    // A first session weeks later is not a sign-up day: the UTC date stands.
    const late = retention([{ signedUp: '2026-11-03', firstDay: '2026-11-15', onboarded: true, days: ['2026-11-15'] }], AS_OF);
    expect(late.cohorts[0].week).toBe('2026-11-02');
    expect(late.cohorts[0].rolling[7]).toEqual({ n: 1, of: 1 });
  });

  it('counts weekly and monthly active accounts, old accounts included, up to the last full day', () => {
    const r = retention(
      [
        { signedUp: '2026-09-01', onboarded: true, days: ['2026-11-20', '2026-11-01'] }, // before the cohorts, still active
        { signedUp: '2026-11-02', onboarded: true, days: ['2026-11-05'] },
        { signedUp: '2026-11-02', onboarded: true, days: ['2026-11-21'] }, // today: not counted yet
        { signedUp: 'not a day', onboarded: true, days: ['nonsense', '2026-11-18'] },
      ],
      AS_OF,
    );
    expect(r.accounts).toBe(2);
    expect(r.active).toEqual({ day: 1, week: 2, month: 3 });
    expect(r.series.at(-1)).toEqual({ end: AS_OF, wau: 2, mau: 3 });
    expect(r.series[0].end).toBe('2026-10-04'); // the first Sunday after Oct 1
    expect(r.series.find((p) => p.end === '2026-11-08')).toEqual({ end: '2026-11-08', wau: 1, mau: 2 });
  });
});

describe('the console', () => {
  const row = (uid: string, extra: Partial<ActivityRow> = {}): ActivityRow => ({ uid, signedUp: '2026-11-02', firstDay: null, onboarded: true, tester: false, service: false, days: ['2026-11-19'], ...extra });

  it('leaves out testers, the owner and the service accounts, and returns no ids', () => {
    const m = build({
      now: Date.UTC(2026, 10, 21, 9),
      ownerUids: new Set(['uid-owner']),
      testers: new Set(['uid-listed-tester']),
      activity: [row('uid-person-1'), row('uid-person-2', { days: [] }), row('uid-owner'), row('uid-flagged', { tester: true }), row('uid-listed-tester'), row('uid-review', { service: true })],
    });
    expect(m.retention?.left).toEqual({ testers: 2, owner: 1, service: 1 });
    expect(m.retention?.accounts).toBe(2);
    expect(m.retention?.active.week).toBe(1);
    const text = JSON.stringify(m.retention);
    for (const id of ['uid-person-1', 'uid-person-2', 'uid-owner', 'uid-flagged', 'uid-listed-tester', 'uid-review']) expect(text).not.toContain(id);
  });

  it('says nothing when the activity could not be read', () => {
    expect(build({ now: Date.UTC(2026, 10, 21) }).retention).toBeNull();
  });
});
