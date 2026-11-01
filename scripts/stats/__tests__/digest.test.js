const zlib = require('zlib');
const D = require('../digest');
const { salesSummary } = require('../appStore');
const { appStore } = require('../weekly');

const HEADER = [
  'Provider', 'Provider Country', 'SKU', 'Developer', 'Title', 'Version', 'Product Type Identifier', 'Units',
  'Developer Proceeds', 'Begin Date', 'End Date', 'Customer Currency', 'Country Code', 'Currency of Proceeds',
  'Apple Identifier', 'Customer Price',
].join('\t');
const row = (type, units, country, appleId = '6767990248') =>
  ['APPLE', 'US', 'revisely', 'Majd', 'Revisely', '1.0.2', type, units, '0', '10/27/2026', '10/27/2026', 'USD', country, 'USD', appleId, '0'].join('\t');
const report = (...rows) => [HEADER, ...rows].join('\n');

describe('reading Sales and Trends', () => {
  it('sorts product types: first downloads, re-downloads, updates; ignores the rest', () => {
    expect(D.kindOf('1F')).toBe('first');
    expect(D.kindOf('1')).toBe('first');
    expect(D.kindOf('3F')).toBe('redownload');
    expect(D.kindOf('7')).toBe('update');
    expect(D.kindOf('IA1')).toBeNull();
    expect(D.kindOf('')).toBeNull();
  });

  it('tallies a report by kind, and first downloads by country, for this app only', () => {
    const rows = D.parseSummary(report(row('1F', 5, 'US'), row('1F', 2, 'GB'), row('3F', 1, 'US'), row('7F', 12, 'US'), row('1F', 9, 'US', '999')));
    expect(D.tally(rows, '6767990248')).toEqual({ first: 7, redownload: 1, update: 12, countries: { US: 5, GB: 2 } });
  });

  it('an empty or header-only report is nothing', () => {
    expect(D.parseSummary('')).toEqual([]);
    expect(D.parseSummary(HEADER)).toEqual([]);
  });
});

