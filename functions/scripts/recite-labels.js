/**
 * Recitation labels in revisely-dev (Revisely Console's /label page; functions/src/console/labels.ts): adds clips for
 * Majd to label, and exports his labels for the lab's bench and training.
 *
 * Only clips a person may listen to go in: a licensed set whose licence allows it (`licensed`), Majd's own recordings
 * (`own`), or recordings gathered with the reciter's permission (`permission`). Never the /record takes or anyone's
 * Dev takes (recite-tests/): their consent says nobody listens. The script refuses a clip without one of those sources,
 * and audio from those folders.
 *
 * Run from functions/, with the dev project's key (or against the emulators, FIRESTORE_EMULATOR_HOST and
 * FIREBASE_STORAGE_EMULATOR_HOST set):
 *   export GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json
 *   node scripts/recite-labels.js add clips.jsonl --batch bench-v0-a [--dry] [--replace]
 *   node scripts/recite-labels.js status
 *   node scripts/recite-labels.js export [--out labels.jsonl] [--batch name] [--all]
 *   node scripts/recite-labels.js queue --batch name --to teacher@example.com [--share 0.2] [--yes]
 *   node scripts/recite-labels.js remove --batch name [--yes] [--labelled-too]
 *
 * `add` reads one clip per line:
 *   {"id": "bench-v0-a-0001",                      // letters, digits, . _ -; unique
 *    "source": {"kind": "licensed", "name": "…"},  // licensed | own | permission, and the set or person
 *    "audio": "/path/to/clip.wav",                 // any format afconvert reads; stored as AAC (m4a), mono
 *    "w": [first, last],                           // the passage, the app's word numbers (QuranWords), inclusive
 *    "marks": [ … ],                               // the checker's marks on it (recite-contract.md, "A mark")
 *    "times": [[w, start, end], …],                // optional: when each word was said, in seconds
 *    "order": 12}                                  // optional: lower comes first (default: the line number)
 * Instead of "w", "from": [surah, ayah] and "to": [surah, ayah] take whole ayahs.
 *
 * `export` writes one line per label (two labellers on a clip are two lines, told apart by `by`, with `role`): the clip
 * (no audio), each mark with `verdict` (yes: a mistake; no: not one; unsure: can't tell), `missed` (words the checker
 * didn't mark, as the labeller heard them: word, skipped, added, harakat, letter, unclear), `clip` (fine, mistakes or
 * unusable), `skip` (why it is unusable), and when and how long.
 *
 * A clip is labelled once by default, by whoever reaches it first. `queue` sends a share of a batch to a labeller as well
 * (one clip in five by default, spread through the batch), so some clips get two labels to compare.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');

const CLIPS = 'reciteLabelClips';
const LABELS = 'labels';
const AUDIO_PREFIX = 'recite-labels/';
const SOURCE_KINDS = ['licensed', 'own', 'permission'];
const MARK_KINDS = ['word', 'skipped', 'added', 'harakat', 'letter', 'tajweed'];
// People's takes, kept for the checker on the promise that nobody listens (CLAUDE.md, "Recitation check"): the dev
// bucket's recite-tests/, and the lab's copies (data/dev-takes, data/record-raw, data/record-v1).
const NEVER = /recite-tests|dev-takes|record-raw|record-v\d|(^|\/)record(\/|$)/i;
const ID = /^[A-Za-z0-9_.-]{1,120}$/;

const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
let PROJECT;
if (EMULATOR) {
  PROJECT = process.env.GCLOUD_PROJECT || 'demo-revisely';
} else {
  const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!KEY) {
    console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to the dev project key (~/secrets/revisely-dev-admin.json).');
    process.exit(1);
  }
  PROJECT = JSON.parse(fs.readFileSync(KEY, 'utf8')).project_id;
  if (PROJECT !== 'revisely-dev') {
    console.error(`Labels live in revisely-dev only (this key is ${PROJECT}).`);
    process.exit(1);
  }
}
const BUCKET = process.env.LABELS_BUCKET || (EMULATOR ? `${PROJECT}.appspot.com` : 'revisely-dev.firebasestorage.app');
admin.initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = admin.firestore();
const bucket = admin.storage().bucket();

// ── The Qur'an's words, numbered as the app numbers them (src/lib/recite/quranWords.ts) ──
const ROOT = path.join(__dirname, '..', '..');
function loadWords() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/quranWords.dat'), 'utf8'));
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/quranData.ts'), 'utf8');
  const surahs = [];
  const re = /^\s*(\d+): \{ nameDisplay: (['"])(.*?)\2, .*?ayahCount: (\d+) \}/gm;
  let m;
  while ((m = re.exec(src))) surahs[+m[1]] = { name: m[3], ayahs: +m[4] };
  const verseStart = [];
  const verseOf = {};
  const words = [];
  let w = 0;
  let s = 1;
  let a = 0;
  for (let v = 0; v < data.counts.length; v++) {
    a += 1;
    if (v > 0 && a > surahs[s].ayahs) {
      s += 1;
      a = 1;
    }
    verseStart[v] = w;
    verseOf[`${s}:${a}`] = v;
    const u = data.uthmani[v].split(' ');
    for (let p = 0; p < data.counts[v]; p++, w++) words.push({ t: (u[p] ?? '').replace(/ /g, ' '), s, a });
  }
  verseStart.push(w);
  return { words, verseStart, verseOf, surahs, total: w };
}

function fail(line, why) {
  throw new Error(`line ${line}: ${why}`);
}

function audioSeconds(file) {
  try {
    const out = execFileSync('afinfo', [file], { encoding: 'utf8' });
    const m = /estimated duration: ([\d.]+)/.exec(out);
    if (m) return +(+m[1]).toFixed(2);
  } catch {
    // afinfo missing or the file unreadable: the manifest's seconds, if any
  }
  return null;
}

/** AAC in an m4a, mono, 48 kb/s: about 6 KB a second, which Safari decodes. An m4a or mp3 is kept as it is. */
function prepareAudio(file, tmp) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.m4a' || ext === '.mp4') return { file, type: 'audio/mp4', ext: '.m4a' };
  if (ext === '.mp3') return { file, type: 'audio/mpeg', ext: '.mp3' };
  const out = path.join(tmp, path.basename(file, ext) + '.m4a');
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', '-c', '1', file, out]);
  return { file: out, type: 'audio/mp4', ext: '.m4a' };
}

