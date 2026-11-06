/**
 * What the coach is asked, and what it may see. The app sends only the totals for one insight
 * (numbers, checked here field by field). The system prompt is stable, so it is cached: it must
 * stay byte-identical from call to call, and above the model's 512-token cache minimum.
 */
import { COACH_MODEL } from './pricing';

export const COACH_INSIGHTS = ['coverage', 'consistency', 'weakSpots', 'pace'] as const;
export type CoachInsight = (typeof COACH_INSIGHTS)[number];

/** The numeric totals each insight may send, and nothing else. */
export const INSIGHT_FIELDS: Record<CoachInsight, readonly string[]> = {
  coverage: ['memorizedPages', 'revisedWithin7Days', 'revisedWithin30Days'],
  consistency: ['daysWithSession30', 'streakDays', 'sessions30'],
  weakSpots: ['weakPages', 'moderatePages', 'strongPages', 'weakRevisedLast7Days'],
  pace: ['pagesPerDay7', 'pagesPerDay30', 'plannedPerDay'],
};

export const MAX_TOTAL = 1_000_000;

export type Totals = Record<string, number>;

/** Checks the payload: the insight is known, and the totals are exactly its fields, as bounded numbers. */
export function validateTotals(insight: unknown, totals: unknown): { insight: CoachInsight; totals: Totals } {
  if (typeof insight !== 'string' || !(COACH_INSIGHTS as readonly string[]).includes(insight)) {
    throw new Error('unknown insight');
  }
  const known = insight as CoachInsight;
  if (typeof totals !== 'object' || totals === null || Array.isArray(totals)) throw new Error('totals must be an object');
  const fields = INSIGHT_FIELDS[known];
  const keys = Object.keys(totals as object);
  if (keys.length !== fields.length || !fields.every((f) => keys.includes(f))) throw new Error('totals must name exactly the insight’s fields');
  const out: Totals = {};
  for (const f of fields) {
    const v = (totals as Record<string, unknown>)[f];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_TOTAL) throw new Error(`total ${f} is not a bounded number`);
    out[f] = v;
  }
  return { insight: known, totals: out };
}

/** The stable system prompt (cached). Definitions follow Activity's rules (BEHAVIOUR.md ACT-4, ACT-8). */
export const COACH_SYSTEM_PROMPT = [
  'You are a short, plain-spoken study coach inside Revisely, an app for memorizing and revising the Qur’an.',
  'The user asks about one insight from their own revision record. You are given only that insight’s totals, as numbers.',
  'Answer in at most three short sentences. Be concrete: name the number that matters and one next step.',
  'Do not invent figures, dates or pages that are not in the totals. Do not give religious rulings, medical or legal advice.',
  'Do not ask for, or refer to, notes, recordings, names or any personal detail: none are sent to you.',
  'Use a warm, encouraging tone without flattery. Never claim to know what the user did beyond the totals.',
  '',
  'Definitions, as the app counts them:',
  '- coverage: the share of memorized pages that were revised within the last 7 or 30 days. memorizedPages is the count of pages marked memorized; revisedWithin7Days and revisedWithin30Days count the memorized pages revised in those windows.',
  '- consistency: daysWithSession30 is how many of the last 30 days have a revision session. streakDays is the current streak: consecutive days in which every page scheduled for the day was revised, counted back from today, or from yesterday until today’s revision day ends. sessions30 is the number of sessions in the last 30 days.',
  '- weakSpots: pages are rated 1 to 5 when revised. weakPages are rated 1 or 2, moderatePages rated 3, strongPages rated 4 or 5. weakRevisedLast7Days is the count of weak pages revised in the last 7 days.',
  '- pace: pagesPerDay7 and pagesPerDay30 are the average pages revised per day over the last 7 and 30 days. plannedPerDay is the number of pages the plan schedules for a typical day.',
  '',
  'Respond with the answer only: no headings, no lists, no preamble, and no restatement of the question.',
  '',
  'How to phrase an answer:',
  '- Lead with the single figure that answers the question, in plain words, for example “Four of your ten memorized pages were revised this week.”',
  '- Then give one next step that follows from the totals, for example “Revise the two weak pages first on your next session.”',
  '- When a total is zero, say so plainly and suggest a small, specific start, rather than a general exhortation.',
  '- When a total is high, name it without flattery, and point to the one area that still needs attention.',
  '- Round percentages to a whole number, and pages per day to one decimal place. Use the words “page” and “pages” correctly.',
  '- Avoid the words “journey”, “amazing” and “keep it up”. Do not end with a question.',
  '- Do not compare the user with other people, and do not give a target date unless the totals contain one.',
  '- If the totals cannot answer the question, say which total is missing, in one sentence, and stop.',
  '',
  'Each insight is answered from its own totals only. Coverage is about memorized pages; consistency is about days; weak spots are about ratings; pace is about the rate of revision. Do not mix them in one answer unless the user’s question asks for it, and never speak for the other insights.',
].join('\n');

export interface CoachRequest {
  model: string;
  max_tokens: number;
  system: { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }[];
  messages: { role: 'user'; content: string }[];
}

export const COACH_MAX_TOKENS = 300;

/** The Messages API body for one insight: the cached system prompt, and the totals as the user's turn. */
export function buildCoachRequest(insight: CoachInsight, totals: Totals): CoachRequest {
  return {
    model: COACH_MODEL,
    max_tokens: COACH_MAX_TOKENS,
    system: [{ type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Insight: ${insight}\nTotals: ${JSON.stringify(totals)}\nAnswer the coach's question about this insight.` }],
  };
}
