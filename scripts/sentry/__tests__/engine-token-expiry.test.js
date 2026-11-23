const { run, TITLE } = require('../engine-token-expiry');

function fakeGitHub(openIssues = []) {
  const created = [];
  return {
    created,
    api: {
      issuesWithLabel: async () => openIssues,
      ensureLabel: async () => undefined,
      createIssue: async (title, body, labels) => {
        const issue = { number: 60 + created.length, title, body, labels };
        created.push(issue);
        return issue;
      },
    },
  };
}
const quiet = () => undefined;
const NOW = new Date('2027-10-01T12:00:00Z');

describe("the engine build token's expiry reminder", () => {
  it('says nothing with no date, a malformed one, or more than 30 days left', async () => {
    for (const RECITE_CORE_EXPIRES of [undefined, '', 'next year', '2027-11-15']) {
      const gh = fakeGitHub();
      expect(await run({ env: { RECITE_CORE_EXPIRES }, githubApi: gh.api, now: NOW, log: quiet })).toBe(0);
      expect(gh.created).toEqual([]);
    }
  });

  it('opens one issue from 30 days before, naming the date and how to rotate, and mentions the owner', async () => {
    const gh = fakeGitHub();
    await run({ env: { RECITE_CORE_EXPIRES: '2027-10-20', MENTION: '@owner' }, githubApi: gh.api, now: NOW, log: quiet });
    expect(gh.created).toHaveLength(1);
    expect(gh.created[0].title).toBe(TITLE);
    expect(gh.created[0].body).toContain('@owner');
    expect(gh.created[0].body).toContain('2027-10-20 (in 19 days)');
    expect(gh.created[0].body).toContain('handbook/dev-stack.md');
    expect(gh.created[0].labels).toEqual(['automation']);
  });

  it('does not open a second one while the first is open, and says "now" once it has expired', async () => {
    const open = fakeGitHub([{ number: 9, title: TITLE }]);
    await run({ env: { RECITE_CORE_EXPIRES: '2027-10-20' }, githubApi: open.api, now: NOW, log: quiet });
    expect(open.created).toEqual([]);
    const late = fakeGitHub();
    await run({ env: { RECITE_CORE_EXPIRES: '2027-09-01' }, githubApi: late.api, now: NOW, log: quiet });
    expect(late.created[0].body).toContain('2027-09-01 (now)');
  });
});