function checkMark(m, first, last, line) {
  if (!m || typeof m !== 'object') fail(line, 'a mark isn’t an object');
  if (typeof m.id !== 'string' || !m.id || m.id.length > 120) fail(line, 'a mark has no id');
  if (!Number.isInteger(m.w) || m.w < first - 1 || m.w > last) fail(line, `mark ${m.id} is on word ${m.w}, outside the clip`);
  if (!MARK_KINDS.includes(m.kind)) fail(line, `mark ${m.id} has kind ${m.kind}`);
  const out = {};
  for (const [k, v] of Object.entries(m)) if (v !== undefined) out[k] = v;
  return out;
}

async function add(file, opts) {
  const Q = loadWords();
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recite-labels-'));
  const batch = opts.batch;
  if (!batch || !ID.test(batch)) throw new Error('Give the clips a batch name: --batch <letters, digits, . _ ->');
  const clips = [];
  const seen = new Set();
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    let c;
    try {
      c = JSON.parse(raw);
    } catch {
      fail(line, 'not JSON');
    }
    if (!ID.test(c.id || '')) fail(line, 'the id must be letters, digits, . _ - (up to 120)');
    if (seen.has(c.id)) fail(line, `id ${c.id} twice`);
    seen.add(c.id);
    if (!c.source || !SOURCE_KINDS.includes(c.source.kind)) fail(line, `source.kind must be one of ${SOURCE_KINDS.join(', ')}: only clips a person may listen to`);
    if (typeof c.source.name !== 'string' || !c.source.name.trim()) fail(line, 'source.name: which set, or whose recording');
    if (typeof c.audio !== 'string' || !fs.existsSync(c.audio)) fail(line, `no audio file at ${c.audio}`);
    if (NEVER.test(c.audio) || NEVER.test(c.source.name)) fail(line, 'that looks like people’s /record or Dev takes, which nobody listens to');
    let first;
    let last;
    if (Array.isArray(c.w)) [first, last] = c.w;
    else if (Array.isArray(c.from) && Array.isArray(c.to)) {
      const v0 = Q.verseOf[`${c.from[0]}:${c.from[1]}`];
      const v1 = Q.verseOf[`${c.to[0]}:${c.to[1]}`];
      if (v0 == null || v1 == null) fail(line, 'from/to isn’t an ayah');
      first = Q.verseStart[v0];
      last = Q.verseStart[v1 + 1] - 1;
    } else fail(line, 'give the passage as "w": [first, last] or "from"/"to"');
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= Q.total || last < first) fail(line, 'the passage’s words are out of range');
    if (last - first > 400) fail(line, 'over 400 words: cut the clip shorter');
    const marks = (c.marks || []).map((m) => checkMark(m, first, last, line));
    if (new Set(marks.map((m) => m.id)).size !== marks.length) fail(line, 'two marks share an id');
    const times = Array.isArray(c.times)
      ? c.times.filter((t) => Array.isArray(t) && t.length === 3 && t.every((x) => typeof x === 'number') && t[0] >= first && t[0] <= last)
      : [];
    const words = [];
    for (let w = first; w <= last; w++) words.push({ w, t: Q.words[w].t, s: Q.words[w].s, a: Q.words[w].a });
    clips.push({ line, c, words, marks, times, order: typeof c.order === 'number' ? c.order : line });
  });
  console.log(`${clips.length} clips in ${file} (batch ${batch}, ${PROJECT}${EMULATOR ? ', emulators' : ''})`);
  const existing = new Set();
  for (let i = 0; i < clips.length; i += 300) {
    const refs = clips.slice(i, i + 300).map((x) => db.collection(CLIPS).doc(x.c.id));
    const docs = await db.getAll(...refs);
    for (const d of docs) if (d.exists) existing.add(d.id);
  }
  if (existing.size && !opts.replace) console.log(`${existing.size} already there; left as they are (--replace puts them back to unlabelled)`);
  if (opts.dry) {
    const marks = clips.reduce((n, x) => n + x.marks.length, 0);
    console.log(`Dry run: would add ${clips.length - (opts.replace ? 0 : existing.size)} clips, ${marks} marks. Nothing written.`);
    return;
  }
  let added = 0;
  for (const x of clips) {
    if (existing.has(x.c.id) && !opts.replace) continue;
    const audio = prepareAudio(x.c.audio, tmp);
    const seconds = audioSeconds(audio.file) ?? (typeof x.c.seconds === 'number' ? x.c.seconds : null);
    if (seconds == null) fail(x.line, 'couldn’t tell the audio’s length (no afinfo): add "seconds"');
    const dest = `${AUDIO_PREFIX}${batch}/${x.c.id}${audio.ext}`;
    await bucket.upload(audio.file, { destination: dest, metadata: { contentType: audio.type, cacheControl: 'private, max-age=0' } });
    await db.collection(CLIPS).doc(x.c.id).set({
      batch,
      order: x.order,
      source: { kind: x.c.source.kind, name: x.c.source.name.trim() },
      audio: { path: dest, type: audio.type, seconds },
      words: x.words,
      // JSON text: a mark's `into.also` is an array of arrays, which Firestore can't hold
      marks: JSON.stringify(x.marks),
      times: x.times.map(([w, a, b]) => ({ w, a, b })),
      status: 'open',
      createdAt: Date.now(),
    });
    added++;
    if (added % 25 === 0) console.log(`  ${added}…`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`✓ Added ${added} clips to ${batch}.`);
}

