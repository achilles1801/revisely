// The words of a revision reminder (issue #174), from the approved copy in the
// Nov 2 mocks (~/Documents/revisely-today-mocks/smart-notifications/NOTE.md).
// Rules: never a page number or a page count; name the surah where the reader
// picks up (or the juz, on a juz plan); progress in words; short and warm.
// Pure: the planner (plan.ts) decides when, this decides what it says.

import { getJuzForPage, getSurah, getSurahsForPage } from '../quranData';
import { describeSurahRuns, pageRuns } from '../pageRanges';
import { juzLabel } from '../widgets/snapshot';
import { t } from '../../i18n';

/** `away`: the one reminder of a day after tomorrow, for someone who hasn't opened the app since (REMIND-2). */
export type ReminderKind = 'morning' | 'midday' | 'evening' | 'congrat' | 'away';

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
  if (input.kind === 'away') return awayCopy(input);
  return input.juzPlan ? juzCopy(input) : pageCopy(input);
}

/** Share of today's pages already revised, 0 to 1. */
function progressOf(input: ReminderCopyInput): number {
  if (input.all.length === 0) return 0;
  return (input.all.length - input.remaining.length) / input.all.length;
}

function greeting(input: ReminderCopyInput): string {
  if (!input.beforeNoon) return t('reminders.todaysRevision');
  return input.name ? t('reminders.goodMorningName', { name: input.name }) : t('reminders.goodMorning');
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
            ? t('reminders.todayIs', { range })
            : t('reminders.rangeOnly', { range })
          : t('reminders.startsWith', { place: surahOf(input.all[0]).name });
      return { title: greeting(input), body };
    }
    return {
      title: input.beforeNoon ? t('reminders.goodMorning') : t('reminders.todaysRevision'),
      body: t(
        position === 'first' ? 'reminders.pickUpWith' : position === 'end' ? 'reminders.pickUpNearEnd' : 'reminders.pickUpIn',
        { place: surah },
      ),
    };
  }

  if (input.kind === 'midday') {
    if (progress === 0) {
      return { title: t('reminders.startingWith', { place: surah }), body: t('reminders.calmMinutes') };
    }
    if (progress >= 0.6) {
      return {
        title: t('reminders.isNext', { place: surah }),
        body: t('reminders.mostDone'),
      };
    }
    if (position === 'first') {
      return { title: t('reminders.isNext', { place: surah }), body: t('reminders.goodStart') };
    }
    return {
      title: t('reminders.backTo', { place: surah }),
      body: position === 'end' ? t('reminders.nearEnd') : t('reminders.goodStart'),
    };
  }

  // Evening: an hour before the day ends.
  return eveningCopy(input, surah, surahsLeft(input.remaining) === 1);
}

function eveningCopy(input: ReminderCopyInput, surah: string, oneLeft: boolean): ReminderCopy {
  if (input.overnight) {
    return {
      title: t('reminders.hourUntilFajr'),
      body: t('reminders.overnight', { place: surah }),
    };
  }
  if (oneLeft) return { title: t('reminders.hourLeft'), body: t('reminders.justLeft', { place: surah }) };
  return { title: t('reminders.hourLeft'), body: t('reminders.evenAPage', { place: surah }) };
}

function juzCopy(input: ReminderCopyInput): ReminderCopy {
  const juz = juzOf(input.remaining[0]);
  const place = t('common.juzN', { n: juz });
  const progress = progressOf(input);

  if (input.kind === 'morning') {
    if (progress === 0) {
      return { title: greeting(input), body: t('reminders.juzWhenReady', { juz }) };
    }
    return {
      title: input.beforeNoon ? t('reminders.goodMorning') : t('reminders.todaysRevision'),
      body: t('reminders.pickUpIn', { place }),
    };
  }

  if (input.kind === 'midday') {
    if (progress === 0) {
      return { title: t('reminders.startingWith', { place }), body: t('reminders.calmMinutes') };
    }
    if (progress >= 0.6) {
      return {
        title: t('reminders.isNext', { place }),
        body: t('reminders.mostDone'),
      };
    }
    return { title: t('reminders.backTo', { place }), body: t('reminders.goodStart') };
  }

  if (input.overnight) {
    return {
      title: t('reminders.hourUntilFajr'),
      body: t('reminders.overnight', { place }),
    };
  }
  return {
    title: t('reminders.hourLeft'),
    body: progress === 0 ? t('reminders.stillOpen', { place }) : t('reminders.almostDone', { place }),
  };
}

/**
 * A day after tomorrow, nothing revised (REMIND-2): one of four wordings by the day, so consecutive days never read
 * the same, each naming where that day's revision is (the surahs, or the juz on a juz plan).
 */
function awayCopy(input: ReminderCopyInput): ReminderCopy {
  if (input.juzPlan) {
    const juz = juzOf(input.all[0]);
    const options: ReminderCopy[] = [
      { title: greeting(input), body: t('reminders.juzWhenReady', { juz }) },
      { title: t('reminders.away.placeToday', { place: t('common.juzN', { n: juz }) }), body: t('reminders.away.keepClose') },
      { title: t('reminders.away.ready'), body: t('reminders.away.juzWhenever', { juz }) },
    ];
    return pick(options, input.variant);
  }
  const range = describeSurahRuns(pageRuns(input.all));
  const place = surahOf(input.all[0]).name;
  const options: ReminderCopy[] = [
    { title: greeting(input), body: input.beforeNoon ? t('reminders.todayIs', { range }) : t('reminders.rangeOnly', { range }) },
    { title: greeting(input), body: t('reminders.startsWith', { place }) },
    { title: t('reminders.away.placeToday', { place }), body: t('reminders.away.keepClose') },
    { title: t('reminders.away.ready'), body: t('reminders.away.whenever', { range }) },
  ];
  return pick(options, input.variant);
}

function congratulation(input: ReminderCopyInput): ReminderCopy {
  const streakLine = input.streak >= 2;
  const options: ReminderCopy[] = [];

  if (input.juzPlan) {
    const today = juzLabel(input.all.map((p) => ({ juz: juzOf(p) })));
    const tomorrow = input.tomorrow.length ? juzLabel(input.tomorrow.map((p) => ({ juz: juzOf(p) }))) : '';
    options.push({
      title: t('reminders.done.juz', { today }),
      body: tomorrow ? t('reminders.done.tomorrowJuz', { tomorrow }) : t('reminders.done.thatsToday'),
    });
  } else {
    options.push({
      title: t('reminders.done.title'),
      body: t('reminders.done.allRevised', { range: describeSurahRuns(pageRuns(input.all)) }),
    });
    const tomorrowFirst = input.tomorrow.length ? surahOf(input.tomorrow[0]).name : '';
    options.push({
      title: t('reminders.done.forToday'),
      body: tomorrowFirst ? t('reminders.done.tomorrowStarts', { place: tomorrowFirst }) : t('reminders.done.restWell'),
    });
  }

  if (streakLine) {
    options.push({
      title: t('reminders.done.streak', { days: input.streak }),
      body: t('reminders.done.alhamdulillah'),
    });
  }
  return pick(options, input.variant);
}
