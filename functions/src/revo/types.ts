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
  /**
   * `planned` and `done` from apps after Nov 7 2026; `caughtUp` (pages revised that day for earlier
   * days), `ahead` (for later days) and `started` (local "HH:MM", null when unknown) after Nov 9 2026.
   */
  week: { day: string; pages: number; planned?: number; done?: boolean; caughtUp?: number; ahead?: number; started?: string | null }[];
  /** Patterns the app read in the last days (REVO-40, the app's lib/revo/patterns), from apps after Nov 9 2026. */
  patterns?: RevoPattern[];
  /** The streak as Home shows it, from apps after Nov 7 2026. */
  streak?: { days: number; atRisk: { previous: number; yesterdayPlanned: number; yesterdayDone: number } | null };
  /**
   * The parts of the Qur'an the context names, in words, surah and juz first (the app's
   * lib/passages, e.g. "Al-Hashr, ayahs 1–10 · Juz 28"), from apps after Nov 7 2026.
   */
  passages?: Partial<Record<RevoPassageKey, string>>;
  /** Each page the context names, in words ("Al-Hashr, ayahs 17–24 · Juz 28"), keyed by page number. */
  pageNames?: Record<string, string>;
  /**
   * Their recitation (Recite with Mark mistakes, Revisely Dev only): what the app's lib/reciteInsights found in the
   * takes kept on the account. Sent only by Dev apps whose account recites; with it, the request carries the
   * recitation rules (recitation.ts) as a second system block.
   */
  recitation?: RevoRecitation;
  /**
   * Insights' Gaps and Last revised (BEHAVIOUR.md ACT-28, ACT-30), from Revisely Dev only (with `app: 'dev'`), from
   * Nov 16 2026: the app's lib/revo/gaps, checked in validate.ts and written out by gaps.ts.
   */
  gaps?: RevoGaps;
  /**
   * 'dev' from Revisely Dev (lib/variant's isDevVariant), from Nov 16 2026: the request then carries the Dev guide
   * (guide.ts DEV_GUIDE_SECTIONS) as a system block of its own. The store app never sends it.
   */
  app?: 'dev';
  /**
   * 'ar' when the app is in Arabic (Revisely Dev's language picker, from Nov 22 2026): the answer is asked for in Arabic
   * (prompt.ts ARABIC_SYSTEM, a system block of its own). English requests never carry it.
   */
  language?: 'ar';
  localTime: string | null;
}

/** A passage of one surah by its ayahs, with the app's words for it ("Al-Kahf, ayahs 22–23"). */
export interface RevoRecitedPassage {
  sura: number;
  from: number;
  to: number;
  name: string;
}

/** One ayah, with the app's short words for it ("Al-Baqarah 48"). */
export interface RevoRecitedAyah {
  sura: number;
  ayah: number;
  name: string;
}

/** Mistakes by kind, as Recite's summary counts them: never Not clear, never tajweed. */
export const REVO_MISTAKE_KINDS = ['wrong', 'skipped', 'added', 'harakat', 'letter'] as const;
export type RevoMistakeKinds = Record<(typeof REVO_MISTAKE_KINDS)[number], number>;

/** Weeks of scores the app sends, the current one last. */
export const REVO_RECITATION_WEEKS = 8;
export const REVO_RECITATION_LIST = 5;

/** What the app's Insights shows of their recitation over the last `days` revision days (the app's lib/reciteInsights). */
/** Insights' Gaps over the last 30 days, the full revision against the plan, and each memorized surah's last revision. */
export interface RevoGaps {
  /** Whole days since the last revision day (0 = today). */
  lastRevisedDaysAgo: number;
  /**
   * The longest gap, in days without revising (2 or more; still open: the days since the last revision, today
   * included); `endedDaysAgo` null while it is still open. Apps before Nov 20 2026 sent the days from one revision day
   * to the next, one more for a closed gap.
   */
  longestGap: { days: number; endedDaysAgo: number | null } | null;
  /** The usual step between revision days (1 = every day, 1.5 = every 1–2 days). */
  usualStepDays: number | null;
  /** Gaps (2 days or more without revising), the open one included. */
  longGaps: number;
  /** Pages the plan brings round later than their spacing, how far that pushed the full revision back, the plan's cycle. */
  fullRevision: { latePages: number; pushedBackDays: number; cycleDays: number } | null;
  /** Memorized surahs, longest since revised first: days since (null: never; `notYet`: memorized under 30 days ago). */
  surahs: { name: string; daysAgo: number | null; notYet?: true }[];
}

export interface RevoRecitation {
  /** The window, in revision days (28). */
  days: number;
  takes: number;
  /** Revision days with a take. */
  daysRecited: number;
  minutes: number;
  words: number;
  mistakes: number;
  kinds: RevoMistakeKinds;
  /** Not clear: never counted as mistakes. */
  unclear: number;
  /** Tajweed notes; null when no take in the window was at the Strict level. */
  tajweed: number | null;
  /**
   * The score by the page (0–1), each take weighted by the words it recited; null with no takes in the window, or when
   * every one ended without the checker's final answer (RECITE-11: those never count in a score).
   */
  score: number | null;
  /** The same for the `days` before. */
  earlierScore: number | null;
  /** Each week's score, oldest first, the current week last; null for a week with no takes. */
  weeks: (number | null)[];
  /** Words still marked on the page now, and words cleared in the window. */
  stillMarked: number;
  cleared: number;
  /** Passages with words still marked, the most slipped first. */
  slipping: { passage: RevoRecitedPassage; words: number; wordMistakes: number; wrong: number; tries: number; daysAgo: number }[];
  /** Slips into a similar ayah in the window (the checker's `into`), the most often first. */
  similar: { from: RevoRecitedAyah; into: RevoRecitedAyah; ending: boolean; times: number; also: number; daysAgo: number }[];
  /** The latest take, any time. */
  last: { daysAgo: number; passage: RevoRecitedPassage; score: number; mistakes: number; unclear: number; hidden: boolean; strict: boolean } | null;
  /**
   * The window's finished takes of REVO_PER_PAGE_FROM pages or more, their pages and mistakes (RECITE-24: the mistakes a
   * page Insights shows). Only when there are some: a summary without long takes is as before.
   */
  perPage?: { takes: number; pages: number; mistakes: number };
}

