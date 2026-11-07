/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts'],
  testTimeout: 15000,
  // One file at a time: every suite shares one emulator and clears it between
  // tests, so files run in parallel wipe each other's data (13-17 failures that
  // change from run to run). `npm test` also passes --runInBand; this covers a
  // plain `npx jest` and editors' test runners too.
  maxWorkers: 1,
};
