/**
 * The console's Premium overview (adminConsole premium.summary; premium.read): how many accounts have Premium now and
 * from where, what ends in the next 30 days, Open Door grants that have ended, and (revisely-dev) dev grants. Counts
 * only, from `entitlements/{uid}` (support/admin.ts writes it: `premium` is the grant that lasts longest, `grants` one
 * per source; times are Timestamps). Each number is a count() query, so nothing about anyone leaves Firestore.
 *
 * Indexes: (premium.source, premium.until) in firestore.indexes.json; the rest use Firestore's single-field indexes.
 */
import type { Firestore, Query } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { SOURCES, Source } from '../support/logic';

export const ENDING_WITHIN_DAYS = 30;
const DAY_MS = 86_400_000;

export interface PremiumSummary {
  /** Premium now (no end date, or one still ahead), all sources and per source */
  now: { total: number; bySource: Record<Source, number> };
  /** Premium whose end date falls in the next ENDING_WITHIN_DAYS days */
  endingSoon: number;
  /** Open Door grants whose end date has passed (taken back ones are deleted, so not counted) */
  supportEnded: number;
  /** accounts with a dev grant (the Dev app's "Get Premium"); null outside the dev project */
  devGrants: number | null;
  endingWithinDays: number;
  asOf: number;
}

const count = async (q: Query): Promise<number> => (await q.count().get()).data().count;

export async function premiumSummary(db: Firestore, now: number, opts: { devProject: boolean }): Promise<PremiumSummary> {
  const ent = db.collection('entitlements');
  const at = Timestamp.fromMillis(now);
  const soon = Timestamp.fromMillis(now + ENDING_WITHIN_DAYS * DAY_MS);
  // Premium now: no end date, or an end date still ahead (hasPremium's rule), per source.
  const perSource = SOURCES.map((s) =>
    Promise.all([
      count(ent.where('premium.source', '==', s).where('premium.until', '==', null)),
      count(ent.where('premium.source', '==', s).where('premium.until', '>', at)),
    ]).then(([open, dated]) => open + dated),
  );
  const [bySourceList, endingSoon, supportEnded, devGrants] = await Promise.all([
    Promise.all(perSource),
    count(ent.where('premium.until', '>', at).where('premium.until', '<=', soon)),
    count(ent.where('grants.support.until', '<=', at)),
    opts.devProject ? count(ent.where('grants.dev.source', '==', 'dev')) : Promise.resolve(null),
  ]);
  const bySource = Object.fromEntries(SOURCES.map((s, i) => [s, bySourceList[i]])) as Record<Source, number>;
  return {
    now: { total: bySourceList.reduce((a, b) => a + b, 0), bySource },
    endingSoon,
    supportEnded,
    devGrants,
    endingWithinDays: ENDING_WITHIN_DAYS,
    asOf: now,
  };
}
