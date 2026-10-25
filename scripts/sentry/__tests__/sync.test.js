const { sync } = require('../sync');
const { marker } = require('../logic');

function fakes({ sentryIssues = {}, tracked = [], sessions = { groups: [] }, openHealth = [] } = {}) {
  const created = [];
  const comments = [];
  const reopened = [];
  let n = 100;
  return {
    created,
    comments,
    reopened,
    deps: {
      sentryApi: {
        issues: async (q) => sentryIssues[q.split(' ')[1]] || [],
        latestEvent: async () => ({ tags: [], entries: [] }),
        sessionsByRelease: async () => sessions,
      },
      githubApi: {
        ensureLabel: async () => undefined,
        issuesWithLabel: async (label) => (label === 'sentry' ? tracked : openHealth),
        createIssue: async (title, body, labels) => {
          const gh = { number: ++n, title, body, labels, state: 'open' };
          created.push(gh);
          return gh;
        },
        comment: async (num, body) => comments.push({ num, body }),
        reopen: async (num) => reopened.push(num),
      },
    },
  };
}
const issue = (id, substatus) => ({
  id,
  shortId: `RN-${id}`,
  title: `Error ${id}`,
  permalink: `https://revisely.sentry.io/issues/${id}/`,
  count: '3',
  userCount: 2,
  firstSeen: 'a',
  lastSeen: 'b',
  substatus,
});
const silence = () => jest.spyOn(console, 'log').mockImplementation(() => undefined);

describe('sync', () => {
  beforeEach(silence);

  it('opens one GitHub issue per new Sentry issue, labelled for Claude when auto-fix is on', async () => {
    const f = fakes({ sentryIssues: { 'is:new': [issue('1', 'new')], 'is:escalating': [issue('1', 'escalating')] } });
    const opened = await sync(f.deps, { autoFix: true, maxNew: 5 });
    expect(opened).toEqual([101]);
    expect(f.created[0].labels).toEqual(['sentry', 'claude-fix']);
    expect(f.created[0].body).toContain(marker('1'));
  });

  it('does not open a second issue for one already tracked, and reopens a closed one that regressed', async () => {
    const f = fakes({
      sentryIssues: { 'is:new': [issue('2', 'new')], 'is:regressed': [issue('3', 'regressed')] },
      tracked: [
        { number: 7, state: 'open', body: marker('2') },
        { number: 8, state: 'closed', body: marker('3') },
      ],
    });
    expect(await sync(f.deps, { autoFix: false })).toEqual([]);
    expect(f.created).toHaveLength(0);
    expect(f.reopened).toEqual([8]);
    expect(f.comments[0].num).toBe(8);
  });

  it('opens at most a few issues a run (a flood waits for the next run)', async () => {
    const many = Array.from({ length: 8 }, (_, i) => issue(String(i + 10), 'new'));
    const f = fakes({ sentryIssues: { 'is:new': many } });
    expect(await sync(f.deps, { maxNew: 3, autoFix: false })).toHaveLength(3);
  });

  it('raises a release-health issue once per production release below the bar', async () => {
    const sessions = {
      groups: [
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'healthy' }, totals: { 'sum(session)': 90 } },
        { by: { release: 'com.revisionbuddy.app@1.0.1+14', 'session.status': 'crashed' }, totals: { 'sum(session)': 10 } },
      ],
    };
    const f = fakes({ sessions });
    await sync(f.deps, { alertMinSessions: 50, alertMinCrashFree: 0.99, mention: '@achilles1801' });
    expect(f.created).toHaveLength(1);
    expect(f.created[0].labels).toEqual(['release-health']);
    expect(f.created[0].body).toContain('@achilles1801');
    expect(f.created[0].body).toContain('Nothing was rolled back');
    const again = fakes({ sessions, openHealth: [{ number: 9, body: f.created[0].body }] });
    await sync(again.deps, { alertMinSessions: 50, alertMinCrashFree: 0.99 });
    expect(again.created).toHaveLength(0);
  });
});
