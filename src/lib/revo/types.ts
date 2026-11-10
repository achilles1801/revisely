import type { RevoPattern } from './patterns';

// Revo, the in-app assistant: what the app and the server exchange (the server's side is
// functions/src/revo/; both follow the same contract) and what is stored per account.

export const REVO_DAILY_QUESTIONS = 20;

export const REVO_TOTALS = [
  'memorizedPages',
  'revisedWithin7Days',
  'revisedWithin30Days',
  'daysWithSession30',
  'streakDays',
  'sessions30',
  'weakPages',
  'moderatePages',
  'strongPages',
  'weakRevisedLast7Days',
  'pagesPerDay7',
  'pagesPerDay30',
  'plannedPerDay',
] as const;
export type RevoTotals = Record<(typeof REVO_TOTALS)[number], number>;

/**
 * Sent with every question: totals and today's blocks, as numbers and page numbers. Built from
 * lib/todaySnapshot, the function Home's Today post is built from, so its numbers are Home's:
 * week[today].pages = today.revisedPages - today.doneEarlier + today.otherPages, always.
 */
export interface RevoContext {
  totals: RevoTotals;
  today: {
    /** Today's pages, carried pages included: Home's "20 pages". */
    plannedPages: number;
    /** Of them, done: Home's "6 of 20" (pages done ahead on an earlier day included). */
    revisedPages: number;
    /** Of today's pages, the ones carried in from earlier days ("4 from yesterday first"). */
    carriedPages: number;
    /** Of the done ones, those revised ahead on an earlier day (not today). */
    doneEarlier: number;
    /** Pages revised today that aren't today's: ahead for a later day, or no longer in today's plan. */
    otherPages: number;
    /** Minutes of today's revision sessions. */
    minutes: number;
    /** Pages marked memorized on this revision day. */
    memorizedPages: number;
    /** Today's pages not revised yet, in order. */
    nextPages: number[];
    /** Of those, the ones rated weak (1–2). */
    weakNext: number[];
    /** Home says Done: today's own pages are all done (carried ones count for their own days). */
    done: boolean;
  };
  /** Pages rated weak (1–2), the longest unrevised first. */
  weakPages: number[];
  /**
   * The last 7 revision days, oldest first: the pages revised that day (in its sessions), the pages
   * its plan had, and whether the day was done, as the streak counts it. Then, from apps after Nov 9
   * 2026 (lib/revo/patterns): the pages it caught up for earlier days and revised ahead for later
   * ones, and when its revision started ("HH:MM", null when unknown).
   */
  week: { day: string; pages: number; planned: number; done: boolean; caughtUp?: number; ahead?: number; started?: string | null }[];
  /** Patterns in the last days (lib/revo/patterns, REVO-40); Revo mentions at most one, when it fits. Always sent by this app. */
  patterns?: RevoPattern[];
  /**
   * The streak as Home shows it. `atRisk`: yesterday was missed but the run before it can still be
   * kept today by finishing yesterday's pages (SESS-6); Home shows `previous` dimmed.
   */
  streak: { days: number; atRisk: { previous: number; yesterdayPlanned: number; yesterdayDone: number } | null };
  /**
   * The parts of the Qur'an named above, in words, surah and juz first (lib/revo/words over
   * lib/passages): today's pages and where they start, what's next and where it starts, the weak ones.
   */
  passages: { today?: string; startsAt?: string; next?: string; nextAt?: string; weakNext?: string; weak?: string; memorizedToday?: string };
  /** Each page named above, in words ("Al-Hashr, ayahs 17–24 · Juz 28"), by page number. */
  pageNames: Record<string, string>;
  localTime: string | null;
}

export type RevoInsight = 'coverage' | 'consistency' | 'weakSpots' | 'pace';

/** How often a part of the Qur'an was revised in a window: on how many days, and each memorized page's least and most. */
export interface RevoTimes {
  /** Revision days with at least one of its pages revised. */
  days: number;
  /** The fewest times any of its memorized pages was revised: how many times it was revised in full. */
  minEach: number;
  /** The most times any of its memorized pages was revised. */
  maxEach: number;
}

