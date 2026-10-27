const { daysToExpiry, keyStatus, run, TITLE_EXPIRING, TITLE_REJECTED } = require('../claude-key');

const respond = (status) => async () => ({ ok: status >= 200 && status < 300, status });

function fakeGitHub(openIssues = []) {
  const calls = { created: [], comments: [] };
  let n = 50;
  return {
    calls,
    api: {
      issuesWithLabel: async () => openIssues,
      ensureLabel: async () => undefined,
      createIssue: async (title, body, labels) => {
        const issue = { number: ++n, title, body, labels };
        calls.created.push(issue);
        return issue;
      },
      comment: async (number, body) => calls.comments.push({ number, body }),
    },
  };
}

const quiet = () => undefined;

describe('the Claude key check', () => {
  it('tells a rejected key from a good one, a missing one and an outage', async () => {
    expect(await keyStatus('sk-test', respond(200))).toBe('ok');
    expect(await keyStatus('sk-test', respond(401))).toBe('rejected');
    expect(await keyStatus('sk-test', respond(403))).toBe('rejected');
    expect(await keyStatus('sk-test', respond(529))).toBe('unknown (529)');
    expect(await keyStatus('', respond(200))).toBe('missing');
    expect(
      await keyStatus('sk-test', async () => {
        throw new TypeError('fetch failed');
      }),
    ).toBe('unknown (TypeError)');
  });

  it('rejected before a fix: opens the tracking issue, says so on the issue, fails', async () => {
    const gh = fakeGitHub();
    const code = await run({
      env: { ANTHROPIC_API_KEY: 'sk-test', MENTION: '@owner' },
      argv: ['node', 'claude-key.js', '--issue', '12'],
      fetchImpl: respond(401),
      githubApi: gh.api,
      log: quiet,
    });
    expect(code).toBe(1);
    expect(gh.calls.created).toHaveLength(1);
    expect(gh.calls.created[0].title).toBe(TITLE_REJECTED);
    expect(gh.calls.created[0].body).toContain('@owner');
    expect(gh.calls.created[0].body).not.toContain('sk-test');
    expect(gh.calls.comments).toEqual([{ number: 12, body: expect.stringContaining('#51') }]);
  });

  it('rejected again: comments on the open tracking issue instead of opening another', async () => {
    const gh = fakeGitHub([{ number: 7, title: TITLE_REJECTED }]);
    const code = await run({ env: { ANTHROPIC_API_KEY: 'sk-test' }, argv: ['node'], fetchImpl: respond(401), githubApi: gh.api, log: quiet });
    expect(code).toBe(1);
    expect(gh.calls.created).toHaveLength(0);
    expect(gh.calls.comments[0].number).toBe(7);
  });

  it('an outage is not the key: no issue, no failure', async () => {
    const gh = fakeGitHub();
    expect(await run({ env: { ANTHROPIC_API_KEY: 'sk-test' }, argv: ['node'], fetchImpl: respond(500), githubApi: gh.api, log: quiet })).toBe(0);
    expect(gh.calls.created).toHaveLength(0);
  });

  it('reminds once, 30 days before it expires', async () => {
    expect(daysToExpiry('2027-01-01', new Date('2026-12-02T13:00:00Z'))).toBe(30);
    expect(daysToExpiry('not a date')).toBeNull();
    const env = { ANTHROPIC_API_KEY: 'sk-test', CLAUDE_KEY_EXPIRES: '2027-01-01' };
    const early = fakeGitHub();
    await run({ env, argv: ['node'], fetchImpl: respond(200), githubApi: early.api, now: new Date('2026-10-27T13:00:00Z'), log: quiet });
    expect(early.calls.created).toHaveLength(0);
    const close = fakeGitHub();
    await run({ env, argv: ['node'], fetchImpl: respond(200), githubApi: close.api, now: new Date('2026-12-10T13:00:00Z'), log: quiet });
    expect(close.calls.created[0].title).toBe(TITLE_EXPIRING);
    expect(close.calls.created[0].body).toContain('in 22 days');
    const already = fakeGitHub([{ number: 9, title: TITLE_EXPIRING }]);
    await run({ env, argv: ['node'], fetchImpl: respond(200), githubApi: already.api, now: new Date('2026-12-11T13:00:00Z'), log: quiet });
    expect(already.calls.created).toHaveLength(0);
    expect(already.calls.comments).toHaveLength(0);
  });
});
