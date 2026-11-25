/**
 * Makes Recite's pack for the phone (on-device-plan.md §6 and §13) and puts it on the dev backend: seals each part
 * with a new random key (functions/src/recitePack/format.ts), checks it opens again, uploads the sealed parts to the
 * private path packs/recite/<id>/, keeps the key in recitePackKeys/<id>, and last points recitePacks/current at it, so
 * the callable recitePack never answers for a pack that isn't all there.
 *
 * Dev only. A pack id is one key and one set of files, for good: a new model, table or engine data version is a new id.
 * The key and the plain files are never printed, logged or written anywhere.
 *
 * The usual way, one command from the functions/ directory, after `npm run build`:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/recite-pack-make.js --lab [--dry]
 * It takes the lab's standard files (runs/mobile/models, golden/pack-v5, golden/pack-strict), refuses a table that isn't
 * its manifest's or a model that isn't in the private checker/marks.json, and works the id out from the files' hashes:
 * a changed file is a new version, and the same files are "already current". Phones move to it at their next daily check.
 *
 * Or file by file:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json node scripts/recite-pack-make.js \
 *     --id v7m-1 \
 *     --core v7.graph.onnx=/models/v7m-any.graph.onnx,v7.weights.f16=/models/v7m-any.weights.f16,\
 *            v7.weights.json=/models/v7m-any.weights.json,v7.check=/pack/v7.check,words.rcwt=/pack/words.rcwt,\
 *            ayahs.bin=/pack/ayahs.bin,\
 *            norms.bin=/pack/norms.bin,stops.bin=/pack/stops.bin,lexicon.bin=/pack/lexicon.bin,\
 *            letters.bin=/pack/letters.bin,mel.bin=/pack/mel.bin,config.json=/pack/config.json,\
 *            manifest.json=/pack/manifest.json \
 *     --strict v5.graph.onnx=/models/v5m.graph.onnx,v5.weights.f16=/models/v5m.weights.f16,\
 *              v5.weights.json=/models/v5m.weights.json,v5.check=/pack/v5.check,strict.bin=/pack-strict/strict.bin \
 *     --apps 1:433792838929:ios:…,1:433792838929:android:… \
 *     --claim onDeviceBench
 *
 * Either way every table must be the one manifest.json names, and manifest.json travels in the core part: the engine
 * reports its version and content in rc_info.
 *
 * Only marked models leave the Mac: v7m-* and v5m.* (their hashes are in the private checker/marks.json). From pack-v4 the
 * phone's v5 is full precision, held as v7 is: the signed 8-bit file computed something else on a real iPhone.
 *
 *   --lab       the standard files, as above (--marks FILE: another marks.json, instead of the private repo's)
 *   --dry       seal and check only: no credentials, nothing uploaded or written
 *   --hold      upload the pack and keep its key, and leave recitePacks/current where it is: no phone is offered it
 *   --make-current ID   point recitePacks/current at a pack uploaded with --hold, once its files are checked
 *   --no-claim  any signed-in account of the listed apps (the default claim is onDeviceBench)
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PACK_ID, RCPK_FORMAT, KEY_BYTES, contentPackId, open, packContainer, seal, unpackContainer } = require('../lib/recitePack/format');

/** The names recite-core's rc_open takes (recite_core.h). */
const CORE_NEEDS = ['v7.graph.onnx', 'v7.weights.f16', 'v7.weights.json', 'v7.check', 'words.rcwt', 'ayahs.bin', 'norms.bin',
  'stops.bin', 'lexicon.bin', 'letters.bin', 'mel.bin', 'config.json', 'manifest.json'];
const STRICT_NEEDS = ['v5.graph.onnx', 'v5.weights.f16', 'v5.weights.json', 'v5.check', 'strict.bin'];
const BLOB_NAMES = new Set([...CORE_NEEDS, ...STRICT_NEEDS]);
/** The lab's tables. A pack folder is never remade in place: a new one sits beside the others under its own name. */
const TABLES_FOLDER = 'golden/pack-v5';  // pack-v4 with the off-script switches on (engine 0.2.2)

