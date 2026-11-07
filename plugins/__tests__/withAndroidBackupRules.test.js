// Android Auto Backup rules (plugins/withAndroidBackupRules.js): only the folders
// that download again are left out, from cloud backups, in both rule formats.
const {
  EXCLUDED_FOLDERS,
  dataExtractionRulesXml,
  fullBackupContentXml,
  setBackupRules,
} = require('../withAndroidBackupRules');

describe('withAndroidBackupRules', () => {
  it('leaves out exactly the offline mushaf, the Arabic text and the translations', () => {
    expect(EXCLUDED_FOLDERS).toEqual(['mushaf', 'quran-text', 'translations']);
    for (const xml of [fullBackupContentXml(), dataExtractionRulesXml()]) {
      const excluded = [...xml.matchAll(/<exclude domain="file" path="([^"]+)" \/>/g)].map((m) => m[1]);
      expect(excluded).toEqual(['mushaf/', 'quran-text/', 'translations/']);
      expect(xml).not.toMatch(/<include|recordings|sharedpref|database/);
    }
  });

  it('Android 12+: cloud backup only, so a device-to-device transfer still takes them', () => {
    const xml = dataExtractionRulesXml();
    expect(xml).toMatch(/<data-extraction-rules>\s*<cloud-backup>/);
    expect(xml).not.toMatch(/device-transfer/);
  });

  it('points the application at both files and keeps backup on', () => {
    const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'true' } }] } };
    const out = setBackupRules(manifest).manifest.application[0].$;
    expect(out).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'true',
      'android:fullBackupContent': '@xml/revisely_backup_rules',
      'android:dataExtractionRules': '@xml/revisely_data_extraction_rules',
    });
  });
});
