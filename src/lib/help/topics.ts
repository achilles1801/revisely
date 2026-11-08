// The in-app help: a ? on the screens that need explaining opens a sheet of a few short topics
// (components/help/HelpSheet). All of the help text lives here, in one place.
//
// Each topic names the BEHAVIOUR.md rules it explains (`covers`). The help's drift check
// (__tests__/topics.test.ts) keeps a hash of each covered rule's text in reviewed.json and fails when
// a rule changes and the topic hasn't been reviewed since: read the topic against the rule, fix the
// words if they no longer hold, then record the review with
//   UPDATE_HELP_REVIEWED=1 npx jest src/lib/help
// It also fails when a {{label}} is no longer text the app shows.
//
// The words: at most four topics a screen, each two short sentences or so. Surahs and juz, never
// page numbers (NAME-1). With Smart Tracking off, nothing about ratings or strength (`when`).
// {{Label}} is text the app shows, word for word (drawn in ink); [[icon]] is a button's own glyph.

import type { Ionicons } from '@expo/vector-icons';

export type HelpIcon = keyof typeof Ionicons.glyphMap;

/** The screens with help. */
export type HelpScreen = 'home';

/** When a topic shows: only with Smart Tracking on, or only with it off. */
export type HelpWhen = 'smartTracking' | 'noSmartTracking';

export interface HelpTopic {
  id: string;
  icon: HelpIcon;
  title: string;
  text: string;
  /** The BEHAVIOUR.md rules it explains. */
  covers: readonly string[];
  when?: HelpWhen;
}

export interface HelpEntry {
  /** The sheet's title. */
  title: string;
  topics: readonly HelpTopic[];
}

/** The glyphs [[name]] may name in a topic's text. */
export const HELP_INLINE_ICONS: Readonly<Record<string, HelpIcon>> = {
  check: 'checkmark',
  more: 'ellipsis-horizontal',
  eye: 'eye-off-outline',
  play: 'play',
  options: 'options-outline',
  mic: 'mic-outline',
  timer: 'stopwatch-outline',
  plus: 'add',
};

export const HELP: Readonly<Record<HelpScreen, HelpEntry>> = {
  home: {
    title: 'How Home works',
    topics: [
      {
        id: 'home.today',
        icon: 'calendar-outline',
        title: 'Today',
        text:
          'Each day brings a set amount of your memorized pages, going round in a cycle. ' +
          'Tap where today starts for {{Jump to…}} or {{Edit schedule}}.',
        covers: ['SCHED-1', 'SCHED-2', 'SCHED-3', 'JUMP-1'],
      },
      {
        id: 'home.missed',
        icon: 'return-down-back-outline',
        title: 'Missed days',
        text: "They don't pile up. Their pages are offered here for three days; {{Add to today}} puts them first.",
        covers: ['SCHED-5', 'CARRY-1', 'CARRY-4'],
      },
      {
        id: 'home.streak',
        icon: 'flame-outline',
        title: 'Streak',
        text:
          'Days in a row with all their pages revised. Missed yesterday? Revise its pages before today ends ' +
          'and the streak comes back.',
        covers: ['SESS-2', 'SESS-6'],
      },
      {
        id: 'home.memorized',
        icon: 'leaf-outline',
        title: 'Memorized',
        text: "Each dot is a juz, filling ayah by ayah as you memorize it. Tap the line to change what you've memorized.",
        covers: ['MEM-1', 'MEM-2'],
      },
    ],
  },
};

/** At most this many topics show on a screen. */
export const MAX_TOPICS = 4;

/** A screen's topics for this account: the Smart Tracking ones only with it on, and the others only with it off. */
export function topicsFor(screen: HelpScreen, opts: { smartTracking: boolean }): HelpTopic[] {
  return HELP[screen].topics.filter((t) => {
    if (t.when === 'smartTracking') return opts.smartTracking;
    if (t.when === 'noSmartTracking') return !opts.smartTracking;
    return true;
  });
}

export type HelpTextPart = { kind: 'text' | 'label'; text: string } | { kind: 'icon'; icon: HelpIcon };

/** A topic's text in parts: plain words, {{labels}} and [[icons]]. */
export function helpTextParts(text: string): HelpTextPart[] {
  const parts: HelpTextPart[] = [];
  const re = /\{\{(.+?)\}\}|\[\[([a-z]+)\]\]/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) parts.push({ kind: 'text', text: text.slice(at, m.index) });
    if (m[1] != null) parts.push({ kind: 'label', text: m[1] });
    else parts.push({ kind: 'icon', icon: HELP_INLINE_ICONS[m[2]] ?? 'help-circle-outline' });
    at = m.index! + m[0].length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}

/** A topic's text as read aloud (VoiceOver) and in tests: labels as words, icons by their button's name. */
export function helpPlainText(text: string): string {
  const spoken: Record<string, string> = { check: '✓', more: '⋯', eye: 'the eye', play: '▶', options: 'Audio Options', mic: 'the microphone', timer: 'the timer', plus: '+' };
  return text.replace(/\{\{(.+?)\}\}/g, '$1').replace(/\[\[([a-z]+)\]\]/g, (_, n: string) => spoken[n] ?? n);
}
