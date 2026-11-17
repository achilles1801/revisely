/**
 * "Load test scenario" for testers (Settings → Testing, previewTester accounts
 * only): the caller's account is reset exactly as Reset my data does it (the
 * same backup first, testerReset.ts), then filled with one of the scenarios
 * below, written in the shapes the app itself writes: the user document, pages,
 * sessions, the Activity items beside them (revisionItems.ts and readItems.ts's
 * rules, ported here), timed readings, daily-log notes and recording records.
 *
 * Kept free of firebase-admin (testScenariosAdmin.ts writes), so the scenarios
 * can be built and checked anywhere: the functions' tests, the rules tests (each
 * scenario's documents written as the user) and the app's tests, which compare
 * the ports here with the app's own code.
 *
 * Days: the phone sends its time zone, its clock and, for the Fajr scenario, the
 * Fajr times its own prayer settings give (lib/fajrBoundary). The server checks
 * them (a real zone, a clock within 15 minutes of its own, each Fajr on its day)
 * and works out every revision day with the app's rule (activityDayAt): the
 * calendar day in that zone, or the day before until that day's Fajr.
 */

import { AuthInfo, ResetError, ResetResult, ResetStore, freshPage, resetTesterAccount } from './testerReset';
import { SILENCE_M4A_BASE64 } from './silence';
import {
  SLIPS,
  SeedClear,
  SeedTake,
  StoredMark,
  ayahKeysStartingOn,
  ayahWords,
  clearDocument,
  harakatMark,
  letterMark,
  pageWords,
  skippedMark,
  slipMark,
  tajweedMark,
  takeDocument,
  timeMarks,
  wrongWordMark,
} from './scenarioTakes';

// ============================================================================
// THE SCENARIOS
// ============================================================================

/**
 * The scenarios Settings offers testers (Majd, Nov 17 2026: "3 scenarios should be sufficient with the most
 * important being a super heavy user with a lot of activity and months of data"), in the order it lists them:
 * - heavy: seven months of a hafiz-sized memorizer: a juz a day, gaps, the daily log, recordings, sittings, Recite
 *   takes with marks, Revo's chats and memory;
 * - steady: six weeks, yesterday missed after a twelve-day run (the streak's grace ring, the catch-up offer);
 * - starting: a newer memorizer, two weeks in, Al-Mulk ayah by ayah, the first Recite takes.
 */
export const SCENARIO_IDS = ['heavy', 'steady', 'starting'] as const;

/**
 * Older, narrow situations the automated tests load (tests/scenarios, the rules tests) to check one rule each:
 * not offered in Settings since Nov 17 2026, still loadable by a tester's account.
 */
export const CHECK_SCENARIO_IDS = [
  'new',
  'beginner',
  'hafiz',
  'partial-today',
  'missed-days',
  'revise-ahead',
  'fajr-edge',
  'custom-reverse',
  'offline-queue',
] as const;

export const ALL_SCENARIO_IDS = [...SCENARIO_IDS, ...CHECK_SCENARIO_IDS] as const;
export type ScenarioId = (typeof ALL_SCENARIO_IDS)[number];

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && (ALL_SCENARIO_IDS as readonly string[]).includes(v);
}

// ============================================================================
// DAYS AND TIMES IN THE PHONE'S ZONE
// ============================================================================

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const formats = new Map<string, Intl.DateTimeFormat>();
function format(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formats.set(zone, f);
  }
  return f;
}

/** Whether `zone` is an IANA time zone this runtime knows. */
export function isZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    format(zone);
    return true;
  } catch {
    return false;
  }
}

