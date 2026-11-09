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

// ============================================================================
// THE SCENARIOS
// ============================================================================

export const SCENARIO_IDS = [
  'new',
  'beginner',
  'hafiz',
  'partial-today',
  'missed-days',
  'revise-ahead',
  'fajr-edge',
  'custom-reverse',
  'heavy-activity',
  'offline-queue',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && (SCENARIO_IDS as readonly string[]).includes(v);
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
  status: 'memorized';
  dateMemorized: number;
  lastRevisedAt: number | null;
  weaknessRating: number;
  totalRevisionCount: number;
  skipCount: number;
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
  private readonly memorizedOn = new Map<string, { at: number; pages: number[] }>();
  private readonly ratings = new Map<number, number>();
  plan: PlanSpec | null = null;
  readonly user: Record<string, unknown> = {};
  readonly sessions: SeedSession[] = [];
  readonly readingSessions: SeedReading[] = [];
  readonly notes: SeedNote[] = [];
  readonly recordings: SeedRecording[] = [];
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

  /** The revision day of a moment, Fajr-aware when the scenario has the boundary on. */
  dayOf(ms: number): string {
    const fajr = this.ctx.fajr;
    return revisionDayAt(ms, this.ctx.zone, fajr ? (day) => fajr.days[day] ?? null : null);
  }

  /** A wall-clock time on a calendar day. */
  at(day: string, hour: number, minute = 0): number {
    return wallMs(day, hour, minute, this.ctx.zone);
  }

  /** The start of the revision day `day` (its midnight; its Fajr with the boundary on). */
  startOf(day: string): number {
    return this.ctx.fajr?.days[day] ?? this.at(day, 0, 0);
  }

  /** A moment today that has passed, `minutesAgo` before now when today allows. */
  earlierToday(minutesAgo: number): number {
    return Math.max(this.startOf(this.today) + MINUTE, this.ctx.now - minutesAgo * MINUTE);
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
  memorize(pages: number[], at: number): void {
    const day = this.dayOf(at);
    const fresh = pages.filter((p) => !this.memorized.has(p));
    for (const p of fresh) this.memorized.set(p, at);
    if (fresh.length === 0) return;
    const item = this.memorizedOn.get(day);
    if (item) item.pages.push(...fresh);
    else this.memorizedOn.set(day, { at, pages: [...fresh] });
  }

  /** The memorized pages as of `day` (all of them without a day). */
  memorizedPages(day?: string): number[] {
    const out: number[] = [];
    for (const [page, at] of this.memorized) if (!day || this.dayOf(at) <= day) out.push(page);
    return out.sort((a, b) => a - b);
  }

  /** The plan's pages for `day`, from the pages memorized by then. */
  pagesFor(day: string, memorizedByThen = false): number[] {
    if (!this.plan) throw new Error('no plan');
    return plannedPages(this.plan, this.memorizedPages(memorizedByThen ? day : undefined), day);
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

  recording(at: number, pages: number[]): SeedRecording {
    const id = `${at}-${this.id(6).toLowerCase()}`;
    const rec: SeedRecording = {
      id,
      kind: 'revision',
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
    const pages: SeedPage[] = this.memorizedPages().map((pageNumber) => {
      let last: number | null = null;
      let lastDay: string | null = null;
      let count = 0;
      let rating = 4;
      for (const s of sessions) {
        if (s.pagesRevised.includes(pageNumber)) {
          count++;
          last = s.completedAt ?? s.updatedAt;
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
      return {
        pageNumber,
        status: 'memorized',
        dateMemorized: this.memorized.get(pageNumber)!,
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
      totalMemorizedPages: pages.length,
      totalLearningPages: 0,
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
        minutes: null,
        recordings: [],
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
    case 'heavy-activity': {
      // Three months: Juz 29–30 known, Juz 28 memorized two pages at a time,
      // sessions most days, timed readings and daily-log notes.
      b.memorize(juzPages(29, 30), b.at(day(-120), 20));
      const juz28 = juzPages(28);
      for (let i = 0; i < juz28.length; i += 2) b.memorize(juz28.slice(i, i + 2), b.at(day(-84 + i * 3), 19));
      b.usePlan({ mode: 'pages', perDay: 5, anchorDay: day(-90) });
      Object.assign(b.user, { smartTrackingEnabled: true, hasSeenSmartTrackingPreview: true });
      for (let k = -90; k <= -1; k++) {
        if (b.chance(0.15)) continue;
        const pages = b.pagesFor(day(k), true);
        b.session(day(k), { revise: b.chance(0.1) ? 2 : 'all', ratings: b.chance(0.3) ? [[pages[0], b.int(2, 5)]] : [] }, pages);
        if (k % 4 === 0) b.reading(b.at(day(k), 7, 10), b.int(10, 25), b.memorizedPages(day(k)).slice(0, 3));
        if (k % 3 === 0) {
          const kind = (['memorization', 'revision', 'note'] as const)[(-k / 3) % 3];
          const text =
            kind === 'note'
              ? 'A long day, but the revision held.'
              : kind === 'revision'
                ? `${pages.length} pages revised`
                : 'New lines of Juz 28';
          b.note(b.at(day(k), 22), kind, text, kind === 'note' ? null : b.int(10, 40));
        }
      }
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
