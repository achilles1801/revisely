// CI's report scripts read GitHub's API through githubGet: a gateway error is
// tried again (twice), anything else fails at once. One 502 failed the "E2E flake
// report" of stack #510–#512 (Nov 10 2026).

const { githubGet } = require('../githubGet');

const answer = (status, body = { ok: true }) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('githubGet', () => {
  const realFetch = global.fetch;
  let statuses;
  let calls;
  const waits = [];
  const wait = async (ms) => {
    waits.push(ms);
  };

  beforeEach(() => {
    calls = 0;
    waits.length = 0;
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    global.fetch = jest.fn(async () => answer(statuses[calls++]));
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('tries a 502 again, and gets the answer', async () => {
    statuses = [502, 200];
    await expect(githubGet('/actions/runs/1/jobs', { wait })).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(waits).toEqual([2000]);
  });

  it('gives up after a third gateway error', async () => {
    statuses = [502, 503, 504];
    await expect(githubGet('/actions/runs', { wait })).rejects.toThrow('GitHub GET /actions/runs -> 504');
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 5000]);
  });

  it('fails at once on anything else', async () => {
    statuses = [404];
    await expect(githubGet('/actions/runs', { wait })).rejects.toThrow('-> 404');
    expect(calls).toBe(1);
    expect(waits).toEqual([]);
  });

  it('a raw request is tried again too, then handed back as it came', async () => {
    statuses = [502, 302];
    const res = await githubGet('/actions/artifacts/1/zip', { raw: true, wait });
    expect(res.status).toBe(302);
    expect(calls).toBe(2);
  });
});
