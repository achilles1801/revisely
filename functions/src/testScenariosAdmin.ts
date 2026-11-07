/**
 * testScenarios.ts's writing, with firebase-admin: a built scenario's documents
 * (scenarioDocuments: the app's own shapes, Timestamps where the app stores
 * them) into users/<uid>/…, and its recordings' audio under recordings/<uid>/
 * in Storage. Only ever the uid it's given; testScenarios.ts only passes the
 * caller's.
 */
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { BucketLike } from './testerResetAdmin';
import { ScenarioWriter, SeedPlan, scenarioDocuments, silenceBytes } from './testScenarios';

export function adminScenarioWriter(db: Firestore, bucket: BucketLike): ScenarioWriter {
  return {
    async write(uid, plan: SeedPlan, now) {
      const counts: Record<string, number> = {};
      let batch: WriteBatch = db.batch();
      let size = 0;
      for (const { path, data } of scenarioDocuments(plan, (ms) => Timestamp.fromMillis(ms), now.stamp)) {
        batch.set(db.doc(`users/${uid}/${path}`), data);
        const what = path.startsWith('journal/') ? 'notes' : path.split('/')[0];
        counts[what] = (counts[what] ?? 0) + 1;
        if (++size >= 400) {
          await batch.commit();
          batch = db.batch();
          size = 0;
        }
      }
      if (size > 0) await batch.commit();

      // The recordings' audio: one second of silence each, so they play.
      const audio = silenceBytes();
      for (const rec of plan.recordings) {
        for (const seg of rec.segments) {
          await bucket.file(`recordings/${uid}/${seg.fileName}`).save(audio, { contentType: 'audio/mp4', resumable: false });
          counts.files = (counts.files ?? 0) + 1;
        }
      }
      return counts;
    },
  };
}
