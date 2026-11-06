/**
 * What a coach call costs, from the usage the Messages API returns. Pricing for claude-haiku-5-5
 * per million tokens, prompts up to 100,000 tokens (docs.claude.com/en/docs/about-claude/pricing,
 * read Nov 5 2026). Prompts over 100k tokens are never sent here, so only that tier is used.
 * Update PRICING and PRICING_AS_OF together when Anthropic changes them.
 */
export const COACH_MODEL = 'claude-haiku-5-5';
export const PRICING_AS_OF = '2026-11-05';

export const PRICING = {
  inputPerMTok: 0.1,
  outputPerMTok: 0.5,
  cacheWrite5mPerMTok: 0.125,
  cacheWrite1hPerMTok: 0.2,
  cacheReadPerMTok: 0.01,
} as const;

/** The usage object of a Messages API response (the fields this module reads). */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null;
}

export interface UsageSplit {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** The usage split into the parts that are priced differently. Creation not split is 5-minute. */
export function splitUsage(u: Usage): UsageSplit {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
  const creation = n(u.cache_creation_input_tokens);
  const split = u.cache_creation;
  const w1h = n(split?.ephemeral_1h_input_tokens);
  const w5m = split ? n(split.ephemeral_5m_input_tokens) : creation - w1h;
  return {
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite5m: Math.max(0, w5m),
    cacheWrite1h: w1h,
  };
}

/** Dollars for one call's usage, at PRICING. */
export function costUsd(u: Usage): number {
  const s = splitUsage(u);
  const dollars =
    (s.input * PRICING.inputPerMTok +
      s.output * PRICING.outputPerMTok +
      s.cacheWrite5m * PRICING.cacheWrite5mPerMTok +
      s.cacheWrite1h * PRICING.cacheWrite1hPerMTok +
      s.cacheRead * PRICING.cacheReadPerMTok) /
    1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
}

/**
 * The most a call can cost before it is made: its prompt counted at the 1-hour cache write
 * price (the dearest input there is), plus the full output allowance. Reserved against the
 * monthly cap, then replaced by the real cost.
 */
export function worstCaseCostUsd(promptChars: number, maxOutputTokens: number): number {
  const promptTokensUpper = Math.ceil(promptChars / 2); // a token is at least two characters' worth
  const dollars =
    (promptTokensUpper * PRICING.cacheWrite1hPerMTok + maxOutputTokens * PRICING.outputPerMTok) / 1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
}
