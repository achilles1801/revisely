import { badgeName, badgeOf, latestMilestone, milestoneLabel, MILESTONES, nextMilestone, progressToNext } from '../badges';

describe('badges for pages revised (ACCOUNT-5)', () => {
  it('climbs in six tiers, two badges each', () => {
    expect(MILESTONES.map((m) => `${badgeOf(m).tier} ${badgeOf(m).level}`)).toEqual([
      'bronze 1', 'bronze 2', 'silver 1', 'silver 2', 'gold 1', 'gold 2',
      'platinum 1', 'platinum 2', 'diamond 1', 'diamond 2', 'emerald 1', 'emerald 2',
    ]);
    expect(badgeName(1000)).toBe('Gold II');
    expect(badgeName(2500)).toBe('Platinum I');
  });

  it('knows the last milestone reached and the next', () => {
    expect(latestMilestone(0)).toBeNull();
    expect(nextMilestone(0)).toBe(10);
    expect(latestMilestone(37)).toBe(10);
    expect(nextMilestone(37)).toBe(50);
    expect(latestMilestone(100)).toBe(100);
    expect(nextMilestone(100)).toBe(250);
    expect(latestMilestone(1240)).toBe(1000);
    expect(nextMilestone(1240)).toBe(2500);
    expect(nextMilestone(100000)).toBeNull();
  });

  it('fills the bar from the last milestone to the next', () => {
    expect(progressToNext(0)).toBe(0);
    expect(progressToNext(37)).toBeCloseTo(27 / 40);
    expect(progressToNext(1240)).toBeCloseTo(240 / 1500);
    expect(progressToNext(200000)).toBe(1);
  });

  it('writes a thousand or more short, as a badge shows it', () => {
    expect(milestoneLabel(250)).toBe('250');
    expect(milestoneLabel(2500)).toBe('2.5K');
    expect(milestoneLabel(100000)).toBe('100K');
  });
});
