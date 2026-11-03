// The words of a revision reminder (issue #174), from the approved copy in the
// Nov 2 mocks (~/Documents/revisely-today-mocks/smart-notifications/NOTE.md).
// Rules: never a page number or a page count; name the surah where the reader
// picks up (or the juz, on a juz plan); progress in words; short and warm.
// Pure: the planner (plan.ts) decides when, this decides what it says.

import { getJuzForPage, getSurah, getSurahsForPage } from '../quranData';
import { describeSurahRuns, pageRuns } from '../pageRanges';
import { juzLabel } from '../widgets/snapshot';

export type ReminderKind = 'morning' | 'midday' | 'evening' | 'congrat';

export interface ReminderCopy {
  title: string;
  body: string;
}

export interface ReminderCopyInput {
  kind: ReminderKind;
  /** The account plans by juz (scheduleMode 'juz'). */
  juzPlan: boolean;
  /** The name to greet by ('' hides it). */
  name: string;
  /** The morning reminder is before noon: "Good morning", else "Today's revision". */
  beforeNoon: boolean;
  /** Today's pages, in mushaf order. */
  all: number[];
  /** Those not revised yet, in order. */
  remaining: number[];
  /** The reminder lands between midnight and fajr: its copy offers rather than asks. */
  overnight: boolean;
  /** Days in a row with a session, counting today; only said once today is done. */
  streak: number;
  /** Tomorrow's pages, for the congratulation. */
  tomorrow: number[];
  /** Rotates the wording so the same line doesn't come two days running. */
  variant: number;
}

type Position = 'first' | 'middle' | 'end';

const pick = <T>(options: T[], n: number): T => options[((n % options.length) + options.length) % options.length];

function surahOf(page: number) {
  const on = getSurahsForPage(page)[0];
  const surah = on ? getSurah(on.number) : undefined;
  return surah ?? { number: 0, name: '', startPage: page, endPage: page };
}

/** Where in its surah the page is: its first page, its last of 3+ pages, or between. */
function positionOf(page: number): Position {
  const s = surahOf(page);
  if (page === s.startPage) return 'first';
  if (s.endPage - s.startPage >= 2 && page === s.endPage) return 'end';
  return 'middle';
}

/** Surahs still to revise, counting each once. */
function surahsLeft(pages: number[]): number {
  return new Set(pages.map((p) => surahOf(p).number)).size;
}

const juzOf = (page: number) => getJuzForPage(page);

export function reminderCopy(input: ReminderCopyInput): ReminderCopy {
  if (input.kind === 'congrat') return congratulation(input);
  return input.juzPlan ? juzCopy(input) : pageCopy(input);
}

/** Share of today's pages already revised, 0 to 1. */
function progressOf(input: ReminderCopyInput): number {
  if (input.all.length === 0) return 0;
  return (input.all.length - input.remaining.length) / input.all.length;
}

function greeting(input: ReminderCopyInput): string {
  if (!input.beforeNoon) return "Today's revision";
  return input.name ? `Good morning, ${input.name}` : 'Good morning';
}

function pageCopy(input: ReminderCopyInput): ReminderCopy {
  const first = input.remaining[0];
  const surah = surahOf(first).name;
  const progress = progressOf(input);
  const position = positionOf(first);

  if (input.kind === 'morning') {
    if (progress === 0) {
      const range = describeSurahRuns(pageRuns(input.all));
      const body =
        input.variant % 2 === 0
          ? input.beforeNoon
            ? `Today's revision: ${range}.`
            : `${range}.`
          : `Today starts with ${surahOf(input.all[0]).name}.`;
      return { title: greeting(input), body };
    }
    const phrase =
      position === 'first' ? `with ${surah}` : position === 'end' ? `near the end of ${surah}` : `in ${surah}`;
    return {
      title: input.beforeNoon ? 'Good morning' : "Today's revision",
      body: `You've made a good start. Pick up ${phrase}.`,
    };
  }

  if (input.kind === 'midday') {
    if (progress === 0) {
      return { title: `Starting with ${surah}`, body: "A few calm minutes for today's revision?" };
    }
    if (progress >= 0.6) {
      return {
        title: `${surah} is next`,
        body: 'Most of today is done. A few calm minutes before your next task?',
      };
    }
    if (position === 'first') {
      return { title: `${surah} is next`, body: 'A good start already. Perfect time for a little more.' };
    }
    return {
      title: `Back to ${surah}`,
      body:
        position === 'end'
          ? "You're near the end of it. Perfect time for a page or two."
          : 'A good start already. Perfect time for a little more.',
    };
  }

  // Evening: an hour before the day ends.
  return eveningCopy(input, surah, surahsLeft(input.remaining) === 1);
}

