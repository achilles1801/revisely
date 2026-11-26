// Revo's reply schema (structured outputs) allows exactly what reply.ts accepts, stays inside the
// API's limits, and goes on every Revo request and no coach request.
import { buildCoachRequest } from '../coach/prompt';
import { createHash } from 'crypto';
import { buildAskRequest, buildReviewRequest, withStoreSchema } from './prompt';
import { parseReply } from './reply';
import { ACTION_SCHEMAS, CHART_SCHEMAS, REVO_OUTPUT_CONFIG, REVO_REPLY_SCHEMA, REVO_SCHEDULE_OUTPUT_CONFIG, REVO_SCHEDULE_REPLY_SCHEMA, SCHEDULE_CHARTS } from './replySchema';
import { REVO_MEMORIZED_MONTHS, REVO_NEW_CHART_KINDS, REVO_SCREENS, REVO_SETTINGS_SECTIONS, REVO_TABLE_COLUMNS, REVO_TIMELINE_DAYS, RevoContext } from './types';

type Schema = Record<string, unknown>;

/** The JSON Schema keywords this schema uses, checked as the API reads them. */
function valid(schema: Schema, v: unknown): boolean {
  if (Array.isArray(schema.anyOf)) return (schema.anyOf as Schema[]).some((s) => valid(s, v));
  if ('const' in schema && v !== schema.const) return false;
  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(v)) return false;
  const types = Array.isArray(schema.type) ? (schema.type as string[]) : schema.type ? [schema.type as string] : [];
  if (types.length > 0) {
    const is = (t: string) =>
      t === 'null' ? v === null
      : t === 'integer' ? Number.isInteger(v)
      : t === 'array' ? Array.isArray(v)
      : t === 'object' ? typeof v === 'object' && v !== null && !Array.isArray(v)
      : typeof v === t;
    if (!types.some(is)) return false;
  }
  if (Array.isArray(v) && schema.items) return v.every((x) => valid(schema.items as Schema, x));
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && schema.properties) {
    const props = schema.properties as Record<string, Schema>;
    const o = v as Record<string, unknown>;
    if (schema.additionalProperties === false && Object.keys(o).some((k) => !(k in props))) return false;
    if (((schema.required as string[]) ?? []).some((k) => !(k in o))) return false;
    return Object.entries(o).every(([k, x]) => valid(props[k], x));
  }
  return true;
}

/** Every schema object inside `s`, depth first. */
function walk(s: unknown, out: Schema[] = []): Schema[] {
  if (Array.isArray(s)) s.forEach((x) => walk(x, out));
  else if (s && typeof s === 'object') {
    out.push(s as Schema);
    Object.values(s).forEach((x) => walk(x, out));
  }
  return out;
}

const base = { text: 'Juz 4 and Juz 5.', chart: null, textAfter: null, action: null, remember: [], title: 'Juz', chips: [] };
const allowed = new Set([548, 549, 550]);
const charts = [
  { kind: 'dailyPages', title: 'This week', days: 7 },
  { kind: 'pageRatings', title: 'The end of Al-Hashr', pages: [548, 549] },
  { kind: 'juzMap', title: 'Your juz' },
  { kind: 'timeline', title: 'Al-Hashr', surah: 59, days: 90 },
  { kind: 'timeline', title: 'Juz 4', juz: 4, days: 365 },
  { kind: 'weeks', title: 'Eight weeks', weeks: 8 },
  { kind: 'table', title: 'Juz 26–28', juz: [26, 27, 28], columns: ['lastRevised', 'weak'] },
  { kind: 'table', title: 'Three surahs', surahs: [59, 60, 61], columns: ['strength'] },
  { kind: 'memorized', title: 'Pages memorized', months: 12 },
];
const actions = [
  { kind: 'reviseFirst', title: 'The end of Al-Hashr first', detail: 'Before the rest', pages: [548] },
  { kind: 'openPage', title: 'Open the end of Al-Hashr', detail: '', page: 548 },
  { kind: 'startRevision', title: 'Continue today', detail: 'From Al-Hashr 17' },
  { kind: 'openScreen', title: 'Edit schedule', detail: '', screen: 'planEditor' },
  { kind: 'openScreen', title: 'Appearance', detail: '', screen: 'settings', section: 'appearance' },
  { kind: 'openScreen', title: 'Open Al-Mulk', detail: '', screen: 'reader', surah: 67 },
];

