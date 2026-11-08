import { allFirstTomorrow, carryForTomorrow, firstTomorrowPages, firstTomorrowText, planItAction, putFirstTomorrow } from '../weakSpotActions';

describe('weak spots’ actions (Insights)', () => {
  it('“Revise these first tomorrow”: the weak pages lead tomorrow’s carry', () => {
    expect(carryForTomorrow('2026-11-06', [548, 549], null)).toEqual({ day: '2026-11-06', pages: [548, 549], skip: 0, source: 'insights' });
  });

  it('a carry already set for tomorrow is kept behind them, with no page twice', () => {
    expect(carryForTomorrow('2026-11-06', [548, 549], { day: '2026-11-06', pages: [549, 560] })).toEqual({
      day: '2026-11-06',
      pages: [548, 549, 560],
      skip: 0,
      source: 'insights',
    });
  });

  it('a carry for another day is replaced, not merged', () => {
    expect(carryForTomorrow('2026-11-06', [548], { day: '2026-11-04', pages: [235] })).toEqual({ day: '2026-11-06', pages: [548], skip: 0, source: 'insights' });
  });

  it('today’s own carry (Add to today) stays as it is, with tomorrow’s beside it', () => {
    const today = { day: '2026-11-05', pages: [585, 586], skip: 2, from: { '585': '2026-11-04', '586': '2026-11-04' } };
    const both = carryForTomorrow('2026-11-06', [600, 601], today);
    expect(both).toEqual({ ...today, next: { day: '2026-11-06', pages: [600, 601], source: 'insights' } });
    // Asked again: tomorrow's pages merge; today's stay.
    expect(carryForTomorrow('2026-11-06', [602, 600], both)).toEqual({ ...today, next: { day: '2026-11-06', pages: [602, 600, 601], source: 'insights' } });
  });

  it('today’s carry held as yesterday’s next becomes the carry, with tomorrow’s next to it', () => {
    const held = { day: '2026-11-04', pages: [1], skip: 0, next: { day: '2026-11-05', pages: [548], source: 'insights' as const } };
    expect(carryForTomorrow('2026-11-06', [560], held)).toEqual({
      day: '2026-11-05',
      pages: [548],
      skip: 0,
      source: 'insights',
      next: { day: '2026-11-06', pages: [560], source: 'insights' },
    });
  });

  it('“Plan it” works for every plan type: a custom plan opens its day, the others carry', () => {
    expect(planItAction(true)).toBe('plan-day');
    expect(planItAction(false)).toBe('carry');
  });
});

describe('first tomorrow: its feedback (ACT-24)', () => {
  it('the pages already first tomorrow, from tomorrow’s carry or the one held beside today’s', () => {
    const own = { day: '2026-11-05', pages: [10], skip: 0, next: { day: '2026-11-06', pages: [548, 549], source: 'insights' as const } };
    expect([...firstTomorrowPages({ carryOver: own }, '2026-11-06')]).toEqual([548, 549]);
    expect([...firstTomorrowPages({ carryOver: carryForTomorrow('2026-11-06', [600], null) }, '2026-11-06')]).toEqual([600]);
    expect(firstTomorrowPages({ carryOver: null }, '2026-11-06').size).toBe(0);
    expect(allFirstTomorrow([548, 549], new Set([548, 549, 550]))).toBe(true);
    expect(allFirstTomorrow([548, 551], new Set([548, 549]))).toBe(false);
    expect(allFirstTomorrow([], new Set([548]))).toBe(false);
  });

  it('the toast: one passage goes, several go', () => {
    expect(firstTomorrowText('Al-Hashr 17–24', 2)).toBe('Al-Hashr 17–24 goes first tomorrow');
    // Several passages lead with the outcome: a toast cut to two lines loses names, not "first tomorrow".
    expect(firstTomorrowText('Al-Hashr 17–24 and At-Taghabun', 4)).toBe('4 pages go first tomorrow: Al-Hashr 17–24 and At-Taghabun');
    expect(firstTomorrowText('Al-Baqarah 246–252, Al-Hashr to Al-Mumtahanah and At-Taghabun', 6)).toBe(
      '6 pages go first tomorrow: Al-Baqarah 246–252, Al-Hashr to Al-Mumtahanah and At-Taghabun',
    );
  });

  it('puts the pages first tomorrow, and Undo puts the carry back as it was, on the latest user', async () => {
    const saved: unknown[] = [];
    const user = { id: 'u', carryOver: null } as never as Parameters<typeof putFirstTomorrow>[0]['user'];
    let latest = user;
    const saveUser = async (u: typeof user) => {
      saved.push(u.carryOver);
      latest = u;
    };
    const { text, undo } = await putFirstTomorrow({ user, saveUser, today: '2026-11-05', pages: [548, 549], name: 'Al-Hashr 17–24', latest: () => ({ ...latest, name: 'changed since' }) });
    expect(text).toBe('Al-Hashr 17–24 goes first tomorrow');
    expect(saved[0]).toEqual({ day: '2026-11-06', pages: [548, 549], skip: 0, source: 'insights' });
    await undo();
    expect(saved[1]).toBeNull();
    expect((latest as { name?: string }).name).toBe('changed since');
  });
});

describe('first tomorrow: in addition, never in place (ACT-24)', () => {
  // Tomorrow (6 Nov) holds 582–586 on a pages plan; 600 and 601 go first from Insights.
  const day = '2026-11-06';
  const user = { carryOver: carryForTomorrow(day, [600, 601], null), carryOverMode: 'shift' as const };
  it('tomorrow’s pages are the extras then all of its own: nothing shifts, even with Keep daily amount', () => {
    expect(user.carryOver).toMatchObject({ skip: 0 });
  });
  it('tomorrow is done with its own pages: the extras aren’t needed for the streak or Done', () => {
    const { duePagesOf } = jest.requireActual('../carryOver') as typeof import('../carryOver');
    expect(duePagesOf([600, 601, 582, 583, 584, 585, 586], user as never, day)).toEqual([582, 583, 584, 585, 586]);
  });
});
