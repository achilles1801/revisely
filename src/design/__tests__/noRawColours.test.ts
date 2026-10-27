// Colours come from the theme (src/theme), never written in a component: a
// raw hex or rgba() outside it is how the old design's leftovers and one-off
// greys crept in. Brand marks that must keep their own colours are listed
// below with the reason.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const THEME = path.join(SRC, 'theme');

/** Files allowed raw colours, and why. Keep this list short. */
const ALLOWED: Record<string, string> = {
  'components/GoogleGIcon.tsx': "Google's multicolour G (Google's branding guidelines)",
};

/** A colour inside a string: a hex, or rgb()/rgba()/hsl()/hsla(). */
const IN_STRING = /#[0-9A-Fa-f]{3,8}\b|\b(?:rgba?|hsla?)\(/;
/** An alpha glued onto a colour: `theme.accent + '22'`. */
const ALPHA_SUFFIX = /\+\s*(['"`])[0-9A-Fa-f]{2}\1/;
const STRING = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** The colours on a line of code (comments removed, `https://` kept). */
function coloursIn(line: string): boolean {
  const code = line.replace(/(^|[^:])\/\/.*$/, '$1');
  if (ALPHA_SUFFIX.test(code)) return true;
  for (const m of code.matchAll(STRING)) if (IN_STRING.test(m[2])) return true;
  return false;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || full === THEME ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('colours come from the theme', () => {
  it('catches every way a colour gets written', () => {
    for (const line of [
      "color: '#fff',",
      'fill="#4285F4"',
      "border: '1px solid #E5E7EB',",
      "backgroundColor: 'rgba(0,0,0,0.4)',",
      'tint: `rgba(${r}, 0, 0, 1)`,',
      "color: 'hsl(240, 50%, 50%)',",
      "backgroundColor: theme.accent + '22',",
      "{ uri: 'https://x.test/a' }, tint: '#000'",
    ]) {
      expect(coloursIn(line)).toBe(true);
    }
    for (const line of [
      "// '#fff' in a comment",
      "{ uri: 'https://revisely.app/#top' }",
      "testID: 'item-1'",
      "const label = `Page ${n}`;",
      "backgroundColor: 'transparent',",
    ]) {
      expect(coloursIn(line)).toBe(false);
    }
  });

  it('no raw hex or rgba() in src outside src/theme', () => {
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED[rel]) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (coloursIn(line)) found.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });

  it('every allowed file still exists and still needs it', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const lines = fs.readFileSync(path.join(SRC, rel), 'utf8').split('\n');
      expect(lines.some(coloursIn)).toBe(true);
    }
  });
});
