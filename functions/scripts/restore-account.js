/**
 * Put back an account's data from a backup made by reset-account.js.
 *
 * Every backed-up document is written again as it was, and every backed-up
 * recording file that isn't in Storage is uploaded again. The user document
 * also gets a new `dataResetAt`, so phones drop what they hold for the account
 * (it is from after the reset) and load it again. Documents written since the
 * backup that it doesn't hold are listed, not deleted.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/restore-account.js ~/secrets/backups/<uid>-<date>          # what it would do
 *   ... node scripts/restore-account.js ~/secrets/backups/<uid>-<date> --yes  # restore
 * Options: --bucket <name> (default <project>.firebasestorage.app).
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { Timestamp, GeoPoint } = require('firebase-admin/firestore');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function decode(v, db) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decode(x, db));
  switch (v.__type) {
    case 'timestamp':
      return new Timestamp(v.seconds, v.nanoseconds);
    case 'geopoint':
      return new GeoPoint(v.latitude, v.longitude);
    case 'ref':
      return db.doc(v.path);
    case 'bytes':
      return Buffer.from(v.base64, 'base64');
  }
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = decode(x, db);
  return out;
}

async function listAll(ref, out) {
  for (const col of await ref.listCollections()) {
    for (const d of await col.listDocuments()) {
      out.push(d.path);
      await listAll(d, out);
    }
  }
}

async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, 'firestore.json'))) {
    console.error('Usage: node scripts/restore-account.js <backup dir> [--yes] [--bucket <name>]');
    process.exit(1);
  }
  const backup = JSON.parse(fs.readFileSync(path.join(dir, 'firestore.json'), 'utf8'));
  const files = JSON.parse(fs.readFileSync(path.join(dir, 'storage.json'), 'utf8'));
  const { uid } = backup;
  const mine = (p) => p === `users/${uid}` || p.startsWith(`users/${uid}/`);
  if (!uid || !backup.docs.every((d) => mine(d.path)) || !files.every((f) => f.name.startsWith(`recordings/${uid}/`))) {
    throw new Error('The backup holds paths outside its account. Nothing changed.');
  }

  let projectId = process.env.GCLOUD_PROJECT;
  if (!projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    projectId = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')).project_id;
  }
  if (backup.project && projectId && backup.project !== projectId) {
    throw new Error(`The backup is from project ${backup.project}, not ${projectId}. Nothing changed.`);
  }
  admin.initializeApp({ projectId, storageBucket: arg('--bucket') ?? `${projectId}.firebasestorage.app` });
  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const now = [];
  await listAll(db.doc(`users/${uid}`), now);
  const held = new Set(backup.docs.map((d) => d.path));
  const extra = now.filter((p) => !held.has(p));
  console.log(`Backup of ${uid} from ${backup.exportedAt}: ${backup.docs.length} documents, ${files.length} files.`);
  if (extra.length) console.log(`Written since and not in the backup (left as they are): ${extra.length}`);
  if (!process.argv.includes('--yes')) {
    console.log('Dry run: nothing changed. Add --yes to restore.');
    return;
  }

  const stamp = Timestamp.now();
  for (let i = 0; i < backup.docs.length; i += 400) {
    const batch = db.batch();
    for (const d of backup.docs.slice(i, i + 400)) {
      const data = decode(d.data, db);
      batch.set(db.doc(d.path), d.path === `users/${uid}` ? { ...data, dataResetAt: stamp } : data);
    }
    await batch.commit();
  }
  let uploaded = 0;
  for (const f of files) {
    const [exists] = await bucket.file(f.name).exists();
    if (exists) continue;
    await bucket.upload(path.join(dir, 'storage', f.name), {
      destination: f.name,
      metadata: { contentType: f.contentType, metadata: f.metadata ?? undefined },
    });
    uploaded++;
  }
  console.log(`✓ Restored ${backup.docs.length} documents and ${uploaded} files.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
