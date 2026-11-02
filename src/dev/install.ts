// Loaded first by index.ts, before Firebase starts. Development builds only:
// the release bundler drops the branch (__DEV__ is false there).
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./offlineSwitch').installOfflineSwitch();
}
