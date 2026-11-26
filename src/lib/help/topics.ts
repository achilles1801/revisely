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
//
// In Arabic the topics come from topics.ar.ts, each with the hash of the English it was translated from
// (__tests__/topicsArabic.test.ts fails when that English changes).

import type { Ionicons } from '@expo/vector-icons';
import { currentLanguage } from '../../i18n';
import { backIcon, forwardIcon } from '../../i18n/direction';
import { HELP_TITLES_AR, HELP_TOPICS_AR } from './topics.ar';

export type HelpIcon = keyof typeof Ionicons.glyphMap;

/**
 * The help sheets. Most belong to a screen's ?; `recite` is also the reader's while a take is open (Recite, Revisely
 * Dev). The rest are reached from another sheet's links (`more`): Recite's other sheets and Insights' second one.
 */
export type HelpScreen =
  | 'home'
  | 'session'
  | 'reader'
  | 'schedule'
  | 'activity'
  | 'insights'
  | 'insightsMore'
  | 'day'
  | 'recite'
  | 'reciteTake'
  | 'reciteMemory'
  | 'reciteTest';

/**
 * When a topic shows: only with Smart Tracking on, only with it off, only with Recite (the one mic, in the reader and
 * sessions, on a phone and print that have it) or only without it, only where Insights has Gaps and Last revised
 * (`devApp`: gapsInsightsEnabled, everyone's from 1.0.5), or only where Activity's sections can be arranged.
 */
export type HelpWhen = 'smartTracking' | 'noSmartTracking' | 'liveRecite' | 'noLiveRecite' | 'devApp' | 'sections';

/** What decides which topics an account sees (HELP-3). */
export interface HelpOpts {
  smartTracking: boolean;
  liveRecite?: boolean;
  devApp?: boolean;
  sections?: boolean;
}

/** Why a Recite topic has no rule to cover: RECITE-1 to RECITE-8 (BEHAVIOUR.md) don't describe that part of it yet. */
const RECITE_UNRULED = 'no RECITE rule in BEHAVIOUR.md describes this part of Recite yet';

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
  /**
   * Other sheets this one leads to, as rows under its topics (their titles, ›): a tap shows that sheet in its place.
   * A row shows only when its sheet has topics for the account.
   */
  more?: readonly HelpScreen[];
  /**
   * Reached from another sheet's `more` (or, for `recite`, only while a take is open), so it may have nothing for an
   * account: its row then doesn't show.
   */
  linked?: boolean;
}

