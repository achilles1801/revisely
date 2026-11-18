/**
 * testScenarios.ts's writing, with firebase-admin: a built scenario's documents
 * (scenarioDocuments: the app's own shapes, Timestamps where the app stores
 * them; revoDocuments: Revo's, as its functions write them) into users/<uid>/…,
 * and its recordings' audio under recordings/<uid>/
 * in Storage. Only ever the uid it's given; testScenarios.ts only passes the
 * caller's.
 */
import type { Firestore, WriteBatch } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { CREATE_ONLY, type BucketLike } from './testerResetAdmin';
import { ScenarioWriter, SeedPlan, revoDocuments, scenarioDocuments, silenceBytes } from './testScenarios';

export function adminScenarioWriter(db: Firestore, bucket: BucketLike): ScenarioWriter {
  return {
    async write(uid, plan: SeedPlan, now) {
      const counts: Record<string, number> = {};
      let batch: WriteBatch = db.batch();
      let size = 0;
      const docs = [...scenarioDocuments(plan, (ms) => Timestamp.fromMillis(ms), now.stamp), ...revoDocuments(plan, uid)];
      for (const { path, data } of docs) {
        batch.set(db.doc(`users/${uid}/${path}`), data);
        const what = path.startsWith('journal/') ? 'notes' : path.includes('/messages/') ? 'revoMessages' : path.split('/')[0];
        counts[what] = (counts[what] ?? 0) + 1;
        if (++size >= 400) {
          await batch.commit();
          batch = db.batch();
          size = 0;
        }
      }
      if (size > 0) await batch.commit();

      // The recordings' audio: one second of silence each, so they play.
      // Eight at a time: the heavy scenario has dozens.
      const audio = silenceBytes();
      const files = plan.recordings.flatMap((rec) => rec.segments.map((seg) => `recordings/${uid}/${seg.fileName}`));
      for (let i = 0; i < files.length; i += 8) {
        await Promise.all(
          files.slice(i, i + 8).map((name) => bucket.file(name).save(audio, { contentType: 'audio/mp4', resumable: false, preconditionOpts: CREATE_ONLY })),
        );
      }
      if (files.length > 0) counts.files = files.length;
      return counts;
    },
  };
}