function wall(ms: number, zone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const parts: Record<string, number> = {};
  for (const p of format(zone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return { y: parts.year, m: parts.month, d: parts.day, h: parts.hour % 24, mi: parts.minute, s: parts.second };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar day (YYYY-MM-DD) of `ms` in `zone`. */
export function calendarDay(ms: number, zone: string): string {
  const w = wall(ms, zone);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

function utcOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** The calendar day `n` days from `day`. */
export function addDays(day: string, n: number): string {
  const t = new Date(utcOf(day) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (calendarDaysBetween in lib/algorithm). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

function offsetOf(ms: number, zone: string): number {
  const w = wall(ms, zone);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/** The moment a wall-clock time on `day` happens in `zone`. */
export function wallMs(day: string, hour: number, minute: number, zone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const first = guess - offsetOf(guess, zone);
  return guess - offsetOf(first, zone);
}

/**
 * The revision day of a moment (lib/fajrBoundary, lib/activityDay's activityDayAt):
 * its calendar day, or with the Fajr boundary the day before until that day's Fajr.
 */
export function revisionDayAt(ms: number, zone: string, fajrOf: ((day: string) => number | null) | null): string {
  const day = calendarDay(ms, zone);
  if (!fajrOf) return day;
  const fajr = fajrOf(day);
  return fajr != null && ms < fajr ? addDays(day, -1) : day;
}

// ============================================================================
// WHAT THE PHONE SENDS
// ============================================================================

export interface SeedContext {
  /** The phone's IANA time zone. */
  zone: string;
  /** The phone's clock (ms). */
  now: number;
  /** For the Fajr scenario: the place, method and the Fajr of each calendar day around now. */
  fajr: null | {
    coords: { latitude: number; longitude: number };
    method: string;
    days: Record<string, number>;
  };
}

/** How far the phone's clock may be from the server's. */
export const CLOCK_SKEW_MS = 15 * MINUTE;

function bad(message: string): ResetError {
  return new ResetError('invalid-argument', message);
}

/** The scenario's context, checked; throws ResetError('invalid-argument') otherwise. */
export function parseContext(raw: unknown, serverNow: number, scenario: ScenarioId): SeedContext {
  if (!raw || typeof raw !== 'object') throw bad('The phone sent no time zone or clock.');
  const c = raw as Record<string, unknown>;
  if (!isZone(c.zone)) throw bad('The phone’s time zone is not one this server knows.');
  const now = c.now;
  if (typeof now !== 'number' || !Number.isFinite(now)) throw bad('The phone sent no clock.');
  if (Math.abs(now - serverNow) > CLOCK_SKEW_MS) {
    throw bad('The phone’s clock is more than 15 minutes off. Set it right and try again.');
  }
  if (scenario !== 'fajr-edge') return { zone: c.zone, now, fajr: null };

  const f = c.fajr as Record<string, unknown> | null | undefined;
  if (!f || typeof f !== 'object') throw bad('The Fajr scenario needs the phone’s Fajr times.');
  const coords = f.coords as { latitude?: unknown; longitude?: unknown } | undefined;
  const lat = coords?.latitude;
  const lon = coords?.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw bad('The Fajr scenario needs a location.');
  }
  if (typeof f.method !== 'string' || !/^[A-Za-z]{1,40}$/.test(f.method)) throw bad('Unknown Fajr method.');
  const daysRaw = f.days as Record<string, unknown> | undefined;
  if (!daysRaw || typeof daysRaw !== 'object' || Object.keys(daysRaw).length > 10) throw bad('Bad Fajr times.');
  const days: Record<string, number> = {};
  for (const [day, ms] of Object.entries(daysRaw)) {
    if (!DATE_RE.test(day) || typeof ms !== 'number' || !Number.isFinite(ms)) throw bad('Bad Fajr times.');
    // Each Fajr falls on its own calendar day, before noon.
    if (calendarDay(ms, c.zone) !== day || ms >= wallMs(day, 12, 0, c.zone)) throw bad('Bad Fajr times.');
    days[day] = ms;
  }
  const today = calendarDay(now, c.zone);
  for (let k = -3; k <= 0; k++) {
    if (days[addDays(today, k)] === undefined) throw bad('The phone sent too few Fajr times.');
  }
  return { zone: c.zone, now, fajr: { coords: { latitude: lat, longitude: lon }, method: f.method, days } };
}

// ============================================================================
// THE QURAN, AS FAR AS THE PLANS NEED IT
// ============================================================================

/** Each juz's pages (lib/quranData's JUZ_RANGES). */
export const JUZ_RANGES: [number, number][] = Array.from({ length: 30 }, (_, i) =>
  i === 0 ? [1, 21] : i === 29 ? [582, 604] : [20 * i + 2, 20 * i + 21],
);

export function juzPages(...juz: number[]): number[] {
  return juz.flatMap((j) => range(JUZ_RANGES[j - 1][0], JUZ_RANGES[j - 1][1]));
}

/**
 * The juz plan's juz of a page (lib/algorithm's juzKeyForPage): a surah that
 * spans more than two juz is cut by juz; a shorter one goes with the juz it
 * starts in. As runs of [first page, juz]; an app test checks all 604 pages.
 */
const JUZ_KEY_RUNS: [number, number][] = [
  [1, 1], [22, 2], [42, 3], [77, 4], [82, 5], [102, 6], [128, 7], [151, 8], [177, 9], [187, 10],
  [208, 11], [236, 12], [249, 13], [262, 14], [282, 15], [305, 16], [322, 17], [342, 18], [367, 19], [386, 20],
  [405, 21], [428, 22], [446, 23], [468, 24], [483, 25], [503, 26], [524, 27], [542, 28], [562, 29], [582, 30],
];

export function juzKeyForPage(page: number): number {
  let juz = 1;
  for (const [start, key] of JUZ_KEY_RUNS) if (page >= start) juz = key;
  return juz;
}

export function range(from: number, to: number): number[] {
  const out: number[] = [];
  if (from <= to) for (let p = from; p <= to; p++) out.push(p);
  else for (let p = from; p >= to; p--) out.push(p);
  return out;
}

// ============================================================================
// PLANS (lib/algorithm's scheduler, for the plans the scenarios use)
// ============================================================================

export type PlanSpec =
  | { mode: 'pages'; perDay: number; anchorDay: string }
  | { mode: 'juz'; perDay: number; anchorDay: string }
  | { mode: 'custom'; days: number[][]; startDay: string; direction: 'forward' | 'reverse' };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** The pages a plan gives `day`, with no carry-over (getPagesScheduledForDate). */
export function plannedPages(plan: PlanSpec, memorized: number[], day: string): number[] {
  if (memorized.length === 0) return [];
  if (plan.mode === 'custom') {
    const k = daysBetween(plan.startDay, day);
    if (k < 0 || plan.days.length === 0) return [];
    return [...plan.days[k % plan.days.length]];
  }
  const k = daysBetween(plan.anchorDay, day);
  if (k < 0) return [];
  const sorted = [...memorized].sort((a, b) => a - b);
  if (plan.mode === 'juz') {
    const juzList = [...new Set(sorted.map(juzKeyForPage))].sort((a, b) => a - b);
    const perDay = Math.max(1, Math.min(plan.perDay, juzList.length));
    const cycle = juzList.length / gcd(juzList.length, perDay);
    const offset = ((k % cycle) * perDay) % juzList.length;
    const out: number[] = [];
    for (let i = 0; i < perDay; i++) {
      const juz = juzList[(offset + i) % juzList.length];
      out.push(...sorted.filter((p) => juzKeyForPage(p) === juz));
    }
    return out;
  }
  const total = sorted.length;
  const perDay = Math.min(plan.perDay, total);
  if (perDay <= 0) return [];
  const offset = ((k * perDay) % total + total) % total;
  return Array.from({ length: perDay }, (_, i) => sorted[(offset + i) % total]);
}

// ============================================================================
// DOCUMENTS (times in ms; testScenariosAdmin.ts turns them into Timestamps)
// ============================================================================

export interface SeedSession {
  id: string;
  date: string;
  state: 'IN_PROGRESS' | 'COMPLETED';
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  durationMinutes: number | null;
  assignedPages: number[];
  totalAssignedPages: number;
  pagesRevised: number[];
  pagesSkipped: number[];
  weaknessUpdates: { pageNumber: number; previousRating: number; newRating: number; changedAt: number }[];
  ahead?: Record<string, number[]>;
  completionPercentage: number;
}

/** src/lib/revisionItems.ts's RevisionItem. */
export interface RevisionItem {
  id: string;
  uid: string;
  day: string;
  occurredAt: number;
  countsFor: string;
  source: 'session';
  pages: number[];
  skipped: number[];
  ratings?: Record<string, number>;
  assigned: number[];
  minutes: number | null;
  recordings: string[];
}

export interface MemorizationItem {
  id: string;
  uid: string;
  day: string;
  occurredAt: number;
  source: 'auto';
  pages: number[];
  minutes: number | null;
  recordings: string[];
  /** Ayahs memorized by the ayah that day (surah * 1000 + ayah), on a page memorized in part. */
  verses?: number[];
}

/** src/lib/readItems.ts's ReadItem. */
export interface ReadItem {
  id: string;
  uid: string;
  day: string;
  occurredAt: number;
  source: 'auto';
  pages: number[];
  minutes: number | null;
  recordings: string[];
  readingSessionId: string;
}

export interface SeedReading {
  id: string;
  date: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  mode: 'stopwatch';
  targetSeconds: null;
  pages: number[];
  pagesVisited: number[];
  createdAt: number;
  updatedAt: number;
}

export interface SeedNote {
  id: string;
  uid: string;
  day: string;
  at: number;
  kind: 'memorization' | 'revision' | 'note';
  text: string;
  minutes: number | null;
}

export interface SeedRecording {
  id: string;
  kind: 'revision' | 'reading';
  day: string;
  createdAt: number;
  durationMs: number;
  pageMarks: { atMs: number; page: number }[];
  segments: { fileName: string; durationMs: number; sizeBytes: number }[];
}

export interface SeedPage {
  pageNumber: number;
  /** 'learning': some of its ayahs memorized (`verses`), as the app stores a partly memorized page (MEM-1). */
  status: 'memorized' | 'learning';
  /** When it was memorized; null for a page memorized in part (the app keeps none until it is whole). */
  dateMemorized: number | null;
  /** A partly memorized page: when its first ayahs were memorized (not stored; the tests' "memorized by then"). */
  startedAt?: number;
  /** A partly memorized page's ayahs (surah * 1000 + ayah). */
  verses?: number[];
  lastRevisedAt: number | null;
  weaknessRating: number;
  totalRevisionCount: number;
  skipCount: number;
}

/** A Revo conversation as functions/src/revo/admin.ts stores it, with its messages. */
export interface SeedRevoChat {
  id: string;
  kind: 'chat' | 'review';
  title: string;
  day: string;
  createdAt: number;
  updatedAt: number;
  messages: { id: string; role: 'user' | 'revo'; text: string; at: number; chips?: string[] }[];
}

export interface SeedRevoMemory {
  id: string;
  text: string;
  source: 'chat' | 'review';
  day: string;
  chatId: string;
  at: number;
}

export interface SeedPlan {
  scenario: ScenarioId;
  /** The revision day the scenario is built around. */
  today: string;
  /** Fields over sign-up's user document. */
  user: Record<string, unknown>;
  pages: SeedPage[];
  sessions: SeedSession[];
  revisions: RevisionItem[];
  memorizations: MemorizationItem[];
  reads: ReadItem[];
  readingSessions: SeedReading[];
  notes: SeedNote[];
  recordings: SeedRecording[];
  /** Recite's memory (users/<uid>/reciteTakes): takes with Mark mistakes, and words cleared by hand. */
  takes: SeedTake[];
  clears: SeedClear[];
  /** Revo's conversations and memory (written as its functions write them). */
  revoChats: SeedRevoChat[];
  revoMemory: SeedRevoMemory[];
  /** Changes the phone queues itself and holds (offline-queue): outbox ops (lib/offline/ops). */
  outbox: Record<string, unknown>[];
}

export const SILENCE_BYTES = 1008;
export function silenceBytes(): Buffer {
  return Buffer.from(SILENCE_M4A_BASE64, 'base64');
}

const MAX_MINUTES = 1440;
function minutesOf(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.min(MAX_MINUTES, Math.max(0, Math.round(value)));
}

/** A session's Revised items (lib/revisionItems' revisionItemsFor). */
export function revisionItemsFor(session: SeedSession, uid: string): RevisionItem[] {
  const day = session.date;
  const occurredAt = session.createdAt;
  const ahead = session.ahead ?? {};
  const aheadPages = new Set(Object.values(ahead).flat());
  // A page of the day's own revised again for a day a cycle on stays the day's (AHEAD-3).
  const assigned = new Set(session.assignedPages);
  const ratings: Record<string, number> = {};
  for (const w of session.weaknessUpdates) ratings[String(w.pageNumber)] = w.newRating;
  const own: RevisionItem = {
    id: day,
    uid,
    day,
    occurredAt,
    countsFor: day,
    source: 'session',
    pages: session.pagesRevised.filter((p) => !aheadPages.has(p) || assigned.has(p)),
    skipped: session.pagesSkipped,
    assigned: session.assignedPages,
    minutes: minutesOf(session.durationMinutes),
    recordings: [],
    ...(Object.keys(ratings).length > 0 ? { ratings } : {}),
  };
  const credited = Object.entries(ahead)
    .filter(([, pages]) => pages.length > 0)
    .map(([countsFor, pages]): RevisionItem => ({
      id: countsFor !== day ? `${day}-ahead-${countsFor}` : day,
      uid,
      day,
      occurredAt,
      countsFor,
      source: 'session',
      pages: [...pages],
      skipped: [],
      assigned: [],
      minutes: null,
      recordings: [],
    }));
  return own.pages.length > 0 ? [own, ...credited] : credited;
}

/** A timed reading's Read item (lib/readItems' readItemFor). */
export function readItemFor(reading: SeedReading, uid: string): ReadItem {
  return {
    id: reading.id,
    uid,
    day: reading.date,
    occurredAt: reading.startedAt,
    source: 'auto',
    pages: [...reading.pages],
    minutes: minutesOf(reading.durationSeconds / 60),
    recordings: [],
    readingSessionId: reading.id,
  };
}

// ============================================================================
// BUILDING A SCENARIO
// ============================================================================

/** A small, fixed random source: the same scenario on the same day is the same. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

interface SessionSpec {
  /** Pages revised of the day's own: all of them, or the first n. */
  revise?: 'all' | number;
  /** When it was opened (ms); default 20:00 on the day. */
  at?: number;
  minutes?: number;
  /** Pages of later days revised in it (credited ahead). */
  ahead?: Record<string, number[]>;
  /** Pages rated in it: [page, rating]. */
  ratings?: [number, number][];
}

class Builder {
  readonly today: string;
  private readonly rand: () => number;
  private readonly memorized = new Map<number, number>();
  /** Pages memorized in part: when their first ayahs were, and the ayahs. */
  private readonly partial = new Map<number, { at: number; verses: number[] }>();
  private readonly memorizedOn = new Map<string, { at: number; pages: number[]; verses: number[]; minutes: number | null }>();
  private readonly ratings = new Map<number, number>();
  plan: PlanSpec | null = null;
  readonly user: Record<string, unknown> = {};
  readonly sessions: SeedSession[] = [];
  readonly readingSessions: SeedReading[] = [];
  readonly notes: SeedNote[] = [];
  readonly recordings: SeedRecording[] = [];
  readonly takes: SeedTake[] = [];
  readonly clears: SeedClear[] = [];
  readonly revoChats: SeedRevoChat[] = [];
  readonly revoMemory: SeedRevoMemory[] = [];
  outbox: Record<string, unknown>[] = [];

  constructor(
    readonly scenario: ScenarioId,
    readonly ctx: SeedContext,
    readonly uid: string,
  ) {
    this.today = this.dayOf(ctx.now);
    let seed = 0;
    for (const ch of `${scenario}:${this.today}`) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
    this.rand = random(seed);
  }

  private readonly days = new Map<number, string>();

  /** The revision day of a moment, Fajr-aware when the scenario has the boundary on. */
  dayOf(ms: number): string {
    let day = this.days.get(ms);
    if (day === undefined) {
      const fajr = this.ctx.fajr;
      day = revisionDayAt(ms, this.ctx.zone, fajr ? (d) => fajr.days[d] ?? null : null);
      this.days.set(ms, day);
    }
    return day;
  }

  /** The scenario's random source, 0 to 1. */
  rand01(): number {
    return this.rand();
  }

  /** A wall-clock time on a calendar day. */
  at(day: string, hour: number, minute = 0): number {
    return wallMs(day, hour, minute, this.ctx.zone);
  }

  /** The start of the revision day `day` (its midnight; its Fajr with the boundary on). */
  startOf(day: string): number {
    return this.ctx.fajr?.days[day] ?? this.at(day, 0, 0);
  }

  /** Now, to the quarter hour before it: loads a minute apart build the same scenario. */
  get quarterHour(): number {
    return Math.floor(this.ctx.now / (15 * MINUTE)) * 15 * MINUTE;
  }

  /** A moment today that has passed, `minutesAgo` before now (to the quarter hour) when today allows. */
  earlierToday(minutesAgo: number): number {
    return Math.max(this.startOf(this.today) + MINUTE, this.quarterHour - minutesAgo * MINUTE);
  }

  id(n = 20): string {
    let s = '';
    for (let i = 0; i < n; i++) s += ID_CHARS[Math.floor(this.rand() * ID_CHARS.length)];
    return s;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.rand() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.rand() < p;
  }

  /** Pages memorized at `at` (one Memorized item on that revision day). */
  memorize(pages: number[], at: number, minutes: number | null = null): void {
    const day = this.dayOf(at);
    const fresh = pages.filter((p) => !this.memorized.has(p));
    for (const p of fresh) {
      this.memorized.set(p, at);
      this.partial.delete(p);
    }
    if (fresh.length === 0) return;
    const item = this.memorizedOn.get(day);
    if (item) item.pages.push(...fresh);
    else this.memorizedOn.set(day, { at, pages: [...fresh], verses: [], minutes });
  }

  /**
   * The first ayahs of a page memorized at `at`, the page still partly memorized (MEM-1): it joins the revision
   * plan (MEM-4), and the day's Memorized item holds them by the ayah, as the app writes it.
   */
  memorizeAyahs(page: number, verses: number[], at: number, minutes: number | null = null): void {
    if (this.memorized.has(page) || verses.length === 0) return;
    const had = this.partial.get(page);
    this.partial.set(page, { at: had?.at ?? at, verses: [...new Set([...(had?.verses ?? []), ...verses])].sort((a, b) => a - b) });
    const day = this.dayOf(at);
    const item = this.memorizedOn.get(day);
    if (item) {
      if (!item.pages.includes(page)) item.pages.push(page);
      item.verses.push(...verses);
    } else this.memorizedOn.set(day, { at, pages: [page], verses: [...verses], minutes });
  }

  /** The memorized pages as of `day` (all of them without a day). */
  memorizedPages(day?: string): number[] {
    const out: number[] = [];
    for (const [page, at] of this.memorized) if (!day || this.dayOf(at) <= day) out.push(page);
    return out.sort((a, b) => a - b);
  }

  /** The pages revised as of `day`: memorized, or memorized in part (MEM-4). */
  revisablePages(day?: string): number[] {
    const out = this.memorizedPages(day);
    for (const [page, p] of this.partial) if (!day || this.dayOf(p.at) <= day) out.push(page);
    return out.sort((a, b) => a - b);
  }

  /** The plan's pages for `day`, from the pages memorized (or begun) by then. */
  pagesFor(day: string, memorizedByThen = false): number[] {
    if (!this.plan) throw new Error('no plan');
    return plannedPages(this.plan, this.revisablePages(memorizedByThen ? day : undefined), day);
  }

  /** A take with Mark mistakes (Recite's memory), its marks timed from its first word. */
  take(spec: Omit<SeedTake, 'id' | 'day' | 'marks'> & { marks: StoredMark[] }): SeedTake {
    const t: SeedTake = { ...spec, id: this.id(), day: this.dayOf(spec.createdAt), marks: timeMarks(spec.marks, spec.from) };
    this.takes.push(t);
    return t;
  }

  /** "Clear now" on a word's remembered mistake. */
  clear(w: number, group: SeedClear['group'], at: number): void {
    this.clears.push({ id: this.id(), createdAt: at, day: this.dayOf(at), w, group });
  }

  /** A Revo conversation: [role, text, chips?] in turn, a minute or two apart from `at`. */
  revoChat(kind: SeedRevoChat['kind'], title: string, at: number, turns: [SeedRevoChat['messages'][number]['role'], string, string[]?][]): SeedRevoChat {
    const id = kind === 'review' ? `review-${this.dayOf(at)}` : this.id();
    const messages = turns.map(([role, text, chips], i) => ({
      id: this.id(),
      role,
      text,
      at: at + i * 90_000,
      ...(chips ? { chips } : {}),
    }));
    const chat: SeedRevoChat = { id, kind, title, day: this.dayOf(at), createdAt: at, updatedAt: messages[messages.length - 1].at, messages };
    this.revoChats.push(chat);
    return chat;
  }

  /** Something Revo remembers, from a conversation. */
  revoRemember(chat: SeedRevoChat, text: string): void {
    this.revoMemory.push({ id: this.id(), text, source: chat.kind, day: chat.day, chatId: chat.id, at: chat.updatedAt });
  }

  session(day: string, spec: SessionSpec = {}, assigned = this.pagesFor(day)): SeedSession {
    const own = spec.revise === undefined || spec.revise === 'all' ? assigned : assigned.slice(0, spec.revise);
    const aheadPages = Object.values(spec.ahead ?? {}).flat();
    const at = spec.at ?? this.at(day, 20, this.int(0, 50));
    const minutes = spec.minutes ?? Math.max(1, Math.round(own.length * 1.5 + this.int(0, 4)));
    const done = own.length === assigned.length && assigned.length > 0;
    const end = at + minutes * MINUTE;
    const weaknessUpdates = (spec.ratings ?? []).map(([page, rating], i) => {
      const previousRating = this.ratings.get(page) ?? 4;
      this.ratings.set(page, rating);
      return { pageNumber: page, previousRating, newRating: rating, changedAt: at + (i + 1) * MINUTE };
    });
    const session: SeedSession = {
      id: day,
      date: day,
      state: done ? 'COMPLETED' : 'IN_PROGRESS',
      createdAt: at,
      updatedAt: end,
      completedAt: done ? end : null,
      durationMinutes: minutes,
      assignedPages: [...assigned],
      totalAssignedPages: assigned.length,
      pagesRevised: [...own, ...aheadPages],
      pagesSkipped: [],
      weaknessUpdates,
      ...(spec.ahead ? { ahead: spec.ahead } : {}),
      completionPercentage: assigned.length ? Math.round((own.length / assigned.length) * 100) : 0,
    };
    this.sessions.push(session);
    return session;
  }

  reading(startedAt: number, minutes: number, pages: number[]): SeedReading {
    const reading: SeedReading = {
      id: this.id(),
      date: this.dayOf(startedAt),
      startedAt,
      endedAt: startedAt + minutes * MINUTE,
      durationSeconds: minutes * 60,
      mode: 'stopwatch',
      targetSeconds: null,
      pages,
      pagesVisited: pages,
      createdAt: startedAt + minutes * MINUTE,
      updatedAt: startedAt + minutes * MINUTE,
    };
    this.readingSessions.push(reading);
    return reading;
  }

  note(at: number, kind: SeedNote['kind'], text: string, minutes: number | null = null): SeedNote {
    const note: SeedNote = { id: this.id(), uid: this.uid, day: this.dayOf(at), at, kind, text, minutes };
    this.notes.push(note);
    return note;
  }

  recording(at: number, pages: number[], kind: SeedRecording['kind'] = 'revision'): SeedRecording {
    const id = `${at}-${this.id(6).toLowerCase()}`;
    const rec: SeedRecording = {
      id,
      kind,
      day: this.dayOf(at),
      createdAt: at,
      durationMs: 1000,
      pageMarks: pages.map((page, i) => ({ atMs: Math.round((i * 1000) / Math.max(1, pages.length)), page })),
      segments: [{ fileName: `${id}-0.m4a`, durationMs: 1000, sizeBytes: SILENCE_BYTES }],
    };
    this.recordings.push(rec);
    return rec;
  }

  /** The schedule fields of the user document for the plan. */
  usePlan(plan: PlanSpec): void {
    this.plan = plan;
    const noon = (day: string) => new Date(this.at(day, 12, 0)).toISOString();
    if (plan.mode === 'custom') {
      Object.assign(this.user, {
        scheduleMode: 'pages',
        dailyPageCapacity: plan.days[0]?.length || 5,
        scheduleAnchorDate: noon(plan.startDay),
        customPlan: { days: plan.days.map((pages) => ({ pages })), cycleStartDate: plan.startDay, direction: plan.direction },
      });
    } else if (plan.mode === 'juz') {
      Object.assign(this.user, {
        scheduleMode: 'juz',
        dailyJuzCount: plan.perDay,
        dailyPageCapacity: 20,
        scheduleAnchorDate: noon(plan.anchorDay),
        customPlan: null,
      });
    } else {
      Object.assign(this.user, {
        scheduleMode: 'pages',
        dailyPageCapacity: plan.perDay,
        scheduleAnchorDate: noon(plan.anchorDay),
        customPlan: null,
      });
    }
  }

  build(): SeedPlan {
    const sessions = [...this.sessions].sort((a, b) => a.date.localeCompare(b.date));
    // Pages as the app derives them from the sessions (lib/algorithm's recomputePagesFromLogs).
    const pages: SeedPage[] = this.revisablePages().map((pageNumber) => {
      let last: number | null = null;
      let lastDay: string | null = null;
      let count = 0;
      let rating = 4;
      for (const s of sessions) {
        if (s.pagesRevised.includes(pageNumber)) {
          count++;
          // The day's midnight UTC, as the app's self-heal stores a page's last revised day: a first launch then
          // finds nothing to rewrite (the heavy scenario's 450 pages included).
          last = utcOf(s.date);
          lastDay = s.date;
        }
        const w = s.weaknessUpdates.find((x) => x.pageNumber === pageNumber);
        if (w) rating = w.newRating;
      }
      let skipCount = 0;
      for (const s of sessions) {
        if (lastDay && s.date <= lastDay) continue;
        if (s.pagesSkipped.includes(pageNumber)) skipCount++;
      }
      const part = this.partial.get(pageNumber);
      return {
        pageNumber,
        status: part ? 'learning' : 'memorized',
        dateMemorized: part ? null : this.memorized.get(pageNumber)!,
        ...(part ? { startedAt: part.at, verses: part.verses } : {}),
        lastRevisedAt: last,
        weaknessRating: rating,
        totalRevisionCount: count,
        skipCount,
      };
    });

    const done = sessions.filter((s) => s.state === 'COMPLETED');
    const revisedDays = sessions.filter((s) => s.pagesRevised.length > 0).map((s) => s.date);
    let streak = 0;
    const doneDays = new Set(done.map((s) => s.date));
    for (let d = doneDays.has(this.today) ? this.today : addDays(this.today, -1); doneDays.has(d); d = addDays(d, -1)) {
      streak++;
    }
    Object.assign(this.user, {
      onboardingComplete: true,
      // Every "What's new" seen (the app's SEEN_ALL, src/lib/help/whatsNew): a loaded scenario opens on
      // Home, not on a walkthrough. Testers replay it from Settings → About or Settings → Testing.
      whatsNewSeen: 'all',
      totalMemorizedPages: pages.filter((p) => p.status === 'memorized').length,
      totalLearningPages: pages.filter((p) => p.status === 'learning').length,
      totalSessionsCompleted: done.length,
      totalPagesRevisedAllTime: sessions.reduce((n, s) => n + s.pagesRevised.length, 0),
      streak,
      lastRevisionDate: revisedDays.length ? revisedDays[revisedDays.length - 1] : null,
    });

    const memorizations: MemorizationItem[] = [...this.memorizedOn.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, m]) => ({
        id: day,
        uid: this.uid,
        day,
        occurredAt: m.at,
        source: 'auto',
        pages: [...m.pages].sort((a, b) => a - b),
        minutes: m.minutes,
        recordings: [],
        // An item added by the ayah counts by its ayahs (lib/memorizedAyahs' memorizedItemShare), as
        // firestoreService.addMemorizationPages writes it. The scenarios add ayahs on days of their own.
        ...(m.verses.length > 0 ? { verses: [...new Set(m.verses)].sort((a, b) => a - b) } : {}),
      }));

    return {
      scenario: this.scenario,
      today: this.today,
      user: this.user,
      pages,
      sessions,
      revisions: sessions.flatMap((s) => revisionItemsFor(s, this.uid)),
      memorizations,
      reads: this.readingSessions.map((r) => readItemFor(r, this.uid)),
      readingSessions: this.readingSessions,
      notes: this.notes,
      recordings: this.recordings,
      takes: [...this.takes].sort((a, b) => a.createdAt - b.createdAt),
      clears: this.clears,
      revoChats: this.revoChats,
      revoMemory: this.revoMemory,
      outbox: this.outbox,
    };
  }
}

/** Builds a scenario for `uid`, from the phone's context. Pure: the same input, the same documents. */
export function buildScenario(scenario: ScenarioId, ctx: SeedContext, uid: string): SeedPlan {
  const b = new Builder(scenario, ctx, uid);
  const D = b.today;
  const day = (k: number) => addDays(D, k);

  switch (scenario) {
    case 'heavy':
      buildHeavy(b);
      break;
    case 'steady':
      buildSteady(b);
      break;
    case 'starting':
      buildStarting(b);
      break;
    case 'new': {
      // Just onboarded: Juz 30, five pages a day from today, nothing done.
      b.memorize(juzPages(30), b.earlierToday(5));
      b.usePlan({ mode: 'pages', perDay: 5, anchorDay: D });
      break;
    }
    case 'beginner': {
      // Juz 30, two pages a day for a week, with two days missed and one left half done.
      b.memorize(juzPages(30), b.at(day(-8), 20));
      b.usePlan({ mode: 'pages', perDay: 2, anchorDay: day(-7) });
      b.session(day(-7));
      b.session(day(-6));
      b.session(day(-4));
      b.session(day(-3), { revise: 1 });
      b.session(day(-1));
      b.note(b.at(day(-6), 21), 'note', 'Juz 30 is going well. An-Naba feels solid.');
      b.note(b.at(day(-1), 21), 'revision', 'Two pages, steady', 6);
      break;
    }
    case 'hafiz': {
      // All 604 pages, one juz a day for 60 days: a few days missed, one left half
      // done, ratings, and recordings on the last three days.
      b.memorize(range(1, 604), b.at(day(-400), 20));
      b.usePlan({ mode: 'juz', perDay: 1, anchorDay: day(-60) });
      Object.assign(b.user, { smartTrackingEnabled: true, hasSeenSmartTrackingPreview: true });
      const missed = new Set([-55, -41, -33, -20, -9]);
      for (let k = -60; k <= -1; k++) {
        if (missed.has(k)) continue;
        const pages = b.pagesFor(day(k));
        const rated = [pages[b.int(0, pages.length - 1)], pages[b.int(0, pages.length - 1)]];
        b.session(day(k), {
          revise: k === -12 ? Math.floor(pages.length / 2) : 'all',
          minutes: b.int(25, 45),
          ratings: [...new Set(rated)].map((p) => [p, b.int(1, 5)] as [number, number]),
        });
      }
      for (const k of [-3, -2, -1]) {
        if (missed.has(k)) continue;
        const pages = b.pagesFor(day(k));
        b.recording(b.at(day(k), 20, 55), pages.slice(0, 2));
      }
      break;
    }
    case 'partial-today': {
      // Juz 29–30, five a day: yesterday left with two pages, today's session half done.
      b.memorize(juzPages(29, 30), b.at(day(-20), 20));
      b.usePlan({ mode: 'pages', perDay: 5, anchorDay: day(-5) });
      for (const k of [-5, -4, -3, -2]) b.session(day(k));
      b.session(day(-1), { revise: 3 });
      b.session(D, { revise: 2, at: b.earlierToday(20), minutes: 4 });
      break;
    }
    case 'missed-days': {
      // Juz 30, three a day: the last session three days ago.
      b.memorize(juzPages(30), b.at(day(-20), 20));
      b.usePlan({ mode: 'pages', perDay: 3, anchorDay: day(-10) });
      for (let k = -10; k <= -3; k++) b.session(day(k));
      break;
    }
    case 'revise-ahead': {
      // Juz 30, three a day: today done, and two of tomorrow's pages revised ahead.
      b.memorize(juzPages(30), b.at(day(-10), 20));
      b.usePlan({ mode: 'pages', perDay: 3, anchorDay: day(-3) });
      for (const k of [-3, -2, -1]) b.session(day(k));
      const ahead = b.pagesFor(day(1)).slice(0, 2);
      b.session(D, { at: b.earlierToday(30), minutes: 9, ahead: { [day(1)]: ahead } });
      break;
    }
    case 'fajr-edge': {
      // The Fajr boundary on: a session opened at 00:30 and one just before Fajr,
      // each on the day before the calendar's, a note at 00:40 and a reading
      // before Fajr likewise.
      const fajr = ctx.fajr!;
      Object.assign(b.user, {
        fajrBoundaryEnabled: true,
        locationCoords: fajr.coords,
        fajrCalculationMethod: fajr.method,
      });
      b.memorize(juzPages(30), b.at(day(-10), 20));
      b.usePlan({ mode: 'pages', perDay: 3, anchorDay: day(-4) });
      b.session(day(-4));
      b.session(day(-3), { at: b.at(day(-3), 21) });
      // 00:30 on the calendar day after day(-2): still day(-2) (before that day's Fajr).
      const halfPastMidnight = b.at(day(-1), 0, 30);
      const beforeFajr = fajr.days[D] - 10 * MINUTE;
      if (b.dayOf(halfPastMidnight) !== day(-2) || b.dayOf(beforeFajr) !== day(-1)) {
        throw new ResetError('failed-precondition', 'Fajr falls before 00:30 here; this scenario needs a place where it doesn’t.');
      }
      b.session(day(-2), { at: halfPastMidnight });
      b.session(day(-1), { at: beforeFajr, minutes: 5 });
      b.note(b.at(day(-1), 0, 40), 'note', 'Revised after midnight, before Fajr.');
      b.reading(beforeFajr - 30 * MINUTE, 15, b.pagesFor(day(-1)));
      break;
    }
    case 'custom-reverse': {
      // A reverse custom plan of Juz 30, four pages a day, each day starting on
      // the page the day before ended on.
      b.memorize(juzPages(30), b.at(day(-10), 20));
      const days: number[][] = [];
      for (let start = 604; start > 582; start -= 3) days.push(range(start, Math.max(582, start - 3)));
      b.usePlan({ mode: 'custom', days, startDay: day(-2), direction: 'reverse' });
      b.session(day(-2));
      b.session(day(-1));
      break;
    }
    case 'offline-queue': {
      // Juz 30, three a day, two days done; the phone then queues today's session,
      // a note and a timed reading, and holds them (lib/testScenarios).
      b.memorize(juzPages(30), b.at(day(-10), 20));
      b.usePlan({ mode: 'pages', perDay: 3, anchorDay: day(-2) });
      b.session(day(-2));
      b.session(day(-1));
      const pages = b.pagesFor(D);
      const at = b.earlierToday(15);
      b.outbox = [
        {
          kind: 'session.add',
          date: D,
          assignedPages: pages,
          pagesRevised: pages,
          pagesSkipped: [],
          weaknessUpdates: [],
          durationAtLeast: 9,
          durationAdd: 9,
        },
        {
          kind: 'journal.entry.add',
          date: D,
          entry: { id: b.id(), at: ctx.now, kind: 'revision', text: 'Revised offline, held to test syncing', minutes: 9 },
        },
        {
          kind: 'reading.add',
          id: b.id(),
          session: {
            date: D,
            startedAt: at,
            endedAt: at + 8 * MINUTE,
            durationSeconds: 480,
            mode: 'stopwatch',
            targetSeconds: null,
            pages: pages.slice(0, 2),
            pagesVisited: pages.slice(0, 2),
          },
        },
      ];
      break;
    }
  }
  return b.build();
}

// ============================================================================
// THE THREE STORIES SETTINGS OFFERS
// ============================================================================

/** Is `day` a Friday (the calendar day)? */
function isFriday(day: string): boolean {
  return new Date(`${day}T12:00:00Z`).getUTCDay() === 5;
}

const REVISION_NOTES = [
  'Strong today, only one hesitation.',
  'Slow start, then it flowed.',
  'Revised after Fajr before work.',
  'Tired, but finished the juz.',
  'Mixed up two similar ayat again.',
  'Kept stumbling on the same page; read it twice.',
  'Smooth. Recited most of it from memory.',
  'Split it: half after Fajr, half after Isha.',
  'Listened to the reciter first, then revised.',
  'Good day. The new pages are settling.',
];
const DAY_NOTES = [
  'Travelling tomorrow; will revise on the train.',
  'Family visiting, a short day.',
  'Taught my son An-Naba tonight.',
  'Need to slow down on the long ayat.',
  'Halaqa tonight: recited to the teacher.',
  'Felt the difference after a week of no gaps.',
];

/**
 * Takes with Mark mistakes over `days` (offsets from today), on `passages` (each a run of pages), as Recite keeps
 * them: one to a few a day; each over a page or two (now and then stopping part way), at Words & harakat or Strict,
 * the page shown or hidden; a few marks of every kind, and the well-known slips (SLIPS) wrong as `slipWrong` says.
 */
function reciteTakes(
  b: Builder,
  opts: {
    days: number[];
    passages: { pages: number[]; weight: number }[];
    perDay: [number, number];
    strict: number;
    hidden: number;
    /** How likely each of SLIPS is said wrong in a take that reaches it, `k` days from today. */
    slipWrong: (slip: number, k: number) => number;
    /** Marks of their own a take finds, by how many: [none, one, two, three]. */
    marks: [number, number, number, number];
    /** Words that keep slipping (a haraka): how likely each is said wrong when reached. */
    sticky?: { w: number; wrong: number }[];
    /** A passage taken at most once from that day on (a word left one right take short of clearing). */
    onceFrom?: { pages: number[]; k: number };
  },
): void {
  const total = opts.passages.reduce((n, p) => n + p.weight, 0);
  let onceTaken = false;
  for (const k of opts.days) {
    const day = addDays(b.today, k);
    const n = b.int(opts.perDay[0], opts.perDay[1]);
    // Morning or night; today's before now.
    let at = k === 0 ? b.earlierToday(20 + n * 8) : b.chance(0.55) ? b.at(day, 6, b.int(10, 50)) : b.at(day, 21, b.int(0, 50));
    // Today's end before now (a load just after midnight has room for fewer).
    const until = k === 0 ? b.quarterHour : Infinity;
    for (let i = 0; i < n; i++) {
      let roll = b.int(1, total);
      let passage = opts.passages[0];
      for (const p of opts.passages) {
        roll -= p.weight;
        if (roll <= 0) {
          passage = p;
          break;
        }
      }
      if (opts.onceFrom && passage.pages === opts.onceFrom.pages && k >= opts.onceFrom.k) {
        if (onceTaken) continue;
        onceTaken = true;
      }
      const memorized = new Set(b.memorizedPages(day));
      const pages = passage.pages.filter((p) => memorized.has(p));
      if (pages.length === 0) continue;
      const first = b.int(0, pages.length - 1);
      const two = first + 1 < pages.length && b.chance(0.3);
      const from = pageWords(pages[first])[0];
      let to = pageWords(pages[two ? first + 1 : first])[1];
      if (b.chance(0.15)) to = from + Math.floor((to - from) * (0.4 + b.rand01() * 0.4));
      const level: SeedTake['level'] = b.chance(opts.strict) ? 'strict' : 'words';
      const marks = new Map<number, StoredMark>();
      const add = (m: StoredMark | null) => {
        if (m && m.w >= from && m.w <= to && !marks.has(m.w)) marks.set(m.w, m);
      };
      SLIPS.forEach((slip, s) => {
        if (slip.w >= from && slip.w <= to && b.chance(opts.slipWrong(s, k))) add(slipMark(b.id(8), slip));
      });
      for (const st of opts.sticky ?? []) if (st.w >= from && st.w <= to && b.chance(st.wrong)) add(harakatMark(b.id(8), st.w, () => b.rand01()));
      const roll2 = b.rand01();
      const own = roll2 < opts.marks[0] ? 0 : roll2 < opts.marks[0] + opts.marks[1] ? 1 : roll2 < opts.marks[0] + opts.marks[1] + opts.marks[2] ? 2 : 3 + b.int(0, 1);
      for (let j = 0; j < own; j++) {
        const w = b.int(from, to);
        const kind = b.rand01();
        if (kind < 0.25) add(skippedMark(b.id(8), w));
        else if (kind < 0.62) add(harakatMark(b.id(8), w, () => b.rand01(), b.chance(0.25) ? 'likely' : 'clear'));
        else if (kind < 0.8) add(letterMark(b.id(8), w, () => b.rand01()));
        else add(wrongWordMark(b.id(8), w, b.int(from, to)));
      }
      if (level === 'strict') for (let j = b.int(1, 3); j > 0; j--) add(tajweedMark(b.id(8), b.int(from, to), () => b.rand01()));
      const secs = Math.round((to - from + 1) * (0.5 + b.rand01() * 0.2));
      if (at + secs * 1000 > until) break;
      b.take({ createdAt: at, level, hidden: b.chance(opts.hidden), from, to, secs, marks: [...marks.values()] });
      at += (secs + b.int(40, 120)) * 1000;
    }
  }
}

/**
 * Heavy: seven months of a hafiz-sized memorizer (Majd, Nov 17 2026: "a super heavy user with a lot of activity and
 * months of data"). Juz 1 and Juz 11–30 memorized long ago but Al-Kahf's first pages; these months, Al-Baqarah from
 * page 22 about a page a week (done by five weeks ago), Al-Kahf a page every ten days, and now Al-Kahf 301 and
 * Al-Imran's first ayahs in part. A juz a day with Smart Tracking: misses now and then, a sixteen-day gap three to
 * four months ago, days left part way, Juz 17 rated weak, a page revised ahead the day before yesterday, and today's
 * juz begun. Sittings (Al-Kahf every Friday, and before memorizing), the daily log on many days, recordings, about a
 * hundred and twenty Recite takes over nine weeks with marks of every kind and the slips into similar ayat, a word cleared by
 * hand, and three Revo conversations with what it remembers.
 */
function buildHeavy(b: Builder): void {
  const day = (k: number) => addDays(b.today, k);
  const HISTORY = 210;
  const inGap = (k: number) => k >= -118 && k <= -103;

  b.memorize([...range(1, 21), ...range(202, 292), ...range(302, 604)], b.at(day(-400), 20));
  // The pages memorized these months, by day (the sitting before, and the note after).
  const memorizing = new Map<string, { page: number; at: number }>();
  const learn = (page: number, at: number, minutes: number) => {
    b.memorize([page], at, minutes);
    memorizing.set(b.dayOf(at), { page, at });
  };
  range(22, 49).forEach((p, i) => {
    let k = -205 + Math.round(i * 6.2);
    if (inGap(k)) k = -102;
    learn(p, b.at(day(k), 5, 40), b.int(25, 50));
  });
  range(293, 300).forEach((p, i) => learn(p, b.at(day(-92 + i * 10), 21, 15), b.int(30, 45)));
  b.memorizeAyahs(301, ayahKeysStartingOn(301).slice(0, 3), b.at(day(-6), 21, 10), 35);
  b.memorizeAyahs(50, ayahKeysStartingOn(50).slice(0, 5), b.at(day(-3), 5, 45), 30);

  b.usePlan({ mode: 'juz', perDay: 1, anchorDay: day(-HISTORY) });
  Object.assign(b.user, { smartTrackingEnabled: true, hasSeenSmartTrackingPreview: true });

  const rate = (p: number): number => (p >= 322 && p <= 341 ? (b.chance(0.65) ? 2 : 3) : p >= 22 && p <= 50 ? b.int(2, 4) : b.int(3, 5));

  for (let k = -HISTORY; k <= -1; k++) {
    const d = day(k);
    // Sittings: Al-Kahf on Fridays, and the page about to be memorized.
    if (isFriday(d)) {
      const s = b.reading(b.at(d, 10, b.int(0, 30)), b.int(22, 38), range(293, 304));
      if (k >= -60 && b.chance(0.6)) b.recording(s.startedAt + 2 * 60_000, range(293, 296), 'reading');
    }
    const fresh = memorizing.get(d);
    if (fresh) {
      b.reading(fresh.at - 35 * 60_000, b.int(18, 32), [fresh.page]);
      b.note(fresh.at + 40 * 60_000, 'memorization', fresh.page >= 293 ? 'Al-Kahf: a new page, tested twice.' : 'New page of Al-Baqarah. Repeated it ten times.', b.int(25, 50));
    } else if (b.chance(0.1)) {
      const p = b.int(202, 600);
      b.reading(b.at(d, 7, b.int(0, 40)), b.int(10, 25), range(p, p + b.int(2, 4)));
    }
    if (inGap(k)) {
      if (k === -117) b.note(b.at(d, 22), 'note', 'Travelling for two weeks. Will try to keep up.');
      continue;
    }
    // A missed day now and then; the last one twenty-five days ago, so the streak is 24 days.
    if (k === -25 || (k < -25 && b.chance(0.07))) continue;
    const pages = b.pagesFor(d, true);
    if (pages.length === 0) continue;
    const weak = pages.filter((p) => p >= 322 && p <= 341);
    const rated = [...new Set([pages[b.int(0, pages.length - 1)], pages[b.int(0, pages.length - 1)], ...weak.slice(0, 2)])];
    const half = k < -24 && b.chance(0.08);
    const ahead = k === -2 ? { [day(-1)]: b.pagesFor(day(-1), true).slice(0, 3) } : undefined;
    const s = b.session(d, {
      revise: half ? Math.ceil(pages.length * 0.6) : 'all',
      at: b.chance(0.6) ? b.at(d, 5, b.int(10, 50)) : b.at(d, 20, b.int(0, 50)),
      minutes: b.int(28, 50),
      ratings: rated.map((p) => [p, rate(p)] as [number, number]),
      ...(ahead ? { ahead } : {}),
    }, pages);
    if (k >= -90 && b.chance(0.3)) b.recording(s.createdAt + 5 * 60_000, pages.slice(0, 3));
    if (b.chance(0.28)) b.note(s.updatedAt + 60_000, 'revision', REVISION_NOTES[b.int(0, REVISION_NOTES.length - 1)], s.durationMinutes);
    else if (b.chance(0.06)) b.note(b.at(d, 22, 15), 'note', DAY_NOTES[b.int(0, DAY_NOTES.length - 1)]);
  }
  // Today: the juz begun after Fajr.
  const todays = b.pagesFor(b.today);
  b.session(b.today, { revise: Math.min(8, todays.length - 1), at: b.earlierToday(60), minutes: 14 }, todays);

  // Recite, from nine weeks ago.
  const sticky = [441, 532, 563, 583, 295]
    .map((page) => {
      const [first, last] = pageWords(page);
      for (let w = first + 17; w <= last; w++) if (harakatMark('x', w, () => 0)) return { w, wrong: 0.55 };
      return null;
    })
    .filter((x): x is { w: number; wrong: number } => x != null);
  const days: number[] = [];
  for (let k = -63; k <= 0; k++) if (k === 0 || b.chance(0.8)) days.push(k);
  const abasa = [585];
  reciteTakes(b, {
    days,
    passages: [
      { pages: [2, 3], weight: 2 },
      { pages: [5, 6], weight: 3 },
      { pages: [8, 9], weight: 4 },
      { pages: [42], weight: 2 },
      { pages: [293, 294], weight: 2 },
      { pages: [295, 296], weight: 2 },
      { pages: [302], weight: 4 },
      { pages: [440, 441, 442], weight: 2 },
      { pages: [531, 532, 533], weight: 3 },
      { pages: [534, 535], weight: 2 },
      { pages: [562, 563, 564], weight: 3 },
      { pages: [582, 583], weight: 2 },
      { pages: abasa, weight: 3 },
      { pages: [587], weight: 1 },
    ],
    perDay: [1, 4],
    strict: 0.2,
    hidden: 0.3,
    // 2:58 keeps going on as Al-A'raf 161; 2:35 was fixed a month ago; Abasa 3 right once since last week; Al-Kahf 75
    // keeps skipping into 72.
    slipWrong: (s, k) => [0.75, k < -30 ? 0.85 : 0, k < -8 ? 0.8 : 0, 0.65][s] ?? 0,
    marks: [0.38, 0.32, 0.2, 0.1],
    sticky,
    onceFrom: { pages: abasa, k: -7 },
  });
  const cleared = b.takes.find((t) => t.marks.some((m) => m.kind === 'harakat' && m.sure === 'clear'));
  const slipped = cleared?.marks.find((m) => m.kind === 'harakat' && m.sure === 'clear');
  if (slipped) b.clear(slipped.w, 'slip', b.at(day(-20), 21, 50));

  // Revo.
  const weakest = b.revoChat('chat', 'Your weakest juz', b.at(day(-20), 21, 30), [
    ['user', 'Which juz am I weakest in?'],
    [
      'revo',
      'Juz 17, Al-Anbiya and Al-Hajj: most of its pages are rated Weak, more than any other juz. Give it ten extra minutes on its day this week.',
      ['What about Al-Baqarah?', 'Plan it for tomorrow'],
    ],
    ['user', 'What about Al-Baqarah?'],
    [
      'revo',
      'The pages you memorized this autumn are still settling, Moderate on average. Keep them in each juz day, and recite Al-Baqarah, ayah 58 a few times: you keep going on as Al-A‘raf 161.',
    ],
  ]);
  b.revoRemember(weakest, 'Finds Juz 17 the hardest to hold');
  b.revoRemember(weakest, 'Memorizing Al-Baqarah, about a page a week');
  const recite = b.revoChat('chat', 'Recitation this week', b.at(day(-5), 7, 50), [
    ['user', 'How did my recitation go this week?'],
    [
      'revo',
      'Steady: most takes were at or above 99%. Al-Kahf, ayah 75 is the one that keeps slipping, where you go on as ayah 72. Recite the mistakes again from its page once a day.',
      ['Which words are still marked?'],
    ],
  ]);
  b.revoRemember(recite, 'Practises Al-Kahf for Fridays');
  const review = b.revoChat('review', 'Day in review', b.at(day(-1), 19, 40), [
    ['revo', 'Yesterday’s juz is done, and the streak holds. Tomorrow starts where today ends; Juz 17 comes round in a few days.'],
  ]);
  b.revoRemember(review, 'Revises a juz a day, most often after Fajr');
}

/**
 * Steady: a mid-level user six weeks in. Juz 26–30 memorized (and the end of Al-Jathiyah in part), ten pages a day
 * without Smart Tracking: two missed days in a row a month ago, a single one a fortnight ago, a day left part way, then
 * twelve days done, and yesterday missed. So the streak shows its grace ring (SESS-6) and Home offers yesterday's
 * pages (CARRY-1). A few sittings, notes, recordings and Recite takes.
 */
function buildSteady(b: Builder): void {
  const day = (k: number) => addDays(b.today, k);
  b.memorize(range(502, 604), b.at(day(-120), 20));
  b.memorizeAyahs(501, ayahKeysStartingOn(501).slice(-4), b.at(day(-60), 21), 25);
  b.usePlan({ mode: 'pages', perDay: 10, anchorDay: day(-42) });
  const missed = new Set([-31, -30, -22, -14]);
  for (let k = -42; k <= -2; k++) {
    const d = day(k);
    if (new Date(`${d}T12:00:00Z`).getUTCDay() % 3 === 0) b.reading(b.at(d, 7, b.int(0, 30)), b.int(10, 20), b.pagesFor(d).slice(0, 3));
    if (missed.has(k)) continue;
    const s = b.session(d, { revise: k === -25 ? 6 : 'all', minutes: b.int(14, 24) });
    if (k === -9 || k === -5 || k === -2) b.recording(s.createdAt + 3 * 60_000, s.assignedPages.slice(0, 2));
    if (b.chance(0.22)) b.note(s.updatedAt + 60_000, 'revision', REVISION_NOTES[b.int(0, REVISION_NOTES.length - 1)], s.durationMinutes);
  }
  b.note(b.at(day(-22), 21, 30), 'note', DAY_NOTES[0]);
  b.note(b.at(day(-1), 22, 40), 'note', 'Long day at work, no revision. Catch up tomorrow.');
  const days: number[] = [];
  for (let k = -14; k <= -2; k++) if (!missed.has(k) && b.chance(0.55)) days.push(k);
  reciteTakes(b, {
    days,
    passages: [
      { pages: [562, 563, 564], weight: 3 },
      { pages: [582, 583], weight: 2 },
      { pages: [585], weight: 2 },
    ],
    perDay: [1, 2],
    strict: 0,
    hidden: 0.2,
    slipWrong: (s) => (s === 2 ? 0.6 : 0),
    marks: [0.45, 0.35, 0.15, 0.05],
  });
}

/**
 * Starting: a newer memorizer two weeks in. Juz 30 marked at sign-up, four pages a day; Al-Mulk ayah by ayah (its
 * first page done, the next begun two days ago); one missed day and one left part way, the last four done, nothing
 * yet today. Notes on the memorizing, two recordings, sittings, and the first four Recite takes.
 */
function buildStarting(b: Builder): void {
  const day = (k: number) => addDays(b.today, k);
  b.memorize(juzPages(30), b.at(day(-16), 19, 30));
  b.usePlan({ mode: 'pages', perDay: 4, anchorDay: day(-14) });
  b.memorizeAyahs(562, ayahKeysStartingOn(562).slice(0, 5), b.at(day(-12), 6, 10), 30);
  b.memorize([562], b.at(day(-9), 6, 20), 35);
  b.memorizeAyahs(563, ayahKeysStartingOn(563).slice(0, 4), b.at(day(-2), 6, 15), 30);
  for (const k of [-12, -9, -2]) b.reading(b.at(day(k), 5, 45), b.int(20, 30), k === -2 ? [563] : [562]);
  b.reading(b.at(day(-6), 7, 10), 12, range(582, 584));
  b.note(b.at(day(-12), 6, 50), 'memorization', 'Started Al-Mulk: the first five ayat.', 30);
  b.note(b.at(day(-9), 7, 0), 'memorization', 'Finished the first page of Al-Mulk.', 35);
  b.note(b.at(day(-2), 6, 55), 'memorization', 'Al-Mulk, the next ayat. Slow but steady.', 30);
  for (let k = -14; k <= -1; k++) {
    if (k === -5) continue;
    // Each day's plan from the pages memorized (or begun) by then: Al-Mulk joins it as it is learned.
    const s = b.session(day(k), { revise: k === -8 ? 2 : 'all', minutes: b.int(6, 12) }, b.pagesFor(day(k), true));
    if (k === -6 || k === -1) b.recording(s.createdAt + 2 * 60_000, s.assignedPages.slice(0, 2));
    if (k === -13) b.note(s.updatedAt + 60_000, 'revision', 'Juz 30 is going well. An-Naba feels solid.', s.durationMinutes);
  }
  // The first takes: a rough one, the same page again, then two better.
  const naba = pageWords(582);
  const mulk = pageWords(562);
  const word = (from: number, n: number) => from + n;
  b.take({
    createdAt: b.at(day(-3), 21, 5),
    level: 'words',
    hidden: false,
    from: naba[0],
    to: naba[1],
    secs: 88,
    marks: [skippedMark(b.id(8), word(naba[0], 31)), harakatMark(b.id(8), word(naba[0], 18), () => 0.3), wrongWordMark(b.id(8), word(naba[0], 52), word(naba[0], 61))].filter(
      (m): m is StoredMark => m != null,
    ),
  });
  b.take({
    createdAt: b.at(day(-2), 21, 10),
    level: 'words',
    hidden: false,
    from: naba[0],
    to: naba[1],
    secs: 80,
    marks: [harakatMark(b.id(8), word(naba[0], 18), () => 0.3)].filter((m): m is StoredMark => m != null),
  });
  b.take({ createdAt: b.at(day(-1), 6, 40), level: 'words', hidden: true, from: mulk[0], to: mulk[1], secs: 95, marks: [] });
  const nabaTwo = pageWords(583);
  b.take({
    createdAt: b.at(day(-1), 21, 20),
    level: 'words',
    hidden: false,
    from: nabaTwo[0],
    to: nabaTwo[1],
    secs: 90,
    marks: [harakatMark(b.id(8), word(nabaTwo[0], 40), () => 0.6, 'likely')].filter((m): m is StoredMark => m != null),
  });
}

/**
 * A built scenario as documents (paths under users/<uid>/), in the shapes the
 * app writes: Timestamps (`stamp`) where the app stores Timestamps, numbers
 * where it stores numbers. testScenariosAdmin.ts writes these; the rules tests
 * write the same as the user, so they're documents the app itself could write.
 */
export function scenarioDocuments(
  plan: SeedPlan,
  stamp: (ms: number) => unknown,
  now: unknown,
): { path: string; data: Record<string, unknown> }[] {
  const ts = (ms: number | null) => (ms == null ? null : stamp(ms));
  const out: { path: string; data: Record<string, unknown> }[] = [];
  for (const p of plan.pages) {
    out.push({
      path: `pages/${p.pageNumber}`,
      data: {
        ...freshPage(p.pageNumber, now),
        status: p.status,
        dateMemorized: ts(p.dateMemorized),
        lastRevisedAt: ts(p.lastRevisedAt),
        weaknessRating: p.weaknessRating,
        totalRevisionCount: p.totalRevisionCount,
        skipCount: p.skipCount,
        ...(p.verses ? { verses: p.verses } : {}),
      },
    });
  }
  for (const s of plan.sessions) {
    out.push({
      path: `sessions/${s.id}`,
      data: {
        ...s,
        createdAt: ts(s.createdAt),
        updatedAt: ts(s.updatedAt),
        completedAt: ts(s.completedAt),
        weaknessUpdates: s.weaknessUpdates.map((w) => ({ ...w, changedAt: ts(w.changedAt) })),
      },
    });
  }
  for (const item of plan.revisions) out.push({ path: `revisions/${item.id}`, data: { ...item } });
  for (const item of plan.memorizations) out.push({ path: `memorizations/${item.id}`, data: { ...item } });
  for (const item of plan.reads) out.push({ path: `reads/${item.id}`, data: { ...item } });
  for (const r of plan.readingSessions) {
    const { id, ...data } = r;
    out.push({
      path: `readingSessions/${id}`,
      data: { ...data, startedAt: ts(r.startedAt), endedAt: ts(r.endedAt), createdAt: ts(r.createdAt), updatedAt: ts(r.updatedAt) },
    });
  }
  for (const n of plan.notes) out.push({ path: `journal/${n.day}/entries/${n.id}`, data: { ...n } });
  for (const rec of plan.recordings) {
    const { id, ...data } = rec;
    out.push({ path: `recordings/${id}`, data: { ...data, updatedAt: now } });
  }
  for (const t of plan.takes) out.push({ path: `reciteTakes/${t.id}`, data: takeDocument(t, now) });
  for (const c of plan.clears) out.push({ path: `reciteTakes/${c.id}`, data: clearDocument(c, now) });
  return out;
}

/**
 * Revo's documents of a built scenario (paths under users/<uid>/), as its functions write them
 * (functions/src/revo/admin.ts). Apart from scenarioDocuments: only the functions write these, never the app
 * (firestore.rules), so the rules tests leave them out.
 */
export function revoDocuments(plan: SeedPlan, uid: string): { path: string; data: Record<string, unknown> }[] {
  const out: { path: string; data: Record<string, unknown> }[] = [];
  for (const chat of plan.revoChats) {
    const { id, messages, ...fields } = chat;
    out.push({ path: `revoChats/${id}`, data: { ...fields, uid, turns: messages.filter((m) => m.role === 'user').length } });
    for (const m of messages) out.push({ path: `revoChats/${id}/messages/${m.id}`, data: { ...m, uid } });
  }
  for (const { id, ...item } of plan.revoMemory) out.push({ path: `revoMemory/${id}`, data: { ...item, uid } });
  return out;
}

// ============================================================================
// THE CALLABLE
// ============================================================================

/** Writes a built scenario for `uid` (testScenariosAdmin.ts). Returns how many of each. */
export interface ScenarioWriter {
  write(uid: string, plan: SeedPlan, now: { stamp: unknown; ms: number }): Promise<Record<string, number>>;
}

export interface ScenarioRequest {
  auth?: { uid: string } | null;
  app?: unknown;
  data?: unknown;
}

export type ScenarioResult = ResetResult & {
  scenario: ScenarioId;
  today: string;
  seeded: Record<string, number>;
  /** The reset's mark (ms): the phone queues `outbox` once it has seen it. */
  resetAt: number;
  outbox: Record<string, unknown>[];
};

/**
 * The callable's handler. App Check is enforced by the callable's options and
 * checked again here. The scenario and the phone's context are checked before
 * anything is claimed or changed.
 */
export async function handleLoadTestScenario(
  request: ScenarioRequest,
  deps: { store: ResetStore; writer: ScenarioWriter; authUser: (uid: string) => Promise<AuthInfo> },
): Promise<ScenarioResult> {
  if (!request.auth?.uid) throw new ResetError('unauthenticated', 'Must be signed in.');
  if (!request.app) throw new ResetError('failed-precondition', 'App Check is required.');
  const auth = await deps.authUser(request.auth.uid);
  if (auth.uid !== request.auth.uid) throw new ResetError('internal', 'Account mismatch.');
  const data = (request.data ?? {}) as { scenario?: unknown; context?: unknown };
  if (!isScenarioId(data.scenario)) throw new ResetError('invalid-argument', 'Unknown test scenario.');
  const scenario = data.scenario;

  let plan: SeedPlan | null = null;
  const result = await resetTesterAccount(deps.store, auth, request.data, {
    kind: 'scenario',
    testersOnly: 'Test scenarios are for testers only.',
    validate: (now) => {
      const ctx = parseContext(data.context, now.ms, scenario);
      plan = buildScenario(scenario, ctx, auth.uid);
    },
    userFor: (fresh) => ({ ...fresh, ...plan!.user }),
    seed: (uid, now) => deps.writer.write(uid, plan!, now),
  });
  const built = plan as unknown as SeedPlan;
  return {
    ...result,
    scenario,
    today: built.today,
    seeded: result.seeded ?? {},
    resetAt: result.resetAt,
    outbox: built.outbox,
  };
}
