// UI text comes from src/i18n (the strings files), never written into a component, once its
// folder has been extracted: that is how the app gets a second language without drifting back
// to English. EXTRACTED lists what is done; add a folder there in the PR that extracts it.
//
// What's left, folder by folder: I18N_PROGRESS=1 npx jest src/i18n/__tests__/noRawStrings
// A line that isn't UI text (a log, an id the detector mistakes for words) says so with
// `// i18n-ignore` on it or alone on the line above. How to extract: src/i18n/README.md.
import fs from 'fs';
import path from 'path';
import { appSourceFiles, rawStringsIn, rawStringsUnder, readsAsText } from '../../../jest/rawStrings';

const SRC = path.resolve(__dirname, '../..');

/**
 * Folders and files (relative to src/) whose UI text all comes from src/i18n. A folder is everything
 * in it; `components/*` is only the files directly in components/.
 */
const EXTRACTED: string[] = [
  'components/*',
  'components/coach',
  'components/help',
  'components/home',
  'components/insights',
  'components/memorization',
  'components/mushaf',
  'components/offline',
  'components/plan',
  'components/player',
  'components/prayer',
  'components/qibla',
  'components/reader',
  'components/recite',
  'components/reciteCheck',
  'components/reciteLive',
  'components/reciteMemory',
  'components/recordings',
  'components/revision',
  'components/revo',
  'components/search',
  'components/settings',
  'components/timer',
  'components/updates',
  'components/v2',
  'components/verse',
  'context',
  'hooks',
  'lib/clearQuran.ts',
  'lib/clipboard.ts',
  'lib/contact.ts',
  'lib/earlyAccess.ts',
  'lib/mushafEdition.ts',
  'lib/mushafOfflineUi.ts',
  'lib/notifications.ts',
  'lib/playbackPlan.ts',
  'lib/prayer',
  'lib/premium.ts',
  'lib/qibla.ts',
  'lib/recitation.ts',
  'lib/recite',
  'lib/reciteCheck',
  'lib/reciteInsights',
  'lib/reciteLive',
  'lib/reciteMemory',
  'lib/recordingBackup.ts',
  'lib/recordingBackupUi.ts',
  'lib/recordingCloud.ts',
  'lib/recordingFormat.ts',
  'lib/reminders',
  'lib/revo',
  'lib/testScenarios.ts',
  'lib/timeLimit.ts',
  'lib/translation.ts',
  'lib/translationLanguages.ts',
  'lib/translationPicker.ts',
  'lib/updates',
  'lib/utils.ts',
  'lib/verseShare.ts',
  'lib/widgets',
  'navigation',
  'screens/auth',
  'screens/journal',
  'screens/main',
  'screens/onboarding',
  'screens/prayer',
  'screens/preview',
  'screens/read',
  'screens/revision',
  'services',
];

/**
 * Files inside an extracted folder that wait for a design of their own, and why. Their text still
 * counts in the progress report.
 */
const WAITING: Record<string, string> = {
  'lib/revo/openers.ts':
    'Revo’s first lines are built from English sentence parts (a day’s “on”/bare forms, “both pages”, “you” added or not): Arabic needs a module of its own with the same signature, as lib/help will.',
  'lib/revo/charts.ts':
    'Its readouts lean on lib/recency’s words (timesWord, recencyWords) and English grammar: it goes with lib’s own files.',
};

