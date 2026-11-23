// Settings' pages (SET-1): which page a Settings section opens, and the first level's Reminders value.
import { pageOfSection, remindersSummary } from '../settingsPages';
import { REVO_SETTINGS_SECTIONS } from '../revo/types';

describe("Settings' pages", () => {
  it('[SET-1] every section Revo can name opens a page that holds its rows', () => {
    const pages = Object.fromEntries(REVO_SETTINGS_SECTIONS.map((s) => [s, pageOfSection(s, true)]));
    expect(pages).toEqual({
      activity: 'storage',
      homeScreen: 'reminders',
      prayer: 'prayer',
      revision: 'revision',
      revo: 'revo',
      mushaf: 'mushaf',
      notifications: 'reminders',
      appearance: 'appearance',
      testing: 'testing',
    });
    // Without prayer times there is no Prayer page: Start day at fajr is in Revision.
    expect(pageOfSection('prayer', false)).toBe('revision');
  });

  it("Reminders' value: the revision reminders and how many prayers notify", () => {
    expect(remindersSummary(true, 3)).toBe('On · 3 prayers');
    expect(remindersSummary(true, 1)).toBe('On · 1 prayer');
    expect(remindersSummary(true, 0)).toBe('On');
    expect(remindersSummary(false, 2)).toBe('2 prayers');
    expect(remindersSummary(false, 0)).toBe('Off');
  });
});
