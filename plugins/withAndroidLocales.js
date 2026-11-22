// The languages the app declares to Android (13 and later): Settings → Apps → Revisely → Language lists them, and a
// choice there reaches the app as its locale (src/i18n/language.ts reads it through Intl, as the phone's language).
// The app's own picker (Settings → Appearance → Language) still wins over it.
//
// res/xml/locales_config.xml and android:localeConfig on <application>. The list is the store app's languages,
// SHIPPED in src/i18n/language.ts (plugins/__tests__/withAndroidLocales.test.js keeps them the same). iOS declares
// them in app.config.js (CFBundleLocalizations) and gets its Arabic permission prompts from locales/ar.json.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/** The store app's languages, as src/i18n/language.ts's SHIPPED. */
const LOCALES = ['en', 'ar'];

const FILE = 'locales_config';

/** res/xml/locales_config.xml. */
function localeConfigXml(locales = LOCALES) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withAndroidLocales.js. -->',
    '<locale-config xmlns:android="http://schemas.android.com/apk/res/android">',
    ...locales.map((locale) => `  <locale android:name="${locale}" />`),
    '</locale-config>',
    '',
  ].join('\n');
}

/** Points the manifest's <application> at the file. */
function setLocaleConfig(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('withAndroidLocales: the manifest has no <application>');
  application.$ = { ...application.$, 'android:localeConfig': `@xml/${FILE}` };
  return manifest;
}

function withAndroidLocales(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = setLocaleConfig(c.modResults);
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${FILE}.xml`), localeConfigXml());
      return c;
    },
  ]);
}

module.exports = withAndroidLocales;
module.exports.LOCALES = LOCALES;
module.exports.localeConfigXml = localeConfigXml;
module.exports.setLocaleConfig = setLocaleConfig;