function eveningCopy(input: ReminderCopyInput, surah: string, oneLeft: boolean): ReminderCopy {
  if (input.overnight) {
    return {
      title: 'An hour until Fajr',
      body: `If you're up, ${surah} is where you left off. What's left can be added to tomorrow.`,
    };
  }
  if (oneLeft) return { title: 'An hour left today', body: `Just ${surah} left. You're nearly there.` };
  return { title: 'An hour left today', body: `Even a page or two of ${surah} counts.` };
}

function juzCopy(input: ReminderCopyInput): ReminderCopy {
  const juz = juzOf(input.remaining[0]);
  const progress = progressOf(input);

  if (input.kind === 'morning') {
    if (progress === 0) {
      return { title: greeting(input), body: `Today's revision is Juz ${juz}, whenever you're ready.` };
    }
    return {
      title: input.beforeNoon ? 'Good morning' : "Today's revision",
      body: `You've made a good start. Pick up in Juz ${juz}.`,
    };
  }

  if (input.kind === 'midday') {
    if (progress === 0) {
      return { title: `Starting with Juz ${juz}`, body: "A few calm minutes for today's revision?" };
    }
    if (progress >= 0.6) {
      return {
        title: `Juz ${juz} is next`,
        body: 'Most of today is done. A few calm minutes before your next task?',
      };
    }
    return { title: `Back to Juz ${juz}`, body: 'A good start already. Perfect time for a little more.' };
  }

  if (input.overnight) {
    return {
      title: 'An hour until Fajr',
      body: `If you're up, Juz ${juz} is where you left off. What's left can be added to tomorrow.`,
    };
  }
  return {
    title: 'An hour left today',
    body:
      progress === 0
        ? `Juz ${juz} is still open. A few calm minutes would do it.`
        : `Almost done with Juz ${juz}. A few calm minutes would do it.`,
  };
}

function congratulation(input: ReminderCopyInput): ReminderCopy {
  const streakLine = input.streak >= 2;
  const options: ReminderCopy[] = [];

  if (input.juzPlan) {
    const today = juzLabel(input.all.map((p) => ({ juz: juzOf(p) })));
    const tomorrow = input.tomorrow.length ? juzLabel(input.tomorrow.map((p) => ({ juz: juzOf(p) }))) : '';
    options.push({
      title: `${today} is done`,
      body: tomorrow ? `That's today's revision. Tomorrow is ${tomorrow}.` : "That's today's revision.",
    });
  } else {
    options.push({
      title: "Today's revision is done",
      body: `${describeSurahRuns(pageRuns(input.all))}, all revised. MashaAllah.`,
    });
    const tomorrowFirst = input.tomorrow.length ? surahOf(input.tomorrow[0]).name : '';
    options.push({
      title: 'Done for today',
      body: tomorrowFirst ? `Tomorrow starts with ${tomorrowFirst}. Rest well.` : 'Rest well.',
    });
  }

  if (streakLine) {
    options.push({
      title: `${input.streak} days in a row`,
      body: "Today's revision is done. Alhamdulillah.",
    });
  }
  return pick(options, input.variant);
}
