/**
 * Upload the phone-sized mushaf pages made by scripts/build-mushaf-variants.py
 * (issue #153) to Storage, next to the originals:
 *   <dir>/w1080/NNN.png -> mushaf/w1080/NNN.png
 *   <dir>/w1440/NNN.png -> mushaf/w1440/NNN.png
 * Each object is public (anyone can read it, as the originals are: the app
 * loads them from storage.googleapis.com without signing in) and cached for a
 * year as immutable.
 *
 * Run from the functions/ directory:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-admin.json \
 *     node scripts/upload-mushaf-variants.js /tmp/mushaf-out [--dry-run]
 *
 * The 1441 print (scripts/build-mushaf-1441.py) goes under its own folder:
 *     node scripts/upload-mushaf-variants.js /tmp/mushaf-1441 --prefix 1441 [--dry-run]
 *   <dir>/w1080/NNN.png -> mushaf/1441/w1080/NNN.png (and w1440)
 *
 * Safe to run again: an object already there with the same bytes is skipped.
 * One with different bytes is refused, never replaced: phones and caches keep
 * a page for a year, so changed pages go under a new set name (see the script
 * that builds them). Upload these before an app update that reads them ships.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const BUCKET = 'revision-buddy-3a398.firebasestorage.app';
const SETS = ['w1080', 'w1440'];
const PAGES = 604;
const CONCURRENCY = 16;
const METADATA = {
  contentType: 'image/png',
  cacheControl: 'public, max-age=31536000, immutable',
};

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path.');
  process.exit(1);
}

const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('base64');

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  const dryRun = args.includes('--dry-run');
  const p = args.indexOf('--prefix');
  const prefix = p >= 0 ? args[p + 1] : '';
  const known = new Set(['--dry-run', '--prefix', prefix]);
  if (!dir || dir.startsWith('--') || (p >= 0 && !/^[0-9a-z]+$/.test(prefix || '')) || args.slice(1).some((a) => !known.has(a))) {
    console.error('Usage: node scripts/upload-mushaf-variants.js <dir> [--prefix <folder>] [--dry-run]');
    process.exit(1);
  }
  const root = prefix ? `mushaf/${prefix}` : 'mushaf';

  // Every file first, so a partial build never half-uploads.
  const jobs = [];
  for (const set of SETS) {
    for (let n = 1; n <= PAGES; n++) {
      const name = `${String(n).padStart(3, '0')}.png`;
      const local = path.join(dir, set, name);
      if (!fs.existsSync(local)) {
        console.error(`Missing ${local}`);
        process.exit(1);
      }
      jobs.push({ local, dest: `${root}/${set}/${name}` });
    }
  }

  admin.initializeApp({ storageBucket: BUCKET });
  const bucket = admin.storage().bucket();
  const counts = { uploaded: 0, same: 0, refused: 0 };

  async function one({ local, dest }) {
    const file = bucket.file(dest);
    const [exists] = await file.exists();
    if (exists) {
      const [md] = await file.getMetadata();
      if (md.md5Hash === md5(local)) {
        counts.same++;
        return;
      }
      counts.refused++;
      console.error(`${dest} exists with different bytes; not replaced.`);
      return;
    }
    if (dryRun) {
      counts.uploaded++;
      return;
    }
    await bucket.upload(local, {
      destination: dest,
      predefinedAcl: 'publicRead',
      metadata: METADATA,
      resumable: false,
      validation: 'md5',
      // Never replace an object that appeared since the check above.
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    counts.uploaded++;
  }

  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      await one(job);
      const done = counts.uploaded + counts.same + counts.refused;
      if (done % 100 === 0) console.log(`${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const verb = dryRun ? 'would upload' : 'uploaded';
  console.log(`${verb} ${counts.uploaded}, already there ${counts.same}, refused ${counts.refused}`);
  if (counts.refused > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
