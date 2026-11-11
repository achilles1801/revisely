const { parseRelease, labelOf, platformMap, shapeRange } = require('../totals');

describe('Sentry totals', () => {
  it('reads release names', () => {
    expect(parseRelease('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toEqual({ version: '1.0.3', build: 32, update: '532abc0c' });
    expect(parseRelease('com.revisionbuddy.app@1.0.3+6')).toEqual({ version: '1.0.3', build: 6, update: null });
    expect(labelOf('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toBe('1.0.3 (32) · update 532abc0c');
    expect(labelOf('com.revisionbuddy.app@1.0.3+32')).toBe('1.0.3 (32), built in');
  });
  it("takes a release's platform from its events, then its build's, then the build number", () => {
    const platformOf = platformMap([
      { release: 'com.revisionbuddy.app@1.0.3+32.u532abc0c', 'os.name': 'iOS', 'count()': 4 },
      { release: 'com.revisionbuddy.app@1.0.3+25.uaaaaaaaa', 'os.name': 'Android', 'count()': 2 },
    ]);
    expect(platformOf('com.revisionbuddy.app@1.0.3+32.u532abc0c')).toBe('ios');
    expect(platformOf('com.revisionbuddy.app@1.0.3+32')).toBe('ios');
    expect(platformOf('com.revisionbuddy.app@1.0.3+25')).toBe('android');
    expect(platformOf('com.revisionbuddy.app@1.0.3+6.ubedea4a5')).toBe('android');
    expect(platformOf('com.revisionbuddy.app@1.0.4+33')).toBe('ios');
  });
  it('adds sessions over statuses, counts crashes and marks the newest update', () => {
    const rel = 'com.revisionbuddy.app@1.0.3+32.u532abc0c';
    const old = 'com.revisionbuddy.app@1.0.3+32.u11111111';
    const r = shapeRange(
      {
        intervals: ['2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z'],
        groups: [
          { by: { release: rel, 'session.status': 'healthy' }, totals: { 'sum(session)': 9 }, series: { 'sum(session)': [4, 5] } },
          { by: { release: rel, 'session.status': 'crashed' }, totals: { 'sum(session)': 1 }, series: { 'sum(session)': [0, 1] } },
          { by: { release: old, 'session.status': 'healthy' }, totals: { 'sum(session)': 2 }, series: { 'sum(session)': [2, 0] } },
        ],
      },
      { groups: [{ by: { release: rel }, totals: { 'count_unique(user)': 3 }, series: { 'count_unique(user)': [2, 3] } }] },
      () => 'ios',
      new Map([[rel, 2000], [old, 1000]]),
    );
    const mine = r.releases.find((x) => x.release === rel);
    expect(mine).toMatchObject({ totalSessions: 10, totalCrashed: 1, totalUsers: 3, sessions: [4, 6], crashed: [0, 1], users: [2, 3], latest: true });
    expect(r.releases.find((x) => x.release === old).latest).toBe(false);
  });
});
