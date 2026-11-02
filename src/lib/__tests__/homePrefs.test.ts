import { hasRetiredKeys, parseHomePrefs } from '../homePrefs';

describe('retired Home settings (the progress card, what it showed, its style)', () => {
  it('saved ones are ignored, and noticed so storage is written back without them', () => {
    const raw = JSON.stringify({ showProgressCard: false, metrics: ['surahs'], progressStyle: 'ring', fridayKahfReminder: false });
    const prefs = parseHomePrefs(raw);
    expect(prefs).toEqual({ fridayKahfReminder: false, kahfDismissedDay: null });
    for (const key of ['showProgressCard', 'metrics', 'progressStyle']) expect(prefs).not.toHaveProperty(key);
    expect(hasRetiredKeys(raw)).toBe(true);
    expect(hasRetiredKeys(JSON.stringify(prefs))).toBe(false);
    expect(hasRetiredKeys(null)).toBe(false);
    expect(hasRetiredKeys('{not json')).toBe(false);
  });
});
