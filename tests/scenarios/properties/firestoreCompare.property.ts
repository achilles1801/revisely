// Firestore's string comparator as the app ships it (metro/firestoreCompare.js):
// the bundle swaps the body of the installed Firestore's compareUtf8Strings for a
// fast one, which must order every pair of strings exactly as the original does.
// The original is read from the installed React Native build, and the shipped
// one is what the plugin makes of that same file. A Firestore upgrade that renames
// or reshapes the function fails here, rather than shipping without the swap.

import fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { runs } from './fixtures';

/* eslint-disable @typescript-eslint/no-require-imports */
const babel = require('@babel/core') as typeof import('@babel/core');
const generate = (require('@babel/generator') as { default: (node: unknown) => { code: string } }).default;
const { FUNCTION_NAME, FIRESTORE_RN_FILE, fastCompareUtf8Strings, firestoreComparePlugin } =
  require('../../../metro/firestoreCompare') as {
    FUNCTION_NAME: string;
    FIRESTORE_RN_FILE: RegExp;
    fastCompareUtf8Strings: (a: string, b: string) => number;
    firestoreComparePlugin: babel.PluginItem;
  };
/* eslint-enable @typescript-eslint/no-require-imports */

type Compare = (a: string, b: string) => number;
const root = path.resolve(__dirname, '../../..');
const dist = path.join(path.dirname(require.resolve('@firebase/firestore/package.json', { paths: [root] })), 'dist');
const rnFiles = fs.readdirSync(dist).filter((f) => f.endsWith('.rn.js')).map((f) => path.join(dist, f));
const declaring = rnFiles.filter((f) => fs.readFileSync(f, 'utf8').includes(`function ${FUNCTION_NAME}(`));

/**
 * FUNCTION_NAME as declared in `code`, with the module's own functions and
 * constants it uses (the original's helpers and its surrogate bounds), as a
 * function to call.
 */
function compiled(code: string): Compare {
  const ast = babel.parseSync(code, { babelrc: false, configFile: false, sourceType: 'module' })!;
  let start: babel.NodePath | null = null;
  babel.traverse(ast, {
    FunctionDeclaration(p) {
      if (!start && p.node.id?.name === FUNCTION_NAME) start = p;
    },
  });
  if (!start) throw new Error(`${FUNCTION_NAME} not found`);
  // Top-level bindings it uses, and what those use, in turn.
  const parts = new Map<string, string>();
  const visit = (p: babel.NodePath) => {
    p.traverse({
      Identifier(ip) {
        if (!ip.isReferencedIdentifier()) return;
        const binding = ip.scope.getBinding(ip.node.name);
        if (!binding || !binding.scope.path.isProgram() || parts.has(ip.node.name)) return;
        const decl = binding.path;
        if (decl.isFunctionDeclaration()) {
          parts.set(ip.node.name, generate(decl.node).code);
        } else if (decl.isVariableDeclarator()) {
          parts.set(ip.node.name, `const ${generate(decl.node).code};`);
        } else {
          throw new Error(`${ip.node.name}: a kind of binding this test can't copy`);
        }
        visit(decl);
      },
    });
  };
  visit(start);
  const own = generate((start as babel.NodePath).node).code;
  return new Function(`${[...parts.values()].join('\n')}\n${own}\nreturn ${FUNCTION_NAME};`)() as Compare;
}

let original: Compare;
let shipped: Compare;

beforeAll(() => {
  expect(declaring).toHaveLength(1);
  const source = fs.readFileSync(declaring[0], 'utf8');
  original = compiled(source);
  const out = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename: declaring[0],
    plugins: [firestoreComparePlugin],
  })!;
  // The plugin found Firestore's declaration and replaced it, once.
  expect((out.metadata as { firestoreCompareReplaced?: number }).firestoreCompareReplaced).toBe(1);
  shipped = compiled(out.code!);
});

// Code units of every kind: ASCII, the rest below the surrogates, lone and paired
// surrogates (code points above U+FFFF), and those above the surrogates, where
// UTF-16 and UTF-8 order part ways.
const unitArb = fc
  .oneof(
    fc.integer({ min: 0x20, max: 0x7e }),
    fc.integer({ min: 0x80, max: 0xd7ff }),
    fc.integer({ min: 0xd800, max: 0xdfff }),
    fc.integer({ min: 0xe000, max: 0xffff }),
  )
  .map((c) => String.fromCharCode(c));
const textArb = fc.oneof(
  fc.array(unitArb, { maxLength: 12 }).map((units) => units.join('')),
  fc.string({ unit: 'binary', maxLength: 12 }),
);
// Two strings that share a beginning, as paths of one account do.
const pairArb = fc.oneof(
  fc.tuple(textArb, textArb),
  fc.tuple(textArb, textArb, textArb).map(([prefix, a, b]) => [prefix + a, prefix + b] as [string, string]),
  textArb.map((a) => [a, a] as [string, string]),
);

describe("Firestore's string comparator, as shipped", () => {
  it('orders every pair of strings as the installed Firestore does', () => {
    fc.assert(
      fc.property(pairArb, ([a, b]) => {
        const want = Math.sign(original(a, b));
        expect(shipped(a, b)).toBe(want);
        expect(shipped(b, a)).toBe(want === 0 ? 0 : -want);
        expect(fastCompareUtf8Strings(a, b)).toBe(want);
      }),
      { numRuns: runs(3000) },
    );
  });

  it('agrees on the cases that tell UTF-8 order from UTF-16 order', () => {
    const replacement = '�';
    const grinning = '😀';
    const cases: [string, string][] = [
      [replacement, grinning],
      ['a' + replacement, 'a' + grinning],
      ['', 'a'],
      ['users/abc/pages/1', 'users/abc/pages/10'],
      ['users/abc/pages/9', 'users/abc/pages/10'],
      ['\ud800', ''],
      ['\udfff', '￿'],
    ];
    for (const [a, b] of cases) {
      expect(shipped(a, b)).toBe(Math.sign(original(a, b)));
      expect(shipped(b, a)).toBe(Math.sign(original(b, a)));
    }
    // UTF-8 order: U+FFFD (EF BF BD) before U+1F600 (F0 9F 98 80).
    expect(shipped(replacement, grinning)).toBe(-1);
  });

  it("is applied to Firestore's React Native build, as Metro and Node name it", () => {
    const relative = path.relative(root, declaring[0]);
    expect(FIRESTORE_RN_FILE.test(relative)).toBe(true);
    expect(FIRESTORE_RN_FILE.test(declaring[0])).toBe(true);
    expect(FIRESTORE_RN_FILE.test(path.join(dist, 'index.node.cjs.js'))).toBe(false);
    expect(FIRESTORE_RN_FILE.test('src/services/firestoreService.ts')).toBe(false);
  });
});
