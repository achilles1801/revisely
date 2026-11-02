/**
 * What the runtime version (`runtimeVersion.policy: "fingerprint"` in app.config.js) is a hash of.
 * It has to come out the same on a laptop, on the GitHub runner and on the EAS builder, or CI starts
 * a build on every push and its updates reach nobody.
 *
 * @type {import('expo/fingerprint').Config}
 */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  // `extra` is JS config (Firebase web keys, client ids, Sentry DSN) carried by every update, not
  // native code. Counting it also made the hash depend on whether a .env was present.
  sourceSkips: SourceSkips.ExpoConfigExtraSection,
  // The widget extension (Swift, assets, font) lives outside ios/, where the fingerprint doesn't
  // look by itself; a widget change must make a new build. Prebuild writes nothing into it
  // (targets/widget/expo-target.config.js), so it hashes the same everywhere.
  // patches/ changes native dependencies after install (whisper.rn's podspec), so a patch change
  // must make a new build too. (Local modules in modules/ are counted by autolinking.)
  extraSources: [
    { type: 'dir', filePath: 'targets', reasons: ['widgetExtension'] },
    { type: 'dir', filePath: 'patches', reasons: ['patchPackage'] },
  ],
  ignorePaths: [
    // Build and submit settings; counted whole, adding a store id would start a new build.
    'eas.json',
    // Gitignored, so present on a laptop and on EAS but not on the GitHub runner.
    'GoogleService-Info.plist',
    'google-services.json',
    // The Android build reads it from GOOGLE_SERVICES_JSON (app.config.js), a file outside the
    // project on the runner and on EAS: ignored wherever it is, as above.
    '**/google-services.json',
    // Terminal colouring the config loader pulls in only when it has a .env.local to announce.
    '**/node_modules/chalk/**/*',
    '**/node_modules/ansi-styles/**/*',
  ],
};
