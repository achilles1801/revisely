import { homeMetricsSummary, parseHomePrefs } from '../homePrefs';

describe('homeMetricsSummary', () => {
  it('names what the progress card shows, in the card’s order', () => {
    expect(homeMetricsSummary(['pages', 'juz'])).toBe('Juz, Pages');
    expect(homeMetricsSummary(['surahs'])).toBe('Surahs');
    expect(homeMetricsSummary(['surahs', 'juz', 'pages'])).toBe('Juz, Pages, Surahs');
  });
});

describe('the progress style (removed: the juz dots are the only one)', () => {
  it('a style saved while testers compared them is ignored', () => {
    for (const progressStyle of ['ring', 'hairline', 'dots', 'bar']) {
      const prefs = parseHomePrefs(JSON.stringify({ showProgressCard: true, progressStyle }));
      expect(prefs).not.toHaveProperty('progressStyle');
      expect(prefs.showProgressCard).toBe(true);
    }
  });
});
