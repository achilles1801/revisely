/**
 * Revo's shapes, as the app and the server exchange and store them (the app's side is
 * src/lib/revo/types.ts; both follow the same contract).
 */

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

export interface RevoContext {
  totals: RevoTotals;
  today: {
    plannedPages: number;
    revisedPages: number;
    /** From apps after Nov 7 2026 (lib/todaySnapshot); absent from older ones. */
    carriedPages?: number;
    doneEarlier?: number;
    otherPages?: number;
    minutes: number;
    memorizedPages: number;
    nextPages: number[];
    weakNext: number[];
    done: boolean;
  };
  weakPages: number[];
  /** `planned` and `done` from apps after Nov 7 2026. */
  week: { day: string; pages: number; planned?: number; done?: boolean }[];
  /** The streak as Home shows it, from apps after Nov 7 2026. */
  streak?: { days: number; atRisk: { previous: number; yesterdayPlanned: number; yesterdayDone: number } | null };
  /**
   * The parts of the Qur'an the context names, in words, surah and juz first (the app's
   * lib/passages, e.g. "Al-Hashr, ayahs 1–10 · Juz 28"), from apps after Nov 7 2026.
   */
  passages?: Partial<Record<RevoPassageKey, string>>;
  /** Each page the context names, in words ("Al-Hashr, ayahs 17–24 · Juz 28"), keyed by page number. */
  pageNames?: Record<string, string>;
  localTime: string | null;
}

/** `memorizedToday`: what was added as memorized today, by surah and ayah ("Al-Mulk, ayahs 1–20"; MEM-1), from apps after Nov 8 2026. */
export const REVO_PASSAGE_KEYS = ['today', 'startsAt', 'next', 'nextAt', 'weakNext', 'weak', 'memorizedToday'] as const;
export type RevoPassageKey = (typeof REVO_PASSAGE_KEYS)[number];

export const REVO_INSIGHTS = ['coverage', 'consistency', 'weakSpots', 'pace'] as const;
export type RevoInsight = (typeof REVO_INSIGHTS)[number];

/** How often a part of the Qur'an was revised in a window (the app's lib/revo/facts). */
export interface RevoTimes {
  days: number;
  minEach: number;
  maxEach: number;
}

/** Its pages on the plan over past days: onDay + late + ahead + skipped = pages. */
export interface RevoPlanTally {
  days: number;
  pages: number;
  onDay: number;
  late: number;
  ahead: number;
  skipped: number;
  skippedDays: number;
}

/** What the app shows for a surah, a juz or some pages. */
export interface RevoPassageFacts {
  name: string;
  pages: number;
  memorized: number;
  revised: { last7: RevoTimes; last30: RevoTimes; all: RevoTimes };
  lastRevisedDaysAgo: number | null;
  oldest: { name: string; page: number; daysAgo: number | null } | null;
  neverRevised: number;
  plan: { last7: RevoPlanTally; last30: RevoPlanTally };
  strength: { weak: number; moderate: number; strong: number; unrated: number; average: number | null };
  weakSpots: { name: string; pages: number[]; rating: number }[];
  today: { pages: number; done: number } | null;
  next: { inDays: number; pages: number } | null;
}

/** What the app shows for one revision day. */
export interface RevoDayFacts {
  daysAgo: number;
  plan: { pages: number; name?: string; carried: number; onDay: number; ahead: number; late: number; notDone: number; done: boolean } | null;
  revised: { pages: number; name?: string; forLater: number; forEarlier: number };
  minutes: number | null;
  readMinutes: number | null;
  memorized: { pages: number; name?: string };
  ratings: { weak: number; moderate: number; strong: number; weakName?: string; weakPages: number[] };
  recordings: { count: number; minutes: number } | null;
  notes: string[] | null;
}

/**
 * What the user attached with +. The first five kinds come from apps before Nov 7 2026 and are
 * still accepted; newer apps send surah, juz, pages and revisionDay (with what the app shows for
 * them, `facts`), recording and insight.
 */
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
  | { kind: 'insight'; label: string; insight: RevoInsight }
  | { kind: 'surah'; label: string; surah: number; facts: RevoPassageFacts }
  | { kind: 'juz'; label: string; juz: number; facts: RevoPassageFacts }
  | { kind: 'pages'; label: string; pages: number[]; facts: RevoPassageFacts }
  | { kind: 'revisionDay'; label: string; day: string; facts: RevoDayFacts };

export type RevoChart = { kind: 'pageRatings'; title: string; pages: number[] } | { kind: 'dailyPages'; title: string; days: 7 | 30 };

