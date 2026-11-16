// E2E builds only: What's new's next release (lib/help/whatsNew NEXT_RELEASE), as Revisely Dev's testers see it.
//
//   revisely://e2e/whats-new?next=1   Settings → About → What's new replays the next release
//   revisely://e2e/whats-new?next=0   back to the current one

let next = false;

export function handleWhatsNewLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/whats-new\?next=([01])/.exec(url);
  if (!m) return false;
  next = m[1] === '1';
  // eslint-disable-next-line no-console
  console.log(`[e2e] whats-new next ${next ? 'on' : 'off'}`);
  return true;
}

export const e2eNextRelease = (): boolean => next;
