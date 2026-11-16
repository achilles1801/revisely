// Finds UI text written straight into the code instead of coming from src/i18n (the strings
// files). Used by src/i18n/__tests__/noRawStrings.test.ts, which fails when a folder that has
// been extracted gets English back, and which prints what is left to extract
// (I18N_PROGRESS=1 npx jest src/i18n/__tests__/noRawStrings).
//
// It is a heuristic, tuned on this codebase: JSX text is always UI; a string elsewhere counts
// when it reads as words (a space between words, or a capitalised word) and isn't in a place
// that only holds identifiers (imports, test ids, styles, logs, errors, comparisons, keys…).
// A line that really isn't UI text says so with `// i18n-ignore` on it or on the line above.
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

export type RawString = { file: string; line: number; text: string };

/** Folders and files under src/ that hold no UI text of their own. */
const SKIPPED = [
  'i18n/', // the strings themselves
  'dev/', // development builds only
  'lib/e2e/', // E2E builds only
  'theme/',
  'data/',
  'lib/quranData.ts', // surah names: content, with nameArabic beside them
];

/** JSX props that never hold UI text. */
const ID_PROPS = new Set([
  'testID', 'nativeID', 'key', 'id', 'name', 'style', 'contentContainerStyle', 'source', 'uri', 'href',
  'pointerEvents', 'accessibilityRole', 'accessibilityLanguage', 'importantForAccessibility',
  'textContentType', 'autoComplete', 'autoCapitalize', 'keyboardType', 'returnKeyType', 'initialRouteName',
  'fontFamily', 'icon', 'iconName', 'mode', 'variant', 'kind', 'tone', 'size', 'type', 'route', 'screen',
  'resizeMode', 'ellipsizeMode', 'textBreakStrategy', 'lineBreakStrategyIOS', 'dataDetectorType',
]);

/** Object properties whose values are identifiers, never UI text. */
const ID_KEYS = new Set([
  'testID', 'nativeID', 'id', 'key', 'fontFamily', 'route', 'screen', 'routeName', 'initialRouteName',
  'channelId', 'categoryIdentifier', 'sound', 'icon', 'iconName', 'accessibilityRole', 'kind', 'type',
  'mode', 'variant', 'tone', 'event', 'eventName', 'path', 'url', 'uri', 'href', 'storageKey', 'tag',
  'fontWeight', 'textAlign', 'resizeMode', 'pointerEvents', 'source', 'mimeType', 'UTI', 'Authorization',
]);

/** Calls whose arguments are never UI text: logs, errors, navigation, storage, tests, t() itself. */
const ID_CALLS = new RegExp(
  [
    '^(console|logger|log|Sentry|crashlytics|jest|expect|describe|it|test)\\b',
    '\\.(warn|error|debug|info|log|trace|addBreadcrumb|captureException|captureMessage|setTag|setTags|setExtra|setContext)$',
    '^(t|i18n\\.t|require|navigate|push|replace|reset|reportError|report|warn|debug|trace)$',
    '\\.(navigate|push|replace|reset|setParams|getItem|setItem|removeItem|multiGet|multiRemove|addEventListener|addListener|emit)$',
    '^(doc|collection|query|where|orderBy|ref|httpsCallable|callFunction|getFunctions|storageRef|fetch)$',
    '^(StyleSheet\\.create|Platform\\.select|Symbol|RegExp|parseInt|Number|Date|new Date)$',
  ].join('|'),
);

const isErrorName = (s: string) => /(^|\.)\w*Error$/.test(s);

