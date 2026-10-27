// The health workflows read Sentry only from the environments of installed builds.

describe('sentryApi: production and preview only', () => {
  const realFetch = global.fetch;
  let urls;

  beforeEach(() => {
    jest.resetModules();
    process.env.SENTRY_API_TOKEN = 'test-token';
    delete process.env.SENTRY_ENVIRONMENTS;
    urls = [];
    global.fetch = jest.fn(async (url) => {
      urls.push(new URL(String(url)));
      return { ok: true, status: 200, json: async () => [] };
    });
  });

  afterAll(() => {
    global.fetch = realFetch;
    delete process.env.SENTRY_API_TOKEN;
  });

  it('asks for issues from production and preview, in the app project', async () => {
    const { sentryApi } = require('../api');
    await sentryApi.issues('is:unresolved is:new', '24h', 25);
    const url = urls[0];
    expect(url.pathname).toBe('/api/0/organizations/revisely/issues/');
    expect(url.searchParams.getAll('environment')).toEqual(['production', 'preview']);
    expect(url.searchParams.get('project')).toBe('4511369481945088');
    expect(url.searchParams.get('query')).toBe('is:unresolved is:new');
  });

  it("takes an issue's latest event from those environments too", async () => {
    const { sentryApi } = require('../api');
    await sentryApi.latestEvent('7813103106');
    expect(urls[0].pathname).toBe('/api/0/organizations/revisely/issues/7813103106/events/latest/');
    expect(urls[0].searchParams.getAll('environment')).toEqual(['production', 'preview']);
  });

  it('SENTRY_ENVIRONMENTS narrows it (e.g. production alone)', async () => {
    process.env.SENTRY_ENVIRONMENTS = 'production';
    const { sentryApi } = require('../api');
    await sentryApi.issues('is:unresolved');
    expect(urls[0].searchParams.getAll('environment')).toEqual(['production']);
  });
});