/**
 * Its pages on the plan over past days (today not counted), as the streak reads the plan and the
 * credits (lib/streak): every page a day had is revised on the day, revised later (carried over),
 * revised ahead on an earlier day, or never revised. onDay + late + ahead + skipped = pages.
 */
export interface RevoPlanTally {
  /** Days that had at least one of its pages. */
  days: number;
  /** Its pages on those days, counted once a day. */
  pages: number;
  onDay: number;
  late: number;
  ahead: number;
  skipped: number;
  /** Days on which one of its pages was never revised. */
  skippedDays: number;
}

/** What the app shows for a surah, a juz or some pages (lib/revo/facts). */
export interface RevoPassageFacts {
  /** In words, surah and juz first (lib/passages): "Yusuf · Juz 12–13". */
  name: string;
  /** Pages it spans, and of them, memorized. */
  pages: number;
  memorized: number;
  /** Times revised: the last 7 and 30 revision days (today included) and every day on record. */
  revised: { last7: RevoTimes; last30: RevoTimes; all: RevoTimes };
  /** Days since any of its memorized pages was last revised; null when none has been. */
  lastRevisedDaysAgo: number | null;
  /** Its memorized page revised longest ago (daysAgo null: never revised). */
  oldest: { name: string; page: number; daysAgo: number | null } | null;
  /** Memorized pages never revised on record. */
  neverRevised: number;
  plan: { last7: RevoPlanTally; last30: RevoPlanTally };
  /** Its memorized pages' ratings, as Insights counts them (pages revised at least once); unrated: never revised. */
  strength: { weak: number; moderate: number; strong: number; unrated: number; average: number | null };
  /** Runs of its weak pages (rated 1–2), weakest first: in words, the pages, the lowest rating. */
  weakSpots: { name: string; pages: number[]; rating: number }[];
  /** Its pages in today's revision, and of them, done. Null when today has none. */
  today: { pages: number; done: number } | null;
  /** The next day after today the plan has any of its pages: in how many days, and how many. */
  next: { inDays: number; pages: number } | null;
}

/** What the app shows for one revision day (lib/revo/facts): Activity's day and, for today, Home's. */
export interface RevoDayFacts {
  /** 0 today, 1 yesterday. */
  daysAgo: number;
  /**
   * The day's pages: carried in first (today only: past carry-overs aren't kept), then its own. Each
   * was revised on the day, ahead on an earlier day, later (caught up), or not (yet). `done`: the day
   * counts as done for the streak (Home's Done, today).
   */
  plan: { pages: number; name?: string; carried: number; onDay: number; ahead: number; late: number; notDone: number; done: boolean } | null;
  /** Every page revised in the day's sessions; of them, for a later day (ahead) and for an earlier one (catch-up). */
  revised: { pages: number; name?: string; forLater: number; forEarlier: number };
  /** Minutes of the day's revision sessions; null when none recorded a length. */
  minutes: number | null;
  /** Minutes of timed reading; null when they couldn't be read. */
  readMinutes: number | null;
  memorized: { pages: number; name?: string };
  /** Ratings given that day (each page's last), and the weak ones. */
  ratings: { weak: number; moderate: number; strong: number; weakName?: string; weakPages: number[] };
  /** This phone's recordings of the day; null when they couldn't be read. */
  recordings: { count: number; minutes: number } | null;
  /** The day's notes from the daily log, as written; null when the log couldn't be read. */
  notes: string[] | null;
}

/** What the user adds with +: sent only with the question it was added to. */
export type RevoAttachment =
  | { kind: 'surah'; label: string; surah: number; facts: RevoPassageFacts }
  | { kind: 'juz'; label: string; juz: number; facts: RevoPassageFacts }
  | { kind: 'pages'; label: string; pages: number[]; facts: RevoPassageFacts }
  | { kind: 'revisionDay'; label: string; day: string; facts: RevoDayFacts }
  | { kind: 'recording'; label: string; day: string; of: 'revision' | 'reading'; seconds: number; pages: number[] }
  | { kind: 'insight'; label: string; insight: RevoInsight };

/** At most this many things go with one question. */
export const REVO_MAX_ATTACHMENTS = 6;

