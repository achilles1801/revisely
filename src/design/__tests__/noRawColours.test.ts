// Colours come from the theme (src/theme), never written in a component: a
// raw hex or rgba() outside it is how the old design's leftovers and one-off
// greys crept in. Brand marks that must keep their own colours are listed
// below with the reason.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');

/** Files allowed raw colours, and why. Keep this list short. */
const ALLOWED: Record<string, string> = {
  'components/GoogleGIcon.tsx': "Google's multicolour G (Google's branding guidelines)",
};

const COLOUR = /(['"`])#[0-9A-Fa-f]{3,8}\1|rgba?\(\s*\d/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'theme' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

describe('colours come from the theme', () => {
  it('no raw hex or rgba() in src outside src/theme', () => {
    const found: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      if (ALLOWED[rel]) continue;
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '');
          if (COLOUR.test(code)) found.push(`${rel}:${i + 1}  ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
  });

  it('every allowed file still exists and still needs it', () => {
    for (const rel of Object.keys(ALLOWED)) {
      const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
      expect(COLOUR.test(text)).toBe(true);
    }
  });
});