/** The glyphs [[name]] may name in a topic's text. */
export const HELP_INLINE_ICONS: Readonly<Record<string, HelpIcon>> = {
  check: 'checkmark',
  more: 'ellipsis-horizontal',
  pages: 'list-outline',
  eye: 'eye-off-outline',
  play: 'play',
  options: 'options-outline',
  mic: 'mic-outline',
  timer: 'stopwatch-outline',
  plus: 'add',
  help: 'help-circle-outline',
  pause: 'pause',
  // The reader's ‹ and › point the way the layout reads (src/i18n/direction).
  get back() {
    return backIcon();
  },
  get next() {
    return forwardIcon();
  },
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
          'Days in a row with all their pages revised. Missed yesterday? A ring beside [[help]] fills as you ' +
          'revise its pages. Fill it before today ends and the streak comes back.',
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
          '[[pages]] goes to any page, and marks or unmarks it.',
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
        text: '[[pages]] → {{Rate page strength}}. Pages you rate weak show in Insights, and a new plan can put them first.',
        covers: ['ACT-8', 'ACT-12'],
        when: 'smartTracking',
      },
      {
        // The reader's mic in a session (Revisely Dev, Majd, Nov 17 2026). While a take is open, the Pages sheet's Help is How Recite works.
        id: 'session.recite',
        icon: 'mic-outline',
        title: 'Reciting',
        text:
          '[[mic]] records you; hold it and choose {{Recite}}, and the page follows you. ' +
          'Going on to the next page marks the one you finished revised; [[pages]] takes it back.',
        covers: ['RECITE-9'],
        when: 'liveRecite',
      },
    ],
    // Recite's sheets, with it (their topics' `when`). Test me isn't in a session (it goes anywhere in what's memorized).
    more: ['recite', 'reciteTake', 'reciteMemory'],
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
        when: 'noLiveRecite',
      },
      {
        // The same mic, with Recite (Revisely Dev): while a take is open, the ? opens "How Recite works".
        id: 'reader.recite',
        icon: 'mic-outline',
        title: 'Recording and reciting',
        text: '[[mic]] records you; hold it and choose {{Recite}}, and the page follows you. [[timer]] times you, and {{End}} saves both to the day in Activity.',
        covers: ['REC-1', 'REC-2'],
        when: 'liveRecite',
      },
    ],
    // Mistake detection without a take open (Majd, Nov 16 2026: "i don't see the guides being updated with the mistake
    // detection stuff in the help icon"). Recite's sheets show only with it (their topics' `when`).
    more: ['recite', 'reciteTake', 'reciteMemory', 'reciteTest'],
  },
  // Recite's four sheets: how it works, during a take, past mistakes, Test me and voice search. Each topic carries
  // `when: 'liveRecite'`: Recite is everyone's from 1.0.5, but only on a phone and print that have it.
  recite: {
    // Majd, Nov 15 2026: in line with what Revisely Dev's Recite does (highlights in three colours, Not clear, Undo
    // and Put back, Hear it, the hidden view). Nov 16: anywhere in the Qur'an, a slip into a
    // similar ayah, links to Recite's other sheets, and takes kept apart from recordings (RMEM-6).
    title: 'How Recite works',
    linked: true,
    more: ['reciteTake', 'reciteMemory', 'reciteTest'],
    topics: [
      {
        id: 'recite.start',
        icon: 'reader-outline',
        title: 'Recite',
        text:
          'Hold [[mic]] → {{Recite}} and start anywhere: it finds you on the page, or elsewhere in the Qur’an. ' +
          'With {{Mark mistakes}} on, it marks your mistakes.',
        covers: ['RECITE-1'],
        when: 'liveRecite',
      },
      {
        id: 'recite.marks',
        icon: 'color-palette-outline',
        title: 'The highlights',
        text:
          'Red: a word skipped, wrong or extra. Amber: a wrong haraka or letter, a mistake too, or {{Not clear}} (never counted). ' +
          'Violet: tajweed, with {{Strict (Beta)}}.',
        covers: ['RECITE-2', 'RECITE-3'],
        when: 'liveRecite',
      },
      {
        id: 'recite.card',
        icon: 'chatbox-ellipses-outline',
        title: 'A mistake',
        text:
          '{{Hear it}} plays the ayah and pauses your take; {{Your recitation}} plays you there. ' +
          '{{Not a mistake}} takes it off, and {{Undo}} or {{Put back}} brings it back.',
        covers: ['RECITE-4'],
        when: 'liveRecite',
      },
      {
        id: 'recite.after',
        icon: 'repeat-outline',
        title: 'After the take',
        text:
          'A slip into a similar ayah gets its own line. ' +
          '[[more]] → {{Delete this take}} deletes it.',
        covers: ['RMEM-6'],
        when: 'liveRecite',
      },
    ],
  },
  reciteTake: {
    title: 'During a take',
    linked: true,
    more: ['recite', 'reciteMemory', 'reciteTest'],
    topics: [
      {
        id: 'reciteTake.page',
        icon: 'expand-outline',
        title: 'Just the page',
        text:
          'Tap the page to put the header and the bar away; the take’s time stays by the page number. ' +
          'Tap again, or tap the time, to bring them back.',
        covers: [],
        unruled: RECITE_UNRULED,
        when: 'liveRecite',
      },
      {
        id: 'reciteTake.hidden',
        icon: 'eye-off-outline',
        title: 'From memory',
        text: '[[eye]] hides the words, and each appears once you’ve said it. [[back]] shows the next word, and ‹‹ the rest of its ayah.',
        covers: ['RECITE-6'],
        when: 'liveRecite',
      },
      {
        id: 'reciteTake.peeked',
        icon: 'eye-outline',
        title: 'Peeked words',
        text:
          'Words you uncover stay grey for the take and never count in your score. ' +
          'The summary lists them.',
        covers: ['RECITE-6'],
        when: 'liveRecite',
      },
      {
        id: 'reciteTake.pause',
        icon: 'pause-circle-outline',
        title: 'Pausing',
        text: '[[pause]] turns the microphone off and keeps your take open; [[play]] carries on from where you were.',
        covers: [],
        unruled: RECITE_UNRULED,
        when: 'liveRecite',
      },
    ],
  },
  reciteMemory: {
    title: 'Your past mistakes',
    linked: true,
    more: ['recite', 'reciteTake', 'reciteTest'],
    topics: [
      {
        id: 'reciteMemory.page',
        icon: 'bookmark-outline',
        title: 'On the page',
        text:
          'A word you missed stays lightly highlighted until you say it right in two takes in a row, on two different ' +
          'days. Tap it for its history, or {{Clear now}}.',
        covers: ['RMEM-2', 'RMEM-3'],
        when: 'liveRecite',
      },
      {
        id: 'reciteMemory.progress',
        icon: 'trending-up-outline',
        title: 'Your progress',
        text:
          'Once a passage has two takes, the summary shows how it’s going. ' +
          'Tap it for {{Your progress}}: every take there, and the words still to fix.',
        covers: ['RMEM-4'],
        when: 'liveRecite',
      },
      {
        id: 'reciteMemory.activity',
        icon: 'calendar-outline',
        title: 'In Activity',
        text:
          'A day lists each take under {{Recited}}, apart from your recordings. ' +
          'Tap one for {{Show on the page}}: it opens with its marks.',
        covers: ['RMEM-5', 'RMEM-6', 'RINS-3'],
        when: 'liveRecite',
      },
    ],
  },
  reciteTest: {
    title: 'Test me and voice search',
    linked: true,
    more: ['recite', 'reciteTake', 'reciteMemory'],
    topics: [
      {
        id: 'reciteTest.start',
        icon: 'shuffle',
        title: 'Test me',
        text:
          'Hold [[mic]] → {{Test me}} → {{Start}}: carry on from one verse at random. ' +
          'How far and where from are under {{Test settings}}.',
        covers: ['RECITE-8'],
        when: 'liveRecite',
      },
      {
        id: 'reciteTest.result',
        icon: 'list-outline',
        title: 'How it went',
        text: 'Reach the end and you’ll see {{Hasbuk}}. Stop sooner and it’s kept as {{Stopped early}}. The bar’s result opens the summary, with {{Test me again}}.',
        covers: ['RECITE-8'],
        when: 'liveRecite',
      },
      {
        id: 'reciteTest.search',
        icon: 'search-outline',
        title: 'Voice search',
        text:
          'Search by voice and find just one ayah, and the reader opens there with it highlighted. ' +
          'Back takes you to the search; tap [[mic]] in the reader to recite it.',
        covers: ['SEARCH-4'],
        when: 'liveRecite',
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
      {
        id: 'activity.sections',
        icon: 'options-outline',
        title: 'Your sections',
        text:
          '{{Edit sections}} shows or hides each section; hold one, then drag it to move it. ' +
          '{{Show all, in the usual order}} puts it back.',
        covers: ['ACT-29'],
        when: 'sections',
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
          "How much of what you've memorized you revised in the range at the top, by {{Juz}}, {{Surah}} or {{Page}}. " +
          'Tap one to see it.',
        covers: ['ACT-4', 'ACT-21', 'ACT-22', 'ACT-26'],
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
    more: ['insightsMore'],
  },
  // Insights' sections past the first sheet's four: Gaps and Last revised (Revisely Dev), Recitation (with Recite) and
  // arranging the sections (testers).
  insightsMore: {
    title: 'More in Insights',
    linked: true,
    more: ['insights'],
    topics: [
      {
        id: 'insightsMore.gaps',
        icon: 'pulse-outline',
        title: 'Gaps',
        text: 'How long since you last revised, and each time you went 2 days or more without revising: tap one to see it on the calendar. {{Days}} shows exact days.',
        covers: ['ACT-28'],
        when: 'devApp',
      },
      {
        id: 'insightsMore.lastRevised',
        icon: 'time-outline',
        title: 'Last revised',
        text: '{{When did I last revise…?}}, under Gaps, says when you last revised what you’ve memorized. Choose surahs, juz, hizbs or pages, the order, and a filter.',
        covers: ['ACT-30'],
        when: 'devApp',
      },
      {
        id: 'insightsMore.recitation',
        icon: 'mic-outline',
        title: 'Recitation',
        text: 'Your Recite score over the range, the passages that keep slipping and the similar ayahs you went on with. Tap one to read it.',
        covers: ['RINS-2'],
        when: 'liveRecite',
      },
      {
        id: 'insightsMore.sections',
        icon: 'options-outline',
        title: 'Your sections',
        text:
          '{{Edit sections}} shows or hides each section; hold one, then drag it to move it. ' +
          '{{Show all, in the usual order}} puts it back.',
        covers: ['ACT-29'],
        when: 'sections',
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
          "Hold a block's title, a note or a recording for its menu. Deleting a Memorized entry takes what it added " +
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
        text: 'A note sits under the block it’s about, or in Notes. Hold one to edit, copy or delete it.',
        covers: ['ACT-11', 'ACT-6', 'LOG-2'],
      },
    ],
    // A day's Recited block (Revisely Dev): "Your past mistakes" tells of it, with the rest of what Recite remembers.
    more: ['reciteMemory'],
  },
};

/** At most this many topics show on a screen. */
export const MAX_TOPICS = 4;

/**
 * A screen's topics for this account (HELP-3): the Smart Tracking ones only with it on, their
 * stand-ins only with it off, Recite's only with it, Revisely
 * Dev's only there, and arranging Activity's sections only where it can be done.
 */
export function topicsFor(screen: HelpScreen, opts: HelpOpts): HelpTopic[] {
  return HELP[screen].topics.filter((t) => {
    if (t.when === 'smartTracking') return opts.smartTracking;
    if (t.when === 'noSmartTracking') return !opts.smartTracking;
    if (t.when === 'liveRecite') return opts.liveRecite === true;
    if (t.when === 'noLiveRecite') return opts.liveRecite !== true;
    if (t.when === 'devApp') return opts.devApp === true;
    if (t.when === 'sections') return opts.sections === true;
    return true;
  }).map(inLanguage);
}

/** A topic in the app's language: its Arabic (topics.ar.ts) when the app is in Arabic and it has one, else as here. */
function inLanguage(topic: HelpTopic): HelpTopic {
  const ar = currentLanguage() === 'ar' ? HELP_TOPICS_AR[topic.id] : undefined;
  return ar?.text != null ? { ...topic, title: ar.title, text: ar.text } : topic;
}

/** A sheet's title in the app's language. */
export function helpTitle(screen: HelpScreen): string {
  return (currentLanguage() === 'ar' ? HELP_TITLES_AR[screen]?.title : undefined) ?? HELP[screen].title;
}

/** The sheets a sheet leads to for this account: its `more`, less those with nothing for it. */
export function linksFor(screen: HelpScreen, opts: HelpOpts): HelpScreen[] {
  return (HELP[screen].more ?? []).filter((s) => s !== screen && topicsFor(s, opts).length > 0);
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
  const spoken: Record<string, string> = currentLanguage() === 'ar' ? SPOKEN_AR : SPOKEN_EN;
  return text.replace(/\{\{(.+?)\}\}/g, '$1').replace(/\[\[([a-z]+)\]\]/g, (_, n: string) => spoken[n] ?? n);
}

/** Each [[icon]] as VoiceOver says it: by its button's name. */
const SPOKEN_EN: Readonly<Record<string, string>> = {
  check: '✓',
  more: '⋯',
  pages: 'Pages',
  eye: 'the eye',
  play: '▶',
  options: 'Audio Options',
  mic: 'the microphone',
  timer: 'the timer',
  plus: '+',
  help: '?',
  pause: 'Pause',
  back: '‹',
  next: '›',
};

const SPOKEN_AR: Readonly<Record<string, string>> = {
  check: '✓',
  more: '⋯',
  pages: 'الصفحات',
  eye: 'زر العين',
  play: 'زر التشغيل',
  options: 'خيارات الصوت',
  mic: 'الميكروفون',
  timer: 'المؤقت',
  plus: '+',
  help: 'زر المساعدة',
  pause: 'إيقاف مؤقت',
  back: 'زر الكلمة التالية',
  next: 'زر التالي',
};