describe('Revo’s reply schema', () => {
  it('lists every chart and action kind reply.ts takes, with its own lists of values', () => {
    expect(Object.keys(CHART_SCHEMAS).sort()).toEqual(['dailyPages', 'pageRatings', ...REVO_NEW_CHART_KINDS].sort());
    expect(Object.keys(ACTION_SCHEMAS).sort()).toEqual(['openPage', 'openScreen', 'reviseFirst', 'startRevision']);
    const enums = walk(REVO_REPLY_SCHEMA).filter((s) => Array.isArray(s.enum)).map((s) => s.enum);
    expect(enums).toEqual(expect.arrayContaining([[...REVO_SCREENS], [...REVO_SETTINGS_SECTIONS], [...REVO_TABLE_COLUMNS], [...REVO_TIMELINE_DAYS], [...REVO_MEMORIZED_MONTHS], [7, 30]]));
  });

  it('every reply reply.ts keeps is one the schema allows, and the other way round', () => {
    for (const chart of charts) {
      const reply = { ...base, chart };
      expect(valid(REVO_REPLY_SCHEMA, reply)).toBe(true);
      const parsed = parseReply(JSON.stringify(reply), allowed, { firstTurn: true })!;
      expect(parsed.chart ?? parsed.visual).toEqual(chart);
    }
    for (const action of actions) {
      const reply = { ...base, textAfter: 'Here’s a plan:', action, chips: ['How was my week?'], remember: ['Revises after Fajr'] };
      expect(valid(REVO_REPLY_SCHEMA, reply)).toBe(true);
      expect(parseReply(JSON.stringify(reply), allowed, { firstTurn: true })!.action).toEqual(action);
    }
  });

  it('[REVO-43] a drafted schedule: in the schedule schema only, every field asked for, kept in range', () => {
    const drafts = [
      { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day, Fridays off', mode: 'pages', perDay: 6, restDays: [5], reverse: false },
      { kind: 'draftSchedule', title: 'A new schedule', detail: 'A juz a day, from An-Nas back', mode: 'juz', perDay: 1, restDays: [], reverse: true },
    ];
    // What the app gets: no restDays for none, no reverse for the usual order (as before the fields were required).
    const kept = [
      { kind: 'draftSchedule', title: 'A new schedule', detail: '6 pages a day, Fridays off', mode: 'pages', perDay: 6, restDays: [5] },
      { kind: 'draftSchedule', title: 'A new schedule', detail: 'A juz a day, from An-Nas back', mode: 'juz', perDay: 1, reverse: true },
    ];
    drafts.forEach((action, i) => {
      const reply = JSON.stringify({ ...base, action });
      expect(valid(REVO_SCHEDULE_REPLY_SCHEMA, { ...base, action })).toBe(true);
      expect(valid(REVO_REPLY_SCHEMA, { ...base, action })).toBe(false);
      expect(parseReply(reply, allowed, { firstTurn: true, drafts: true })!.action).toEqual(kept[i]);
      expect(parseReply(reply, allowed, { firstTurn: true })!.action).toBeUndefined();
    });
    // Every field is required: a draft without its rest days or order doesn't fit the schema.
    const { restDays: _r, ...noRest } = drafts[0];
    const { reverse: _v, ...noOrder } = drafts[0];
    expect(valid(REVO_SCHEDULE_REPLY_SCHEMA, { ...base, action: noRest })).toBe(false);
    expect(valid(REVO_SCHEDULE_REPLY_SCHEMA, { ...base, action: noOrder })).toBe(false);
    const out = (a: object) => parseReply(JSON.stringify({ ...base, action: { kind: 'draftSchedule', title: 'x', detail: '', restDays: [], reverse: false, ...a } }), allowed, { firstTurn: true, drafts: true })!.action;
    expect(out({ mode: 'pages', perDay: 41 })).toBeUndefined();
    expect(out({ mode: 'juz', perDay: 4 })).toBeUndefined();
    expect(out({ mode: 'pages', perDay: 6, restDays: [7] })).toBeUndefined();
    expect(out({ mode: 'pages', perDay: 6, restDays: [1, 2, 3, 4] })).toBeUndefined();
    expect(out({ mode: 'juz', perDay: 1, restDays: [5] })).toBeUndefined();
    expect(out({ mode: 'hours', perDay: 6 })).toBeUndefined();
    expect(out({ mode: 'pages', perDay: 6 })).toEqual({ kind: 'draftSchedule', title: 'x', detail: '', mode: 'pages', perDay: 6 });
  });

  it('[REVO-43] the store app’s schema is exactly the one that answered before the draft; the schedule’s has the draft, every action and the schedule’s charts', () => {
    // Nov 26 2026: the draft as one more branch made the API refuse every question from Revisely Dev with a 400 ("The
    // compiled grammar is too large…", a limit it doesn't publish), with or without optional fields, though both counts
    // below were inside their limits. ca725b35… is the schema every answer before it was given with.
    // What the real API compiles is recorded by functions/scripts/check-revo-schemas.js (emulator.test.ts checks both).
    const sha = (o: object) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
    expect(sha(REVO_OUTPUT_CONFIG)).toBe('ca725b35345fa9d4316a6e08e45b7f3a3c7c7833def4ea0b669b4c4d39dfba1e');
    const counts = (schema: Schema) => {
      const objects = walk(schema).filter((s) => s.type === 'object');
      const props = objects.flatMap((o) => Object.values(o.properties as Record<string, Schema>));
      return {
        optional: objects.reduce((n, o) => n + Object.keys(o.properties as object).length - (o.required as string[]).length, 0),
        unions: props.filter((p) => Array.isArray(p.anyOf) || Array.isArray(p.type)).length,
      };
    };
    expect(counts(REVO_REPLY_SCHEMA)).toEqual({ optional: 7, unions: 3 });
    // The timeline's and the table's optional fields go with them; the draft adds none.
    expect(counts(REVO_SCHEDULE_REPLY_SCHEMA)).toEqual({ optional: 3, unions: 3 });
    const kinds = (schema: Schema, field: string) => ((schema.properties as Record<string, Schema>)[field].anyOf as Schema[]).map((b) => (b.properties as Record<string, Schema> | undefined)?.kind?.const ?? null);
    expect(kinds(REVO_SCHEDULE_REPLY_SCHEMA, 'chart')).toEqual([null, ...SCHEDULE_CHARTS]);
    expect(kinds(REVO_SCHEDULE_REPLY_SCHEMA, 'action')).toEqual([null, 'reviseFirst', 'openPage', 'startRevision', 'openScreen', 'draftSchedule']);
  });

  it('allows nothing more: no unknown kind, field or screen, and every field present', () => {
    const bad = [
      { ...base, chart: { kind: 'pieChart', title: 'Pie' } },
      { ...base, chart: { kind: 'juzMap', title: 'Your juz', juz: 4 } },
      { ...base, chart: { kind: 'dailyPages', title: 'Two weeks', days: 14 } },
      { ...base, chart: { kind: 'timeline', title: 'Al-Hashr', surah: 59, days: 60 } },
      { ...base, chart: { kind: 'table', title: 'x', juz: [26, 27], columns: ['colour'] } },
      { ...base, chart: { kind: 'memorized', title: 'Pages memorized', months: 3 } },
      { ...base, action: { kind: 'openScreen', title: 'x', detail: '', screen: 'nowhere' } },
      { ...base, action: { kind: 'teleport', title: 'x', detail: '' } },
      { ...base, extra: true },
      { text: 'Only words.' },
    ];
    for (const reply of bad) expect(valid(REVO_REPLY_SCHEMA, reply)).toBe(false);
  });

  it.each([
    ['the store app’s', REVO_REPLY_SCHEMA],
    ['the schedule’s', REVO_SCHEDULE_REPLY_SCHEMA],
  ])('%s stays inside the API’s limits: objects closed, at most 16 unions and 24 optional parameters', (_name, schema) => {
    const objects = walk(schema).filter((s) => s.type === 'object');
    for (const o of objects) {
      expect(o.additionalProperties).toBe(false);
      for (const k of o.required as string[]) expect(Object.keys(o.properties as object)).toContain(k);
    }
    const props = objects.flatMap((o) => Object.values(o.properties as Record<string, Schema>));
    const unions = props.filter((p) => Array.isArray(p.anyOf) || Array.isArray(p.type));
    const optional = objects.reduce((n, o) => n + Object.keys(o.properties as object).length - (o.required as string[]).length, 0);
    expect(unions.length).toBeLessThanOrEqual(16);
    expect(optional).toBeLessThanOrEqual(24);
    // Nothing structured outputs refuses.
    const keywords = new Set(walk(schema).flatMap((s) => Object.keys(s)));
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'maxItems', 'pattern', 'oneOf']) expect(keywords.has(k)).toBe(false);
  });

  it('goes on every Revo request (questions and the day in review), and on no coach request', () => {
    const context = {
      totals: { memorizedPages: 0, revisedWithin7Days: 0, revisedWithin30Days: 0, daysWithSession30: 0, streakDays: 0, sessions30: 0, weakPages: 0, moderatePages: 0, strongPages: 0, weakRevisedLast7Days: 0, pagesPerDay7: 0, pagesPerDay30: 0, plannedPerDay: 0 },
      today: { plannedPages: 0, revisedPages: 0, minutes: 0, memorizedPages: 0, nextPages: [], weakNext: [], done: false },
      weakPages: [],
      week: [],
      localTime: null,
    } as RevoContext;
    expect(buildAskRequest({ day: '2026-11-05', question: 'How was my week?', context, attached: [], memory: [], history: [] }).output_config).toEqual(REVO_OUTPUT_CONFIG);
    expect(buildReviewRequest({ day: '2026-11-05', context, memory: [] }).output_config).toEqual(REVO_OUTPUT_CONFIG);
    // Revo opened from Edit schedule in Revisely Dev asks with the schedule schema (the draft); every other Dev question,
    // and its day in review, with the store's; asked again, the store's. `place` from the store app is never kept (validate.ts).
    const schedule = buildAskRequest({ day: '2026-11-05', question: 'Make it lighter', context: { ...context, app: 'dev', place: 'schedule' }, attached: [], memory: [], history: [] });
    expect(schedule.output_config).toBe(REVO_SCHEDULE_OUTPUT_CONFIG);
    expect(buildAskRequest({ day: '2026-11-05', question: 'Make it lighter', context: { ...context, app: 'dev' }, attached: [], memory: [], history: [] }).output_config).toBe(REVO_OUTPUT_CONFIG);
    expect(buildAskRequest({ day: '2026-11-05', question: 'Make it lighter', context: { ...context, place: 'schedule' }, attached: [], memory: [], history: [] }).output_config).toBe(REVO_OUTPUT_CONFIG);
    expect(buildReviewRequest({ day: '2026-11-05', context: { ...context, app: 'dev', place: 'schedule' }, memory: [] }).output_config).toBe(REVO_OUTPUT_CONFIG);
    expect(withStoreSchema(schedule)).toEqual({ ...schedule, output_config: REVO_OUTPUT_CONFIG });
    expect(withStoreSchema(buildAskRequest({ day: '2026-11-05', question: 'How was my week?', context, attached: [], memory: [], history: [] }))).toBeNull();
    expect(REVO_OUTPUT_CONFIG.format.type).toBe('json_schema');
    const coach = buildCoachRequest({ kind: 'coverage' } as never, {} as never) as unknown as Record<string, unknown>;
    expect(coach.output_config).toBeUndefined();
  });
});
