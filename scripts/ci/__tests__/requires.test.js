// Every script CI runs can find what it requires. #326 added a require of
// .github/scripts/affected-flows.js to scripts/e2e/develop-red.js, inside a function, before that file was
// on develop (it came with #328). develop-red.test.js never reached that line, so nothing failed until the
// job ran: develop's "E2E (develop-red issue)" failed on every push from Nov 7 to Nov 9 2026 with "Cannot
// find module", and a red develop opened no issue.
//
// So: each `node <file>` in a workflow names a file that exists, and every relative require or import in the
// scripts (those the workflows run, those under scripts/, .github/scripts/ and .maestro/, and whatever they
// pull in) resolves to a file, wherever in the script it sits.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const workflowsDir = path.join(root, '.github', 'workflows');
const workflows = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));
const SCRIPT = /\.(c|m)?js$/;

/** `node <file>` in each workflow, with the directories its steps may run in. */
function scriptsRun() {
  const out = [];
  for (const workflow of workflows) {
    const text = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
    const dirs = ['.', ...[...text.matchAll(/working-directory:\s*([^\s#]+)/g)].map((m) => m[1])];
    for (const m of text.matchAll(/\bnode\s+([\w./-]+\.(?:c|m)?js)\b/g)) out.push({ workflow, file: m[1], dirs });
  }
  return out;
}

function filesUnder(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'build') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(rel));
    else if (SCRIPT.test(entry.name)) out.push(path.join(root, rel));
  }
  return out;
}

// require('./x'), require("../x"), import('./x'), `from './x'`, `import './x'`: relative ones only (a package
// is the job's npm ci's business).
const SPEC =
  /\brequire\(\s*(['"])(\.{1,2}\/[^'"]+)\1\s*\)|\bimport\(\s*(['"])(\.{1,2}\/[^'"]+)\3\s*\)|\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\5|^\s*import\s+(['"])(\.{1,2}\/[^'"]+)\7/gm;

/** The specifiers in a file's code, not its comments. */
function relativeSpecs(file) {
  const code = fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(SPEC)].map((m) => m[2] ?? m[4] ?? m[6] ?? m[8]);
}

function resolveFrom(file, spec) {
  const base = path.resolve(path.dirname(file), spec);
  // .ts: a test may require TypeScript, which Jest compiles (scripts/smoke reads functions/src).
  const candidates = ['', '.js', '.cjs', '.mjs', '.json', '.ts', '/index.js'].map((ext) => base + ext);
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

it('runs only scripts that exist (each `node <file>` in a workflow)', () => {
  const missing = scriptsRun()
    .filter(({ file, dirs }) => !dirs.some((d) => fs.existsSync(path.join(root, d, file))))
    .map(({ workflow, file }) => `${workflow}: node ${file}`);
  expect(missing).toEqual([]);
});

it("finds every script's relative requires and imports", () => {
  const start = [
    ...scriptsRun().flatMap(({ file, dirs }) => dirs.map((d) => path.join(root, d, file)).filter((f) => fs.existsSync(f))),
    ...['scripts', '.github/scripts', '.maestro'].flatMap(filesUnder),
  ];
  const seen = new Set();
  const queue = [...start];
  const unresolved = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeSpecs(file)) {
      const target = resolveFrom(file, spec);
      if (!target) unresolved.push(`${path.relative(root, file)}: ${spec}`);
      else if (SCRIPT.test(target)) queue.push(target);
    }
  }
  expect(seen.size).toBeGreaterThan(20);
  expect(unresolved).toEqual([]);
});
