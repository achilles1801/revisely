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
   * its plan had, and whether the day was done, as the streak counts it.
   */
  week: { day: string; pages: number; planned: number; done: boolean }[];
  /**
   * The streak as Home shows it. `atRisk`: yesterday was missed but the run before it can still be
   * kept today by finishing yesterday's pages (SESS-6); Home shows `previous` dimmed.
   */
  streak: { days: number; atRisk: { previous: number; yesterdayPlanned: number; yesterdayDone: number } | null };
  localTime: string | null;
}

export type RevoInsight = 'coverage' | 'consistency' | 'weakSpots' | 'pace';

/** What the user adds with +: sent only with the question it was added to. */
export type RevoAttachment =
  | {
      kind: 'day';
      label: string;
      day: string;
      revisedPages: number[];
      memorizedPages: number[];
      readMinutes: number;
      minutes: number;
      ratings: { page: number; rating: number }[];
    }
  | {
      kind: 'page';
      label: string;
      pages: { page: number; rating: number | null; revisions: number; lastRevised: string | null; history: { day: string; rating: number }[] }[];
    }
  | { kind: 'note'; label: string; day: string; text: string }
  | { kind: 'recording'; label: string; day: string; of: 'revision' | 'reading'; seconds: number; pages: number[] }
  | { kind: 'insight'; label: string; insight: RevoInsight };

export type RevoChart =
  | { kind: 'pageRatings'; title: string; pages: number[] }
  | { kind: 'dailyPages'; title: string; days: 7 | 30 };

export type RevoAction =
  | { kind: 'reviseFirst'; title: string; detail: string; pages: number[] }
  | { kind: 'openPage'; title: string; detail: string; page: number }
  | { kind: 'startRevision'; title: string; detail: string };

export interface RevoMessage {
  id: string;
  role: 'user' | 'revo';
  text: string;
  at: number;
  textAfter?: string;
  chart?: RevoChart;
  action?: RevoAction;
  chips?: string[];
  attach?: { kind: RevoAttachment['kind']; label: string };
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
export type RevoRefusal = 'daily' | 'monthly' | 'off' | 'unavailable' | 'clock' | 'offline' | 'gone';
