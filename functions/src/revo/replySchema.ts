/**
 * The shape of Revo's reply, as a JSON schema for structured outputs (`output_config.format`): the
 * API then returns the one JSON object every time. Before this (Nov 8 2026), 13 of 24 sampled
 * replies to chart questions came back with words around the object, or as plain prose with no
 * chart, action or chips (scripts/revo-chart-samples.js).
 *
 * It allows exactly what reply.ts accepts, and nothing more. reply.ts still checks every field:
 * the schema can't say "1 to 4 pages", "at most 60 characters" or "a page Revo was given"
 * (structured outputs support no number ranges, string lengths or maxItems). It also still reads a
 * reply that isn't the object: a refusal or a cut-off reply may not match the schema, and older
 * recordings don't.
 *
 * Limits on the API's side: at most 16 union-typed parameters (anyOf, or a type array) and 24
 * optional ones across the schema (replySchema.test.ts counts them).
 */
import { REVO_MEMORIZED_MONTHS, REVO_SCREENS, REVO_SETTINGS_SECTIONS, REVO_TABLE_COLUMNS, REVO_TIMELINE_DAYS } from './types';

type Schema = Record<string, unknown>;

const text: Schema = { type: 'string' };
const whole: Schema = { type: 'integer' };
const wholes: Schema = { type: 'array', items: whole };

/** An object of exactly these properties; all required but `optional`. */
function object(properties: Record<string, Schema>, optional: readonly string[] = []): Schema {
  return { type: 'object', properties, required: Object.keys(properties).filter((k) => !optional.includes(k)), additionalProperties: false };
}

const kind = (k: string): Schema => ({ type: 'string', const: k });

/** The charts: the first two (the reply's `chart`) and the newer ones (its `visual`). */
export const CHART_SCHEMAS: Record<string, Schema> = {
  dailyPages: object({ kind: kind('dailyPages'), title: text, days: { type: 'integer', enum: [7, 30] } }),
  pageRatings: object({ kind: kind('pageRatings'), title: text, pages: wholes }),
  juzMap: object({ kind: kind('juzMap'), title: text }),
  timeline: object({ kind: kind('timeline'), title: text, surah: whole, juz: whole, days: { type: 'integer', enum: [...REVO_TIMELINE_DAYS] } }, ['surah', 'juz']),
  weeks: object({ kind: kind('weeks'), title: text, weeks: whole }),
  table: object(
    { kind: kind('table'), title: text, juz: wholes, surahs: wholes, columns: { type: 'array', items: { type: 'string', enum: [...REVO_TABLE_COLUMNS] } } },
    ['juz', 'surahs'],
  ),
  memorized: object({ kind: kind('memorized'), title: text, months: { type: 'integer', enum: [...REVO_MEMORIZED_MONTHS] } }),
};

/** The one suggestion an answer may carry. */
export const ACTION_SCHEMAS: Record<string, Schema> = {
  reviseFirst: object({ kind: kind('reviseFirst'), title: text, detail: text, pages: wholes }),
  openPage: object({ kind: kind('openPage'), title: text, detail: text, page: whole }),
  startRevision: object({ kind: kind('startRevision'), title: text, detail: text }),
  openScreen: object(
    {
      kind: kind('openScreen'),
      title: text,
      detail: text,
      screen: { type: 'string', enum: [...REVO_SCREENS] },
      section: { type: 'string', enum: [...REVO_SETTINGS_SECTIONS] },
      surah: whole,
      juz: whole,
    },
    ['section', 'surah', 'juz'],
  ),
};

export const REVO_REPLY_SCHEMA: Schema = object({
  text,
  chart: { anyOf: [{ type: 'null' }, ...Object.values(CHART_SCHEMAS)] },
  textAfter: { type: ['string', 'null'] },
  action: { anyOf: [{ type: 'null' }, ...Object.values(ACTION_SCHEMAS)] },
  remember: { type: 'array', items: text },
  title: text,
  chips: { type: 'array', items: text },
});

/** What Revo's requests send: the reply as that one JSON object. */
export const REVO_OUTPUT_CONFIG = { format: { type: 'json_schema' as const, schema: REVO_REPLY_SCHEMA } };
