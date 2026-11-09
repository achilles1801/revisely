/**
 * The coach's Firestore store (firebase-admin). Collections are server-only: the rules deny every
 * client read and write (the catch-all), so clients can't see answers, counts or the ledger.
 *   users/{uid}.previewTester        read: the tester gate
 *   coachSettings/{uid}              optIn, set by setCoachOptIn
 *   coachAnswers/{uid__insight__day} the cached answer
 *   coachUsage/{uid__day}            questions asked that UTC day
 *   coachLedger/{YYYY-MM}            spend (dollars) and token totals for the month; no content
 *   coachLedgerDay/{YYYY-MM-DD}      the same totals for one day (the weekly digest reads them)
 *   config/coach                     monthlyCapUsd, dailyCapUsd: the caps (set-coach-cap.js); server only
 */
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { CallLedger, CoachStore, dailyCapFrom, monthlyCapFrom } from './handler';

/** How long a read of the caps is used before reading them again (a change applies within this). */
const CAP_CACHE_MS = 60_000;
let capCache: { monthly: number; daily: number; until: number } | null = null;

/** config/coach's caps, read at most once a minute: the month's, and one UTC day's (Revo's, REVO-4). */
export async function coachCaps(db: Firestore): Promise<{ monthly: number; daily: number }> {
  if (capCache && Date.now() < capCache.until) return capCache;
  const snap = await db.doc('config/coach').get();
  const monthly = monthlyCapFrom(snap.get('monthlyCapUsd'));
  const daily = dailyCapFrom(snap.get('dailyCapUsd'), monthly);
  capCache = { monthly, daily, until: Date.now() + CAP_CACHE_MS };
  return capCache;
}

/** What one UTC day has spent (coachLedgerDay/{day}: settled calls, both models). */
export async function spentOn(db: Firestore, day: string): Promise<number> {
  const spent = (await db.doc(`coachLedgerDay/${day}`).get()).get('spendUsd');
  return typeof spent === 'number' && Number.isFinite(spent) ? spent : 0;
}
import { CoachInsight } from './prompt';

export function adminCoachStore(db: Firestore): CoachStore {
  const answerRef = (uid: string, insight: CoachInsight, day: string) => db.doc(`coachAnswers/${uid}__${insight}__${day}`);
  const usageRef = (uid: string, day: string) => db.doc(`coachUsage/${uid}__${day}`);
  const ledgerRef = (month: string) => db.doc(`coachLedger/${month}`);

  return {
    async isPreviewTester(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists && snap.get('previewTester') === true;
    },
    async hasOptedIn(uid) {
      const snap = await db.doc(`coachSettings/${uid}`).get();
      return snap.exists && snap.get('optIn') === true;
    },
    async setOptIn(uid, optIn) {
      await db.doc(`coachSettings/${uid}`).set({ optIn, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },
    async getAnswer(uid, insight, day) {
      const snap = await answerRef(uid, insight, day).get();
      const text = snap.get('text');
      return typeof text === 'string' ? text : null;
    },
    async setAnswer(uid, insight, day, text) {
      await answerRef(uid, insight, day).set({ text, uid, insight, day, createdAt: FieldValue.serverTimestamp() });
    },
    async reserveQuestion(uid, utcDay, limit) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef(uid, utcDay));
        const count = (snap.get('count') as number | undefined) ?? 0;
        if (count >= limit) return false;
        tx.set(usageRef(uid, utcDay), { count: count + 1, uid, day: utcDay }, { merge: true });
        return true;
      });
    },
    async releaseQuestion(uid, utcDay) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(usageRef(uid, utcDay));
        const count = (snap.get('count') as number | undefined) ?? 0;
        if (count > 0) tx.set(usageRef(uid, utcDay), { count: count - 1 }, { merge: true });
      });
    },
    async questionsToday(uid, utcDay) {
      const snap = await usageRef(uid, utcDay).get();
      return (snap.get('count') as number | undefined) ?? 0;
    },
    async monthlyCapUsd() {
      return (await coachCaps(db)).monthly;
    },
    async reserveSpend(month, amount, cap) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ledgerRef(month));
        const spent = (snap.get('spendUsd') as number | undefined) ?? 0;
        if (spent + amount > cap) return false;
        tx.set(ledgerRef(month), { spendUsd: spent + amount, month }, { merge: true });
        return true;
      });
    },
    async settleSpend(month, reserved, actual, usage: CallLedger, day) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ledgerRef(month));
        // The same totals per day, for the weekly digest (no user, no content).
        const spent = (snap.get('spendUsd') as number | undefined) ?? 0;
        tx.set(
          ledgerRef(month),
          {
            spendUsd: Math.max(0, Math.round((spent - reserved + actual) * 1e8) / 1e8),
            month,
            calls: FieldValue.increment(usage.calls),
            inputTokens: FieldValue.increment(usage.input),
            outputTokens: FieldValue.increment(usage.output),
            cacheReadTokens: FieldValue.increment(usage.cacheRead),
            cacheWriteTokens: FieldValue.increment(usage.cacheWrite),
          },
          { merge: true },
        );
        tx.set(
          db.doc(`coachLedgerDay/${day}`),
          {
            day,
            calls: FieldValue.increment(usage.calls),
            inputTokens: FieldValue.increment(usage.input),
            outputTokens: FieldValue.increment(usage.output),
            cacheReadTokens: FieldValue.increment(usage.cacheRead),
            cacheWriteTokens: FieldValue.increment(usage.cacheWrite),
            spendUsd: FieldValue.increment(actual),
          },
          { merge: true },
        );
      });
    },
  };
}