export type RevoChart =
  | { kind: 'pageRatings'; title: string; pages: number[] }
  | { kind: 'dailyPages'; title: string; days: 7 | 30 };

/**
 * The charts after the first two, in a message's `visual` (the server's types.ts RevoNewChart):
 * apps before them don't read that field, so they show the words, never an empty chart.
 */
export type RevoNewChart =
  | { kind: 'juzMap'; title: string }
  /** Each revision of one surah or one juz (exactly one of them) over the last `days`. */
  | { kind: 'timeline'; title: string; surah?: number; juz?: number; days: 30 | 90 | 365 }
  /** The last `weeks` weeks (4–12), a day a cell: done, in part or missed. */
  | { kind: 'weeks'; title: string; weeks: number }
  /** Juz or surahs (exactly one list, 2–8 of them) side by side, in 1–3 of the columns. */
  | { kind: 'table'; title: string; juz?: number[]; surahs?: number[]; columns: RevoTableColumn[] }
  /** Pages memorized each month, over the last 6 or 12. */
  | { kind: 'memorized'; title: string; months: 6 | 12 };
export const REVO_TABLE_COLUMNS = ['lastRevised', 'times30', 'weak', 'strength', 'memorized'] as const;
export type RevoTableColumn = (typeof REVO_TABLE_COLUMNS)[number];
export type RevoVisual = RevoChart | RevoNewChart;

/** The screens an `openScreen` action may open (REVO-31); the server has the same list. */
export const REVO_SCREENS = ['jumpTo', 'planEditor', 'memorized', 'activity', 'insights', 'dailyLog', 'settings', 'prayerTimes', 'qibla', 'reader'] as const;
export type RevoScreen = (typeof REVO_SCREENS)[number];

/** The Settings sections `openScreen` may show (with `screen: 'settings'`). */
export const REVO_SETTINGS_SECTIONS = ['activity', 'homeScreen', 'prayer', 'revision', 'revo', 'mushaf', 'notifications', 'appearance', 'testing'] as const;
export type RevoSettingsSection = (typeof REVO_SETTINGS_SECTIONS)[number];

export type RevoAction =
  | { kind: 'reviseFirst'; title: string; detail: string; pages: number[] }
  | { kind: 'openPage'; title: string; detail: string; page: number }
  | { kind: 'startRevision'; title: string; detail: string }
  | { kind: 'openScreen'; title: string; detail: string; screen: RevoScreen; section?: RevoSettingsSection; surah?: number; juz?: number };

export interface RevoMessage {
  id: string;
  role: 'user' | 'revo';
  text: string;
  at: number;
  textAfter?: string;
  chart?: RevoChart;
  /** A newer chart (never with `chart`): drawn instead of it. */
  visual?: RevoNewChart;
  action?: RevoAction;
  chips?: string[];
  /** What was attached, as chips: the first (every app version shows it), and all of them when there were several. */
  attach?: { kind: string; label: string };
  attachments?: { kind: string; label: string }[];
  feedback?: 'up' | 'down' | null;
  actionState?: 'added' | 'dismissed';
}

export interface RevoChat {
  id: string;
  kind: 'chat' | 'review';
  title: string;
  day: string;
  createdAt: number;
  updatedAt: number;
  turns: number;
  meta?: string;
}

export interface RevoMemoryItem {
  id: string;
  text: string;
  source: 'chat' | 'review';
  day: string;
  chatId?: string;
  at: number;
}

export interface RevoSettings {
  optIn: boolean;
  memoryOn: boolean;
}

export interface RevoAskResult {
  chatId: string;
  title: string;
  question: RevoMessage;
  reply: RevoMessage;
  remainingToday: number;
  cached: boolean;
}

/** Why a question was refused, as the app tells the user. */
/**
 * Why a question was refused: the day's questions, the month's cap, the day's share of it (resting),
 * Revo off on the account (the opt-in), off for everyone or not open to the account (paused, REVO-37),
 * a failure, the phone's clock, offline, or a deleted chat.
 */
export type RevoRefusal = 'daily' | 'monthly' | 'resting' | 'off' | 'paused' | 'unavailable' | 'clock' | 'offline' | 'gone';
