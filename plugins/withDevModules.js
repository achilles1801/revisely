// Revisely Dev only (app.config.js loads this plugin only with APP_VARIANT=dev; handbook/dev-stack.md).
//
// Native modules in modules-dev/ (Recite on the phone: modules-dev/recite-engine) are linked into Revisely Dev's
// builds and nowhere else. Everything in modules/ is linked into the store app and counts toward its fingerprints;
// modules-dev/ isn't on autolinking's default path, so this plugin adds it in the copy Dev's build works on:
// - iOS: `use_expo_modules!(searchPaths: [...])` in the Podfile, plus ONNX Runtime's pod from its podspec in the
//   module (ios/ReviselyOnnxRuntime.podspec.json: Microsoft's NuGet package, pinned by SHA-256);
// - Android: `expoAutolinking.searchPaths` in settings.gradle.
// fingerprint.config.js counts modules-dev/ toward Revisely Dev's fingerprints (only), so a change there builds Dev.
// The release-native change links the module into the store app and retires this plugin (the release owner's call).
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withSettingsGradle } = require('expo/config-plugins');

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
  return withSettingsGradle(config, (cfg) => {
    assertDev(cfg.android && cfg.android.package);
    if (cfg.modResults.language !== 'groovy') throw new Error('withDevModules: settings.gradle is not Groovy.');
    cfg.modResults.contents = devSettingsGradle(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withDevModules;
module.exports.devPodfile = devPodfile;
module.exports.devSettingsGradle = devSettingsGradle;
