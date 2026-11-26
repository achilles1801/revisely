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
 * optional ones across the schema (replySchema.test.ts counts them), and an unpublished limit on the
 * compiled grammar's size, a 400 ("The compiled grammar is too large…"). The store app's schema is
 * close to that limit: on Nov 26 2026 the real API refused it with the draft added, also with every
 * draft field required, with the optional fields made required, and with a draft of five fields; it
 * compiled with any one of the charts' table, the timeline or openScreen taken out
 * (functions/scripts/check-revo-schemas.js records what it compiles, and the emulator refuses the rest).
 * So the draft goes only where it's needed: Revo opened from Edit schedule in Revisely Dev
 * (the context's `place`) gets the schedule schema, the draft with the charts a schedule question needs
 * (a day's pages, the weeks, the juz map), with room left for two more actions as big as openScreen. Every
 * other question keeps the store's, exactly the one that answered before the draft (its hash is pinned in
 * replySchema.test.ts). A schedule question the API still refuses is asked again with the store's (handler.ts).
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

/**
 * A drafted schedule (REVO-43), only in the schedule schema. Every field is required, so it adds no
 * optional parameter: restDays [] is no rest day, reverse false the usual order (reply.ts reads both so).
 */
export const DRAFT_SCHEDULE_SCHEMA: Schema = object({
  kind: kind('draftSchedule'),
  title: text,
  detail: text,
  mode: { type: 'string', enum: ['pages', 'juz'] },
  perDay: whole,
  restDays: wholes,
  reverse: { type: 'boolean' },
});

function replySchema(charts: readonly Schema[], actions: readonly Schema[]): Schema {
  return object({
    text,
    chart: { anyOf: [{ type: 'null' }, ...charts] },
    textAfter: { type: ['string', 'null'] },
    action: { anyOf: [{ type: 'null' }, ...actions] },
    remember: { type: 'array', items: text },
    title: text,
    chips: { type: 'array', items: text },
  });
}

/** Every question but the schedule's, and every day in review: exactly the schema before the draft. */
export const REVO_REPLY_SCHEMA: Schema = replySchema(Object.values(CHART_SCHEMAS), Object.values(ACTION_SCHEMAS));

/** The charts a schedule question needs: how a day went, which days they miss, which juz are overdue. */
export const SCHEDULE_CHARTS = ['dailyPages', 'weeks', 'juzMap'] as const;

/** Revo opened from Edit schedule in Revisely Dev (REVO-43): the draft, every action, and the schedule's charts. */
export const REVO_SCHEDULE_REPLY_SCHEMA: Schema = replySchema(
  SCHEDULE_CHARTS.map((k) => CHART_SCHEMAS[k]),
  [...Object.values(ACTION_SCHEMAS), DRAFT_SCHEDULE_SCHEMA],
);

/** What Revo's requests send: the reply as that one JSON object. */
export const REVO_OUTPUT_CONFIG = { format: { type: 'json_schema' as const, schema: REVO_REPLY_SCHEMA } };

/** What a schedule question sends. */
export const REVO_SCHEDULE_OUTPUT_CONFIG = { format: { type: 'json_schema' as const, schema: REVO_SCHEDULE_REPLY_SCHEMA } };
