const { counted, summarize, render } = require('../wait-times');

const job = (id, created, started, ended, extra = {}) => ({
  id,
  runner_name: 'GitHub Actions 1',
  created_at: `2026-11-07T03:${created}:00Z`,
  started_at: `2026-11-07T03:${started}:00Z`,
  completed_at: `2026-11-07T03:${ended}:00Z`,
  conclusion: 'success',
  labels: ['ubuntu-latest'],
  ...extra,
});

describe('CI wait times', () => {
  it('counts only jobs that held a runner, and a start before the creation as no wait', () => {
    expect(counted(job(1, '00', '10', '15'), 'CI')).toMatchObject({ wait: 600000, run: 300000, os: 'Linux' });
    expect(counted(job(2, '00', '00', '01', { runner_name: '' }), 'CI')).toBeNull();
    expect(counted(job(3, '00', '01', '02', { conclusion: 'skipped' }), 'CI')).toBeNull();
    expect(counted(job(4, '10', '05', '07'), 'CI').wait).toBe(0);
    expect(counted(job(5, '00', '01', '30', { labels: ['macos-26'] }), 'E2E').os).toBe('macOS');
  });

  it('sums waiting and running per workflow and finds the peak running at once', () => {
    const jobs = [job(1, '00', '10', '20'), job(2, '00', '12', '18'), job(3, '00', '15', '25'), job(4, '00', '30', '31')].map((j) => counted(j, j.id === 4 ? 'Preview' : 'CI'));
    const s = summarize(jobs);
    expect(s.rows[0]).toMatchObject({ name: 'CI', jobs: 3, waitMin: 37, runMin: 26, over10: 2 });
    expect(s.peaks.Linux.count).toBe(3);
    expect(s.peaks.macOS.count).toBe(0);
    expect(render(s, Date.parse('2026-11-07T00:00:00Z'), Date.parse('2026-11-07T06:00:00Z'))).toContain('**Linux 3**');
  });
});
