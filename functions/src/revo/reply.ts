/**
 * Revo's reply, checked. The model is asked for one JSON object; every part is validated and an
 * invalid chart, action, chip or fact is dropped rather than failing the answer. A chart or an
 * action that names a page the model wasn't given is dropped whole. A reply that isn't JSON is
 * its own text, and nothing else (a reply cut off mid-object keeps its text when it arrived whole).
 */
import { screenFromText } from './screenText';
import {
  REVO_MEMORIZED_MONTHS,
  REVO_SCREENS,
  REVO_SETTINGS_SECTIONS,
  REVO_TABLE_COLUMNS,
  REVO_TABLE_MAX_COLUMNS,
  REVO_TABLE_ROWS,
  REVO_TIMELINE_DAYS,
  REVO_WEEKS,
  RevoAction,
  RevoChart,
  RevoNewChart,
  RevoReplyParts,
  RevoTableColumn,
} from './types';

export const MAX_TEXT = 1500;
export const MAX_TEXT_AFTER = 300;
export const MAX_TITLE = 60;
export const MAX_CHIPS = 3;
export const MAX_CHIP = 40;
export const MAX_REMEMBER = 2;
export const MAX_FACT = 160;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A trimmed, non-empty string of at most `max` characters, or null. */
function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= max ? s : null;
}

/** The answer's text cut to MAX_TEXT. */
export function cutText(s: string): string {
  const t = s.trim();
  return t.length <= MAX_TEXT ? t : `${t.slice(0, MAX_TEXT - 1).trimEnd()}…`;
}

/** Whole page numbers, all given to the model, no repeats, `min`..`max` of them; else null. */
function givenPages(v: unknown, allowed: ReadonlySet<number>, min: number, max: number): number[] | null {
  if (!Array.isArray(v) || v.length < min || v.length > max) return null;
  if (!v.every((p) => typeof p === 'number' && Number.isInteger(p) && allowed.has(p))) return null;
  if (new Set(v).size !== v.length) return null;
  return v as number[];
}

export function checkChart(v: unknown, allowed: ReadonlySet<number>): RevoChart | null {
  if (!isObj(v)) return null;
  const title = clean(v.title, MAX_TITLE);
  if (!title) return null;
  if (v.kind === 'pageRatings') {
    const pages = givenPages(v.pages, allowed, 1, 4);
    return pages ? { kind: 'pageRatings', title, pages } : null;
  }
  if (v.kind === 'dailyPages' && (v.days === 7 || v.days === 30)) return { kind: 'dailyPages', title, days: v.days };
  return null;
}

/**
 * A newer chart kind (types.ts RevoNewChart), checked like the first two: anything wrong drops the
 * chart and keeps the answer. The app draws every figure from its own data; the reply only names
 * the chart.
 */
export function checkNewChart(v: unknown): RevoNewChart | null {
  if (!isObj(v)) return null;
  const title = clean(v.title, MAX_TITLE);
  if (!title) return null;
  if (v.kind === 'juzMap') return { kind: 'juzMap', title };
  if (v.kind === 'timeline') {
    const days = REVO_TIMELINE_DAYS.find((d) => d === v.days);
    const surah = v.surah ?? null;
    const juz = v.juz ?? null;
    if (!days || (surah === null) === (juz === null)) return null;
    if (surah !== null) return wholeIn(surah, 1, 114) ? { kind: 'timeline', title, surah, days } : null;
    return wholeIn(juz, 1, 30) ? { kind: 'timeline', title, juz, days } : null;
  }
  if (v.kind === 'weeks') return wholeIn(v.weeks, REVO_WEEKS.min, REVO_WEEKS.max) ? { kind: 'weeks', title, weeks: v.weeks } : null;
  if (v.kind === 'table') return checkTable(v, title);
  if (v.kind === 'memorized') {
    const months = REVO_MEMORIZED_MONTHS.find((m) => m === v.months);
    return months ? { kind: 'memorized', title, months } : null;
  }
  return null;
}

/** Distinct whole numbers in [min, max], `count.min`..`count.max` of them; else null. */
function distinctWhole(v: unknown, min: number, max: number, count: { min: number; max: number }): number[] | null {
  if (!Array.isArray(v) || v.length < count.min || v.length > count.max) return null;
  if (!v.every((x) => wholeIn(x, min, max)) || new Set(v).size !== v.length) return null;
  return v as number[];
}

function checkTable(v: Obj, title: string): RevoNewChart | null {
  const hasJuz = v.juz != null;
  if (hasJuz === (v.surahs != null)) return null;
  const rows = hasJuz ? distinctWhole(v.juz, 1, 30, REVO_TABLE_ROWS) : distinctWhole(v.surahs, 1, 114, REVO_TABLE_ROWS);
  const cols = v.columns;
  if (!rows || !Array.isArray(cols) || cols.length < 1 || cols.length > REVO_TABLE_MAX_COLUMNS || new Set(cols).size !== cols.length) return null;
  if (!cols.every((c) => (REVO_TABLE_COLUMNS as readonly unknown[]).includes(c))) return null;
  const columns = cols as RevoTableColumn[];
  return hasJuz ? { kind: 'table', title, juz: rows, columns } : { kind: 'table', title, surahs: rows, columns };
}