describe('the weeks', () => {
  it('on a Monday: the Monday to Sunday before, and the week before that', () => {
    const w = D.weeks(new Date('2026-11-09T15:00:00Z'));
    expect(w.week).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(w.previous[0]).toBe('2026-10-26');
    expect(w.previous[6]).toBe('2026-11-01');
  });

  it('run by hand mid-week: still the last full week', () => {
    expect(D.weeks(new Date('2026-11-12T10:00:00Z')).week[0]).toBe('2026-11-02');
  });

  it('months since launch and the days of a month', () => {
    expect(D.monthsSince('2026-10-01', new Date('2027-01-05T00:00:00Z'))).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(D.daysOfMonth('2026-11', '2026-10-01', '2026-11-04')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('week over week', () => {
    expect(D.change(12, 10)).toBe('+20%');
    expect(D.change(8, 10)).toBe('-20%');
    expect(D.change(5, 0)).toBe('new');
    expect(D.change(0, 0)).toBe('·');
  });
});

describe('the digest', () => {
  const store = {
    week: { first: 42, redownload: 3, update: 120, countries: { US: 20, GB: 8, SA: 8, DE: 2, CA: 1, FR: 1 } },
    previous: { first: 30, redownload: 3, update: 90, countries: {} },
    total: { first: 312, redownload: 25, update: 900, countries: {} },
    missing: ['2026-11-08'],
  };
  const days = D.weeks(new Date('2026-11-09T15:00:00Z')).week;

  it('says the week, the change, the top five countries, totals and what is missing', () => {
    const md = D.renderDigest({ weekDays: days, launch: '2026-10-01', appStore: store, play: null, mention: '@owner' });
    expect(md).toContain('### Week of 2 Nov – 8 Nov');
    expect(md).toContain('| First-time downloads | 42 | 30 | +40% |');
    expect(md).toContain('| Re-downloads | 3 | 3 | ±0% |');
    expect(md).toContain('| Updates | 120 | 90 | +33% |');
    expect(md).toMatch(/Top countries \(first downloads\): United States 20 · (Saudi Arabia 8 · United Kingdom 8|United Kingdom 8 · Saudi Arabia 8) · Germany 2 · Canada 1$/m);
    expect(md).toContain('Since launch (1 Oct): 312 first-time downloads · 25 re-downloads · 900 updates');
    expect(md).toContain("Not yet in Apple's reports: 8 Nov");
    expect(md).toContain('**Google Play**');
    expect(md).toContain('_Not live yet._');
    expect(md).toContain('@owner');
  });

  it('without App Store data: says so, still posts', () => {
    const md = D.renderDigest({ weekDays: days, launch: '2026-10-01', appStore: null, play: null, mention: '' });
    expect(md).toContain("couldn't be read this week");
  });
});

describe('salesSummary', () => {
  const env = { ASC_VENDOR_NUMBER: '12345678' };
  const fake = (status, body, json) => async (url, opts) => {
    fake.last = { url, opts };
    return {
      ok: status === 200,
      status,
      arrayBuffer: async () => body,
      json: async () => json,
    };
  };

  it('asks for a gzipped daily summary with the vendor number, and parses it', async () => {
    const gz = zlib.gzipSync(report(row('1F', 4, 'US')));
    const f = fake(200, gz);
    const r = await salesSummary('2026-11-02', { env, fetchImpl: f, auth: 'x' });
    expect(r.rows).toHaveLength(1);
    expect(fake.last.url).toContain('filter%5Bfrequency%5D=DAILY');
    expect(fake.last.url).toContain('filter%5BvendorNumber%5D=12345678');
    expect(fake.last.url).toContain('filter%5BreportDate%5D=2026-11-02');
    expect(fake.last.opts.headers.Authorization).toBe('Bearer x');
  });

  it("a day with no sales is empty; a report that isn't out yet is missing", async () => {
    expect(await salesSummary('2026-11-02', { env, auth: 'x', fetchImpl: fake(404, null, { errors: [{ detail: 'There were no sales for the date specified.' }] }) })).toEqual({ rows: [] });
    expect(await salesSummary('2026-11-08', { env, auth: 'x', fetchImpl: fake(404, null, { errors: [{ detail: 'Report is not available yet. Daily reports …' }] }) })).toEqual({ missing: true });
  });

  it('a refused key or a bad vendor number throws (the run fails, GitHub emails)', async () => {
    await expect(salesSummary('2026-11-02', { env, auth: 'x', fetchImpl: fake(403, null, { errors: [{ detail: 'The API key in use does not allow this request' }] }) })).rejects.toThrow(/403/);
    await expect(salesSummary('2026-11-02', { env: {}, auth: 'x', fetchImpl: fake(200, Buffer.from('')) })).rejects.toThrow(/ASC_VENDOR_NUMBER/);
  });
});

describe('appStore (the whole collection)', () => {
  it('the week, the week before, totals since launch (monthly reports, else days), each day fetched once', async () => {
    const calls = [];
    const get = async (date, frequency) => {
      calls.push(`${frequency} ${date}`);
      if (frequency === 'MONTHLY') return date === '2026-10' ? { rows: D.parseSummary(report(row('1F', 100, 'US'), row('7F', 50, 'US'))) } : { missing: true };
      if (date === '2026-11-08') return { missing: true };
      return { rows: D.parseSummary(report(row('1F', 1, date.endsWith('02') ? 'GB' : 'US'), row('7F', 2, 'US'))) };
    };
    const r = await appStore(new Date('2026-11-09T15:00:00Z'), {}, get);
    expect(r.appStore.week).toEqual({ first: 6, redownload: 0, update: 12, countries: { GB: 1, US: 5 } });
    expect(r.appStore.missing).toEqual(['2026-11-08']);
    // October from its monthly report; November so far from days (1–8, 8 missing).
    expect(r.appStore.total.first).toBe(100 + 7);
    expect(r.appStore.total.update).toBe(50 + 14);
    const daily = calls.filter((c) => c.startsWith('DAILY'));
    expect(new Set(daily).size).toBe(daily.length);
  });
});