/** A take this many pages or longer says its mistakes a page (the app's PER_PAGE_FROM, lib/reciteLive/score). */
export const REVO_PER_PAGE_FROM = 2;

/** A mark's kind, finer detail and tajweed rule, as the checker names them (recite-contract.md). */
export const REVO_MARK_KINDS = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'] as const;
export const REVO_MARK_DETAILS = ['lookalike', 'sound', 'replaced', 'order', 'trail', 'shadda'] as const;
export const REVO_TAJWEED_RULES = [
  'madd_munfasil',
  'madd_muttasil',
  'madd_aared',
  'madd_lazim',
  'madd_dropped',
  'qalqalah',
  'ghunnah',
  'ikhfa',
  'idgham',
  'idgham_no_ghunnah',
  'iqlab',
] as const;

/** One mark of an attached take, in mushaf order. */
export interface RevoTakeMark {
  sura: number;
  ayah: number;
  /** The ayah in the app's short words ("Al-Baqarah 48"). */
  name: string;
  kind: (typeof REVO_MARK_KINDS)[number];
  /** A haraka or letter heard only past the normal bar: "Not clear", never a mistake. */
  unclear: boolean;
  detail?: (typeof REVO_MARK_DETAILS)[number];
  /** The word expected (the Qur'an's text); absent for an extra word. */
  expected?: string;
  /** What was heard instead: a real word, or the expected word with the heard haraka or letter. Never a sound spelt out. */
  heard?: string;
  rule?: (typeof REVO_TAJWEED_RULES)[number];
  /** Madds: counts heard, and counts set. */
  got?: number;
  set?: number;
  /** Went on with a similar ayah, or ended the ayah as `into` ends. */
  into?: { sura: number; ayah: number; name: string; ending: boolean; also: number };
}

/** What the app shows for one take (Recite with Mark mistakes), attached by the user. */
export interface RevoTakeFacts {
  daysAgo: number;
  passage: RevoRecitedPassage;
  level: 'words' | 'strict';
  hidden: boolean;
  secs: number;
  words: number;
  score: number;
  mistakes: number;
  unclear: number;
  tajweed: number;
  /** Its marks, at most REVO_TAKE_MARKS. */
  marks: RevoTakeMark[];
  /** Words this take cleared from the page. */
  cleared: number;
  /** The score of the take before it of the same passage, if any. */
  before: number | null;
}
export const REVO_TAKE_MARKS = 60;

/**
 * A pattern in the account's last days, found by the app from its own credits and session times
 * (REVO-40). Revo mentions at most one, when it fits; it never infers one itself.
 */
export type RevoPattern =
  /** `day`'s revision made up for `forDays` (`pages` caught up); whether Keep daily amount is on. */
  | { kind: 'catchingUp'; day: string; pages: number; forDays: string[]; keepDailyAmount: boolean }
  /** On `day`, `pages` revised ahead for the next `days` revision days; `quietDays` since had nothing left. */
  | { kind: 'aheadBurst'; day: string; pages: number; days: number; quietDays: number }
  /** `late` of the last `of` revision days with a known start began between 10 PM and 4 AM. */
  | { kind: 'lateNights'; late: number; of: number }
  /** A streak of `days`, each day this week done on its own day. */
  | { kind: 'steady'; days: number };

export const REVO_PATTERN_KINDS = ['catchingUp', 'aheadBurst', 'lateNights', 'steady'] as const;

/** `memorizedToday`: what was added as memorized today, by surah and ayah ("Al-Mulk, ayahs 1–20"; MEM-1), from apps after Nov 8 2026. */
export const REVO_PASSAGE_KEYS = ['today', 'startsAt', 'next', 'nextAt', 'weakNext', 'weak', 'memorizedToday'] as const;
export type RevoPassageKey = (typeof REVO_PASSAGE_KEYS)[number];

/** `recitation`: Insights' Recitation section (Revisely Dev). */
export const REVO_INSIGHTS = ['coverage', 'consistency', 'weakSpots', 'pace', 'recitation'] as const;
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
  | { kind: 'revisionDay'; label: string; day: string; facts: RevoDayFacts }
  /** A take with Mark mistakes (Revisely Dev), from Activity's hold menu or +. */
  | { kind: 'reciteTake'; label: string; day: string; facts: RevoTakeFacts };

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
  | { kind: 'table'; title: string; juz?: number[]; surahs?: number[]; columns: RevoTableColumn[] }
  /** Pages memorized each month, over the last 6 or 12. */
  | { kind: 'memorized'; title: string; months: RevoMemorizedMonths };
export const REVO_NEW_CHART_KINDS = ['juzMap', 'timeline', 'weeks', 'table', 'memorized'] as const;
export const REVO_MEMORIZED_MONTHS = [6, 12] as const;
export type RevoMemorizedMonths = (typeof REVO_MEMORIZED_MONTHS)[number];
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
