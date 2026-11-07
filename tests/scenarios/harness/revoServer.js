// Revo's callables (functions revoAsk, revoDayInReview, revoSetOptions, revoClear) against the
// emulators, in their own Node process with firebase-admin, as harness/testerReset.js runs
// resetMyData. The functions' own code runs (functions/src/revo/handler.ts with its Firestore
// store, revo/admin.ts), compiled here with the functions' TypeScript, behind the callable's
// checks: the caller's uid as the ID token gives it. Only the model is a stand-in: it answers
// with the text it is given. The answer is printed as the callable protocol sends it:
// `{ result }`, or `{ error: { status, message, details } }` (what index.ts's revoFailure throws).
// Usage (harness/admin.ts):
//   node revoServer.js <revoAsk|revoDayInReview|revoSetOptions|revoClear> <uid> '<data json>' --now <ms> [--reply '<model text>']
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

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

(async () => {
  const [name, uid, json] = process.argv.slice(2);
  const db = admin.firestore();
  const handler = load(path.join(functions, 'src/revo/handler.ts'));
  const { adminRevoStore } = load(path.join(functions, 'src/revo/admin.ts'));
  const now = Number(arg('--now') ?? Date.now());
  const reply = arg('--reply') ?? JSON.stringify({ text: 'You revised steadily this week.', chips: ['How is my pace?'] });
  const deps = {
    store: adminRevoStore(db),
    call: async () => ({ text: reply, usage: { input_tokens: 500, output_tokens: 120 }, attempts: 1, stopReason: 'end_turn' }),
    now: () => new Date(now),
    log: () => undefined,
  };
  const run = {
    revoAsk: handler.handleRevoAsk,
    revoDayInReview: handler.handleDayInReview,
    revoSetOptions: handler.handleSetOptions,
    revoClear: handler.handleClear,
  }[name];
  if (!run) throw new Error(`No callable ${name}`);
  try {
    const result = await run({ uid }, JSON.parse(json ?? '{}'), deps);
    console.log(JSON.stringify({ result }));
  } catch (err) {
    if (err instanceof handler.RevoError) {
      const status = err.code.toUpperCase().replace(/-/g, '_');
      console.log(JSON.stringify({ error: { status, message: err.message, ...(err.details ? { details: err.details } : {}) } }));
    } else {
      console.error(err);
      console.log(JSON.stringify({ error: { status: 'INTERNAL', message: 'Revo is unavailable. Try again.' } }));
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
