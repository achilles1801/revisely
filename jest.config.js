/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/functions/',
    '/tests/firestore-rules/',
    '/.maestro/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@react-native-firebase/.*|@sentry/react-native|native-base|react-native-svg|firebase|@firebase/.*))',
  ],
  moduleNameMapper: {
    '^expo-constants$': '<rootDir>/jest/mocks/expo-constants.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/lib/quranData.ts',
    '!src/lib/quranImages.ts',
  ],
};
