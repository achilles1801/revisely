/**
 * Settings → Share Revisely (SET-2): the words and the link, each once.
 *
 * iOS takes the link apart from the words (Messages, WhatsApp and Mail then draw the site's preview card under
 * them); Android's share sheet takes text only, so there the link ends the text. Before Nov 22 2026 the link was
 * in the words and passed again as the URL, so iOS shared it twice.
 */
export const REVISELY_LINK = 'https://revisely.app';

export function shareRevisely(words: string, os: string): { message: string; url?: string } {
  return os === 'ios' ? { message: words, url: REVISELY_LINK } : { message: `${words}\n${REVISELY_LINK}` };
}
