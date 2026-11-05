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

  it('“Plan it” works for every plan type: a custom plan opens its day, the others carry', () => {
    expect(planItAction(true)).toBe('plan-day');
    expect(planItAction(false)).toBe('carry');
  });
});
