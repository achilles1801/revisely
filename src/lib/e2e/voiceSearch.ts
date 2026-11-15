// E2E builds only: searching by voice without a microphone or the speech model (lib/search, useVoiceSearch).
//
//   revisely://e2e/voice-search?heard=<words, URL-encoded>   voice search is on, and it hears these words
//   revisely://e2e/voice-search?off=1                        back to the build's own (no voice search)
//
// A search by voice then shows Listening… for 3 s and searches with the words given, as if they were said.

let heard: string | null = null;

export function handleVoiceSearchLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/voice-search\?(heard=([^&]*)|off=1)/.exec(url);
  if (!m) return false;
  heard = m[2] != null ? decodeURIComponent(m[2].replace(/\+/g, ' ')) || null : null;
  // eslint-disable-next-line no-console
  console.log(`[e2e] voice-search ${heard ? 'on' : 'off'}`);
  return true;
}

/** The words the next voice search hears, or null: voice search as the build has it. */
export function e2eVoiceHeard(): string | null {
  return heard;
}