export function checkAction(v: unknown, allowed: ReadonlySet<number>): RevoAction | null {
  if (!isObj(v)) return null;
  const title = clean(v.title, 80);
  const detail = typeof v.detail === 'string' && v.detail.trim().length <= 100 ? v.detail.trim() : null;
  if (!title || detail === null) return null;
  if (v.kind === 'reviseFirst') {
    const pages = givenPages(v.pages, allowed, 1, 10);
    return pages ? { kind: 'reviseFirst', title, detail, pages } : null;
  }
  if (v.kind === 'openPage') {
    const page = v.page;
    return typeof page === 'number' && Number.isInteger(page) && allowed.has(page) ? { kind: 'openPage', title, detail, page } : null;
  }
  if (v.kind === 'startRevision') return { kind: 'startRevision', title, detail };
  if (v.kind === 'openScreen') return checkScreen(v, title, detail);
  return null;
}

const wholeIn = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * A screen of the fixed list (REVO-31). Settings may name one of its sections, the reader a
 * surah or a juz; anything else about it (an unknown section, a surah out of range, both a surah
 * and a juz) drops the action, as a page Revo wasn't given does.
 */
function checkScreen(v: Obj, title: string, detail: string): RevoAction | null {
  const screen = REVO_SCREENS.find((s) => s === v.screen);
  if (!screen) return null;
  const out: RevoAction = { kind: 'openScreen', title, detail, screen };
  if (screen === 'settings' && v.section != null) {
    const section = REVO_SETTINGS_SECTIONS.find((s) => s === v.section);
    if (!section) return null;
    out.section = section;
  }
  if (screen === 'reader') {
    const surah = v.surah ?? null;
    const juz = v.juz ?? null;
    if (surah !== null && juz !== null) return null;
    if (surah !== null) {
      if (!wholeIn(surah, 1, 114)) return null;
      out.surah = surah;
    }
    if (juz !== null) {
      if (!wholeIn(juz, 1, 30)) return null;
      out.juz = juz;
    }
  }
  return out;
}

function strings(v: unknown, max: number, each: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = clean(x, each);
    if (s && !out.includes(s)) out.push(s);
    if (out.length === max) break;
  }
  return out;
}

/** The model's text without a code fence around it. */
function unfenced(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function parsedObject(s: string): Obj | null {
  try {
    const v = JSON.parse(s);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** The object that opens at `at`: up to its own closing brace (braces inside strings skipped), or null. */
function objectAt(t: string, at: number): Obj | null {
  let depth = 0;
  let inString = false;
  for (let i = at; i < t.length; i++) {
    const c = t[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return parsedObject(t.slice(at, i + 1));
  }
  return null;
}

/**
 * The JSON object in the model's text. The model sometimes writes its answer in words first, then
 * the object in a ```json fence (the recorded "How was my week?", Nov 7 2026): the object is the
 * reply and the words around it are dropped, never shown with it. Tried in turn: from the first
 * "{" to the last "}" (as before); the fenced block's own text; each "{" that starts a line, up to
 * its own closing brace (words with braces in them before or after the object).
 */
function jsonObject(t: string): Obj | null {
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const whole = parsedObject(t.slice(start, end + 1));
  if (whole) return whole;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const fenced = fence ? parsedObject(fence[1].trim()) : null;
  if (fenced) return fenced;
  for (const m of t.matchAll(/(?:^|\n)[ \t]*\{/g)) {
    const found = objectAt(t, (m.index ?? 0) + m[0].indexOf('{'));
    if (found) return found;
  }
  return null;
}

/** A reply cut off mid-object (out of tokens): its "text" value when that much arrived whole. */
function salvageText(raw: string): string | null {
  const m = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
  if (!m) return null;
  try {
    const s = JSON.parse(`"${m[1]}"`);
    return typeof s === 'string' && s.trim().length > 0 ? s : null;
  } catch {
    return null;
  }
}

/**
 * The reply's parts. `allowed`: the pages in the context and attachments. Null when there is no
 * answer to show (the model's object had no text).
 */
export function parseReply(raw: string, allowed: ReadonlySet<number>, opts: { firstTurn: boolean }): RevoReplyParts | null {
  const t = unfenced(raw);
  const o = jsonObject(t);
  if (!o || typeof o.text !== 'string' || o.text.trim() === '') {
    // Not the object: plain words are the answer; a broken object keeps its text if it can. Plain
    // words that name a screen still get its card (REVO-31; how-to answers came back as plain text).
    const text = t.startsWith('{') ? salvageText(t) : raw;
    if (!text || !text.trim()) return null;
    const found = screenFromText(text);
    return found ? { text: cutText(text), remember: [], action: found } : { text: cutText(text), remember: [] };
  }
  const out: RevoReplyParts = { text: cutText(o.text), remember: strings(o.remember, MAX_REMEMBER, MAX_FACT) };
  // The model names every kind as "chart"; a newer kind goes out as `visual` (apps before it don't read it).
  const chart = checkChart(o.chart, allowed);
  if (chart) out.chart = chart;
  else {
    const visual = checkNewChart(o.chart);
    if (visual) out.visual = visual;
  }
  const textAfter = clean(o.textAfter, MAX_TEXT_AFTER);
  if (textAfter) out.textAfter = textAfter;
  // One action: an object, or the first valid one of a list.
  const actions = Array.isArray(o.action) ? o.action : [o.action];
  for (const a of actions) {
    const action = checkAction(a, allowed);
    if (action) {
      out.action = action;
      break;
    }
  }
  // An answer that names a screen but suggests nothing gets that screen's card (REVO-31).
  if (!out.action) {
    const found = screenFromText([out.text, out.textAfter].filter(Boolean).join('\n'));
    if (found) out.action = found;
  }
  const chips = strings(o.chips, MAX_CHIPS, MAX_CHIP);
  if (chips.length > 0) out.chips = chips;
  if (opts.firstTurn && typeof o.title === 'string' && o.title.trim()) out.title = o.title.trim().slice(0, MAX_TITLE).trimEnd();
  return out;
}
