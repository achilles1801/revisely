/** The system prompt's length, for the cache minimum check (a token is about four characters). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
