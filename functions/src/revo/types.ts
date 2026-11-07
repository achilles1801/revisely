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

export const REVO_PASSAGE_KEYS = ['today', 'startsAt', 'next', 'nextAt', 'weakNext', 'weak'] as const;
export type RevoPassageKey = (typeof REVO_PASSAGE_KEYS)[number];

export const REVO_INSIGHTS = ['coverage', 'consistency', 'weakSpots', 'pace'] as const;
export type RevoInsight = (typeof REVO_INSIGHTS)[number];

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

export type RevoChart = { kind: 'pageRatings'; title: string; pages: number[] } | { kind: 'dailyPages'; title: string; days: 7 | 30 };

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
}

/** A message as stored: the returned fields, the owner, and on a user message the attachment itself. */
export interface StoredMessage extends RevoMessage {
  uid: string;
  attachData?: RevoAttachment;
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
