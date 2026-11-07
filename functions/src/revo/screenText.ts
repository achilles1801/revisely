/**
 * The screen an answer sends the user to, read from its words (REVO-31). The model is asked to put
 * an openScreen action on every how-to answer that names a screen, but often leaves the action out
 * (Nov 7 eval: 7 of 16), once even writing "I've added a shortcut below". When a reply suggests
 * nothing, the card for the first screen its text names is added here, so the user can tap through.
 * Only the app's own names count (the guide's paths: “Edit schedule”, Settings → Appearance, …).
 */
import { REVO_SETTINGS_SECTIONS, RevoAction, RevoScreen, RevoSettingsSection } from './types';

const SECTION_NAMES: Record<RevoSettingsSection, string> = {
  activity: 'Activity',
  homeScreen: 'Home screen',
  prayer: 'Prayer',
  revision: 'Revision',
  revo: 'Revo AI',
  mushaf: 'Mushaf',
  notifications: 'Notifications',
  appearance: 'Appearance',
  testing: 'Testing',
};

/** The card's title for a screen found in the text (its button says what it opens). */
const TITLES: Record<Exclude<RevoScreen, 'settings'>, string> = {
  jumpTo: 'Jump to…',
  planEditor: 'Your schedule',
  memorized: 'Your memorized pages',
  activity: 'Activity',
  insights: 'Insights',
  dailyLog: 'Today’s daily log',
  prayerTimes: 'Prayer times',
  qibla: 'The Qibla',
  reader: 'The reader',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ARROW = '\\s*(?:→|->|>)\\s*';
// "Settings → Prayer"; "Settings → Day boundary" is the same section without prayer times.
const SETTINGS = new RegExp(`\\bSettings${ARROW}(${[...REVO_SETTINGS_SECTIONS.map((s) => escape(SECTION_NAMES[s])), 'Day boundary'].join('|')})\\b`);

/** Each screen's names in an answer, as the guide and the app write them. */
const FINDERS: { screen: Exclude<RevoScreen, 'settings'>; re: RegExp }[] = [
  { screen: 'planEditor', re: /\bEdit schedule\b|\bCreate new plan\b|\bDaily amount\b/ },
  { screen: 'jumpTo', re: /\bJump to\b/ },
  { screen: 'qibla', re: /\bQibla\b/ },
  { screen: 'prayerTimes', re: /\bprayer times\b|\bPrayer sheet\b/i },
  { screen: 'reader', re: /\bAudio Options\b|\bthe reader\b|\bplayer bar\b/i },
  { screen: 'memorized', re: /\bmemorized pages\b|\bMark memorized pages\b|\bof the Quran memorized\b/i },
  { screen: 'dailyLog', re: /\bdaily log\b/i },
  { screen: 'insights', re: /\bActivity\s*(?:→|->|>)\s*(?:“|")?Insights\b|\bInsights tab\b/ },
  { screen: 'activity', re: /\bActivity\s*(?:→|->|>)|\bpulse icon\b|\bopen Activity\b/i },
];

/** The openScreen card for the first screen the text names, or null when it names none. */
export function screenFromText(text: string): RevoAction | null {
  let best: { at: number; action: RevoAction } | null = null;
  const settings = SETTINGS.exec(text);
  if (settings) {
    const section = settings[1] === 'Day boundary' ? 'prayer' : REVO_SETTINGS_SECTIONS.find((s) => SECTION_NAMES[s] === settings[1])!;
    best = { at: settings.index, action: { kind: 'openScreen', title: `Settings → ${SECTION_NAMES[section]}`, detail: '', screen: 'settings', section } };
  }
  for (const f of FINDERS) {
    const m = f.re.exec(text);
    if (m && (!best || m.index < best.at)) best = { at: m.index, action: { kind: 'openScreen', title: TITLES[f.screen], detail: '', screen: f.screen } };
  }
  return best?.action ?? null;
}
