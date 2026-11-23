// Settings' pages (SET-1; Majd, Nov 22 2026, the Settings audit's option B: "i feel like option B is way better and
// cleaner let's do that"). Settings opens on a short first level: your account, then a row per group with what it's set
// to, each opening its own page. The same screen (SettingsScreen) draws the first level or one page, pushed again with
// `page`, so the back gesture goes from a page to the first level.

import type { RevoSettingsSection } from './revo/types';
import { t } from '../i18n';

export const SETTINGS_PAGES = [
  'account',
  'revision',
  'reminders',
  'prayer',
  'mushaf',
  'revo',
  'storage',
  'appearance',
  'help',
  'about',
  'testing',
] as const;
export type SettingsPage = (typeof SETTINGS_PAGES)[number];

/**
 * The page a Settings section opens (Revo's openScreen and Insights' "Turn on Smart Tracking"). Revo's section ids stay
 * as they were, on the phone and on the server, so an older app or server still understands them; each now opens the
 * page that holds its rows. Without prayer times there is no Prayer page: "Start day at fajr" is in Revision.
 */
export function pageOfSection(section: RevoSettingsSection, prayerShown: boolean): SettingsPage {
  switch (section) {
    case 'activity':
      return 'storage';
    case 'homeScreen':
    case 'notifications':
      return 'reminders';
    case 'prayer':
      return prayerShown ? 'prayer' : 'revision';
    case 'revision':
      return 'revision';
    case 'revo':
      return 'revo';
    case 'mushaf':
      return 'mushaf';
    case 'appearance':
      return 'appearance';
    case 'testing':
      return 'testing';
  }
}

/** The first level's Reminders value: "On · 3 prayers", "On", "3 prayers" (reminders off) or "Off". */
export function remindersSummary(remindersOn: boolean, prayers: number): string {
  if (remindersOn && prayers > 0) return t('settings.root.onAndPrayers', { count: prayers });
  if (remindersOn) return t('settings.on');
  if (prayers > 0) return t('settings.root.prayers', { count: prayers });
  return t('settings.off');
}
