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
export type HelpScreen = 'home' | 'session' | 'reader' | 'schedule' | 'activity' | 'insights' | 'day';

/**
 * When a topic shows: only with Smart Tracking on, only with it off, or only where the hidden page
 * (recite mode, the session's eye) is offered.
 */
export type HelpWhen = 'smartTracking' | 'noSmartTracking' | 'recite';

export interface HelpTopic {
  id: string;
  icon: HelpIcon;
  title: string;
  text: string;
  /** The BEHAVIOUR.md rules it explains. */
  covers: readonly string[];
  /**
   * For a topic no rule covers yet: why. The drift check can't watch it, so it's kept to what the
   * screen itself shows; a rule for it (with a scenario) turns this into `covers`.
   */
  unruled?: string;
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
  help: 'help-circle-outline',
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
  session: {
    title: 'How a session works',
    topics: [
      {
        id: 'session.marking',
        icon: 'checkmark-circle-outline',
        title: 'Marking pages',
        text:
          'Swipe on and the page you leave is marked revised; swipe onto the end card for the last. ' +
          '[[check]] marks or unmarks this page.',
        covers: ['SESS-1'],
      },
      {
        id: 'session.stopping',
        icon: 'chevron-back-circle-outline',
        title: 'Stopping',
        text:
          "Back saves what you've marked, and {{Continue revision}} on Home picks up from there. " +
          'The day is done when every page is marked.',
        covers: ['SESS-3', 'SESS-2'],
      },
      {
        id: 'session.rating',
        icon: 'fitness-outline',
        title: 'Rating',
        text: '[[more]] → {{Rate page strength}}. Pages you rate weak show in Insights, and a new plan can put them first.',
        covers: ['ACT-8', 'ACT-12'],
        when: 'smartTracking',
      },
      {
        id: 'session.hidden',
        icon: 'eye-off-outline',
        title: 'Hidden page',
        text:
          "[[eye]] hides the page so you recite from memory. Each verse appears when you pause; " +
          "{{Next verse}} shows one if you're stuck.",
        covers: [],
        unruled: 'recite mode needs on-device speech recognition, which the scenarios can’t run',
        when: 'recite',
      },
    ],
  },
  reader: {
    title: 'How the reader works',
    topics: [
      {
        id: 'reader.hold',
        icon: 'hand-left-outline',
        title: 'Hold a verse',
        text: 'Hold a verse to play it, read its translation, or copy or share it.',
        covers: [],
        unruled: 'the reader isn’t in the scenarios yet (its page images and gestures)',
      },
      {
        id: 'reader.turning',
        icon: 'swap-horizontal-outline',
        title: 'Turning pages',
        text: 'Tap the page to show or hide the controls. Swipe to turn pages; slide the bar at the bottom to go further.',
        covers: [],
        unruled: 'the reader isn’t in the scenarios yet (its page images and gestures)',
      },
      {
        id: 'reader.recitation',
        icon: 'play-circle-outline',
        title: 'Recitation',
        text: '[[play]] plays from this page. [[options]] sets the reciter, speed, which ayahs and repeats. It plays on when you leave.',
        covers: [],
        unruled: 'no rule describes the player yet (AUDIO-* are about Android’s notification)',
      },
      {
        id: 'reader.sitting',
        icon: 'stopwatch-outline',
        title: 'Recording and timer',
        text: '[[mic]] records you and [[timer]] times you. {{End}} saves both to the day in Activity, where you can add what you memorized.',
        covers: ['REC-1', 'REC-2', 'MEM-5', 'DAY-9'],
      },
    ],
  },
  schedule: {
    title: 'How the schedule works',
    topics: [
      {
        id: 'schedule.cycle',
        icon: 'repeat-outline',
        title: 'The cycle',
        text:
          'Your days run in order, then start again, so each memorized page comes round once a cycle. ' +
          "Missed days don't push it back.",
        covers: ['SCHED-1', 'SCHED-3', 'SCHED-5'],
      },
      {
        id: 'schedule.rest',
        icon: 'cafe-outline',
        title: 'Rest days',
        text: "A rest day is a day of the cycle, so it comes back every round. It isn't a pause.",
        covers: ['SCHED-3'],
      },
      {
        id: 'schedule.days',
        icon: 'reorder-three-outline',
        title: 'Changing days',
        text:
          'Tap a day to change it, hold and drag to move it, swipe left to delete it. ' +
          'Saving leaves today as it is unless you edited today.',
        covers: ['CARRY-5'],
      },
      {
        id: 'schedule.new',
        icon: 'sparkles-outline',
        title: 'New plan',
        text: '{{Create new plan}} makes a fresh cycle: even pages, whole juz or weakest first, forwards or in reverse.',
        covers: ['SCHED-1', 'SCHED-2', 'SCHED-4'],
        when: 'smartTracking',
      },
      {
        id: 'schedule.new.off',
        icon: 'sparkles-outline',
        title: 'New plan',
        text: '{{Create new plan}} makes a fresh cycle: even pages or whole juz, forwards or in reverse.',
        covers: ['SCHED-1', 'SCHED-2', 'SCHED-4'],
        when: 'noSmartTracking',
      },
    ],
  },
  activity: {
    title: 'How Activity works',
    topics: [
      {
        id: 'activity.calendar',
        icon: 'calendar-outline',
        title: 'The calendar',
        text:
          "A day's ring fills as you revise its pages; dots show memorizing, reading and notes. " +
          'Tap a day, then its summary, to open it.',
        covers: ['ACT-3', 'ACT-18'],
      },
      {
        id: 'activity.day',
        icon: 'sunny-outline',
        title: 'Which day',
        text:
          'Everything goes on the revision day it was done. With {{Start day at fajr}} on, anything before Fajr ' +
          'counts for the day before.',
        covers: ['DAY-9', 'DAY-2', 'ACT-1'],
      },
      {
        id: 'activity.adding',
        icon: 'add-circle-outline',
        title: 'Adding',
        text: 'Open today or yesterday and tap [[plus]] to log pages revised elsewhere, new memorization or a note.',
        covers: ['ACT-5', 'ACT-17'],
      },
    ],
  },
  insights: {
    title: 'How Insights work',
    topics: [
      {
        id: 'insights.coverage',
        icon: 'grid-outline',
        title: 'Coverage',
        text:
          "How much of what you've memorized you revised in the range at the top, juz by juz. " +
          'Tap a juz to see its surahs.',
        covers: ['ACT-4', 'ACT-21', 'ACT-22'],
      },
      {
        id: 'insights.consistency',
        icon: 'ellipse-outline',
        title: 'Consistency',
        text: 'The days you revised or read, and the hours you usually do it. Tap a day’s circle to open that day.',
        covers: ['ACT-4', 'ACT-23'],
      },
      {
        id: 'insights.weak',
        icon: 'alert-circle-outline',
        title: 'Weak spots',
        text: 'Pages you rated weak, or often skipped. Tap one to read it; the button under them puts them first tomorrow.',
        covers: ['ACT-12', 'ACT-8', 'ACT-20', 'ACT-24'],
        when: 'smartTracking',
      },
      {
        id: 'insights.pace',
        icon: 'speedometer-outline',
        title: 'Pace',
        text: 'Minutes a page, once ten revisions or readings were timed. Tap the count under it to see each one.',
        covers: ['ACT-4', 'ACT-23'],
      },
    ],
  },
  day: {
    title: 'How a day works',
    topics: [
      {
        id: 'day.change',
        icon: 'hand-left-outline',
        title: 'Changing an entry',
        text:
          "Hold a block's title, or a recording, for its menu. Deleting a Memorized entry takes what it added " +
          'off your memorized.',
        covers: ['ACT-6', 'ACT-7'],
      },
      {
        id: 'day.pages',
        icon: 'albums-outline',
        title: 'The pages',
        text:
          "The strip is the day's pages: revised, skipped or not reached. Tap one to read it. " +
          'Weak, moderate and strong come from your ratings.',
        covers: ['ACT-20', 'ACT-8'],
        when: 'smartTracking',
      },
      {
        id: 'day.pages.off',
        icon: 'albums-outline',
        title: 'The pages',
        text: "The strip is the day's pages: revised, skipped or not reached. Tap one to open it in the reader.",
        covers: ['ACT-20', 'ACT-19'],
        when: 'noSmartTracking',
      },
      {
        id: 'day.adding',
        icon: 'add-circle-outline',
        title: 'Adding',
        text: 'On today and yesterday, [[plus]] logs pages revised elsewhere, new memorization or a note. Earlier days take notes only.',
        covers: ['ACT-5', 'ACT-17'],
      },
      {
        id: 'day.notes',
        icon: 'document-text-outline',
        title: 'Notes',
        text: 'A note sits under the block it’s about, or in Notes. Tap one in Notes to open the daily log, where notes are edited and deleted.',
        covers: ['ACT-11', 'ACT-6', 'LOG-2'],
      },
    ],
  },
};

/** At most this many topics show on a screen. */
export const MAX_TOPICS = 4;

/**
 * A screen's topics for this account (HELP-3): the Smart Tracking ones only with it on, their
 * stand-ins only with it off, and the hidden page's only where it's offered.
 */
export function topicsFor(screen: HelpScreen, opts: { smartTracking: boolean; recite?: boolean }): HelpTopic[] {
  return HELP[screen].topics.filter((t) => {
    if (t.when === 'smartTracking') return opts.smartTracking;
    if (t.when === 'noSmartTracking') return !opts.smartTracking;
    if (t.when === 'recite') return opts.recite === true;
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
  const spoken: Record<string, string> = { check: '✓', more: '⋯', eye: 'the eye', play: '▶', options: 'Audio Options', mic: 'the microphone', timer: 'the timer', plus: '+', help: '?' };
  return text.replace(/\{\{(.+?)\}\}/g, '$1').replace(/\[\[([a-z]+)\]\]/g, (_, n: string) => spoken[n] ?? n);
}
