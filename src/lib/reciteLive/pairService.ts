// Whether recite-check-pair takes this phone's takes (recite-contract.md, "Two services"). Until Majd opens it to the
// internet (as recite-check was on Nov 13), it answers 403: a take sent there pays a refused upgrade before starting on
// recite-check. So a refusal is remembered for an hour, from either way it shows: the warm-up's /health (403, before
// any take: lib/reciteCheck/service) or a take it couldn't start (lib/reciteLive/socket). /health answering lets it
// back at once. Held in memory: a cold start asks again (the reader's warm-up does, as it opens).

/** How long a closed pair service is passed over. */
export const PAIR_CLOSED_MS = 60 * 60_000;

let closedUntil = 0;

/** Takes may go to the pair service. */
export const pairOpen = (now: number = Date.now()): boolean => now >= closedUntil;

/** It refused (403) or couldn't start a take: recite-check takes them for PAIR_CLOSED_MS. */
export function pairClosed(now: number = Date.now()): void {
  closedUntil = now + PAIR_CLOSED_MS;
}

/** Its /health answered: open again. */
export function pairAnswered(): void {
  closedUntil = 0;
}
