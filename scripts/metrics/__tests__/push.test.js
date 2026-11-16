/**
 * @jest-environment node
 */
// push.js: the alarm comment it posts, and what the dev project is sent (no production numbers).
const { alertBody, devTotals } = require('../push');

describe('the Metrics alerts comment', () => {
  const alarms = [{ id: 'open-door-overdue', title: 'Open Door replies', value: '2 past the 7-day promise (oldest 9 days)' }];

  it('names production alarms as they are, and labels the dev project\'s', () => {
    expect(alertBody(alarms, '@owner')).toContain('- **Open Door replies**: 2 past the 7-day promise (oldest 9 days)');
    expect(alertBody(alarms, '@owner', 'Dev')).toContain('- **Dev: Open Door replies**: 2 past');
  });

  it('carries no mentions or markup from the values', () => {
    const body = alertBody([{ title: 'x @someone `code`', value: '<b>y</b>\nz' }], '@owner');
    expect(body).toContain('- **x someone code**: by/bz');
    expect(body.match(/@/g)).toHaveLength(1);
  });
});

describe('what the dev project is sent', () => {
  it('keeps the hour and drops Sentry and the App Store', () => {
    expect(devTotals({ generatedAt: '2026-11-15T20:17:00Z', sentry: { sessions: 5 }, appStore: { days: [] }, errors: {} })).toEqual({
      generatedAt: '2026-11-15T20:17:00Z',
      sentry: null,
      appStore: null,
      errors: { sentry: 'production only', appStore: 'production only' },
    });
  });
});
