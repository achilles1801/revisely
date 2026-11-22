// ESLint for the app (src/, App.tsx, index.ts). From the repository root:
//   npm ci --prefix scripts/lint
//   npx --prefix scripts/lint eslint -c scripts/lint/eslint.config.mjs .
//
// It lives in scripts/lint, with its own package.json, so nothing here touches the app's package.json (its
// `scripts` block is part of the store fingerprint) or the app hash preview.yml stamps on updates (scripts/ is
// outside it). README.md beside this file says more.
import expoConfig from 'eslint-config-expo/flat.js';
import { defineConfig, globalIgnores } from 'eslint/config';

const TESTS = ['**/__tests__/**', '**/*.test.{ts,tsx,js}', '**/__perf__/**', 'src/lib/e2e/**'];

export default defineConfig([
  // Only the app is linted here. functions/, worker/, tests/scenarios and the rest are their own projects.
  globalIgnores([
    '**/node_modules/**',
    '.claude/**',
    '.github/**',
    '.maestro/**',
    'admin/**',
    'android/**',
    'coverage/**',
    'dist/**',
    'docs/**',
    'functions/**',
    'ios/**',
    'jest/**',
    'jest.setup.ts',
    'metro/**',
    'modules/**',
    'plugins/**',
    'scripts/**',
    'store/**',
    'targets/**',
    'tests/**',
    'worker/**',
    '*.config.js',
  ]),
  expoConfig,
  {
    rules: {
      // A React Native <Text> shows ' and " as they are; escaping them is a concern of HTML, not of this app.
      'react/no-unescaped-entities': 'off',
      // Names help in React DevTools, so they're reported, but an anonymous memo() is not a bug.
      'react/display-name': 'warn',
    },
  },
  {
    // Jest: mocks are declared before imports and often `require` their module, and mock components are anonymous.
    files: TESTS,
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
      'react/display-name': 'off',
      'react/no-children-prop': 'off',
    },
  },
]);
