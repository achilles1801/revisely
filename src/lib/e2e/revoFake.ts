// E2E builds only: Revo without the model or the functions emulator (lib/revo/memoryBackend).
// Flows set its state with a link:
//   revisely://e2e/revo?optin=1&left=0&review=1&memory=1&day=2026-11-03
// optin turns Revo on (as the opt-in would), left sets the questions left on `day`, review
// leaves a Day in review waiting (the button's dot), memory adds a few remembered facts.

import { createMemoryRevoBackend } from '../revo/memoryBackend';

export const revoFake = createMemoryRevoBackend();

export function handleRevoLink(url: string): boolean {
  const m = /^revisely:\/\/e2e\/revo\?(.*)$/.exec(url);
  if (!m) return false;
  const params = new Map(
    m[1].split('&').map((kv) => {
      const [k, v = ''] = kv.split('=');
      return [decodeURIComponent(k), decodeURIComponent(v)] as const;
    }),
  );
  const day = params.get('day') ?? new Date().toISOString().slice(0, 10);
  if (params.get('optin') === '1') void revoFake.setOptions({ optIn: true });
  if (params.has('left')) revoFake.setRemaining(day, Number(params.get('left')));
  if (params.get('review') === '1') {
    revoFake.seedReview(day, 'A steady day: most of today’s pages are done, and the weak pair near the end held up better than last time. Tomorrow starts where today stopped.', '18 of 20 revised');
  }
  if (params.get('memory') === '1') {
    revoFake.seedMemory([
      { text: 'You usually revise after Fajr, and again around 9 PM.', source: 'review', day },
      { text: 'You like short, practical plans.', source: 'chat', day },
      { text: 'You read Al-Kahf on Fridays.', source: 'review', day },
    ]);
  }
  // eslint-disable-next-line no-console
  console.log(`[e2e] revo ${m[1]}`);
  return true;
}