/** A string that reads as words someone would see. `0` stands for a template's values. */
export function readsAsText(s: string): boolean {
  const v = s.trim();
  if (!/[A-Za-z]{2,}/.test(v)) return false;
  // Identifiers, keys, ids and paths: 'home.startsAt', 'chevron-forward', 'users/0/pages', 'en-US'.
  if (/^[A-Za-z0-9]*[a-z0-9][A-Za-z0-9]*([._:/@#-]+[A-Za-z0-9]+)*[./]?$/.test(v) && !/^[A-Z][a-z]+$/.test(v)) return false;
  // URLs, deep links, storage keys, file names.
  if (/^([a-z][a-z0-9+.-]*:\/\/|mailto:|@|\.\.?\/)/.test(v)) return false;
  if (/^[\w./-]+\.(png|jpe?g|svg|json|m4a|mp3|wav|txt|ts|tsx|js)$/.test(v)) return false;
  // Words: two of them with a space between, or one capitalised word ("Done", "Fajr").
  // (\s includes the no-break space.)
  return /[A-Za-z0-9]\s+[A-Za-z]{2,}|[A-Za-z]{2,}[.,:;!?]?\s+[A-Za-z0-9]/.test(v) || /^[A-Z][a-z]/.test(v);
}

/** The text of a string-like node, with each template value as `0`. */
function stringText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return node.head.text + node.templateSpans.map((s) => `0${s.literal.text}`).join('');
  }
  return null;
}

function calleeText(call: ts.CallExpression | ts.NewExpression, sf: ts.SourceFile): string {
  const text = call.expression.getText(sf);
  return ts.isNewExpression(call) ? `new ${text}` : text;
}

/** True when this string sits somewhere that only ever holds identifiers or developer text. */
function inIdPlace(node: ts.Node, sf: ts.SourceFile): boolean {
  let child: ts.Node = node;
  for (let p = node.parent; p; child = p, p = p.parent) {
    if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isImportTypeNode(p)) return true;
    if (ts.isTypeNode(p) && !ts.isExpressionWithTypeArguments(p)) return true;
    if (ts.isTaggedTemplateExpression(p)) return true;
    if (ts.isCaseClause(p) && child === p.expression) return true;
    if (ts.isElementAccessExpression(p) && child === p.argumentExpression) return true;
    if (ts.isBinaryExpression(p)) {
      const op = p.operatorToken.kind;
      if (
        op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        op === ts.SyntaxKind.EqualsEqualsToken ||
        op === ts.SyntaxKind.ExclamationEqualsToken ||
        (op === ts.SyntaxKind.InKeyword && child === p.left)
      ) {
        return true;
      }
    }
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) && child === p.name) return true;
    if (ts.isPropertyAssignment(p) && ID_KEYS.has(p.name.getText(sf).replace(/['"]/g, ''))) return true;
    if (ts.isJsxAttribute(p)) return ID_PROPS.has(p.name.getText(sf));
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
      if (child === p.expression) continue;
      const callee = calleeText(p, sf);
      if (ID_CALLS.test(callee) || isErrorName(callee.replace(/^new /, ''))) return true;
    }
    if (ts.isThrowStatement(p)) return true;
    // A statement or a JSX element ends the climb: what holds it doesn't change what it is.
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return false;
    if (ts.isStatement(p) && !ts.isBlock(p)) {
      // ...except a variable whose name says what it holds.
      return false;
    }
  }
  return false;
}

/** A line marked `// i18n-ignore` (on it, or alone on the line above). */
function ignoredLines(text: string): Set<number> {
  const lines = text.split('\n');
  const out = new Set<number>();
  lines.forEach((l, i) => {
    if (!/\/\/\s*i18n-ignore\b|\/\*\s*i18n-ignore\b/.test(l)) return;
    out.add(i + 1);
    if (/^\s*(\/\/|\/\*|\{\s*\/\*)/.test(l)) out.add(i + 2);
  });
  return out;
}

/** The UI text written into one source file. */
export function rawStringsIn(file: string, text: string): RawString[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const ignored = ignoredLines(text);
  const found: RawString[] = [];
  const add = (node: ts.Node, value: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (!ignored.has(line)) found.push({ file, line, text: value.replace(/\s+/g, ' ').trim() });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      // JSX text is always something someone sees.
      if (/[A-Za-z]{2,}/.test(node.text)) add(node, node.text);
      return;
    }
    if (ts.isJsxAttribute(node) && ID_PROPS.has(node.name.getText(sf))) return;
    const value = stringText(node);
    if (value != null) {
      if (readsAsText(value) && !inIdPlace(node, sf)) add(node, value);
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Every app source file under src/ the check reads, relative to src/ with forward slashes. */
export function appSourceFiles(src: string): string[] {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' || e.name === '__mocks__' ? [] : walk(full);
      return /\.(ts|tsx)$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name) ? [full] : [];
    });
  return walk(src)
    .map((f) => path.relative(src, f).split(path.sep).join('/'))
    .filter((rel) => !SKIPPED.some((s) => (s.endsWith('/') ? rel.startsWith(s) : rel === s)))
    .sort();
}

/** The raw UI text of every file under the given folders or files (relative to src/). */
export function rawStringsUnder(src: string, scopes: string[]): RawString[] {
  const inScope = (rel: string) => scopes.some((s) => rel === s || rel.startsWith(s.endsWith('/') ? s : `${s}/`));
  return appSourceFiles(src)
    .filter(inScope)
    .flatMap((rel) => rawStringsIn(rel, fs.readFileSync(path.join(src, rel), 'utf8')));
}
