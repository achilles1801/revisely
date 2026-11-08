// Revo's reply schema (structured outputs) allows exactly what reply.ts accepts, stays inside the
// API's limits, and goes on every Revo request and no coach request.
import { buildCoachRequest } from '../coach/prompt';
import { buildAskRequest, buildReviewRequest } from './prompt';
import { parseReply } from './reply';
import { ACTION_SCHEMAS, CHART_SCHEMAS, REVO_OUTPUT_CONFIG, REVO_REPLY_SCHEMA } from './replySchema';
import { REVO_NEW_CHART_KINDS, REVO_SCREENS, REVO_SETTINGS_SECTIONS, REVO_TABLE_COLUMNS, REVO_TIMELINE_DAYS, RevoContext } from './types';

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
    expect(enums).toEqual(expect.arrayContaining([[...REVO_SCREENS], [...REVO_SETTINGS_SECTIONS], [...REVO_TABLE_COLUMNS], [...REVO_TIMELINE_DAYS], [7, 30]]));
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

  it('allows nothing more: no unknown kind, field or screen, and every field present', () => {
    const bad = [
      { ...base, chart: { kind: 'pieChart', title: 'Pie' } },
      { ...base, chart: { kind: 'juzMap', title: 'Your juz', juz: 4 } },
      { ...base, chart: { kind: 'dailyPages', title: 'Two weeks', days: 14 } },
      { ...base, chart: { kind: 'timeline', title: 'Al-Hashr', surah: 59, days: 60 } },
      { ...base, chart: { kind: 'table', title: 'x', juz: [26, 27], columns: ['colour'] } },
      { ...base, action: { kind: 'openScreen', title: 'x', detail: '', screen: 'nowhere' } },
      { ...base, action: { kind: 'teleport', title: 'x', detail: '' } },
      { ...base, extra: true },
      { text: 'Only words.' },
    ];
    for (const reply of bad) expect(valid(REVO_REPLY_SCHEMA, reply)).toBe(false);
  });

  it('stays inside the API’s limits: objects closed, at most 16 unions and 24 optional parameters', () => {
    const objects = walk(REVO_REPLY_SCHEMA).filter((s) => s.type === 'object');
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
    const keywords = new Set(walk(REVO_REPLY_SCHEMA).flatMap((s) => Object.keys(s)));
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
    expect(REVO_OUTPUT_CONFIG.format.type).toBe('json_schema');
    const coach = buildCoachRequest({ kind: 'coverage' } as never, {} as never) as unknown as Record<string, unknown>;
    expect(coach.output_config).toBeUndefined();
  });
});
