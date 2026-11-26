/**
 * For a question asked anywhere in Revo (not from the mushaf): is it about the Qur'an, and which ayat? One small
 * Haiku 5.5 call (212 tokens in, measured; a fraction of a cent) before the answer. Only then does the answer come
 * from the tafsir; every other question goes to Revo as before.
 */
import type { MessagesRequest } from '../../coach/call';
import { COACH_MODEL } from '../../coach/pricing';
import { AYAH_COUNTS } from './ayat';

export const LOCATE_MODEL = COACH_MODEL;
export const LOCATE_MAX_TOKENS = 200;
/** At most this many ayat from a range are answered from. */
export const LOCATE_MAX_AYAT = 15;

export const LOCATE_SYSTEM = [
  "You find where in the Qur'an a question is about. Reply with the JSON object only.",
  "- about_quran is true when the question asks what an ayah or passage means, what happens in it, who someone in it is, or why something in it is so, including a story or a person of the Qur'an (\"why was Musa afraid of the snake?\"). Questions about the person's own revision, memorizing, plan, progress or the app are false, and so are rulings (fiqh).",
  "- ayat: the passage the question is about, as surah, first ayah and last ayah (Hafs numbering), at most 15 ayat; a second range only when the question is about two places. An empty list when you can't tell where it is.",
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    about_quran: { type: 'boolean' },
    ayat: {
      type: 'array',
      items: {
        type: 'object',
        properties: { surah: { type: 'integer' }, from: { type: 'integer' }, to: { type: 'integer' } },
        required: ['surah', 'from', 'to'],
        additionalProperties: false,
      },
    },
  },
  required: ['about_quran', 'ayat'],
  additionalProperties: false,
};

export function buildLocateRequest(question: string): MessagesRequest {
  return {
    model: LOCATE_MODEL,
    max_tokens: LOCATE_MAX_TOKENS,
    thinking: { type: 'disabled' },
    system: [{ type: 'text', text: LOCATE_SYSTEM }],
    messages: [{ role: 'user', content: question }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  };
}

export interface Located {
  surah: number;
  from: number;
  to: number;
}

/** The first range the reply names, checked against the Qur'an; null when the question isn't about the Qur'an. */
export function parseLocate(text: string): Located | null {
  let v: { about_quran?: unknown; ayat?: unknown };
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (v.about_quran !== true || !Array.isArray(v.ayat)) return null;
  for (const r of v.ayat as { surah?: unknown; from?: unknown; to?: unknown }[]) {
    const surah = Number(r?.surah);
    let from = Number(r?.from);
    let to = Number(r?.to);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) continue;
    const count = AYAH_COUNTS[surah - 1];
    if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
    if (from > to) [from, to] = [to, from];
    from = Math.max(1, from);
    to = Math.min(count, to, from + LOCATE_MAX_AYAT - 1);
    if (from > count) continue;
    return { surah, from, to };
  }
  return null;
}
