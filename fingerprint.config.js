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
  ignorePaths: [
    // Build and submit settings; counted whole, adding a store id would start a new build.
    'eas.json',
    // Gitignored, so present on a laptop and on EAS but not on the GitHub runner.
    'GoogleService-Info.plist',
    'google-services.json',
    // Terminal colouring the config loader pulls in only when it has a .env.local to announce.
    '**/node_modules/chalk/**/*',
    '**/node_modules/ansi-styles/**/*',
  ],
};
