// The languages the binary declares (plugins/withAndroidLocales.js on Android, CFBundleLocalizations and locales in
// app.config.js on iOS) are the store app's, SHIPPED in src/i18n/language.ts; and every Arabic permission prompt
// (locales/ar.json) is one the app asks for, written so iOS can read it.
const fs = require('fs');
const path = require('path');
const { LOCALES, localeConfigXml, setLocaleConfig } = require('../withAndroidLocales');
const { SHIPPED } = require('../../src/i18n/language');

const root = path.join(__dirname, '..', '..');
const arabic = require('../../locales/ar.json');

describe('withAndroidLocales', () => {
  it('declares exactly the store app’s languages', () => {
    expect(LOCALES).toEqual([...SHIPPED]);
    const declared = [...localeConfigXml().matchAll(/<locale android:name="([^"]+)" \/>/g)].map((m) => m[1]);
    expect(declared).toEqual([...SHIPPED]);
  });

  it('points the application at the file and leaves the rest of it alone', () => {
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }] } };
    expect(setLocaleConfig(manifest).manifest.application[0].$).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'true',
      'android:localeConfig': '@xml/locales_config',
    });
  });
});

describe('iOS', () => {
  const config = fs.readFileSync(path.join(root, 'app.config.js'), 'utf8');

  it('declares the same languages, and requires the Arabic prompts into the config (so they count in the fingerprint)', () => {
    const declared = /CFBundleLocalizations: \[([^\]]*)\]/.exec(config);
    expect(declared).not.toBeNull();
    expect(declared[1].split(',').map((l) => l.trim().replace(/"/g, ''))).toEqual([...SHIPPED]);
    expect(config).toMatch(/locales: \{\s*ar: require\("\.\/locales\/ar\.json"\)\s*\}/);
    expect(config).toContain('"./plugins/withAndroidLocales"');
  });

  it('has an Arabic prompt for every permission the app asks for, and only those', () => {
    // The English: app.config.js's infoPlist and its plugins' options (expo-audio, expo-location; the location one it
    // doesn't set is expo-location's own wording).
    expect(Object.keys(arabic)).toEqual(['ios']);
    expect(Object.keys(arabic.ios).sort()).toEqual(
      [
        'NSLocationAlwaysAndWhenInUseUsageDescription',
        'NSLocationAlwaysUsageDescription',
        'NSLocationWhenInUseUsageDescription',
        'NSMicrophoneUsageDescription',
        'NSPhotoLibraryAddUsageDescription',
        'NSPhotoLibraryUsageDescription',
      ].sort(),
    );
    expect(config).toContain('microphonePermission:');
    expect(config).toContain('locationAlwaysAndWhenInUsePermission:');
    expect(config).toContain('locationWhenInUsePermission:');
    expect(config).toContain('NSPhotoLibraryUsageDescription:');
    expect(config).toContain('NSPhotoLibraryAddUsageDescription:');
  });

  it('writes each prompt so InfoPlist.strings can hold it: Arabic, no straight quotes or backslashes, no tatweel', () => {
    for (const [key, text] of Object.entries(arabic.ios)) {
      // Expo writes `key = "text";` as it is (@expo/config-plugins ios/Locales).
      expect([key, /["\\\n]/.test(text)]).toEqual([key, false]);
      expect([key, /[؀-ۿ]/.test(text)]).toEqual([key, true]);
      expect([key, text.includes('ـ')]).toEqual([key, false]);
      // Latin names sit in isolates (src/i18n/ar-glossary.md).
      for (const latin of text.match(/[A-Za-z]+/g) ?? []) expect([key, text]).toEqual([key, expect.stringContaining(`⁨${latin}⁩`)]);
    }
  });
});
