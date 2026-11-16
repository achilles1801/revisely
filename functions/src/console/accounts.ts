/**
 * The console's Accounts page (adminConsole accounts.get; accounts.read): one account on one page, so answering
 * "what's going on with this account?" needs no scripts. Read-only (Majd's choice, Nov 15 2026: read-only first).
 *
 * What it shows, and nothing more: the Revisely side of the account (has a plan, tester flag), its Premium and every
 * grant, its Open Door application's state and decisions (never the answers or the internal notes: those stay in Open
 * Door, behind openDoor.read), and Revo as counts (on or off, conversations this month, memory items, today's
 * questions; never what was said). The handler logs every read with who read whom.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { ReviewAction, accountReview } from '../support/review';
import type { ApplicationStatus, Source } from '../support/logic';
import { revoSettingsOf } from '../revo/settings';

export interface AccountOverview {
  /** a user document exists: the account has made a Revisely plan in the app */
  hasPlan: boolean;
  previewTester: boolean;
  premium: { source: Source; grantedAt: number; until: number | null } | null;
  grants: { source: Source; grantedAt: number; until: number | null }[];
  openDoor: {
    status: ApplicationStatus;
    createdAt: number;
    decidedAt: number | null;
    applyAgainFrom: number | null;
    count: number;
    via: 'app' | 'web';
  } | null;
  /** decisions, newest first: what, when, by whom (no notes) */
  decisions: { action: ReviewAction; at: number; by: string; until: number | null }[];
  revo: { on: boolean; memoryOn: boolean; chatsThisMonth: number; memoryItems: number; today: { day: string; count: number } | null };
}

/** The first moment of `now`'s month, UTC. */
export function monthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export async function accountOverview(db: Firestore, uid: string, now: number): Promise<AccountOverview> {
  const [user, settings, usage, chats, memory, review] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`coachSettings/${uid}`).get(),
    db.doc(`revoUsage/${uid}`).get(),
    db.collection(`users/${uid}/revoChats`).where('createdAt', '>=', monthStart(now)).count().get(),
    db.collection(`users/${uid}/revoMemory`).count().get(),
    accountReview(db, uid),
  ]);
  const grant = (g: { source: Source; grantedAt: number; until: number | null }) => ({ source: g.source, grantedAt: g.grantedAt, until: g.until });
  const app = review.app;
  const day = usage.get('day');
  const n = usage.get('count');
  return {
    hasPlan: user.exists,
    previewTester: user.get('previewTester') === true,
    premium: review.ent?.premium ? grant(review.ent.premium) : null,
    grants: Object.values(review.ent?.grants ?? {}).map((g) => grant(g!)),
    openDoor: app
      ? { status: app.status, createdAt: app.createdAt, decidedAt: app.decidedAt, applyAgainFrom: app.applyAgainFrom, count: app.count, via: app.via }
      : null,
    decisions: review.history.map((d) => ({
      action: d.action,
      at: d.at,
      by: d.by.via === 'script' ? 'review script' : (d.by.email ?? 'a reviewer'),
      until: d.until,
    })),
    revo: {
      ...(({ optIn, memoryOn }) => ({ on: optIn, memoryOn }))(revoSettingsOf((f) => settings.get(f))),
      chatsThisMonth: chats.data().count,
      memoryItems: memory.data().count,
      today: typeof day === 'string' && typeof n === 'number' ? { day, count: n } : null,
    },
  };
}
