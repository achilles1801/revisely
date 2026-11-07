const zlib = require('zlib');
const { aggregate, render, unzip } = require('../flakes');

const ok = (secs = 100) => ({ attempt: 0, passed: true, secs });
const miss = (reason) => ({ attempt: 0, passed: false, secs: 50, reason });
const retryOk = { attempt: 1, passed: true, secs: 100 };
const retryMiss = { attempt: 1, passed: false, secs: 60, reason: 'again' };

let runId = 0;
function job(platform, flows, at = '2026-11-06T05:00:00Z', branch = 'develop') {
  runId++;
  return {
    version: 1,
    platform,
    run: { id: runId, attempt: 1, branch, url: `https://github.com/o/r/actions/runs/${runId}` },
    at,
    flows: Object.entries(flows).map(([flow, attempts]) => ({ flow, attempts })),
  };
}

describe('the flake report', () => {
  it('counts first-attempt passes, passes on a retry and runs that never passed, worst first', () => {
    const recs = [];
    for (let i = 0; i < 9; i++) recs.push(job('ios', { '02-revision-session': [ok()], '05-daily-log': [ok()] }));
    recs.push(job('ios', { '02-revision-session': [miss('Element not found: Continue'), retryOk], '05-daily-log': [miss('x'), retryMiss] }));
    recs.push(job('android', { '02-revision-session': [ok()] }));
    const rows = aggregate(recs);
    expect(rows.map((r) => [r.flow, r.platform, r.runs, r.first, r.retry, r.failed])).toEqual([
      ['02-revision-session', 'ios', 10, 9, 1, 0],
      ['05-daily-log', 'ios', 10, 9, 0, 1],
      ['02-revision-session', 'android', 1, 1, 0, 0],
    ]);
    expect(rows[0].rate).toBeCloseTo(0.9);
    // A run where both attempts failed is not in the rate.
    expect(rows[1].rate).toBe(1);
  });

  it('counts and lists the passes that needed a stand-in (a second swipe, a relaunch)', () => {
    const helped = { ...ok(), standIns: ['WARNING swipe-page: the page did not turn 10 s after the swipe; swiping again'] };
    const recs = [job('android', { '06-offline': [helped] }), job('android', { '06-offline': [ok()] })];
    const rows = aggregate(recs);
    expect(rows[0]).toMatchObject({ flow: '06-offline', runs: 2, first: 2, standIn: 1 });
    // The rate counts first attempts; the stand-in is shown beside it.
    expect(rows[0].rate).toBe(1);
    const text = render({ rows, since: new Date('2026-11-01'), until: new Date('2026-11-08'), jobs: 2 });
    expect(text).toContain('| 06-offline | Android | 2 | 2 | 0 | 0 | 1 | 100% |');
    expect(text).toContain('### Passes that needed a stand-in');
    expect(text).toContain('`WARNING swipe-page: the page did not turn 10 s after the swipe; swiping again`');
  });

  it('counts a job once, however often its artifact is read', () => {
    const one = job('android', { '06-offline': [miss('x'), retryOk] });
    expect(aggregate([one, one])[0].runs).toBe(1);
  });

  it('mentions the owner only for a flow under 95% with enough runs', () => {
    const since = new Date('2026-10-31T00:00:00Z');
    const until = new Date('2026-11-07T00:00:00Z');
    const flaky = [];
    for (let i = 0; i < 6; i++) flaky.push(job('ios', { '02-revision-session': [ok()] }));
    flaky.push(job('ios', { '02-revision-session': [miss('Element not found: `x`\nmore'), retryOk] }, '2026-11-05T10:20:00Z', 'feature/x'));
    const body = render({ rows: aggregate(flaky), since, until, jobs: 7, mention: '@owner' });
    expect(body).toContain('@owner one flow passed on the first attempt less than 95% of the time: 02-revision-session (iOS).');
    expect(body).toContain('| 02-revision-session | iOS | 7 | 6 | 1 | 0 | 0 | **85.7%** |');
    expect(body).toContain('Nov 5, 10:20 UTC');
    expect(body).toContain('`Element not found: x more`');

    // Too few runs to tell: listed, not mentioned.
    const few = [job('android', { '04-fajr-boundary': [miss('y'), retryOk] }), job('android', { '04-fajr-boundary': [ok()] })];
    const quiet = render({ rows: aggregate(few), since, until, jobs: 2, mention: '@owner' });
    expect(quiet).not.toContain('@owner');
    expect(quiet).toContain('| 04-fajr-boundary | Android | 2 | 1 | 1 | 0 | 0 | 50% |');

    const steady = [];
    for (let i = 0; i < 20; i++) steady.push(job('android', { '05-daily-log': [ok()] }));
    steady.push(job('android', { '05-daily-log': [miss('z'), retryOk] }));
    expect(render({ rows: aggregate(steady), since, until, jobs: 21, mention: '@owner' })).not.toContain('@owner');
  });

  it('says so when no job recorded its attempts', () => {
    const body = render({ rows: [], since: new Date('2026-10-31'), until: new Date('2026-11-07'), jobs: 0, mention: '@owner' });
    expect(body).toContain('No E2E jobs recorded their attempts in these 7 days.');
  });

  it('reads the file in an artifact zip', () => {
    const name = Buffer.from('attempts.json');
    const content = Buffer.from(JSON.stringify({ version: 1 }));
    const data = zlib.deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const cdStart = local.length + name.length + data.length;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(central.length + name.length, 12);
    eocd.writeUInt32LE(cdStart, 16);
    const zip = Buffer.concat([local, name, data, central, name, eocd]);
    expect(JSON.parse(unzip(zip)['attempts.json'].toString())).toEqual({ version: 1 });
  });
});