/** Every label, grouped by clip id: [{ uid, ...label }]. */
async function labelsByClip() {
  const snap = await db.collectionGroup(LABELS).get();
  const out = new Map();
  for (const d of snap.docs) {
    const clip = d.ref.parent.parent;
    if (!clip || clip.parent.id !== CLIPS) continue;
    const l = d.data();
    const list = out.get(clip.id) || [];
    list.push({ uid: d.id, ...l, at: l.at && l.at.toMillis ? l.at.toMillis() : l.at });
    out.set(clip.id, list);
  }
  return out;
}

async function status() {
  const snap = await db.collection(CLIPS).select('batch', 'status', 'queue', 'labelledBy').get();
  const labels = await labelsByClip();
  const by = new Map();
  for (const d of snap.docs) {
    const b = d.get('batch');
    const row = by.get(b) || { open: 0, done: 0, skipped: 0, labels: 0, twice: 0, queued: 0, answers: 0, ms: 0 };
    row[d.get('status')] = (row[d.get('status')] || 0) + 1;
    const ls = labels.get(d.id) || [];
    row.labels += ls.length;
    if (ls.length > 1) row.twice += 1;
    row.queued += (d.get('queue') || []).length;
    for (const l of ls) {
      row.answers += l.answers || 0;
      row.ms += l.ms || 0;
    }
    by.set(b, row);
  }
  if (!by.size) return console.log('No clips yet.');
  for (const [b, r] of by) {
    const rate = r.ms ? Math.round(r.answers / (r.ms / 3_600_000)) : 0;
    console.log(
      `${b}: ${r.open} to label, ${r.done} labelled, ${r.skipped} unusable · ${r.labels} labels (${r.twice} clips by two people, ` +
        `${r.queued} waiting for a second) · ${r.answers} answers${rate ? `, ${rate} an hour` : ''}`,
    );
  }
}

