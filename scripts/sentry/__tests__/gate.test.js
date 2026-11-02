const { parseTarget, gateAll } = require('../gate');

const releases = [
  { release: 'com.revisionbuddy.app@1.0.3+32.uff76d17c', sessions: 12, crashed: 0, users: 2, crashFree: 1 },
  { release: 'com.revisionbuddy.app@1.0.3+3.u51b39a90', sessions: 2, crashed: 0, users: 1, crashFree: 1 },
];
const bar = { minSessions: 5, minCrashFree: 0.99 };

describe('parseTarget', () => {
  it('reads an optional platform label', () => {
    expect(parseTarget('ios:ff76d17c-397b')).toEqual({ label: 'ios', group: 'ff76d17c-397b' });
    expect(parseTarget('51b39a90-6c72')).toEqual({ label: '51b39a90', group: '51b39a90-6c72' });
  });
});

describe('gateAll', () => {
  it('needs every platform to pass: iOS alone is not enough', () => {
    const { ok, results } = gateAll(releases, [parseTarget('ios:ff76d17c-397b'), parseTarget('android:51b39a90-6c72')], bar);
    expect(ok).toBe(false);
    expect(results.map((r) => [r.label, r.decision.ok])).toEqual([
      ['ios', true],
      ['android', false],
    ]);
    expect(results[1].decision.reason).toMatch(/Only 2 preview session/);
  });

  it('passes when each group meets the bar, and never with no groups', () => {
    expect(gateAll(releases, [parseTarget('ios:ff76d17c'), parseTarget('android:51b39a90')], { ...bar, minSessions: 2 }).ok).toBe(true);
    expect(gateAll(releases, [], bar).ok).toBe(false);
  });
});
