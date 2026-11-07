import { carryForTomorrow, planItAction } from '../weakSpotActions';

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
