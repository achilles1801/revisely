/**
 * What the app may send Revo, checked field by field: the context (numbers and page numbers),
 * and an attachment only of the kinds the contract names. Unknown fields, wrong types and
 * values out of range are refused. Minutes and seconds may arrive as fractions (a session's
 * length) and are rounded; page numbers, ratings and counts must be whole.
 * Messages here never say "date": the app reads that word as a clock problem.
 */
import { REVO_INSIGHTS, REVO_TOTALS, RevoAttachment, RevoContext, RevoInsight, RevoTotals } from './types';

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

export function validateContext(v: unknown): RevoContext {
  const c = obj(v, 'context');
  keys(c, ['totals', 'today', 'weakPages', 'week', 'localTime'], 'context', ['totals', 'today', 'weakPages', 'week']);

  const t = obj(c.totals, 'context.totals');
  keys(t, REVO_TOTALS, 'context.totals');
  const totals = {} as RevoTotals;
  for (const k of REVO_TOTALS) totals[k] = num(t[k], 0, MAX_COUNT, `context.totals.${k}`);

  const d = obj(c.today, 'context.today');
  keys(d, ['plannedPages', 'revisedPages', 'minutes', 'memorizedPages', 'nextPages', 'weakNext', 'done'], 'context.today');
  if (typeof d.done !== 'boolean') fail('context.today.done');
  const today = {
    plannedPages: int(d.plannedPages, 0, MAX_COUNT, 'context.today.plannedPages'),
    revisedPages: int(d.revisedPages, 0, MAX_COUNT, 'context.today.revisedPages'),
    minutes: rounded(d.minutes, MAX_COUNT, 'context.today.minutes'),
    memorizedPages: int(d.memorizedPages, 0, MAX_COUNT, 'context.today.memorizedPages'),
    nextPages: pages(d.nextPages, 20, 'context.today.nextPages'),
    weakNext: pages(d.weakNext, 20, 'context.today.weakNext'),
    done: d.done,
  };

  const week = list(c.week, 7, 'context.week', (x, p) => {
    const w = obj(x, p);
    keys(w, ['day', 'pages'], p);
    return { day: day(w.day, `${p}.day`), pages: int(w.pages, 0, MAX_COUNT, `${p}.pages`) };
  });

  const lt = c.localTime ?? null;
  if (lt !== null && (typeof lt !== 'string' || !TIME_RE.test(lt))) fail('context.localTime');

  return { totals, today, weakPages: pages(c.weakPages, 30, 'context.weakPages'), week, localTime: lt };
}

const ATTACH_KEYS: Record<RevoAttachment['kind'], readonly string[]> = {
  day: ['kind', 'label', 'day', 'revisedPages', 'memorizedPages', 'readMinutes', 'minutes', 'ratings'],
  page: ['kind', 'label', 'pages'],
  note: ['kind', 'label', 'day', 'text'],
  recording: ['kind', 'label', 'day', 'of', 'seconds', 'pages'],
  insight: ['kind', 'label', 'insight'],
};

export function validateAttachment(v: unknown): RevoAttachment | null {
  if (v === null || v === undefined) return null;
  const a = obj(v, 'attach');
  const kind = a.kind;
  if (typeof kind !== 'string' || !(kind in ATTACH_KEYS)) fail('attach.kind');
  keys(a, ATTACH_KEYS[kind as RevoAttachment['kind']], 'attach');
  switch (kind as RevoAttachment['kind']) {
    case 'day':
      return {
        kind: 'day',
        label: str(a.label, 40, 'attach.label'),
        day: day(a.day, 'attach.day'),
        revisedPages: pages(a.revisedPages, 60, 'attach.revisedPages'),
        memorizedPages: pages(a.memorizedPages, 60, 'attach.memorizedPages'),
        readMinutes: rounded(a.readMinutes, 1440, 'attach.readMinutes'),
        minutes: rounded(a.minutes, 1440, 'attach.minutes'),
        ratings: list(a.ratings, 60, 'attach.ratings', (x, p) => {
          const r = obj(x, p);
          keys(r, ['page', 'rating'], p);
          return { page: int(r.page, 1, MAX_PAGE, `${p}.page`), rating: int(r.rating, 1, 5, `${p}.rating`) };
        }),
      };
    case 'page':
      return {
        kind: 'page',
        label: str(a.label, 60, 'attach.label'),
        pages: list(a.pages, 60, 'attach.pages', (x, p) => {
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
      return { kind: 'note', label: str(a.label, 40, 'attach.label'), day: day(a.day, 'attach.day'), text: str(a.text, 2000, 'attach.text') };
    case 'recording':
      if (a.of !== 'revision' && a.of !== 'reading') fail('attach.of');
      return {
        kind: 'recording',
        label: str(a.label, 40, 'attach.label'),
        day: day(a.day, 'attach.day'),
        of: a.of,
        seconds: rounded(a.seconds, 86_400, 'attach.seconds'),
        pages: pages(a.pages, 60, 'attach.pages'),
      };
    case 'insight':
      if (typeof a.insight !== 'string' || !(REVO_INSIGHTS as readonly string[]).includes(a.insight)) fail('attach.insight');
      return { kind: 'insight', label: str(a.label, 40, 'attach.label'), insight: a.insight as RevoInsight };
  }
  return fail('attach.kind');
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
    default:
      return [];
  }
}

/** The pages the context names. */
export function contextPages(c: RevoContext): number[] {
  return [...c.today.nextPages, ...c.today.weakNext, ...c.weakPages];
}
