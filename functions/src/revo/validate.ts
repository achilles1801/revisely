/**
 * What the app may send Revo, checked field by field: the context (numbers and page numbers),
 * and an attachment only of the kinds the contract names. Unknown fields, wrong types and
 * values out of range are refused. Minutes and seconds may arrive as fractions (a session's
 * length) and are rounded; page numbers, ratings and counts must be whole.
 * Messages here never say "date": the app reads that word as a clock problem.
 */
import { juzPages, surahPages } from './quranIndex';
import {
  REVO_INSIGHTS,
  REVO_PASSAGE_KEYS,
  REVO_PATTERN_KINDS,
  REVO_TOTALS,
  RevoAttachment,
  RevoContext,
  RevoDayFacts,
  RevoInsight,
  RevoPassageFacts,
  RevoPattern,
  RevoPlanTally,
  RevoTimes,
  RevoTotals,
} from './types';

export class RevoInvalid extends Error {}

export const MAX_QUESTION = 600;
export const MAX_COUNT = 1_000_000;
export const MAX_PAGE = 604;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHAT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type Obj = Record<string, unknown>;

function fail(path: string): never {
  throw new RevoInvalid(`${path} is not valid.`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path);
  return v as Obj;
}

/** The object has only these keys, and every one of `required`. */
function keys(o: Obj, allowed: readonly string[], path: string, required: readonly string[] = allowed): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${path}.${k}`);
  for (const k of required) if (!(k in o)) fail(`${path}.${k}`);
}

function int(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(path);
  return v;
}

function num(v: unknown, min: number, max: number, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path);
  return v;
}

/** Minutes or seconds: any number in range, rounded to whole. */
function rounded(v: unknown, max: number, path: string): number {
  return Math.round(num(v, 0, max, path));
}

function str(v: unknown, max: number, path: string): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) fail(path);
  return v;
}

function list<T>(v: unknown, max: number, path: string, item: (x: unknown, p: string) => T): T[] {
  if (!Array.isArray(v) || v.length > max) fail(path);
  return v.map((x, i) => item(x, `${path}[${i}]`));
}

const MAX_PASSAGE = 160;
const MAX_PAGE_NAME = 100;
const MAX_PAGE_NAMES = 70;
/** Surah names, ayah and juz numbers and joining words: letters (Latin, with transliteration marks), digits, spaces and a little punctuation. */
const PASSAGE_RE = /^[\p{L}\p{M}0-9 '’ʿʾ.,·–—\-‑\u00A0]+$/u;

/** A part of the Qur'an in words ("Al-Hashr, ayahs 1–10 · Juz 28"): one short line of plain text. */
function passageText(v: unknown, max: number, path: string): string {
  if (typeof v !== 'string') fail(path);
  const t = v.trim();
  if (t.length === 0 || t.length > max || !PASSAGE_RE.test(t)) fail(path);
  return t;
}

function pages(v: unknown, max: number, path: string): number[] {
  return list(v, max, path, (x, p) => int(x, 1, MAX_PAGE, p));
}

export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function day(v: unknown, path: string): string {
  if (!isDay(v)) fail(path);
  return v;
}

/** Days since 1970-01-01 for a valid YYYY-MM-DD. */
export function dayNumber(d: string): number {
  const [y, m, dd] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, dd) / 86_400_000);
}

/** The revision day is at most one day from the server's UTC day (either way). */
export function dayNearServer(d: string, now: Date): boolean {
  return Math.abs(dayNumber(d) - dayNumber(now.toISOString().slice(0, 10))) <= 1;
}

export function validateQuestion(v: unknown): string {
  if (typeof v !== 'string') fail('question');
  const q = v.trim();
  if (q.length === 0 || q.length > MAX_QUESTION) fail('question');
  return q;
}

export function validateChatId(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !CHAT_ID_RE.test(v)) fail('chatId');
  return v;
}

/** One pattern the app read (REVO-40): its kind's fields only, each in range; days before the pattern's own. */
function validatePattern(x: unknown, p: string): RevoPattern {
  const o = obj(x, p);
  const kind = o.kind;
  if (typeof kind !== 'string' || !(REVO_PATTERN_KINDS as readonly string[]).includes(kind)) fail(`${p}.kind`);
  if (kind === 'catchingUp') {
    keys(o, ['kind', 'day', 'pages', 'forDays', 'keepDailyAmount'], p);
    const on = day(o.day, `${p}.day`);
    const forDays = list(o.forDays, 7, `${p}.forDays`, (d, q) => {
      const v = day(d, q);
      if (v >= on) fail(q);
      return v;
    });
    if (forDays.length === 0) fail(`${p}.forDays`);
    if (typeof o.keepDailyAmount !== 'boolean') fail(`${p}.keepDailyAmount`);
    return { kind, day: on, pages: int(o.pages, 1, MAX_COUNT, `${p}.pages`), forDays, keepDailyAmount: o.keepDailyAmount };
  }
  if (kind === 'aheadBurst') {
    keys(o, ['kind', 'day', 'pages', 'days', 'quietDays'], p);
    return {
      kind,
      day: day(o.day, `${p}.day`),
      pages: int(o.pages, 1, MAX_COUNT, `${p}.pages`),
      days: int(o.days, 1, MAX_COUNT, `${p}.days`),
      quietDays: int(o.quietDays, 0, 7, `${p}.quietDays`),
    };
  }
  if (kind === 'lateNights') {
    keys(o, ['kind', 'late', 'of'], p);
    const of = int(o.of, 1, 31, `${p}.of`);
    return { kind, late: int(o.late, 1, of, `${p}.late`), of };
  }
  keys(o, ['kind', 'days'], p);
  return { kind: 'steady', days: int(o.days, 1, MAX_COUNT, `${p}.days`) };
}

export function validateContext(v: unknown): RevoContext {
  const c = obj(v, 'context');
  // `streak`, `today.carriedPages`, `today.doneEarlier`, `today.otherPages`, `week[].planned` and
  // `week[].done` come from apps after Nov 7 2026 (lib/todaySnapshot); older apps send without them.
  // `week[].caughtUp`, `week[].ahead`, `week[].started` and `patterns` come from apps after Nov 9 2026 (REVO-40).
  keys(c, ['totals', 'today', 'weakPages', 'week', 'streak', 'patterns', 'passages', 'pageNames', 'localTime'], 'context', ['totals', 'today', 'weakPages', 'week']);

  const t = obj(c.totals, 'context.totals');
  keys(t, REVO_TOTALS, 'context.totals');
  const totals = {} as RevoTotals;
  for (const k of REVO_TOTALS) totals[k] = num(t[k], 0, MAX_COUNT, `context.totals.${k}`);

  const d = obj(c.today, 'context.today');
  const TODAY_REQUIRED = ['plannedPages', 'revisedPages', 'minutes', 'memorizedPages', 'nextPages', 'weakNext', 'done'];
  keys(d, [...TODAY_REQUIRED, 'carriedPages', 'doneEarlier', 'otherPages'], 'context.today', TODAY_REQUIRED);
  if (typeof d.done !== 'boolean') fail('context.today.done');
  const optionalCount = (v: unknown, path: string) => (v === undefined ? {} : { [path.split('.').pop()!]: int(v, 0, MAX_COUNT, path) });
  const today = {
    plannedPages: int(d.plannedPages, 0, MAX_COUNT, 'context.today.plannedPages'),
    revisedPages: int(d.revisedPages, 0, MAX_COUNT, 'context.today.revisedPages'),
    ...optionalCount(d.carriedPages, 'context.today.carriedPages'),
    ...optionalCount(d.doneEarlier, 'context.today.doneEarlier'),
    ...optionalCount(d.otherPages, 'context.today.otherPages'),
    minutes: rounded(d.minutes, MAX_COUNT, 'context.today.minutes'),
    memorizedPages: int(d.memorizedPages, 0, MAX_COUNT, 'context.today.memorizedPages'),
    nextPages: pages(d.nextPages, 20, 'context.today.nextPages'),
    weakNext: pages(d.weakNext, 20, 'context.today.weakNext'),
    done: d.done,
  };

  const week = list(c.week, 7, 'context.week', (x, p) => {
    const w = obj(x, p);
    keys(w, ['day', 'pages', 'planned', 'done', 'caughtUp', 'ahead', 'started'], p, ['day', 'pages']);
    if (w.done !== undefined && typeof w.done !== 'boolean') fail(`${p}.done`);
    if (w.started !== undefined && w.started !== null && (typeof w.started !== 'string' || !TIME_RE.test(w.started))) fail(`${p}.started`);
    return {
      day: day(w.day, `${p}.day`),
      pages: int(w.pages, 0, MAX_COUNT, `${p}.pages`),
      ...(w.planned === undefined ? {} : { planned: int(w.planned, 0, MAX_COUNT, `${p}.planned`) }),
      ...(w.done === undefined ? {} : { done: w.done as boolean }),
      ...(w.caughtUp === undefined ? {} : { caughtUp: int(w.caughtUp, 0, MAX_COUNT, `${p}.caughtUp`) }),
      ...(w.ahead === undefined ? {} : { ahead: int(w.ahead, 0, MAX_COUNT, `${p}.ahead`) }),
      ...(w.started === undefined ? {} : { started: w.started as string | null }),
    };
  });

  const patterns = c.patterns === undefined ? undefined : list(c.patterns, REVO_PATTERN_KINDS.length, 'context.patterns', validatePattern);

  let streak: RevoContext['streak'];
  if (c.streak !== undefined) {
    const s = obj(c.streak, 'context.streak');
    keys(s, ['days', 'atRisk'], 'context.streak');
    let atRisk: NonNullable<RevoContext['streak']>['atRisk'] = null;
    if (s.atRisk !== null) {
      const r = obj(s.atRisk, 'context.streak.atRisk');
      keys(r, ['previous', 'yesterdayPlanned', 'yesterdayDone'], 'context.streak.atRisk');
      atRisk = {
        previous: int(r.previous, 0, MAX_COUNT, 'context.streak.atRisk.previous'),
        yesterdayPlanned: int(r.yesterdayPlanned, 0, MAX_COUNT, 'context.streak.atRisk.yesterdayPlanned'),
        yesterdayDone: int(r.yesterdayDone, 0, MAX_COUNT, 'context.streak.atRisk.yesterdayDone'),
      };
    }
    streak = { days: int(s.days, 0, MAX_COUNT, 'context.streak.days'), atRisk };
  }

  const lt = c.localTime ?? null;
  if (lt !== null && (typeof lt !== 'string' || !TIME_RE.test(lt))) fail('context.localTime');

  const weakPages = pages(c.weakPages, 30, 'context.weakPages');

  // Names of parts of the Qur'an, as the app words them: short plain text, never instructions.
  let passages: RevoContext['passages'];
  if (c.passages !== undefined) {
    const o = obj(c.passages, 'context.passages');
    keys(o, REVO_PASSAGE_KEYS, 'context.passages', []);
    passages = {};
    for (const k of REVO_PASSAGE_KEYS) if (o[k] !== undefined) passages[k] = passageText(o[k], MAX_PASSAGE, `context.passages.${k}`);
  }
  let pageNames: RevoContext['pageNames'];
  if (c.pageNames !== undefined) {
    const o = obj(c.pageNames, 'context.pageNames');
    const named = new Set([...today.nextPages, ...today.weakNext, ...weakPages].map(String));
    if (Object.keys(o).length > MAX_PAGE_NAMES) fail('context.pageNames');
    pageNames = {};
    for (const [k, v] of Object.entries(o)) {
      if (!named.has(k)) fail(`context.pageNames.${k}`);
      pageNames[k] = passageText(v, MAX_PAGE_NAME, `context.pageNames.${k}`);
    }
  }

  return {
    totals,
    today,
    weakPages,
    week,
    ...(streak ? { streak } : {}),
    ...(patterns ? { patterns } : {}),
    ...(passages ? { passages } : {}),
    ...(pageNames ? { pageNames } : {}),
    localTime: lt,
  };
}

const ATTACH_KEYS: Record<RevoAttachment['kind'], readonly string[]> = {
  day: ['kind', 'label', 'day', 'revisedPages', 'memorizedPages', 'readMinutes', 'minutes', 'ratings'],
  page: ['kind', 'label', 'pages'],
  note: ['kind', 'label', 'day', 'text'],
  recording: ['kind', 'label', 'day', 'of', 'seconds', 'pages'],
  insight: ['kind', 'label', 'insight'],
  surah: ['kind', 'label', 'surah', 'facts'],
  juz: ['kind', 'label', 'juz', 'facts'],
  pages: ['kind', 'label', 'pages', 'facts'],
  revisionDay: ['kind', 'label', 'day', 'facts'],
};

/** At most this many attachments with one question. */
export const MAX_ATTACHMENTS = 6;
/** Days back an attached day may be (Activity reads 400). */
export const MAX_DAYS_AGO = 400;
const MAX_LOOKAHEAD = 366;
const MAX_DAY_NUMBER = 100_000;
const MAX_NOTES = 10;
const NOTE_CHARS = 1000;
const DAY_NOTE_CHARS = 3000;
const MAX_DAY_MINUTES = 1440;

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path);
  return v;
}

function maybe<T>(v: unknown, f: (x: unknown) => T): T | null {
  return v === null ? null : f(v);
}

/** Every key of `a` is at most the same key of `b` (a window inside a longer one). */
function within<T extends object>(a: T, b: T, path: string): void {
  const x = a as Record<string, number>;
  const y = b as Record<string, number>;
  for (const k of Object.keys(x)) if (x[k] > y[k]) fail(`${path}.${k}`);
}

function times(v: unknown, path: string, window: number | null, memorized: number): RevoTimes {
  const t = obj(v, path);
  keys(t, ['days', 'minEach', 'maxEach'], path);
  const out = {
    days: int(t.days, 0, window ?? MAX_DAY_NUMBER, `${path}.days`),
    minEach: int(t.minEach, 0, MAX_DAY_NUMBER, `${path}.minEach`),
    maxEach: int(t.maxEach, 0, MAX_DAY_NUMBER, `${path}.maxEach`),
  };
  // A page counts once a day; the least is at most the most; nothing memorized counts nothing.
  if (out.maxEach > out.days || out.minEach > out.maxEach || (memorized === 0 && out.maxEach > 0)) fail(path);
  return out;
}

function tally(v: unknown, path: string, window: number): RevoPlanTally {
  const t = obj(v, path);
  const K = ['days', 'pages', 'onDay', 'late', 'ahead', 'skipped', 'skippedDays'] as const;
  keys(t, K, path);
  const out = {} as RevoPlanTally;
  for (const k of K) out[k] = int(t[k], 0, MAX_COUNT, `${path}.${k}`);
  if (out.days > window || out.skippedDays > out.days || out.skippedDays > out.skipped) fail(path);
  if (out.onDay + out.late + out.ahead + out.skipped !== out.pages || out.pages < out.days || out.pages > out.days * MAX_PAGE) fail(path);
  return out;
}

/** What the app shows for a surah, a juz or pages (`span`: its pages), checked to add up. */
function passageFacts(v: unknown, path: string, span: readonly number[]): RevoPassageFacts {
  const f = obj(v, path);
  keys(f, ['name', 'pages', 'memorized', 'revised', 'lastRevisedDaysAgo', 'oldest', 'neverRevised', 'plan', 'strength', 'weakSpots', 'today', 'next'], path);
  const inSpan = new Set(span);
  const spanPages = (x: unknown, p: string, max: number) => {
    const list = pages(x, max, p);
    if (list.length === 0 || new Set(list).size !== list.length || list.some((n) => !inSpan.has(n))) fail(p);
    return list;
  };
  if (f.pages !== span.length) fail(`${path}.pages`);
  const memorized = int(f.memorized, 0, span.length, `${path}.memorized`);

  const r = obj(f.revised, `${path}.revised`);
  keys(r, ['last7', 'last30', 'all'], `${path}.revised`);
  const revised = {
    last7: times(r.last7, `${path}.revised.last7`, 7, memorized),
    last30: times(r.last30, `${path}.revised.last30`, 30, memorized),
    all: times(r.all, `${path}.revised.all`, null, memorized),
  };
  within(revised.last7, revised.last30, `${path}.revised.last7`);
  within(revised.last30, revised.all, `${path}.revised.last30`);

  const neverRevised = int(f.neverRevised, 0, memorized, `${path}.neverRevised`);
  if (neverRevised > 0 && revised.all.minEach > 0) fail(`${path}.neverRevised`);
  const lastRevisedDaysAgo = maybe(f.lastRevisedDaysAgo, (x) => int(x, 0, MAX_DAY_NUMBER, `${path}.lastRevisedDaysAgo`));
  if ((lastRevisedDaysAgo === null) !== (memorized === neverRevised)) fail(`${path}.lastRevisedDaysAgo`);
  const oldest = maybe(f.oldest, (x) => {
    const o = obj(x, `${path}.oldest`);
    keys(o, ['name', 'page', 'daysAgo'], `${path}.oldest`);
    const page = int(o.page, 1, MAX_PAGE, `${path}.oldest.page`);
    if (!inSpan.has(page)) fail(`${path}.oldest.page`);
    return {
      name: passageText(o.name, MAX_PAGE_NAME, `${path}.oldest.name`),
      page,
      daysAgo: maybe(o.daysAgo, (d) => int(d, 0, MAX_DAY_NUMBER, `${path}.oldest.daysAgo`)),
    };
  });
  if (oldest && memorized < 2) fail(`${path}.oldest`);

  const pl = obj(f.plan, `${path}.plan`);
  keys(pl, ['last7', 'last30'], `${path}.plan`);
  const plan = { last7: tally(pl.last7, `${path}.plan.last7`, 7), last30: tally(pl.last30, `${path}.plan.last30`, 30) };
  within(plan.last7, plan.last30, `${path}.plan.last7`);

  const st = obj(f.strength, `${path}.strength`);
  keys(st, ['weak', 'moderate', 'strong', 'unrated', 'average'], `${path}.strength`);
  const strength = {
    weak: int(st.weak, 0, memorized, `${path}.strength.weak`),
    moderate: int(st.moderate, 0, memorized, `${path}.strength.moderate`),
    strong: int(st.strong, 0, memorized, `${path}.strength.strong`),
    unrated: int(st.unrated, 0, memorized, `${path}.strength.unrated`),
    average: maybe(st.average, (x) => num(x, 1, 5, `${path}.strength.average`)),
  };
  const rated = strength.weak + strength.moderate + strength.strong;
  if (rated + strength.unrated !== memorized) fail(`${path}.strength`);
  if ((strength.average === null) !== (rated === 0) || (strength.average !== null && Math.round(strength.average * 10) !== strength.average * 10)) {
    fail(`${path}.strength.average`);
  }

  const weakSpots = list(f.weakSpots, 6, `${path}.weakSpots`, (x, p) => {
    const w = obj(x, p);
    keys(w, ['name', 'pages', 'rating'], p);
    return { name: passageText(w.name, MAX_PAGE_NAME, `${p}.name`), pages: spanPages(w.pages, `${p}.pages`, MAX_PAGE), rating: int(w.rating, 1, 2, `${p}.rating`) };
  });
  if (weakSpots.reduce((n, w) => n + w.pages.length, 0) > strength.weak) fail(`${path}.weakSpots`);

  const today = maybe(f.today, (x) => {
    const t = obj(x, `${path}.today`);
    keys(t, ['pages', 'done'], `${path}.today`);
    const n = int(t.pages, 1, span.length, `${path}.today.pages`);
    return { pages: n, done: int(t.done, 0, n, `${path}.today.done`) };
  });
  const next = maybe(f.next, (x) => {
    const t = obj(x, `${path}.next`);
    keys(t, ['inDays', 'pages'], `${path}.next`);
    return { inDays: int(t.inDays, 1, MAX_LOOKAHEAD, `${path}.next.inDays`), pages: int(t.pages, 1, span.length, `${path}.next.pages`) };
  });

  return {
    name: passageText(f.name, MAX_PASSAGE, `${path}.name`),
    pages: span.length,
    memorized,
    revised,
    lastRevisedDaysAgo,
    oldest,
    neverRevised,
    plan,
    strength,
    weakSpots,
    today,
    next,
  };
}

/** What the app shows for one revision day, `daysAgo` before the question's day; checked to add up. */
function dayFacts(v: unknown, path: string, daysAgo: number | null): RevoDayFacts {
  const f = obj(v, path);
  keys(f, ['daysAgo', 'plan', 'revised', 'minutes', 'readMinutes', 'memorized', 'ratings', 'recordings', 'notes'], path);
  const ago = int(f.daysAgo, 0, MAX_DAYS_AGO, `${path}.daysAgo`);
  if (daysAgo !== null && ago !== daysAgo) fail(`${path}.daysAgo`);
  const optName = (o: Obj, k: string, p: string, present: boolean) => {
    if (o[k] === undefined) return {};
    if (!present) fail(`${p}.${k}`);
    return { [k]: passageText(o[k], MAX_PASSAGE, `${p}.${k}`) };
  };

  const plan = maybe(f.plan, (x) => {
    const p = `${path}.plan`;
    const o = obj(x, p);
    keys(o, ['pages', 'name', 'carried', 'onDay', 'ahead', 'late', 'notDone', 'done'], p, ['pages', 'carried', 'onDay', 'ahead', 'late', 'notDone', 'done']);
    const n = int(o.pages, 1, MAX_PAGE, `${p}.pages`);
    const out = {
      pages: n,
      ...optName(o, 'name', p, true),
      carried: int(o.carried, 0, n, `${p}.carried`),
      onDay: int(o.onDay, 0, n, `${p}.onDay`),
      ahead: int(o.ahead, 0, n, `${p}.ahead`),
      late: int(o.late, 0, n, `${p}.late`),
      notDone: int(o.notDone, 0, n, `${p}.notDone`),
      done: bool(o.done, `${p}.done`),
    };
    if (out.onDay + out.ahead + out.late + out.notDone !== n) fail(p);
    // Carried pages are known for today only, and a page can't be caught up later yet; a past day
    // is done (for the streak) exactly when every page of it was revised for it.
    if (ago > 0 && (out.carried > 0 || out.done !== (out.notDone === 0))) fail(p);
    if (ago === 0 && out.late > 0) fail(p);
    return out;
  });

  const rv = obj(f.revised, `${path}.revised`);
  keys(rv, ['pages', 'name', 'forLater', 'forEarlier'], `${path}.revised`, ['pages', 'forLater', 'forEarlier']);
  const revisedPages = int(rv.pages, 0, MAX_PAGE, `${path}.revised.pages`);
  const revised = {
    pages: revisedPages,
    ...optName(rv, 'name', `${path}.revised`, revisedPages > 0),
    forLater: int(rv.forLater, 0, revisedPages, `${path}.revised.forLater`),
    forEarlier: int(rv.forEarlier, 0, revisedPages, `${path}.revised.forEarlier`),
  };
  if (revised.forLater + revised.forEarlier > revisedPages) fail(`${path}.revised`);
  // A page revised on its day was revised in the day's sessions.
  if (plan && plan.onDay > revisedPages) fail(`${path}.revised`);

  const m = obj(f.memorized, `${path}.memorized`);
  keys(m, ['pages', 'name'], `${path}.memorized`, ['pages']);
  const memorizedPages = int(m.pages, 0, MAX_PAGE, `${path}.memorized.pages`);
  const memorized = { pages: memorizedPages, ...optName(m, 'name', `${path}.memorized`, memorizedPages > 0) };

  const ra = obj(f.ratings, `${path}.ratings`);
  keys(ra, ['weak', 'moderate', 'strong', 'weakName', 'weakPages'], `${path}.ratings`, ['weak', 'moderate', 'strong', 'weakPages']);
  const weak = int(ra.weak, 0, MAX_PAGE, `${path}.ratings.weak`);
  const weakPages = pages(ra.weakPages, 20, `${path}.ratings.weakPages`);
  if (weakPages.length > weak || new Set(weakPages).size !== weakPages.length || (weak > 0 && weakPages.length === 0)) fail(`${path}.ratings.weakPages`);
  const ratings = {
    weak,
    moderate: int(ra.moderate, 0, MAX_PAGE, `${path}.ratings.moderate`),
    strong: int(ra.strong, 0, MAX_PAGE, `${path}.ratings.strong`),
    ...optName(ra, 'weakName', `${path}.ratings`, weak > 0),
    weakPages,
  };

  const recordings = maybe(f.recordings, (x) => {
    const o = obj(x, `${path}.recordings`);
    keys(o, ['count', 'minutes'], `${path}.recordings`);
    return { count: int(o.count, 0, 500, `${path}.recordings.count`), minutes: int(o.minutes, 0, MAX_DAY_MINUTES, `${path}.recordings.minutes`) };
  });
  const notes = maybe(f.notes, (x) => {
    const n = list(x, MAX_NOTES, `${path}.notes`, (t, p) => str(t, NOTE_CHARS, p));
    if (n.reduce((c, t) => c + t.length, 0) > DAY_NOTE_CHARS) fail(`${path}.notes`);
    return n;
  });

  return {
    daysAgo: ago,
    plan,
    revised,
    minutes: maybe(f.minutes, (x) => rounded(x, MAX_DAY_MINUTES, `${path}.minutes`)),
    readMinutes: maybe(f.readMinutes, (x) => rounded(x, MAX_DAY_MINUTES, `${path}.readMinutes`)),
    memorized,
    ratings,
    recordings,
    notes,
  };
}

/** One attachment. `today` (the question's revision day) checks a day's place; null skips that (stored ones). */
export function validateAttachment(v: unknown, today: string | null = null, path = 'attach'): RevoAttachment | null {
  if (v === null || v === undefined) return null;
  const a = obj(v, path);
  const kind = a.kind;
  if (typeof kind !== 'string' || !(kind in ATTACH_KEYS)) fail(`${path}.kind`);
  keys(a, ATTACH_KEYS[kind as RevoAttachment['kind']], path);
  switch (kind as RevoAttachment['kind']) {
    case 'day':
      return {
        kind: 'day',
        label: str(a.label, 40, `${path}.label`),
        day: day(a.day, `${path}.day`),
        revisedPages: pages(a.revisedPages, 60, `${path}.revisedPages`),
        memorizedPages: pages(a.memorizedPages, 60, `${path}.memorizedPages`),
        readMinutes: rounded(a.readMinutes, 1440, `${path}.readMinutes`),
        minutes: rounded(a.minutes, 1440, `${path}.minutes`),
        ratings: list(a.ratings, 60, `${path}.ratings`, (x, p) => {
          const r = obj(x, p);
          keys(r, ['page', 'rating'], p);
          return { page: int(r.page, 1, MAX_PAGE, `${p}.page`), rating: int(r.rating, 1, 5, `${p}.rating`) };
        }),
      };
    case 'page':
      return {
        kind: 'page',
        label: str(a.label, 60, `${path}.label`),
        pages: list(a.pages, 60, `${path}.pages`, (x, p) => {
          const g = obj(x, p);
          keys(g, ['page', 'rating', 'revisions', 'lastRevised', 'history'], p);
          return {
            page: int(g.page, 1, MAX_PAGE, `${p}.page`),
            rating: g.rating === null ? null : int(g.rating, 1, 5, `${p}.rating`),
            revisions: int(g.revisions, 0, 100_000, `${p}.revisions`),
            lastRevised: g.lastRevised === null ? null : day(g.lastRevised, `${p}.lastRevised`),
            history: list(g.history, 12, `${p}.history`, (y, q) => {
              const h = obj(y, q);
              keys(h, ['day', 'rating'], q);
              return { day: day(h.day, `${q}.day`), rating: int(h.rating, 1, 5, `${q}.rating`) };
            }),
          };
        }),
      };
    case 'note':
      return { kind: 'note', label: str(a.label, 40, `${path}.label`), day: day(a.day, `${path}.day`), text: str(a.text, 2000, `${path}.text`) };
    case 'recording':
      if (a.of !== 'revision' && a.of !== 'reading') fail(`${path}.of`);
      return {
        kind: 'recording',
        label: str(a.label, 40, `${path}.label`),
        day: day(a.day, `${path}.day`),
        of: a.of,
        seconds: rounded(a.seconds, 86_400, `${path}.seconds`),
        pages: pages(a.pages, 60, `${path}.pages`),
      };
    case 'insight':
      if (typeof a.insight !== 'string' || !(REVO_INSIGHTS as readonly string[]).includes(a.insight)) fail(`${path}.insight`);
      return { kind: 'insight', label: str(a.label, 40, `${path}.label`), insight: a.insight as RevoInsight };
    case 'surah': {
      const surah = int(a.surah, 1, 114, `${path}.surah`);
      return { kind: 'surah', label: str(a.label, 60, `${path}.label`), surah, facts: passageFacts(a.facts, `${path}.facts`, surahPages(surah)) };
    }
    case 'juz': {
      const juz = int(a.juz, 1, 30, `${path}.juz`);
      return { kind: 'juz', label: str(a.label, 60, `${path}.label`), juz, facts: passageFacts(a.facts, `${path}.facts`, juzPages(juz)) };
    }
    case 'pages': {
      const list_ = pages(a.pages, 60, `${path}.pages`);
      if (list_.length === 0 || list_.some((p, i) => i > 0 && p <= list_[i - 1])) fail(`${path}.pages`);
      return { kind: 'pages', label: str(a.label, 60, `${path}.label`), pages: list_, facts: passageFacts(a.facts, `${path}.facts`, list_) };
    }
    case 'revisionDay': {
      const d = day(a.day, `${path}.day`);
      if (today !== null && (d > today || dayNumber(today) - dayNumber(d) > MAX_DAYS_AGO)) fail(`${path}.day`);
      return {
        kind: 'revisionDay',
        label: str(a.label, 60, `${path}.label`),
        day: d,
        facts: dayFacts(a.facts, `${path}.facts`, today === null ? null : dayNumber(today) - dayNumber(d)),
      };
    }
  }
  return fail(`${path}.kind`);
}

/**
 * What a question carries: `attach` (one, as every app version sends it) or `attachments` (up to
 * MAX_ATTACHMENTS, from apps after Nov 7 2026), never both; each checked as above.
 */
export function validateAttachments(attach: unknown, attachments: unknown, today: string): RevoAttachment[] {
  if (attachments !== undefined && attachments !== null) {
    if (attach !== undefined && attach !== null) fail('attachments');
    if (!Array.isArray(attachments) || attachments.length === 0 || attachments.length > MAX_ATTACHMENTS) fail('attachments');
    return attachments.map((x, i) => validateAttachment(x, today, `attachments[${i}]`)!);
  }
  const one = validateAttachment(attach, today);
  return one ? [one] : [];
}

/** The pages an attachment names (what a chart or an action may point at). */
export function attachmentPages(a: RevoAttachment | null | undefined): number[] {
  if (!a) return [];
  switch (a.kind) {
    case 'day':
      return [...a.revisedPages, ...a.memorizedPages, ...a.ratings.map((r) => r.page)];
    case 'page':
      return a.pages.map((p) => p.page);
    case 'recording':
      return a.pages;
    case 'surah':
      return surahPages(a.surah);
    case 'juz':
      return juzPages(a.juz);
    case 'pages':
      return a.pages;
    case 'revisionDay':
      return a.facts.ratings.weakPages;
    default:
      return [];
  }
}

/** The pages the context names. */
export function contextPages(c: RevoContext): number[] {
  return [...c.today.nextPages, ...c.today.weakNext, ...c.weakPages];
}
