// Which checker the app talks to: its own Firebase project's (lib/reciteCheck/endpoints).
import { CHECKERS, checkerFor, PRODUCTION_PROJECT } from '../endpoints';
import { RECITE_CHECK_PAIR_URL, RECITE_CHECK_URL } from '../service';
import { RECITE_LIVE_URL, RECITE_PAIR_LIVE_URL } from '../../reciteLive/socket';

describe('the recitation checker', () => {
  it('the store app (production) talks to the production checker, in europe-west1', () => {
    expect(checkerFor(PRODUCTION_PROJECT)).toBe(CHECKERS.production);
    expect(CHECKERS.production.base).toMatch(/^https:\/\/recite-check-169239488140\.europe-west1\.run\.app$/);
    expect(CHECKERS.production.pair).toMatch(/^https:\/\/recite-check-pair-169239488140\.europe-west1\.run\.app$/);
  });

  it('Revisely Dev, E2E and anything else talk to the dev checker, never production', () => {
    for (const p of ['revisely-dev', 'demo-revisely', undefined, null, '']) expect(checkerFor(p)).toBe(CHECKERS.dev);
  });

  it('the live socket and the HTTP calls use the same service (tests run as no project: dev)', () => {
    expect(RECITE_CHECK_URL).toBe(CHECKERS.dev.base);
    expect(RECITE_CHECK_PAIR_URL).toBe(CHECKERS.dev.pair);
    expect(RECITE_LIVE_URL).toBe('wss://recite-check-433792838929.us-east1.run.app/live');
    expect(RECITE_PAIR_LIVE_URL).toBe('wss://recite-check-pair-433792838929.us-east1.run.app/live');
  });
});
