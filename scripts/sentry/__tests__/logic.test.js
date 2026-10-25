const {
  marker,
  findTracked,
  issueTitle,
  issueBody,
  sessionsByRelease,
  updateHealth,
  gate,
  productionAlerts,
  dailyReport,
} = require('../logic');

const issue = {
  id: '7472682057',
  shortId: 'REACT-NATIVE-6',
  title: 'FirebaseError: Missing or insufficient permissions.',
  culprit: 'recreateUserDocIfMissing(src/lib/userDoc)',
  permalink: 'https://revisely.sentry.io/issues/7472682057/',
  count: '41',
  userCount: 13,
  firstSeen: '2026-05-11T06:11:44Z',
  lastSeen: '2026-10-24T12:37:17Z',
  substatus: 'regressed',
  level: 'error',
};
const event = {
  release: 'com.revisionbuddy.app@1.0.1+14',
  environment: 'production',
  tags: [
    { key: 'release', value: 'com.revisionbuddy.app@1.0.1+14' },
    { key: 'environment', value: 'production' },
    { key: 'device', value: 'iPad15,7' },
    { key: 'os', value: 'iOS 27.0.1' },
    { key: 'user', value: 'id:1H0zB0DC6mRLxWKAX1OXrPnqeb82' },
  ],
  user: { id: '1H0zB0DC6mRLxWKAX1OXrPnqeb82', ip_address: '212.171.58.233', geo: { city: 'Venice' } },
  contexts: { ota_updates: { update_id: 'e58fdbea', is_embedded_launch: true, runtime_version: '2e08c17f' } },
  entries: [
    {
      type: 'exception',
      data: {
        values: [
          {
            type: 'FirebaseError',
            value: 'Missing or insufficient permissions.',
            stacktrace: {
              frames: [
                { function: 'node_internal', filename: 'node_modules/x.js', lineNo: 1, inApp: false },
                { function: 'createUser', filename: 'src/services/firestoreService.ts', lineNo: 140, inApp: true },
                { function: 'recreate', filename: 'src/context/AppContext.tsx', lineNo: 230, inApp: true },
              ],
            },
          },
        ],
      },
    },
    { type: 'breadcrumbs', data: { values: [{ message: 'user typed their email someone@example.com' }] } },
  ],
};

describe('Sentry → GitHub issues', () => {
  it('finds the GitHub issue already tracking a Sentry issue by its marker', () => {
    const gh = [
      { number: 3, body: `x ${marker('1')}` },
      { number: 4, body: `y ${marker('7472682057')}` },
      { number: 5, body: marker('7472682057'), pull_request: {} },
    ];
    expect(findTracked(gh, '7472682057').number).toBe(4);
    expect(findTracked(gh, '9')).toBeNull();
  });

  it('titles and describes the issue with what is needed to fix it', () => {
    expect(issueTitle(issue)).toBe('[Sentry] REACT-NATIVE-6: FirebaseError: Missing or insufficient permissions.');
    const body = issueBody(issue, event);
    expect(body).toContain(marker('7472682057'));
    expect(body).toContain('Regressed');
    expect(body).toContain('`com.revisionbuddy.app@1.0.1+14`');
    expect(body).toContain('e58fdbea (built-in)');
    expect(body).toContain('FirebaseError: Missing or insufficient permissions.');
    // In-app frames only, innermost first.
    expect(body.indexOf('recreate (src/context/AppContext.tsx:230)')).toBeLessThan(body.indexOf('createUser (src/services/firestoreService.ts:140)'));
    expect(body).not.toContain('node_internal');
  });

  it('never puts personal data in the public issue (user id, IP, location, breadcrumbs)', () => {
    const body = issueBody(issue, event);
    expect(body).not.toContain('1H0zB0DC6mRLxWKAX1OXrPnqeb82');
    expect(body).not.toContain('212.171.58.233');
    expect(body).not.toContain('Venice');
    expect(body).not.toContain('someone@example.com');
  });

  it('copes with an issue whose latest event could not be fetched', () => {
    expect(issueBody({ ...issue, substatus: 'new' }, null)).toContain('**New**');
  });
});

const sessions = {
  groups: [
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.u84b0091f', 'session.status': 'healthy' }, totals: { 'sum(session)': 9, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.u84b0091f', 'session.status': 'crashed' }, totals: { 'sum(session)': 1, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+20.u84b0091f', 'session.status': 'healthy' }, totals: { 'sum(session)': 10, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.2+19.ue55e24c2', 'session.status': 'healthy' }, totals: { 'sum(session)': 4, 'count_unique(user)': 1 } },
    { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'healthy' }, totals: { 'sum(session)': 950, 'count_unique(user)': 40 } },
    { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'crashed' }, totals: { 'sum(session)': 50, 'count_unique(user)': 5 } },
  ],
};

describe('release health', () => {
  const releases = sessionsByRelease(sessions);

  it('sums sessions and crashes per release', () => {
    const r = releases.find((x) => x.release === 'com.revisionbuddy.app@1.0.1+14');
    expect(r).toMatchObject({ sessions: 1000, crashed: 50, users: 40 });
    expect(r.crashFree).toBeCloseTo(0.95);
  });

  it('adds up one update group across builds, and only that group', () => {
    const h = updateHealth(releases, '84b0091f-17b0-402b-985a-a5270bc27a51');
    expect(h).toMatchObject({ sessions: 20, crashed: 1 });
    expect(h.crashFree).toBeCloseTo(0.95);
    expect(h.releases).toHaveLength(2);
    expect(updateHealth(releases, 'nope').sessions).toBe(0);
  });

  it('refuses promotion below the bar or without enough sessions, and allows it above', () => {
    const bar = { minSessions: 5, minCrashFree: 0.99 };
    expect(gate(updateHealth(releases, '84b0091f'), bar)).toMatchObject({ ok: false });
    expect(gate(updateHealth(releases, '84b0091f'), bar).reason).toMatch(/95\.0%/);
    expect(gate(updateHealth(releases, 'e55e24c2'), bar)).toMatchObject({ ok: false });
    expect(gate(updateHealth(releases, 'e55e24c2'), bar).reason).toMatch(/Only 4 preview session/);
    expect(gate(updateHealth(releases, 'e55e24c2'), { ...bar, minSessions: 3 })).toMatchObject({ ok: true });
  });

  it('alerts on production releases below the bar that have enough sessions', () => {
    expect(productionAlerts(releases, { minSessions: 50, minCrashFree: 0.99 }).map((r) => r.release)).toEqual([
      'com.revisionbuddy.app@1.0.1+14',
    ]);
    expect(productionAlerts(releases, { minSessions: 5000, minCrashFree: 0.99 })).toEqual([]);
  });

  it('writes the daily report with the alert first and mentions the owner', () => {
    const md = dailyReport({
      date: '2026-10-25',
      newIssues: [issue],
      regressed: [],
      top: [issue],
      feedback: [],
      production: releases.filter((r) => !r.release.includes('.u')),
      preview: releases.filter((r) => r.release.includes('.u')),
      alerts: productionAlerts(releases, { minSessions: 50, minCrashFree: 0.99 }),
      mention: '@achilles1801',
    });
    expect(md).toContain('## App health · 2026-10-25');
    expect(md).toContain('@achilles1801 ⚠️ **1 production release(s) below the crash-free bar.**');
    expect(md).toContain('| `1.0.1+14` | 1000 | 95.0% | 50 | 40 |');
    expect(md).toContain('### Regressed (0)');
  });
});