async function exportLabels(opts) {
  let q = db.collection(CLIPS);
  if (opts.batch) q = q.where('batch', '==', opts.batch);
  const snap = await q.get();
  const labels = await labelsByClip();
  const out = opts.out ? fs.createWriteStream(opts.out) : process.stdout;
  let n = 0;
  for (const d of snap.docs) {
    const c = d.data();
    const ls = labels.get(d.id) || [];
    if (!ls.length && !opts.all) continue;
    const base = {
      id: d.id,
      batch: c.batch,
      source: c.source,
      seconds: c.audio.seconds,
      w: [c.words[0].w, c.words[c.words.length - 1].w],
      words: c.words,
      times: (c.times || []).map((t) => [t.w, t.a, t.b]),
      status: c.status,
    };
    // One line per label: two labellers on a clip are two lines, told apart by `by`.
    for (const l of ls.length ? ls : [null]) {
      const row = {
        ...base,
        marks: JSON.parse(c.marks).map((m) => ({ ...m, verdict: l ? (l.marks[m.id] ?? null) : null })),
        missed: l ? Object.entries(l.words).map(([w, label]) => ({ w: +w, label })).sort((a, b) => a.w - b.w) : [],
        clip: l?.clip ?? null,
        skip: l?.skip ?? null,
        labelledAt: l?.at ?? null,
        ms: l?.ms ?? null,
        by: l?.uid ?? null,
        role: l?.by?.role ?? null,
      };
      out.write(JSON.stringify(row) + '\n');
      n++;
    }
  }
  if (opts.out) {
    out.end();
    console.error(`✓ ${n} lines to ${opts.out}`);
  }
}

/** Sends some of a batch's clips to a labeller as well (a second label on purpose), spread through the batch. */
async function queue(opts) {
  if (!opts.batch || !opts.to) throw new Error('queue --batch <name> --to <email|uid> [--share 0.2] [--yes]');
  const user = opts.to.includes('@') ? await admin.auth().getUserByEmail(opts.to) : await admin.auth().getUser(opts.to);
  const share = opts.share != null ? Number(opts.share) : 0.2;
  if (!(share > 0 && share <= 1)) throw new Error('--share is a fraction: 0.2 sends one clip in five');
  const snap = await db.collection(CLIPS).where('batch', '==', opts.batch).get();
  const docs = snap.docs.sort((a, b) => a.get('order') - b.get('order'));
  const every = Math.max(1, Math.round(1 / share));
  const pick = docs.filter((d, i) => i % every === 0).filter((d) => !(d.get('labelledBy') || []).includes(user.uid) && !(d.get('queue') || []).includes(user.uid));
  console.log(`${opts.batch}: ${pick.length} of ${docs.length} clips to send to ${user.email || user.uid} as well`);
  if (!opts.yes) return console.log('Dry run: --yes sends them.');
  for (const d of pick) await d.ref.update({ queue: admin.firestore.FieldValue.arrayUnion(user.uid) });
  console.log(`✓ Sent ${pick.length}. They come first on that labeller's page.`);
}

async function remove(opts) {
  if (!opts.batch) throw new Error('--batch <name>: which batch to remove');
  const snap = await db.collection(CLIPS).where('batch', '==', opts.batch).get();
  const docs = snap.docs.filter((d) => opts.labelledToo || !(d.get('labelledBy') || []).length);
  const kept = snap.size - docs.length;
  console.log(`${opts.batch}: ${docs.length} clips to remove${kept ? ` (${kept} labelled ones kept; --labelled-too removes them and their labels too)` : ''}`);
  if (!opts.yes) return console.log('Dry run: --yes removes them and their audio.');
  for (const d of docs) {
    await bucket.file(d.get('audio.path')).delete({ ignoreNotFound: true });
    await db.recursiveDelete(d.ref);
  }
  console.log(`✓ Removed ${docs.length}.`);
}

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry' || a === '--replace' || a === '--all' || a === '--yes') opts[a.slice(2)] = true;
    else if (a === '--labelled-too') opts.labelledToo = true;
    else if (a === '--batch' || a === '--out' || a === '--to' || a === '--share') opts[a.slice(2)] = argv[++i];
    else opts._.push(a);
  }
  return opts;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opts = parse(rest);
  if (cmd === 'add' && opts._[0]) return add(opts._[0], opts);
  if (cmd === 'status') return status();
  if (cmd === 'export') return exportLabels(opts);
  if (cmd === 'remove') return remove(opts);
  if (cmd === 'queue') return queue(opts);
  console.error('Usage: node scripts/recite-labels.js add <clips.jsonl> --batch <name> [--dry] [--replace] | status | export [--out f] [--batch b] [--all] | queue --batch <name> --to <email|uid> [--share 0.2] [--yes] | remove --batch <name> [--yes] [--labelled-too]');
  process.exit(1);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err.message || err);
    process.exit(1);
  },
);
