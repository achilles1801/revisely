/**
 * Revo's switch in coachSettings/{uid}: its own field, `revoOn` (the callables call it `optIn`). Until
 * Nov 7 2026 Revo read the Ask coach's `optIn`, so an account that had turned the coach on had Revo on
 * before it ever saw Revo's opt-in, and the Day in review was sent without it (REVO-21).
 *
 * The changeover keeps apps from before it working: an account that has never set `revoOn` but has the
 * coach's `optIn` on may still use Revo; only `revoOn === false` turns it off. The app from #310 on
 * reads `revoOn` alone, so it shows Revo's opt-in until the account turns it on there. Drop the
 * fallback once every tester has that app.
 */
import type { RevoSettings } from './types';

export const REVO_ON = 'revoOn';

export function revoSettingsOf(get: (field: string) => unknown): RevoSettings {
  const on = get(REVO_ON);
  const optIn = on === true || (on === undefined && get('optIn') === true);
  return { optIn, memoryOn: get('memoryOn') !== false };
}
