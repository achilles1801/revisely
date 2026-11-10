// The Android home-screen widgets (modules/android-widgets) against what they share with the app
// and the iOS widgets (targets/widget): the verse list and Amiri they bundle, the theme's colours,
// the links they open and the words they say. Their timeline rules have JVM tests of their own
// (modules/android-widgets/android/src/test).

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { paletteV2 } from '../../theme/v2';
import { parseWidgetLink } from '../widgets/links';

const ROOT = path.join(__dirname, '../../..');
const MAIN = 'modules/android-widgets/android/src/main';
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

function colours(file: string): Record<string, string> {
  return Object.fromEntries([...read(file).matchAll(/<color name="(\w+)">(#[0-9A-Fa-f]{6})<\/color>/g)].map((m) => [m[1], m[2]]));
}

function kotlin(): string {
  const dir = path.join(ROOT, MAIN, 'java/app/revisely/widgets');
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.kt'))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
    .join('\n');
}

describe('Android widgets', () => {
  it('bundle the iOS widget’s verses and Amiri (and its licence), byte for byte', () => {
    for (const file of ['verses.json', 'Amiri-Regular.ttf', 'Amiri-OFL.txt']) {
      expect(sha(`${MAIN}/assets/widgets/${file}`)).toBe(sha(`targets/widget/${file}`));
    }
  });

  it('take the ground, ink and hairlines from the theme, light and dark', () => {
    const light = colours(`${MAIN}/res/values/colors.xml`);
    const dark = { ...light, ...colours(`${MAIN}/res/values-night/colors.xml`) };
    for (const [appearance, values, isDark] of [['light', light, false], ['dark', dark, true]] as const) {
      const p = paletteV2(isDark, 'indigo');
      for (const token of ['bg', 'text', 'secondary', 'separator', 'fill'] as const) {
        expect(`${appearance} ${token} ${values[`aw_${token}`]}`).toBe(`${appearance} ${token} ${p[token].toUpperCase()}`);
      }
      // The picker's previews are Indigo's, the default accent.
      expect(values.aw_preview_accent).toBe(p.accentText.toUpperCase());
      expect(values.aw_preview_primary).toBe(p.primary.toUpperCase());
      expect(values.aw_preview_on_primary).toBe(p.onPrimary.toUpperCase());
    }
  });

  it('fall back to Indigo’s accent as the theme has it, before the app has written anything', () => {
    const k = kotlin();
    for (const [appearance, isDark] of [['light', false], ['dark', true]] as const) {
      const p = paletteV2(isDark, 'indigo');
      const block = k.match(new RegExp(`${appearance} = AccentColors\\(([\\s\\S]*?)\\n\\s*\\),`))?.[1] ?? '';
      for (const token of ['accentText', 'done', 'onDone', 'primary', 'onPrimary', 'accentSubtle', 'subtleText'] as const) {
        expect(block).toContain(`${token} = argb("${p[token].toUpperCase()}")`);
      }
    }
  });

  it('open only links the app handles (lib/widgets/links)', () => {
    const urls = [...kotlin().matchAll(/"(revisely:\/\/[^"]*)"/g)].map((m) => m[1].replace('${verse.page}', '596'));
    expect(new Set(urls)).toEqual(
      new Set(['revisely://today', 'revisely://home', 'revisely://read?page=596', 'revisely://qibla', 'revisely://prayer']),
    );
    for (const url of urls) expect(parseWidgetLink(url)).not.toBeNull();
  });

  it('say what the iOS widgets say when there’s nothing to show', () => {
    const k = kotlin();
    const swift = ['TodayWidget', 'PrayerWidget', 'QiblaWidget'].map((f) => read(`targets/widget/${f}.swift`)).join('\n');
    for (const text of [
      'Open Revisely to set up your plan.',
      "Open Revisely to see today's revision.",
      'Open Revisely to see prayer times.',
      'Open Revisely to set your location.',
      'Done for today',
      'Tomorrow · ',
      '-day streak',
      ' to Makkah',
    ]) {
      expect(`${text}: ${k.includes(text)}`).toBe(`${text}: true`);
      expect(`${text}: ${swift.includes(text)}`).toBe(`${text}: true`);
    }
  });

  it('declare the four widgets, each with its provider info and preview', () => {
    const manifest = read(`${MAIN}/AndroidManifest.xml`);
    for (const [cls, info] of [
      ['TodayWidget', 'aw_today_info'],
      ['VerseWidget', 'aw_verse_info'],
      ['QiblaWidget', 'aw_qibla_info'],
      ['PrayerWidget', 'aw_prayer_info'],
    ]) {
      expect(manifest).toContain(`android:name="app.revisely.widgets.${cls}"`);
      expect(manifest).toContain(`android:resource="@xml/${info}"`);
      const xml = read(`${MAIN}/res/xml/${info}.xml`);
      const preview = xml.match(/android:previewLayout="@layout\/(\w+)"/)?.[1];
      expect(fs.existsSync(path.join(ROOT, MAIN, `res/layout/${preview}.xml`))).toBe(true);
    }
    // The alarm's permission is declared, never asked for.
    expect(manifest).toContain('android.permission.SCHEDULE_EXACT_ALARM');
    expect(read('src/lib/widgets/storage.ts')).not.toContain('SCHEDULE_EXACT_ALARM');
  });
});
