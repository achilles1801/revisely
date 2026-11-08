/**
 * Page numbers where Revo should have named the surah (NAME-1, REVO-27): "page 587", "pages 3–5",
 * "p. 589" on their own. Revo may give a page number only after the surah, as a quiet detail
 * ("Al-Baqarah, p. 288", "Al-Mujadila · p. 542"). Used by the tests on the recorded replies and by
 * the scripts that ask the real model (revo-guide-samples.js, revo-tone-samples.js); the server
 * doesn't rewrite answers with it.
 */
import { RevoReplyParts } from './types';

const PAGE_NUMBER = /\b(?:pages?\s+\d{1,3}|pp?\.\s?\d{1,3})/gi;
/** A surah's or juz's name (with its ayahs) just before, then "," or "·": the quiet detail. */
const AFTER_NAME = /[A-Z][\p{L}'’‑-]+(?:,?\s(?:ayahs?\s)?\d{1,3}(?:[–-]\d{1,3})?)?(?:,|\s·)\s?$/u;

/** Each page number in the text that isn't a quiet detail after a surah's name. */
export function barePageNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PAGE_NUMBER)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 60), m.index);
    const quiet = /^pp?\./i.test(m[0]) && AFTER_NAME.test(before);
    if (!quiet) out.push(m[0]);
  }
  return out;
}

/** Everything of a reply the user reads, for the check: text, the chart's title (either kind), the card, the chips. */
export function replyWords(reply: Pick<RevoReplyParts, 'text' | 'textAfter' | 'chart' | 'visual' | 'action' | 'chips'>): string {
  return [reply.text, reply.textAfter, reply.chart?.title, reply.visual?.title, reply.action?.title, reply.action?.detail, ...(reply.chips ?? [])].filter(Boolean).join('\n');
}
