// Android Auto Backup: what goes to the user's Google Drive backup. Everything the app keeps
// goes, except what downloads again by itself: the offline mushaf's pages (135–191 MB a set),
// the Arabic text and the translations. With them the app passes Android's 25 MB backup quota,
// and an app over it isn't backed up at all, recordings and settings included.
// iOS keeps the same folders out of iCloud backups (RecitationAudio.excludeFromBackup).
//
// Two forms of the same rules: fullBackupContent for Android 6–11, dataExtractionRules for
// Android 12 and later (it replaces the other there). Only cloud backup leaves them out: a
// device-to-device transfer has no quota, and a new phone then has the pages at once.
// The folders are Paths.document's (the app's files directory): lib/pageCache (STORE_FOLDER),
// lib/translation and lib/saheeh. Recordings and anything else that can't be downloaded again
// stay in.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/** Folders of the files directory left out of cloud backups. */
const EXCLUDED_FOLDERS = ['mushaf', 'quran-text', 'translations'];

const FULL_BACKUP_FILE = 'revisely_backup_rules';
const DATA_EXTRACTION_FILE = 'revisely_data_extraction_rules';

function excludes(indent) {
  return EXCLUDED_FOLDERS.map((folder) => `${indent}<exclude domain="file" path="${folder}/" />`).join('\n');
}

/** res/xml/revisely_backup_rules.xml: android:fullBackupContent (Android 6–11). */
function fullBackupContentXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withAndroidBackupRules.js. -->',
    '<full-backup-content>',
    excludes('  '),
    '</full-backup-content>',
    '',
  ].join('\n');
}

/** res/xml/revisely_data_extraction_rules.xml: android:dataExtractionRules (Android 12+). */
function dataExtractionRulesXml() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Written by plugins/withAndroidBackupRules.js. -->',
    '<data-extraction-rules>',
    '  <cloud-backup>',
    excludes('    '),
    '  </cloud-backup>',
    '</data-extraction-rules>',
    '',
  ].join('\n');
}

/** Points the manifest's <application> at the two files (backup stays on). */
function setBackupRules(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('withAndroidBackupRules: the manifest has no <application>');
  application.$ = {
    ...application.$,
    'android:allowBackup': 'true',
    'android:fullBackupContent': `@xml/${FULL_BACKUP_FILE}`,
    'android:dataExtractionRules': `@xml/${DATA_EXTRACTION_FILE}`,
  };
  return manifest;
}

function withAndroidBackupRules(config) {
  config = withAndroidManifest(config, (c) => {
    c.modResults = setBackupRules(c.modResults);
    return c;
  });
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${FULL_BACKUP_FILE}.xml`), fullBackupContentXml());
      await fs.promises.writeFile(path.join(dir, `${DATA_EXTRACTION_FILE}.xml`), dataExtractionRulesXml());
      return c;
    },
  ]);
}

module.exports = withAndroidBackupRules;
module.exports.EXCLUDED_FOLDERS = EXCLUDED_FOLDERS;
module.exports.fullBackupContentXml = fullBackupContentXml;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;
module.exports.setBackupRules = setBackupRules;
