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

function strings(): Record<'en' | 'ar', Record<string, string>> {
  const ctx: { window: { RV_STRINGS?: Record<'en' | 'ar', Record<string, string>> } } = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('docs/assets/strings.js'), ctx);
  if (!ctx.window.RV_STRINGS) throw new Error('strings.js set no window.RV_STRINGS');
  return ctx.window.RV_STRINGS;
}

function outside(text: string, ranges: [number, number][]): string[] {
  const bad = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
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

  it('English and Arabic have the same keys (a missing one would show English on an Arabic page)', () => {
    const s = strings();
    expect(Object.keys(s.ar).sort()).toEqual(Object.keys(s.en).sort());
  });

  it('the pages load the subset fonts, Regular and Bold, and both are there', () => {
    const css = read('docs/assets/account.css');
    const urls = [...css.matchAll(/url\("\/assets\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(['Amiri-Bold.woff2', 'Amiri-Regular.woff2']);
    for (const f of urls) expect(fs.statSync(path.join(ROOT, 'docs/assets/fonts', f)).size).toBeGreaterThan(50_000);
    expect(fs.existsSync(path.join(ROOT, 'docs/assets/fonts/Amiri-OFL.txt'))).toBe(true);
  });
});
