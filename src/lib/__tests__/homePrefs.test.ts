import { homeMetricsSummary, parseHomePrefs } from '../homePrefs';

describe('homeMetricsSummary', () => {
  it('names what the progress card shows, in the card’s order', () => {
    expect(homeMetricsSummary(['pages', 'juz'])).toBe('Juz, Pages');
    expect(homeMetricsSummary(['surahs'])).toBe('Surahs');
    expect(homeMetricsSummary(['surahs', 'juz', 'pages'])).toBe('Juz, Pages, Surahs');
  });
});

describe('the progress style (tester-only for now)', () => {
  it('the ring by default, for new and older installs; a saved style kept; an unknown one back to the ring', () => {
    expect(parseHomePrefs(null).progressStyle).toBe('ring');
    expect(parseHomePrefs(JSON.stringify({ showProgressCard: true })).progressStyle).toBe('ring');
    expect(parseHomePrefs(JSON.stringify({ progressStyle: 'hairline' })).progressStyle).toBe('hairline');
    expect(parseHomePrefs(JSON.stringify({ progressStyle: 'dots' })).progressStyle).toBe('dots');
    expect(parseHomePrefs(JSON.stringify({ progressStyle: 'bar' })).progressStyle).toBe('ring');
  });
});
