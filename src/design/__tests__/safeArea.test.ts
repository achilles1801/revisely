// React Native's own SafeAreaView pads only on iOS: on Android (edge-to-edge since SDK 54) it is a
// plain View, so a screen built on it puts its top bar under the status bar. The Schedule screen
// did until Nov 7 2026: its Back and Save sat under the clock, where an E2E flow couldn't tap
// Back. Every screen uses components/SafeAreaView (or TopSafeAreaView), which pads on both.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const SHARED = path.join(SRC, 'components', 'SafeAreaView.tsx');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** Whether the code takes SafeAreaView (not as a type) from react-native. */
function importsNativeSafeArea(code: string): boolean {
  for (const m of code.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g)) {
    if (m[1]) continue;
    const names = m[2].split(',').map((n) => n.trim());
    if (names.some((n) => /^(type\s+)?SafeAreaView(\s+as\s+\w+)?$/.test(n) && !n.startsWith('type '))) return true;
  }
  return /\b(?:require\(['"]react-native['"]\)|ReactNative|RN)\.SafeAreaView\b/.test(code);
}

describe("screens pad by the system bars on Android too (components/SafeAreaView)", () => {
  it('recognises every way of taking React Native’s SafeAreaView', () => {
    expect(importsNativeSafeArea("import { View, SafeAreaView } from 'react-native';")).toBe(true);
    expect(importsNativeSafeArea("import {\n  Text,\n  SafeAreaView,\n} from 'react-native';")).toBe(true);
    expect(importsNativeSafeArea("import { SafeAreaView as Safe } from \"react-native\";")).toBe(true);
    expect(importsNativeSafeArea("const S = RN.SafeAreaView;")).toBe(true);
    expect(importsNativeSafeArea("import type { SafeAreaView } from 'react-native';")).toBe(false);
    expect(importsNativeSafeArea("import { type SafeAreaView, View } from 'react-native';")).toBe(false);
    expect(importsNativeSafeArea("import { SafeAreaView } from '../../components/SafeAreaView';")).toBe(false);
    expect(importsNativeSafeArea("import { SafeAreaView } from 'react-native-safe-area-context';")).toBe(false);
  });

  it('no screen or component takes it from react-native but the shared one', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f !== SHARED)
      .filter((f) => importsNativeSafeArea(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the Schedule screen and the session use the shared one', () => {
    for (const f of ['screens/main/PlanEditScreen.tsx', 'screens/revision/ActiveRevisionScreen.tsx']) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8')).toMatch(
        /import \{ SafeAreaView \} from '\.\.\/\.\.\/components\/SafeAreaView';/,
      );
    }
  });
});
