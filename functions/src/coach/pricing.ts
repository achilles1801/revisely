/**
 * What a model call costs, from the usage the Messages API returns, per model
 * (docs.claude.com/en/docs/about-claude/pricing, read Nov 7 2026). The Ask coach runs on
 * claude-haiku-5-5, Revo on claude-sonnet-5-5; both share one ledger and one monthly cap.
 * Haiku 5.5's prices here are for prompts up to 100,000 tokens (none sent here is longer);
 * Sonnet 5.5 has one price at every length, and its cache hits are 0.05x input.
 * Update PRICES and PRICING_AS_OF together when Anthropic changes them.
 */
export const COACH_MODEL = 'claude-haiku-5-5';
export const REVO_MODEL = 'claude-sonnet-5-5';
export const PRICING_AS_OF = '2026-11-07';

export interface Pricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
}

export const PRICES: Record<string, Pricing> = {
  'claude-haiku-5-5': {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheWrite5mPerMTok: 0.125,
    cacheWrite1hPerMTok: 0.2,
    cacheReadPerMTok: 0.01,
  },
  'claude-sonnet-5-5': {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheWrite5mPerMTok: 2.5,
    cacheWrite1hPerMTok: 4,
    cacheReadPerMTok: 0.1,
  },
};

/** The Ask coach's prices (its model's). */
export const PRICING = PRICES[COACH_MODEL];

function pricesOf(model: string): Pricing {
  const p = PRICES[model];
  if (!p) throw new Error(`No prices for ${model}`);
  return p;
}

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

/** Dollars for one call's usage, at the model's prices (the Ask coach's by default). */
export function costUsd(u: Usage, model: string = COACH_MODEL): number {
  const p = pricesOf(model);
  const s = splitUsage(u);
  const dollars =
    (s.input * p.inputPerMTok +
      s.output * p.outputPerMTok +
      s.cacheWrite5m * p.cacheWrite5mPerMTok +
      s.cacheWrite1h * p.cacheWrite1hPerMTok +
      s.cacheRead * p.cacheReadPerMTok) /
    1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
}

/**
 * The most a call can cost before it is made: its prompt counted at the model's 1-hour cache
 * write price (the dearest input there is), plus the full output allowance. Reserved against
 * the monthly cap, then replaced by the real cost.
 */
export function worstCaseCostUsd(promptChars: number, maxOutputTokens: number, model: string = COACH_MODEL): number {
  const p = pricesOf(model);
  const promptTokensUpper = Math.ceil(promptChars / 2); // a token is at least two characters' worth
  const dollars = (promptTokensUpper * p.cacheWrite1hPerMTok + maxOutputTokens * p.outputPerMTok) / 1_000_000;
  return Math.round(dollars * 1e8) / 1e8;
}
