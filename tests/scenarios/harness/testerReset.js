// The tester reset (functions resetMyData) against the emulators, in its own
// Node process with firebase-admin, as harness/adminReset.js runs the owner's
// script. It runs the function's own code (functions/src/testerReset.ts and
// testerResetAdmin.ts, compiled here with the functions' TypeScript) behind the
// callable's checks: the caller's uid as the ID token gives it, App Check as
// passed. Storage isn't emulated in the scenarios: an in-memory bucket with no
// recording files, which keeps the backup it is given.
// Usage (harness/admin.ts):
//   node testerReset.js reset <uid> '<data json>' [--no-app-check]
//   node testerReset.js scenario <uid> '<data json>' --now <ms> [--no-app-check]
//   node testerReset.js mark-tester <uid>
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const functions = path.resolve(__dirname, '../../../functions');
const ts = require(path.join(functions, 'node_modules/typescript'));

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Only against the emulators (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST).');
  process.exit(2);
}

const loaded = new Map();
/** A functions/src module, compiled to CommonJS; its packages come from functions/node_modules. */
function load(file) {
  if (loaded.has(file)) return loaded.get(file);
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const mod = { exports: {} };
  loaded.set(file, mod.exports);
  const req = createRequire(file);
  const localRequire = (id) => (id.startsWith('.') ? load(path.resolve(path.dirname(file), `${id}.ts`)) : req(id));
  new Function('require', 'module', 'exports', out)(localRequire, mod, mod.exports);
  loaded.set(file, mod.exports);
  return mod.exports;
}

const admin = require(path.join(functions, 'node_modules/firebase-admin'));
admin.initializeApp({ projectId: 'demo-revisely' });

function memoryBucket() {
  const saved = new Map();
  const file = (name) => ({
    name,
    metadata: {},
    save: async (data) => void saved.set(name, Buffer.from(data)),
    download: async () => [saved.get(name) ?? Buffer.alloc(0)],
    copy: async (dest) => void saved.set(dest, saved.get(name)),
    getMetadata: async () => [{}],
    delete: async () => void saved.delete(name),
  });
  return { getFiles: async ({ prefix }) => [[...saved.keys()].filter((k) => k.startsWith(prefix)).map(file)], file };
}

(async () => {
  const [mode, uid, json] = process.argv.slice(2);
  const db = admin.firestore();
  if (mode === 'mark-tester') {
    await db.doc(`users/${uid}`).set({ previewTester: true }, { merge: true });
    console.log(JSON.stringify({ ok: true }));
    return;
  }
  const { handleResetMyData } = load(path.join(functions, 'src/testerReset.ts'));
  const { adminResetStore } = load(path.join(functions, 'src/testerResetAdmin.ts'));
  const request = {
    auth: { uid },
    app: process.argv.includes('--no-app-check') ? undefined : { appId: 'scenario' },
    data: JSON.parse(json ?? '{}'),
  };
  const authUser = async (id) => {
    const u = await admin.auth().getUser(id);
    return { uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, photoURL: u.photoURL ?? null };
  };
  // The server's clock: the scenario's (the phone's fake one) when given, so that
  // its checks of the phone's clock and its rate limit go by the scenario's time.
  const nowAt = process.argv.indexOf('--now');
  const fakeNow = nowAt > 0 ? Number(process.argv[nowAt + 1]) : null;
  const bucket = memoryBucket();
  const store = adminResetStore(db, bucket);
  if (fakeNow != null) {
    // The same firebase-admin the function's code loads (functions/node_modules).
    const { Timestamp } = createRequire(path.join(functions, 'src/index.ts'))('firebase-admin/firestore');
    store.now = () => ({ stamp: Timestamp.fromMillis(fakeNow), ms: fakeNow, iso: new Date(fakeNow).toISOString() });
  }
  try {
    let result;
    if (mode === 'scenario') {
      // Load test scenario (functions loadTestScenario): the same reset, then the seed.
      const { handleLoadTestScenario } = load(path.join(functions, 'src/testScenarios.ts'));
      const { adminScenarioWriter } = load(path.join(functions, 'src/testScenariosAdmin.ts'));
      result = await handleLoadTestScenario(request, { store, writer: adminScenarioWriter(db, bucket), authUser });
    } else {
      result = await handleResetMyData(request, { store, authUser });
    }
    console.log(JSON.stringify({ result }));
  } catch (err) {
    console.log(JSON.stringify({ error: { status: err.code ?? 'internal', message: err.message } }));
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
