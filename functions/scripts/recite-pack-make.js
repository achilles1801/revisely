/**
 * Makes Recite's pack for the phone (on-device-plan.md §6 and §13) and puts it on the dev backend: seals each part
 * with a new random key (functions/src/recitePack/format.ts), checks it opens again, uploads the sealed parts to the
 * private path packs/recite/<id>/, keeps the key in recitePackKeys/<id>, and last points recitePacks/current at it, so
 * the callable recitePack never answers for a pack that isn't all there.
 *
 * Dev only. A pack id is one key and one set of files, for good: a new model, table or engine data version is a new id.
 * The key and the plain files are never printed, logged or written anywhere.
 *
 * From the functions/ directory, after `npm run build`:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/recite-pack-make.js \
 *     --id v7m-1 \
 *     --core v7.graph.onnx=/models/v7m-any.graph.onnx,v7.weights.f16=/models/v7m-any.weights.f16,\
 *            v7.weights.json=/models/v7m-any.weights.json,words.rcwt=/pack/words.rcwt,ayahs.bin=/pack/ayahs.bin,\
 *            norms.bin=/pack/norms.bin,stops.bin=/pack/stops.bin,lexicon.bin=/pack/lexicon.bin,\
 *            letters.bin=/pack/letters.bin,mel.bin=/pack/mel.bin,config.json=/pack/config.json \
 *     --strict v5.onnx=/models/v5.onnx,strict.bin=/pack-strict/strict.bin \
 *     --apps 1:433792838929:ios:…,1:433792838929:android:… \
 *     --claim onDeviceBench
 *
 *   --dry       seal and check only: no credentials, nothing uploaded or written
 *   --no-claim  any signed-in account of the listed apps (the default claim is onDeviceBench)
 */
const crypto = require('crypto');
const fs = require('fs');
const { PACK_ID, RCPK_FORMAT, KEY_BYTES, open, packContainer, seal, unpackContainer } = require('../lib/recitePack/format');

/** The names recite-core's rc_open takes (recite_core.h). */
const CORE_NEEDS = ['v7.graph.onnx', 'v7.weights.f16', 'v7.weights.json', 'words.rcwt', 'ayahs.bin', 'norms.bin',
  'stops.bin', 'lexicon.bin', 'letters.bin', 'mel.bin', 'config.json'];
const STRICT_NEEDS = ['v5.onnx', 'strict.bin'];
const BLOB_NAMES = new Set([...CORE_NEEDS, ...STRICT_NEEDS]);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function args(argv) {
  const out = { claim: 'onDeviceBench', dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--no-claim') out.claim = null;
    else if (['--id', '--core', '--strict', '--apps', '--claim'].includes(a)) {
      if (argv[i + 1] === undefined) fail(`${a} needs a value`);
      out[a.slice(2)] = argv[++i];
    } else fail(`unknown argument ${a}`);
  }
  return out;
}

/** "name=path,name=path" → [{ name, path }], every name one rc_open knows and every file there. */
function blobList(spec) {
  return spec.split(',').map((item) => {
    const at = item.indexOf('=');
    if (at < 1) fail(`expected name=path, got ${item}`);
    const name = item.slice(0, at);
    const path = item.slice(at + 1);
    if (!BLOB_NAMES.has(name)) fail(`${name} isn't a blob the engine reads (${[...BLOB_NAMES].join(', ')})`);
    if (!fs.existsSync(path)) fail(`no file for ${name}`);
    return { name, path };
  });
}

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** One part sealed, and opened again with the key before anything leaves this machine. */
function makePart(packId, part, list, key) {
  const blobs = list.map(({ name, path }) => ({ name, data: fs.readFileSync(path) }));
  const weights = blobs.find((b) => b.name === 'v7.weights.f16');
  if (weights) {
    // the engine widens them in place: the phone's buffer for them is the fp32 size (recite_core.h)
    const layout = JSON.parse(blobs.find((b) => b.name === 'v7.weights.json').data.toString('utf8'));
    if (!Number.isSafeInteger(layout.fp32_bytes) || layout.fp32_bytes < weights.data.length) fail('v7.weights.json: fp32_bytes');
    weights.room = layout.fp32_bytes;
  }
  const sealed = seal(packContainer(blobs), key, { packId, part });
  const back = unpackContainer(open(sealed, key, { packId, part }));
  if (back.length !== blobs.length || back.some((b, i) => b.name !== blobs[i].name || !b.data.equals(blobs[i].data))) {
    fail(`${part} didn't open back to its files`);
  }
  const info = { path: `packs/recite/${packId}/${part}.rcpk`, bytes: sealed.length, sha256: sha256(sealed) };
  console.log(`${part}: ${blobs.map((b) => `${b.name} ${(b.data.length / 1e6).toFixed(1)} MB`).join(', ')} → ${(sealed.length / 1e6).toFixed(1)} MB sealed`);
  return { sealed, info };
}

