// Loaded first by index.ts, before Firebase starts.
//
// Development builds only: the release bundler drops the branch (__DEV__ is
// false there).
if (__DEV__) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./offlineSwitch').installOfflineSwitch();
}

// E2E builds only (EXPO_PUBLIC_E2E=1, .maestro/README.md): the test clock and
// the hermetic network. The bundler inlines the variable, as undefined in every
// other build, so this branch and the module it loads are dropped from them.
if (process.env.EXPO_PUBLIC_E2E === '1') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../lib/e2e/install').installE2E();
}