/** Revisely Dev's iOS and Android apps (handbook/dev-stack.md): the App Check ids a --lab pack is for. */
const DEV_APPS = ['1:433792838929:ios:854e01f457f27d29bbf0b0', '1:433792838929:android:5c8c71d0893a4fe3bbf0b0'];
/** Where the private repo keeps checker/marks.json, newest branch first. */
const MARK_REFS = ['origin/recite-core/main', 'origin/checker/teacher-speed', 'origin/main'];
const MODEL_FILES = {
  'v7.graph.onnx': 'v7m-any.graph.onnx',
  'v7.weights.f16': 'v7m-any.weights.f16',
  'v7.weights.json': 'v7m-any.weights.json',
  'v5.graph.onnx': 'v5m.graph.onnx',
  'v5.weights.f16': 'v5m.weights.f16',
  'v5.weights.json': 'v5m.weights.json',
};

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function args(argv) {
  const out = { claim: 'onDeviceBench', dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--lab') out.lab = true;
    else if (a === '--no-claim') out.claim = null;
    else if (a === '--hold') out.hold = true;
    else if (a === '--make-current') {
      if (argv[i + 1] === undefined) fail(`${a} needs a pack id`);
      out.makeCurrent = argv[++i];
    } else if (['--id', '--core', '--strict', '--apps', '--claim', '--marks'].includes(a)) {
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

function readManifest(file) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fail(`${file} isn't a readable manifest`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail(`${file} isn't a manifest`);
  return manifest;
}

/** A table must be the file the manifest names. Models have their marks, strict.bin isn't listed, and the manifest can't vouch for itself. */
function checkTable(manifest, from, name, data) {
  if (MODEL_FILES[name] || name === 'strict.bin' || name === 'manifest.json') return;
  const row = manifest[name];
  if (!row || row.sha256 !== sha256(data) || row.bytes !== data.length) fail(`${name} isn't the file ${from} names`);
}

/** Every file with an ownership mark, as "name sha256" (checker/marks.json: [{ files: { name: sha256 } }]). */
function markedFiles(file) {
  const texts = [];
  if (file) texts.push(fs.readFileSync(file, 'utf8'));
  else {
    const repo = path.join(os.homedir(), 'revisely-internal');
    try {
      execFileSync('git', ['-C', repo, 'fetch', '-q', 'origin'], { stdio: 'ignore' });
    } catch {
      // offline: the refs as they are
    }
    for (const ref of MARK_REFS) {
      try {
        texts.push(execFileSync('git', ['-C', repo, 'show', `${ref}:checker/marks.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      } catch {
        // this branch doesn't have it
      }
    }
  }
  if (texts.length === 0) fail('no checker/marks.json to check the models against (--marks FILE)');
  const out = new Set();
  for (const text of texts) {
    for (const entry of JSON.parse(text)) {
      for (const [name, hash] of Object.entries(entry.files ?? {})) out.add(`${name} ${hash}`);
    }
  }
  return out;
}

/** The lab's standard files, each checked: tables against their manifest, models against the marks. */
function labParts(marksFile) {
  const lab = process.env.RECITE_LAB || path.join(os.homedir(), 'revisely-mistake-lab');
  const models = path.join(lab, 'runs/mobile/models');
  const tables = path.join(lab, TABLES_FOLDER);
  if (!fs.existsSync(path.join(tables, 'manifest.json'))) fail(`no ${TABLES_FOLDER}/manifest.json`);
  const where = (name) => {
    if (MODEL_FILES[name]) return path.join(models, MODEL_FILES[name]);
    return name === 'strict.bin' ? path.join(lab, 'golden/pack-strict/strict.bin') : path.join(tables, name);
  };
  const manifest = readManifest(path.join(tables, 'manifest.json'));
  const marked = markedFiles(marksFile);
  const hashes = [];
  const part = (name, needs) =>
    needs.map((blob) => {
      const file = where(blob);
      if (!fs.existsSync(file)) fail(`no file for ${blob}`);
      const data = fs.readFileSync(file);
      const hash = sha256(data);
      if (MODEL_FILES[blob]) {
        if (!marked.has(`${MODEL_FILES[blob]} ${hash}`)) fail(`${MODEL_FILES[blob]} isn't a marked model (checker/marks.json): it stays on the Mac`);
      } else {
        checkTable(manifest, `${TABLES_FOLDER}/manifest.json`, blob, data);
      }
      hashes.push({ part: name, name: blob, sha256: hash });
      return { name: blob, path: file };
    });
  return { core: part('core', CORE_NEEDS), strict: part('strict', STRICT_NEEDS), hashes };
}

/** One part sealed, and opened again with the key before anything leaves this machine. */
function makePart(packId, part, list, key) {
  const blobs = list.map(({ name, path }) => ({ name, data: fs.readFileSync(path) }));
  for (const model of ['v7', 'v5']) {
    const weights = blobs.find((b) => b.name === `${model}.weights.f16`);
    if (!weights) continue;
    // the engine widens them in place: the phone's buffer for them is the fp32 size (recite_core.h)
    const table = blobs.find((b) => b.name === `${model}.weights.json`);
    if (!table) fail(`${model}.weights.f16 without ${model}.weights.json`);
    const layout = JSON.parse(table.data.toString('utf8'));
    if (!Number.isSafeInteger(layout.fp32_bytes) || layout.fp32_bytes < weights.data.length) fail(`${model}.weights.json: fp32_bytes`);
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

/** The dev backend, from the admin key. Refuses any other project. */
function devBackend() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) fail('Set GOOGLE_APPLICATION_CREDENTIALS to the dev project service account JSON path.');
  const project = JSON.parse(fs.readFileSync(keyFile, 'utf8')).project_id;
  if (project !== 'revisely-dev') fail(`The pack lives on the dev backend only; this key is for ${project}.`);
  const admin = require('firebase-admin');
  admin.initializeApp({ storageBucket: 'revisely-dev.firebasestorage.app' });
  return { admin, db: admin.firestore() };
}

/** recitePacks/held-<id>: what recitePacks/current will say for a pack uploaded with --hold. Closed to clients, as they all are. */
const heldDoc = (id) => `recitePacks/held-${id}`;

/** Points recitePacks/current at a held pack, after checking its key and its uploaded files are all there. */
async function makeCurrent(id) {
  if (!PACK_ID.test(id)) fail('--make-current: not a pack id');
  const { admin, db } = devBackend();
  const held = (await db.doc(heldDoc(id)).get()).data();
  if (!held || held.packId !== id) fail(`${id} isn't a held pack`);
  if (!(await db.doc(`recitePackKeys/${id}`).get()).exists) fail(`${id} has no key`);
  for (const info of Object.values(held.parts)) {
    const file = admin.storage().bucket().file(info.path);
    const [there] = await file.exists();
    if (!there) fail(`${info.path} isn't there`);
    const [meta] = await file.getMetadata();
    if (Number(meta.size) !== info.bytes) fail(`${info.path} is the wrong size`);
  }
  await db.doc('recitePacks/current').set({ ...held, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`recitePacks/current → ${id}`);
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.makeCurrent) {
    if (o.lab || o.hold || o.dry || o.core) fail('--make-current takes only the pack id');
    await makeCurrent(o.makeCurrent);
    return;
  }
  const lab = o.lab ? labParts(o.marks) : null;
  if (lab) {
    o.id = contentPackId(lab.hashes);
    o.apps = o.apps ?? DEV_APPS.join(',');
    console.log(`pack id: ${o.id}`);
  }
  if (!o.id || !PACK_ID.test(o.id)) fail('--id: lower-case letters, digits, dots and dashes');
  if (!lab && !o.core) fail('--core is required');
  const core = lab ? lab.core : blobList(o.core);
  const missing = CORE_NEEDS.filter((n) => !core.some((b) => b.name === n));
  if (missing.length) fail(`--core is missing ${missing.join(', ')}`);
  const strict = lab ? lab.strict : o.strict ? blobList(o.strict) : null;
  const strictMissing = strict ? STRICT_NEEDS.filter((n) => !strict.some((b) => b.name === n)) : [];
  if (strictMissing.length) fail(`--strict is missing ${strictMissing.join(', ')}`);
  if (!lab) {
    const manifest = readManifest(core.find((b) => b.name === 'manifest.json').path);
    for (const b of [...core, ...(strict ?? [])]) checkTable(manifest, 'the given manifest.json', b.name, fs.readFileSync(b.path));
  }
  const apps = (o.apps ?? '').split(',').filter(Boolean);
  if (!o.dry && apps.length === 0) fail('--apps: the App Check app ids that may fetch it');

  let admin;
  let db;
  if (!o.dry) {
    ({ admin, db } = devBackend());
    if ((await db.doc(`recitePackKeys/${o.id}`).get()).exists) {
      if (lab && (await db.doc('recitePacks/current').get()).data()?.packId === o.id) {
        console.log(`${o.id} is already the current pack: nothing to do.`);
        return;
      }
      fail(`pack ${o.id} already exists: a version is never overwritten`);
    }
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
  const record = {
    packId: o.id,
    format: RCPK_FORMAT,
    parts: Object.fromEntries(Object.entries(parts).map(([name, p]) => [name, p.info])),
    apps,
    claim: o.claim,
    dailyCalls: 6,
    dailyKeys: 3,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (o.hold) {
    await db.doc(heldDoc(o.id)).create(record);
    const current = (await db.doc('recitePacks/current').get()).data()?.packId;
    console.log(`held: ${o.id}. recitePacks/current stays on ${current ?? 'nothing'}; --make-current ${o.id} moves it.`);
    return;
  }
  await db.doc('recitePacks/current').set(record);
  console.log(`recitePacks/current → ${o.id} (${apps.length} apps, claim: ${o.claim ?? 'none'})`);
}

main().catch((err) => fail(err.message));
