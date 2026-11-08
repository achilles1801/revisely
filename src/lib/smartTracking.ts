// Smart Tracking: rating pages, and strength from those ratings (Insights' weak spots, Revo's
// ratings charts). Off unless the account turned it on, as AppContext reads the user document
// (`smartTrackingEnabled ?? false`); the functions read it the same way (revo/admin.ts). With it
// off, nothing shows strength: recency instead (lib/recency).

import type { User } from '../types';

/** Whether the account has Smart Tracking on: off when unset. */
export function smartTrackingOn(user: Pick<User, 'smartTrackingEnabled'> | null | undefined): boolean {
  return user?.smartTrackingEnabled ?? false;
}