describe('UI text comes from src/i18n', () => {
  it('reads words as words and ids as ids', () => {
    for (const s of ['Done', 'Update now', 'Starts at 0 ›', '0 pages', 'pp. 0–0', 'Fajr', 'Juz 0', "Couldn't load", '0: 0. Change']) {
      expect([s, readsAsText(s)]).toEqual([s, true]);
    }
    for (const s of [
      'home.startsAt', 'chevron-forward', 'users/0/pages', 'en-US', 'update-ready-now', '@revisely_audio:v1',
      'https://revisely.app/support/', 'revisely://today', 'assets/audio/silence.m4a', '›', '0–0', 'ios', 'done',
    ]) {
      expect([s, readsAsText(s)]).toEqual([s, false]);
    }
  });

  it('finds every way UI text gets written, and nothing else', () => {
    const code = [
      'const a = <Text>Update required</Text>;', // 1 JSX text
      'const b = <PillButton title="Update now" testID="update-now" />;', // 2 a prop
      "const c = <Sheet footer={{ label: 'Later', testID: 'later' }} />;", // 3 an object in a prop
      "const d = done ? 'Done' : `${n} pages left`;", // 4 logic, a template
      "Alert.alert('Delete this recording?', 'It can’t be undone.');", // 5 an alert
      "logger.warn('Failed to load page');", // 6 a log: not UI
      "throw new Error('No user signed in');", // 7 an error: not UI
      "if (mode === 'Some Mode') navigation.navigate('ActivityAll');", // 8 ids
      "const e = { fontFamily: 'Amiri', id: 'Main Thing' };", // 9 ids
      "const f = t('updates.ready.title');", // 10 t() itself
      "const g = 'Settings'; // i18n-ignore", // 11 marked
      '// i18n-ignore',
      "const h = 'Route Name';", // 13 marked on the line above
      'const i = <Ionicons name="arrow-up-circle-outline" accessibilityLabel="Close" />;', // 14 a label
      "import { x } from 'Some Module';", // 15 an import
      "type K = 'Some Type';", // 16 a type
      "actions.push({ key: 'rate', label: 'Rate this page' });", // 17 pushed onto a list
      "navigation.push('Some Screen');", // 18 a route
      'const j = <ThreadRow name="New entry" mark={<Ionicons name="add-outline" />} />;', // 19 a row's title
    ].join('\n');
    const lines = rawStringsIn('x.tsx', code).map((r) => `${r.line} ${r.text}`);
    expect(lines).toEqual([
      '1 Update required',
      '2 Update now',
      '3 Later',
      '4 Done',
      '4 0 pages left',
      '5 Delete this recording?',
      '5 It can’t be undone.',
      '14 Close',
      '17 Rate this page',
      '19 New entry',
    ]);
  });

  it('every extracted folder has no UI text of its own', () => {
    const found = rawStringsUnder(SRC, EXTRACTED)
      .filter((r) => !WAITING[r.file])
      .map((r) => `src/${r.file}:${r.line}  ${r.text}`);
    if (found.length) {
      // eslint-disable-next-line no-console
      console.error(
        'UI text written into an extracted folder. Put it in src/i18n/en/<folder>.ts and use t() ' +
          '(src/i18n/README.md), or mark a line that is not UI text with // i18n-ignore.',
      );
    }
    expect(found).toEqual([]);
  });

  it('every extracted folder still exists', () => {
    for (const scope of EXTRACTED) {
      expect([scope, fs.existsSync(path.join(SRC, scope.replace(/\/\*$/, '')))]).toEqual([scope, true]);
    }
    for (const file of Object.keys(WAITING)) expect([file, fs.existsSync(path.join(SRC, file))]).toEqual([file, true]);
  });

  // I18N_PROGRESS=1 prints what is left: strings per folder, then per file for a folder named in
  // I18N_FOLDER (e.g. I18N_FOLDER=components/updates).
  (process.env.I18N_PROGRESS ? it : it.skip)('progress', () => {
    const done = new Set(EXTRACTED);
    const byFolder = new Map<string, number>();
    const focus = process.env.I18N_FOLDER;
    const lines: string[] = [];
    for (const rel of appSourceFiles(SRC)) {
      const found = rawStringsIn(rel, fs.readFileSync(path.join(SRC, rel), 'utf8'));
      const folder = path.posix.dirname(rel);
      byFolder.set(folder, (byFolder.get(folder) ?? 0) + found.length);
      if (focus && (rel === focus || rel.startsWith(`${focus}/`))) {
        for (const r of found) lines.push(`  src/${rel}:${r.line}  ${r.text}`);
      }
    }
    const rows = [...byFolder].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const total = rows.reduce((s, [, n]) => s + n, 0);
    // eslint-disable-next-line no-console
    console.log(
      [
        `${total} strings left in ${rows.length} folders (${done.size} extracted)`,
        ...rows.map(([f, n]) => `${String(n).padStart(5)}  ${f}`),
        ...lines,
      ].join('\n'),
    );
  });
});
