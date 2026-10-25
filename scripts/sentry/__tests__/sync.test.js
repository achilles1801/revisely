const { sync } = require('../sync');
const { marker } = require('../logic');

function fakes({ sentryIssues = {}, tracked = [], sessions = { groups: [] }, openHealth = [], failSessions = false, failCreate = false } = {}) {
  const created = [];
  const comments = [];
  const reopened = [];
  const issues = [...tracked];
  let n = 100;
  return {
    created,
    comments,
    reopened,
    issues,
    deps: {
      sentryApi: {
        issues: async (q) => sentryIssues[q.split(' ')[1]] || [],
        latestEvent: async () => ({ tags: [], entries: [] }),
        sessionsByRelease: async () => {
          if (failSessions) throw new Error('Sentry sessions -> 500');
          return sessions;
        },
      },
      githubApi: {
        ensureLabel: async () => undefined,
        issuesWithLabel: async (label) => (label === 'sentry' ? issues.map((i) => ({ ...i })) : openHealth),
        createIssue: async (title, body, labels) => {
          if (failCreate) throw new Error('GitHub POST /issues -> 502');
          const gh = { number: ++n, title, body, labels, state: 'open' };
          created.push(gh);
          if (labels.includes('sentry')) issues.push(gh);
          return gh;
        },
        comment: async (num, body) => comments.push({ num, body }),
        reopen: async (num) => reopened.push(num),
      },
    },
  };
}
const issue = (id, substatus, lastSeen = '2026-10-25T10:00:00Z') => ({
  id,
  shortId: `RN-${id}`,
  title: `Error ${id}`,
  permalink: `https://revisely.sentry.io/issues/${id}/`,
  count: '3',
  userCount: 2,
  firstSeen: '2026-10-20T10:00:00Z',
  lastSeen,
  substatus,
});
const quiet = () => undefined;

describe('sync', () => {
  it('opens one GitHub issue per new Sentry issue, labelled `sentry` only (Claude starts only when the owner labels it)', async () => {
    const f = fakes({ sentryIssues: { 'is:new': [issue('1', 'new')], 'is:escalating': [issue('1', 'escalating')] } });
    const { opened } = await sync(f.deps, { maxNew: 5 }, quiet);
    expect(opened).toEqual([101]);
    expect(f.created[0].labels).toEqual(['sentry']);
    expect(f.created[0].body).toContain(marker('1'));
  });

  it('does not open a second issue for one already tracked', async () => {
    const f = fakes({
      sentryIssues: { 'is:new': [issue('2', 'new')] },
      tracked: [{ number: 7, state: 'open', body: marker('2') }],
    });
    expect((await sync(f.deps, {}, quiet)).opened).toEqual([]);
    expect(f.created).toHaveLength(0);
  });

  it('reopens a closed issue only when Sentry saw it again after it was closed', async () => {
    const f = fakes({
      sentryIssues: { 'is:regressed': [issue('3', 'regressed', '2026-10-25T10:00:00Z'), issue('4', 'regressed', '2026-10-25T10:00:00Z')] },
      tracked: [
        { number: 8, state: 'closed', closed_at: '2026-10-24T09:00:00Z', body: marker('3') },
        // Closed after the last event (e.g. "Fixes #9" reached main): stays closed.
        { number: 9, state: 'closed', closed_at: '2026-10-25T11:00:00Z', body: marker('4') },
      ],
    });
    await sync(f.deps, {}, quiet);
    expect(f.reopened).toEqual([8]);
    expect(f.comments).toHaveLength(1);
    expect(f.comments[0].num).toBe(8);
    expect(f.created).toHaveLength(0);
  });

  it('opens at most a few issues a run, and none while many are open (a flood waits)', async () => {
    const many = Array.from({ length: 8 }, (_, i) => issue(String(i + 10), 'new'));
    const f = fakes({ sentryIssues: { 'is:new': many } });
    expect((await sync(f.deps, { maxNew: 3 }, quiet)).opened).toHaveLength(3);

    const openOnes = Array.from({ length: 4 }, (_, i) => ({ number: i + 1, state: 'open', body: marker(String(900 + i)) }));
    const g = fakes({ sentryIssues: { 'is:new': many }, tracked: openOnes });
    expect((await sync(g.deps, { maxNew: 5, maxOpen: 5 }, quiet)).opened).toHaveLength(1);
  });

  it('skips Sentry issues whose id is not a number', async () => {
    const f = fakes({ sentryIssues: { 'is:new': [issue('1 OR 1', 'new')] } });
    expect((await sync(f.deps, {}, quiet)).opened).toEqual([]);
  });

  it('after a failure halfway, reports it and the next run neither loses nor duplicates issues', async () => {
    const f = fakes({ sentryIssues: { 'is:new': [issue('5', 'new')] }, failSessions: true });
    await expect(sync(f.deps, {}, quiet)).rejects.toThrow(/Release health: Sentry sessions -> 500/);
    expect(f.created).toHaveLength(1);
    // The next run finds the issue by its marker.
    const again = await sync({ ...f.deps, sentryApi: { ...f.deps.sentryApi, sessionsByRelease: async () => ({ groups: [] }) } }, {}, quiet);
    expect(again.opened).toEqual([]);
    expect(f.created).toHaveLength(1);
  });

  it('still checks release health when opening issues fails', async () => {
    const sessions = {
      groups: [
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'healthy' }, totals: { 'sum(session)': 90 } },
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'crashed' }, totals: { 'sum(session)': 10 } },
      ],
    };
    const f = fakes({ sentryIssues: { 'is:new': [issue('6', 'new')] }, sessions, failCreate: true });
    await expect(sync(f.deps, { alertMinSessions: 50 }, quiet)).rejects.toThrow(/Sentry issue 6: GitHub POST/);
  });

  it('raises a release-health issue once per production release below the bar', async () => {
    const sessions = {
      groups: [
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'healthy' }, totals: { 'sum(session)': 90 } },
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'crashed' }, totals: { 'sum(session)': 10 } },
        // A forged release name with markup is never raised.
        { by: { release: '[x](https://phish.example)', 'session.status': 'crashed' }, totals: { 'sum(session)': 100 } },
      ],
    };
    const f = fakes({ sessions });
    await sync(f.deps, { alertMinSessions: 50, alertMinCrashFree: 0.99, mention: '@achilles1801' }, quiet);
    expect(f.created).toHaveLength(1);
    expect(f.created[0].labels).toEqual(['release-health']);
    expect(f.created[0].title).toBe('[Release health] 1.0.1+14 at 90.0% crash-free');
    expect(f.created[0].body).toContain('@achilles1801');
    expect(f.created[0].body).toContain('Nothing was rolled back');
    const again = fakes({ sessions, openHealth: [{ number: 9, body: f.created[0].body }] });
    await sync(again.deps, { alertMinSessions: 50, alertMinCrashFree: 0.99 }, quiet);
    expect(again.created).toHaveLength(0);
  });
});
