/**
 * The coach's Firestore store (firebase-admin). Collections are server-only: the rules deny every
 * client read and write (the catch-all), so clients can't see answers, counts or the ledger.
 *   users/{uid}.previewTester        read: the tester gate
 *   coachSettings/{uid}              optIn, set by setCoachOptIn
 *   coachAnswers/{uid__insight__day} the cached answer
 *   coachUsage/{uid__day}            questions asked that UTC day
 *   coachLedger/{YYYY-MM}            spend (dollars) and token totals for the month; no content
 */
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { CallLedger, CoachStore } from './handler';
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
    async reserveSpend(month, amount, cap) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ledgerRef(month));
        const spent = (snap.get('spendUsd') as number | undefined) ?? 0;
        if (spent + amount > cap) return false;
        tx.set(ledgerRef(month), { spendUsd: spent + amount, month }, { merge: true });
        return true;
      });
    },
    async settleSpend(month, reserved, actual, usage: CallLedger) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ledgerRef(month));
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
      });
    },
  };
}
