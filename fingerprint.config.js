/**
 * What the runtime version (`runtimeVersion.policy: "fingerprint"` in app.config.js) is a hash of.
 * It has to come out the same on a laptop, on the GitHub runner and on the EAS builder, or CI starts
 * a build on every push and its updates reach nobody.
 *
 * @type {import('expo/fingerprint').Config}
 */
const { SourceSkips } = require('expo/fingerprint');

// Revisely Dev only (APP_VARIANT=dev; CLAUDE.md "Dev stack"). Its prebuild rewrites targets/widget:
// plugins/withDevVariant puts its App Group and revisely-dev:// in the Swift, and @bacons/apple-targets
// writes its App Group into widget.entitlements. EAS hashes the project again after prebuild, so those
// files are hashed as committed, or the build's runtime never matches the one computed before it
// (Nov 11 2026: 0bce2dd9 before, 282a2e42 inside the build, which stopped). The store app never uses
// this, so its fingerprints can't move.
// It lives here, not in the plugin: the plugin's own file counts toward Revisely Dev's fingerprints.
const STORE_GROUP = 'group.com.revisionbuddy.app';
const DEV_GROUP = `${STORE_GROUP}.dev`;

/** A targets/widget file's text as committed, from the copy a Revisely Dev prebuild left. */
function storeWidgetText(text) {
  return text
    .split(`"${DEV_GROUP}"`).join(`"${STORE_GROUP}"`)
    .split(`<string>${DEV_GROUP}</string>`).join(`<string>${STORE_GROUP}</string>`)
    .split('"revisely-dev://').join('"revisely://');
}

// The fingerprint reads files in 1 KB chunks; a widget file is held until its end, then hashed whole.
const WIDGET_FILE = /^targets\/widget\/[^/]+\.(swift|entitlements)$/;
const held = new Map();
function devWidgetAsCommitted(source, chunk, isEndOfFile) {
  if (source.type !== 'file' || !WIDGET_FILE.test(source.filePath.split('\\').join('/'))) return chunk;
  const parts = held.get(source.filePath) ?? [];
  if (chunk != null) parts.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!isEndOfFile) {
    held.set(source.filePath, parts);
    return null;
  }
  held.delete(source.filePath);
  return Buffer.from(storeWidgetText(Buffer.concat(parts).toString('utf8')), 'utf8');
}

module.exports = {
  // `extra` is JS config (Firebase web keys, client ids, Sentry DSN) carried by every update, not
  // native code. Counting it also made the hash depend on whether a .env was present.
  sourceSkips: SourceSkips.ExpoConfigExtraSection,
  // The widget extension (Swift, assets, font) lives outside ios/, where the fingerprint doesn't
  // look by itself; a widget change must make a new build. The store app's prebuild writes only
  // widget.entitlements into it, exactly as committed (targets/widget/expo-target.config.js), so it
  // hashes the same everywhere; Revisely Dev's prebuild changes more, put back by
  // devWidgetAsCommitted above.
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
  ...(process.env.APP_VARIANT === 'dev' ? { fileHookTransform: devWidgetAsCommitted } : {}),
};

module.exports.devWidgetAsCommitted = devWidgetAsCommitted;
module.exports.storeWidgetText = storeWidgetText;
