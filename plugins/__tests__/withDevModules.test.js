// plugins/withDevModules: Revisely Dev's builds link modules-dev/ (Recite on the phone) through autolinking's search
// path and take ONNX Runtime's pod from the module's own podspec. The store app never loads the plugin.
const { devBackupRules, devPodfile, devSettingsGradle } = require('../withDevModules');
const { dataExtractionRulesXml, fullBackupContentXml } = require('../withAndroidBackupRules');

// The lines that matter in Expo SDK 54's bare template (expo-template-bare-minimum 54.0.54).
const PODFILE = `prepare_react_native_project!

target 'Revisely Dev' do
  use_expo_modules!

  if ENV['EXPO_USE_COMMUNITY_AUTOLINKING'] == '1'
    config_command = ['node', '-e', "process.argv=['', '', 'config'];require('@react-native-community/cli').run()"];
  end
end
`;

const SETTINGS = `extensions.configure(com.facebook.react.ReactSettingsExtension) { ex ->
  if (System.getenv('EXPO_USE_COMMUNITY_AUTOLINKING') == '1') {
    ex.autolinkLibrariesFromCommand()
  } else {
    ex.autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)
  }
}
expoAutolinking.useExpoModules()

rootProject.name = 'Revisely Dev'
`;

describe('withDevModules', () => {
  it('leaves Recite’s pack out of both of Android’s backup rules, once', () => {
    for (const xml of [fullBackupContentXml(), dataExtractionRulesXml()]) {
      const out = devBackupRules(xml);
      expect(out.match(/path="recite-pack\/"/g)).toHaveLength(1);
      expect(out).toContain('path="mushaf/"');
      expect(devBackupRules(out)).toBe(out);
    }
    expect(() => devBackupRules('<full-backup-content />')).toThrow('no <exclude>');
  });

  it('puts modules-dev on the Podfile’s autolinking path and adds ONNX Runtime’s pod from the module', () => {
    const out = devPodfile(PODFILE);
    expect(out).toContain("  use_expo_modules!(searchPaths: [File.join(__dir__, '..', 'modules-dev')])");
    expect(out).toContain(
      "  pod 'ReviselyOnnxRuntime', :podspec => File.join(File.join(__dir__, '..', 'modules-dev'), 'recite-engine', 'ios', 'ReviselyOnnxRuntime.podspec.json')",
    );
    expect(out.match(/use_expo_modules!/g)).toHaveLength(1);
    expect(devPodfile(out)).toBe(out);
  });

  it('sets the search path in settings.gradle before Expo’s modules are linked', () => {
    const out = devSettingsGradle(SETTINGS);
    const set = out.indexOf("expoAutolinking.searchPaths = [new File(rootDir, '../modules-dev').absolutePath]");
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(out.indexOf('expoAutolinking.useExpoModules()'));
    expect(out.match(/expoAutolinking\.useExpoModules\(\)/g)).toHaveLength(1);
    expect(devSettingsGradle(out)).toBe(out);
  });

  it('fails the build when the templates change shape, never links half', () => {
    expect(() => devPodfile('target "x" do\nend\n')).toThrow(/use_expo_modules!/);
    expect(() => devSettingsGradle('rootProject.name = "x"\n')).toThrow(/useExpoModules/);
  });

  it('is loaded for Revisely Dev only', () => {
    const load = (variant) => {
      const saved = process.env.APP_VARIANT;
      if (variant) process.env.APP_VARIANT = variant;
      else delete process.env.APP_VARIANT;
      try {
        let config;
        jest.isolateModules(() => {
          config = require('../../app.config.js').default;
        });
        return config.expo.plugins.filter((p) => typeof p === 'string' && p.startsWith('./plugins/withDev'));
      } finally {
        if (saved === undefined) delete process.env.APP_VARIANT;
        else process.env.APP_VARIANT = saved;
      }
    };
    expect(load()).toEqual([]);
    expect(load('dev')).toEqual(['./plugins/withDevVariant', './plugins/withDevModules']);
  });
});