/**
 * The charts after the first two (Nov 2026: Majd's interactive charts). They travel in a reply's
 * `visual`, which apps before them don't read, so those apps show the answer's words and never an
 * empty chart: an older app draws any `chart` it gets, and fell through to an empty bar chart for
 * a kind it didn't know. `chart` keeps carrying only the first two; newer apps draw
 * `visual ?? chart`. The app's side is src/lib/revo/types.ts.
 */
export type RevoNewChart =
  | { kind: 'juzMap'; title: string }
  /** Each revision of one surah or one juz (exactly one of them) over the last `days`. */
  | { kind: 'timeline'; title: string; surah?: number; juz?: number; days: RevoTimelineDays }
  /** The last `weeks` weeks (4–12), a day a cell: done, in part or missed. */
  | { kind: 'weeks'; title: string; weeks: number }
  /** Juz or surahs (exactly one list, 2–8 of them) side by side, in 1–3 of the columns. */
  | { kind: 'table'; title: string; juz?: number[]; surahs?: number[]; columns: RevoTableColumn[] };
export const REVO_NEW_CHART_KINDS = ['juzMap', 'timeline', 'weeks', 'table'] as const;
export const REVO_WEEKS = { min: 4, max: 12 } as const;
/** A table's columns, each worked out on the phone (lib/revo/facts passageFacts). */
export const REVO_TABLE_COLUMNS = ['lastRevised', 'times30', 'weak', 'strength', 'memorized'] as const;
export type RevoTableColumn = (typeof REVO_TABLE_COLUMNS)[number];
export const REVO_TABLE_ROWS = { min: 2, max: 8 } as const;
export const REVO_TABLE_MAX_COLUMNS = 3;
export const REVO_TIMELINE_DAYS = [30, 90, 365] as const;
export type RevoTimelineDays = (typeof REVO_TIMELINE_DAYS)[number];
export type RevoVisual = RevoChart | RevoNewChart;

/**
 * The screens an `openScreen` action may open (REVO-31). The app has the same list
 * (src/lib/revo/types.ts REVO_SCREENS); guide.test.ts checks they agree.
 */
export const REVO_SCREENS = ['jumpTo', 'planEditor', 'memorized', 'activity', 'insights', 'dailyLog', 'settings', 'prayerTimes', 'qibla', 'reader'] as const;
export type RevoScreen = (typeof REVO_SCREENS)[number];

/** The Settings sections `openScreen` may scroll to (with `screen: 'settings'`). */
export const REVO_SETTINGS_SECTIONS = ['activity', 'homeScreen', 'prayer', 'revision', 'revo', 'mushaf', 'notifications', 'appearance', 'testing'] as const;
export type RevoSettingsSection = (typeof REVO_SETTINGS_SECTIONS)[number];

export type RevoAction =
  | { kind: 'reviseFirst'; title: string; detail: string; pages: number[] }
  | { kind: 'openPage'; title: string; detail: string; page: number }
  | { kind: 'startRevision'; title: string; detail: string }
  | {
      kind: 'openScreen';
      title: string;
      detail: string;
      screen: RevoScreen;
      /** settings only: the section to show. */
      section?: RevoSettingsSection;
      /** reader only: where it opens, a surah (1–114) or a juz (1–30); neither opens the Read tab's list. */
      surah?: number;
      juz?: number;
    };

export interface RevoMessage {
  id: string;
  role: 'user' | 'revo';
  text: string;
  at: number;
  textAfter?: string;
  chart?: RevoChart;
  /** A newer chart kind (RevoNewChart), never set together with `chart`. */
  visual?: RevoNewChart;
  action?: RevoAction;
  chips?: string[];
  attach?: { kind: RevoAttachment['kind']; label: string };
  /** Every attachment's chip, when there were several (apps after Nov 7 2026 show them all; older ones show `attach`). */
  attachments?: { kind: RevoAttachment['kind']; label: string }[];
}

/** A message as stored: the returned fields, the owner, and on a user message the attachments themselves. */
export interface StoredMessage extends RevoMessage {
  uid: string;
  /** One attachment. */
  attachData?: RevoAttachment;
  /** Several (never set together with attachData). */
  attachList?: RevoAttachment[];
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
  uid: string;
  text: string;
  source: 'chat' | 'review';
  day: string;
  chatId: string;
  at: number;
}

export interface RevoSettings {
  optIn: boolean;
  memoryOn: boolean;
}

/** What Revo's reply holds once checked (reply.ts). */
export interface RevoReplyParts {
  text: string;
  textAfter?: string;
  chart?: RevoChart;
  visual?: RevoNewChart;
  action?: RevoAction;
  chips?: string[];
  remember: string[];
  title?: string;
}

/** A cached first answer (revoAnswers/{uid}__{hash}). */
export interface CachedAnswer {
  title: string;
  reply: Omit<RevoReplyParts, 'remember' | 'title'>;
}
