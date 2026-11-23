// CLAUDE.md holds the rules every session needs; reference for each area lives in handbook/ (Nov 22 2026). This keeps
// the two in step: the index names every handbook file, names no file that's missing, and the rules stay in the core.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const core = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const files = fs.readdirSync(path.join(ROOT, 'handbook')).filter((f) => f.endsWith('.md'));
const indexed = [...new Set([...core.matchAll(/`handbook\/([a-z0-9-]+\.md)`/g)].map((m) => m[1]))];

describe('CLAUDE.md and handbook/', () => {
  it('names only handbook files that exist', () => {
    expect(indexed.filter((f) => !files.includes(f))).toEqual([]);
  });

  it('names every handbook file in its index', () => {
    expect(files.filter((f) => !indexed.includes(f))).toEqual([]);
  });

  it('keeps the rules every session needs in the core', () => {
    const headings = [...core.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    for (const required of [
      'How a session works',
      'Branches and releases',
      'Runtime version is a fingerprint',
      'Config and secrets',
      'CI',
      'Deploy order',
      'Strings',
      'UI traps',
    ]) {
      expect(headings.some((h) => h === required || h.startsWith(`${required} `))).toBe(true);
    }
  });

  it('moved each section once: no heading is in both the core and a handbook file', () => {
    const coreHeadings = new Set([...core.matchAll(/^## (.+)$/gm)].map((m) => m[1]));
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, 'handbook', f), 'utf8');
      const shared = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((h) => coreHeadings.has(h));
      expect({ file: f, shared }).toEqual({ file: f, shared: [] });
    }
  });
});
