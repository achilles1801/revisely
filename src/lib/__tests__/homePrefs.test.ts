import { homeMetricsSummary } from '../homePrefs';

describe('homeMetricsSummary', () => {
  it('names what the progress card shows, in the card’s order', () => {
    expect(homeMetricsSummary(['pages', 'juz'])).toBe('Juz, Pages');
    expect(homeMetricsSummary(['surahs'])).toBe('Surahs');
    expect(homeMetricsSummary(['surahs', 'juz', 'pages'])).toBe('Juz, Pages, Surahs');
  });
});
