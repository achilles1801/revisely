// Scenario tests: the root Jest setup (jest-expo, the native mocks), but with
// the real Firebase JS SDK talking to the emulators (harness/firebaseSetup.ts).
const path = require('path');
const base = require('../../jest.config.js');

const root = path.resolve(__dirname, '../..');
const preset = require('jest-expo/jest-preset');
const firestoreNode = require.resolve('@firebase/firestore', { paths: [root] }).replace(/[^/]+$/, 'index.node.cjs.js');
const babel = Object.entries(preset.transform).find(([k]) => k === '\\.[jt]sx?$')[1];

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  rootDir: root,
  roots: ['<rootDir>/tests/scenarios', '<rootDir>/src'],
  testMatch: ['<rootDir>/tests/scenarios/**/*.(scenario|property).ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFiles: [...base.setupFiles, '<rootDir>/tests/scenarios/harness/firebaseSetup.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/scenarios/harness/afterEnv.ts'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^expo-constants$': '<rootDir>/tests/scenarios/harness/expoConstants.ts',
    // Firestore's React Native build needs XMLHttpRequest; its Node build talks
    // to the emulator over gRPC. Same API, same cache and write behaviour.
    '^(@firebase|firebase)/firestore$': firestoreNode,
  },
  modulePaths: ['<rootDir>/tests/scenarios/node_modules'],
  // @firebase/util loads a .mjs file, which the preset's transform skips.
  transform: { ...preset.transform, '\\.mjs$': babel },
  testEnvironment: '<rootDir>/tests/scenarios/harness/environment.js',
  testTimeout: 30000,
  collectCoverageFrom: base.collectCoverageFrom,
};
