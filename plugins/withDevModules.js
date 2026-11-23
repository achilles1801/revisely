// Revisely Dev only (app.config.js loads this plugin only with APP_VARIANT=dev; handbook/dev-stack.md).
//
// Native modules in modules-dev/ (Recite on the phone: modules-dev/recite-engine) are linked into Revisely Dev's
// builds and nowhere else. Everything in modules/ is linked into the store app and counts toward its fingerprints;
// modules-dev/ isn't on autolinking's default path, so this plugin adds it in the copy Dev's build works on:
// - iOS: `use_expo_modules!(searchPaths: [...])` in the Podfile, plus ONNX Runtime's pod from its podspec in the
//   module (ios/ReviselyOnnxRuntime.podspec.json: Microsoft's NuGet package, pinned by SHA-256);
// - Android: `expoAutolinking.searchPaths` in settings.gradle, and Firebase Test Lab's game-loop intent filter on the
//   main activity, so Test Lab's phones can run the on-device bench without signing in (src/lib/onDevice/testLoop).
//   Nothing sends that intent outside Test Lab.
// fingerprint.config.js counts modules-dev/ toward Revisely Dev's fingerprints (only), so a change there builds Dev.
// The release-native change links the module into the store app and retires this plugin (the release owner's call).
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withFinalizedMod, withSettingsGradle } = require('expo/config-plugins');

const TEST_LOOP = 'com.google.intent.action.TEST_LOOP';

/** The manifest with Test Lab's game-loop intent filter on the main activity (its own filter, as Test Lab asks). */
function withTestLoopFilter(manifest) {
  const activity = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const filters = activity['intent-filter'] ?? [];
  const has = filters.some((f) => (f.action ?? []).some((a) => a.$['android:name'] === TEST_LOOP));
  if (!has) {
    activity['intent-filter'] = [
      ...filters,
      {
        action: [{ $: { 'android:name': TEST_LOOP } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'application/javascript' } }],
      },
    ];
  }
  return manifest;
}

const MARK = 'Revisely Dev: modules-dev (plugins/withDevModules)';

/** The Podfile with modules-dev/ on autolinking's search path and ONNX Runtime's pod. Throws if it can't place them. */
function devPodfile(text) {
  if (text.includes(MARK)) return text;
  const line = /^(\s*)use_expo_modules!\s*$/m;
  const m = text.match(line);
  if (!m) throw new Error('withDevModules: no bare `use_expo_modules!` line in the Podfile. Update plugins/withDevModules.js.');
  const indent = m[1];
  const devDir = "File.join(__dir__, '..', 'modules-dev')";
  return text.replace(
    line,
    [
      `${indent}# ${MARK}`,
      `${indent}use_expo_modules!(searchPaths: [${devDir}])`,
      `${indent}pod 'ReviselyOnnxRuntime', :podspec => File.join(${devDir}, 'recite-engine', 'ios', 'ReviselyOnnxRuntime.podspec.json')`,
    ].join('\n'),
  );
}

/** settings.gradle with modules-dev/ on autolinking's search path. Throws if it can't place it. */
function devSettingsGradle(text) {
  if (text.includes(MARK)) return text;
  const line = /^(\s*)expoAutolinking\.useExpoModules\(\)\s*$/m;
  const m = text.match(line);
  if (!m) throw new Error('withDevModules: no `expoAutolinking.useExpoModules()` in settings.gradle. Update plugins/withDevModules.js.');
  const indent = m[1];
  return text.replace(
    line,
    [
      `${indent}// ${MARK}`,
      `${indent}expoAutolinking.searchPaths = [new File(rootDir, '../modules-dev').absolutePath]`,
      `${indent}expoAutolinking.useExpoModules()`,
    ].join('\n'),
  );
}

/** Android's backup rules (written by withAndroidBackupRules) with Recite's pack left out too: it would pass the 25 MB quota. */
function devBackupRules(xml) {
  if (xml.includes('path="recite-pack/"')) return xml;
  const at = xml.lastIndexOf('<exclude ');
  if (at < 0) throw new Error('withDevModules: no <exclude> in the backup rules. Update plugins/withDevModules.js.');
  const lineStart = xml.lastIndexOf('\n', at) + 1;
  const lineEnd = xml.indexOf('\n', at);
  const indent = xml.slice(lineStart, at);
  return `${xml.slice(0, lineEnd + 1)}${indent}<exclude domain="file" path="recite-pack/" />\n${xml.slice(lineEnd + 1)}`;
}

function assertDev(bundleId) {
  if (!bundleId || !bundleId.endsWith('.dev')) {
    throw new Error(`withDevModules is for Revisely Dev only (bundle id ${bundleId}).`);
  }
}

function withDevModules(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      assertDev(cfg.ios && cfg.ios.bundleIdentifier);
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      fs.writeFileSync(file, devPodfile(fs.readFileSync(file, 'utf8')));
      return cfg;
    },
  ]);
  // After every other mod, so the backup rules' files are there (the store app's plugin writes them; its file stays as
  // it is, so the store fingerprints don't move).
  config = withFinalizedMod(config, [
    'android',
    async (cfg) => {
      assertDev(cfg.android && cfg.android.package);
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      for (const name of ['revisely_backup_rules.xml', 'revisely_data_extraction_rules.xml']) {
        const file = path.join(dir, name);
        fs.writeFileSync(file, devBackupRules(fs.readFileSync(file, 'utf8')));
      }
      return cfg;
    },
  ]);
  config = withSettingsGradle(config, (cfg) => {
    assertDev(cfg.android && cfg.android.package);
    if (cfg.modResults.language !== 'groovy') throw new Error('withDevModules: settings.gradle is not Groovy.');
    cfg.modResults.contents = devSettingsGradle(cfg.modResults.contents);
    return cfg;
  });
  return withAndroidManifest(config, (cfg) => {
    assertDev(cfg.android && cfg.android.package);
    cfg.modResults = withTestLoopFilter(cfg.modResults);
    return cfg;
  });
}

module.exports = withDevModules;
module.exports.devPodfile = devPodfile;
module.exports.devSettingsGradle = devSettingsGradle;
module.exports.devBackupRules = devBackupRules;
module.exports.withTestLoopFilter = withTestLoopFilter;