async function main() {
  const o = args(process.argv.slice(2));
  if (!o.id || !PACK_ID.test(o.id)) fail('--id: lower-case letters, digits, dots and dashes');
  if (!o.core) fail('--core is required');
  const core = blobList(o.core);
  const missing = CORE_NEEDS.filter((n) => !core.some((b) => b.name === n));
  if (missing.length) fail(`--core is missing ${missing.join(', ')}`);
  const strict = o.strict ? blobList(o.strict) : null;
  const strictMissing = strict ? STRICT_NEEDS.filter((n) => !strict.some((b) => b.name === n)) : [];
  if (strictMissing.length) fail(`--strict is missing ${strictMissing.join(', ')}`);
  const apps = (o.apps ?? '').split(',').filter(Boolean);
  if (!o.dry && apps.length === 0) fail('--apps: the App Check app ids that may fetch it');

  let admin;
  let db;
  if (!o.dry) {
    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyFile) fail('Set GOOGLE_APPLICATION_CREDENTIALS to the dev project service account JSON path.');
    const project = JSON.parse(fs.readFileSync(keyFile, 'utf8')).project_id;
    if (project !== 'revisely-dev') fail(`The pack lives on the dev backend only; this key is for ${project}.`);
    admin = require('firebase-admin');
    admin.initializeApp({ storageBucket: 'revisely-dev.firebasestorage.app' });
    db = admin.firestore();
    if ((await db.doc(`recitePackKeys/${o.id}`).get()).exists) fail(`pack ${o.id} already exists: a new pack needs a new id`);
  }

  const key = crypto.randomBytes(KEY_BYTES);
  const parts = { core: makePart(o.id, 'core', core, key) };
  if (strict) parts.strict = makePart(o.id, 'strict', strict, key);
  if (o.dry) {
    console.log('Dry run: sealed and checked; nothing uploaded or written.');
    return;
  }

  const bucket = admin.storage().bucket();
  for (const { sealed, info } of Object.values(parts)) {
    // Create-only: a name is one file, for good.
    await bucket.file(info.path).save(sealed, {
      resumable: true,
      contentType: 'application/octet-stream',
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    const [meta] = await bucket.file(info.path).getMetadata();
    if (Number(meta.size) !== info.bytes) fail(`${info.path} uploaded at the wrong size`);
    console.log(`uploaded ${info.path}`);
  }
  await db.doc(`recitePackKeys/${o.id}`).create({ key: key.toString('base64'), createdAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.doc('recitePacks/current').set({
    packId: o.id,
    format: RCPK_FORMAT,
    parts: Object.fromEntries(Object.entries(parts).map(([name, p]) => [name, p.info])),
    apps,
    claim: o.claim,
    dailyCalls: 6,
    dailyKeys: 3,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`recitePacks/current → ${o.id} (${apps.length} apps, claim: ${o.claim ?? 'none'})`);
}

main().catch((err) => fail(err.message));
