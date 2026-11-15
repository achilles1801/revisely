/**
 * @jest-environment node
 */
// The website's Arabic (docs/: the account, Premium and Open Door pages). Its font is Amiri cut down to a set of
// characters (scripts/site/amiri-subset.sh), so a string with a character outside that set would show in a fallback
// font. These keep the words and the font in step, and English and Arabic in step with each other.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** The subset's ranges, read from the script that builds the fonts. */
function subsetRanges(): [number, number][] {
  const line = /^UNICODES="([^"]+)"/m.exec(read('scripts/site/amiri-subset.sh'));
  if (!line) throw new Error('no UNICODES= line in scripts/site/amiri-subset.sh');
  return line[1].split(',').map((r) => {
    const [a, b] = r.replace(/U\+/g, '').split('-');
    return [parseInt(a, 16), parseInt(b ?? a, 16)];
  });
}

type Strings = Record<'en' | 'ar', Record<string, string>>;

/** strings.js (the account, Premium and Open Door pages), and with `site` strings-site.js too (the home, Support). */
function strings(site = false): Strings {
  const ctx: { window: { RV_STRINGS?: Strings } } = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('docs/assets/strings.js'), ctx);
  if (site) vm.runInContext(read('docs/assets/strings-site.js'), ctx);
  if (!ctx.window.RV_STRINGS) throw new Error('strings.js set no window.RV_STRINGS');
  return ctx.window.RV_STRINGS;
}

/** strings-site.js alone: the Arabic it adds. */
function siteArabic(): Record<string, string> {
  const ctx: { window: { RV_STRINGS?: Strings } } = { window: { RV_STRINGS: { en: {}, ar: {} } } };
  vm.createContext(ctx);
  vm.runInContext(read('docs/assets/strings-site.js'), ctx);
  return ctx.window.RV_STRINGS!.ar;
}

/** Every key the home and Support name (data-t…, data-name-t, rv-title), and the ones site.js asks for. */
function siteKeys(): Set<string> {
  const keys = new Set<string>();
  for (const page of ['docs/index.html', 'docs/support/index.html']) {
    for (const m of read(page).matchAll(/\bdata-(?:t|t-html|t-aria|t-alt|t-ph|name-t)="([^"]+)"/g)) keys.add(m[1]);
    for (const m of read(page).matchAll(/<meta name="rv-title" content="([^"]+)">/g)) keys.add(m[1]);
  }
  for (const m of read('docs/assets/site.js').matchAll(/\btr\('([^']+)'/g)) keys.add(m[1]);
  return keys;
}

/** Symbols the whole of Amiri doesn't have either: the system font draws them, as it does on the English pages. */
const NOT_IN_AMIRI = new Set(['←', '→', '⋯']);

function outside(text: string, ranges: [number, number][]): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (NOT_IN_AMIRI.has(ch)) continue;
    if (!ranges.some(([a, b]) => c >= a && c <= b)) bad.add(`U+${c.toString(16).toUpperCase().padStart(4, '0')} ${ch}`);
  }
  return [...bad];
}

describe('the website in Arabic', () => {
  const ranges = subsetRanges();

  it('every Arabic string is in the font', () => {
    const misses = Object.entries(strings().ar)
      .map(([key, text]) => [key, outside(text, ranges)] as const)
      .filter(([, bad]) => bad.length);
    expect(misses).toEqual([]);
  });

  it('the Arabic written straight into the pages is in the font too', () => {
    const pages = ['docs/apply/index.html', 'docs/premium/index.html', 'docs/account/index.html'];
    for (const page of pages) {
      const arabic = (read(page).match(/[؀-ۿ][^<>"]*/g) ?? []).join(' ');
      expect([page, outside(arabic, ranges)]).toEqual([page, []]);
    }
  });

  it("the home's and Support's Arabic is in the font too", () => {
    const misses = Object.entries(siteArabic())
      .map(([key, text]) => [key, outside(text, ranges)] as const)
      .filter(([, bad]) => bad.length);
    expect(misses).toEqual([]);
  });

  it('every key the home and Support use has Arabic, and strings-site.js holds nothing they don\'t use', () => {
    const ar = strings(true).ar;
    const used = siteKeys();
    expect([...used].filter((k) => ar[k] == null)).toEqual([]);
    expect(Object.keys(siteArabic()).filter((k) => !used.has(k))).toEqual([]);
    // Keys shared with strings.js (nav.support, foot.privacy…) come from there; strings-site.js doesn't repeat them.
    const own = strings().ar;
    expect(Object.keys(siteArabic()).filter((k) => own[k] != null)).toEqual([]);
  });

  it('English and Arabic have the same keys (a missing one would show English on an Arabic page)', () => {
    const s = strings();
    expect(Object.keys(s.ar).sort()).toEqual(Object.keys(s.en).sort());
  });

  it('the pages load the subset fonts, Regular and Bold, and both are there', () => {
    const fontsOf = (file: string) => [...read(file).matchAll(/url\("\/assets\/fonts\/([^"]+)"\)/g)].map((m) => m[1]).sort();
    expect(fontsOf('docs/assets/site-rtl.css')).toEqual(['Amiri-Bold.woff2', 'Amiri-Regular.woff2']);
    const css = read('docs/assets/account.css');
    const urls = [...css.matchAll(/url\("\/assets\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(['Amiri-Bold.woff2', 'Amiri-Regular.woff2']);
    for (const f of urls) expect(fs.statSync(path.join(ROOT, 'docs/assets/fonts', f)).size).toBeGreaterThan(50_000);
    expect(fs.existsSync(path.join(ROOT, 'docs/assets/fonts/Amiri-OFL.txt'))).toBe(true);
  });
});
