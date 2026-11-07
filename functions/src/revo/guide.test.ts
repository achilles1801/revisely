/**
 * Revo's guide stays true to the app (guide.ts): it covers every rule in BEHAVIOUR.md, names only
 * screens the app has and labels the app shows, and the screens Revo may open are the same list
 * on both sides. When one of these fails, change the guide in the same PR as the feature.
 */
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GUIDE_INTERNAL, GUIDE_SECTIONS, REVO_GUIDE } from './guide';
import { REVO_SCREENS, REVO_SETTINGS_SECTIONS } from './types';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const rules = [...read('BEHAVIOUR.md').matchAll(/^- \*\*([A-Z]+-\d+)\.\*\*/gm)].map((m) => m[1]);
const covered = GUIDE_SECTIONS.flatMap((s) => [...s.covers]);

/** The app's source, comments left out (a label must be text the app shows, not a note about it). */
function appSource(): string {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' || e.name === '__fixtures__' ? [] : walk(p);
      return /\.(tsx?|json)$/.test(e.name) ? [p] : [];
    });
  const uncommented = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return walk('src').map((f) => uncommented(read(f))).join('\n');
}

describe('Revo’s guide covers BEHAVIOUR.md', () => {
  it('reads the rules', () => {
    expect(rules.length).toBeGreaterThan(50);
  });

  it('every rule is in a section’s covers, or left out on purpose with a reason', () => {
    const missing = rules.filter((id) => !covered.includes(id) && !(id in GUIDE_INTERNAL));
    // A new rule: say how it works for users in guide.ts (and add its id to that section's covers),
    // or, if users can't ask about it, add it to GUIDE_INTERNAL with the reason.
    expect(missing).toEqual([]);
  });

  it('names only rules that exist, each once', () => {
    const all = [...covered, ...Object.keys(GUIDE_INTERNAL)];
    expect(all.filter((id) => !rules.includes(id))).toEqual([]);
    expect(all.filter((id, i) => all.indexOf(id) !== i)).toEqual([]);
  });
});

describe('Revo’s guide names what the app has', () => {
  it('every screen a section sends the user to is in the navigation', () => {
    const nav = read('src/navigation/MainNavigator.tsx');
    const screens = new Set([...nav.matchAll(/\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]));
    expect(screens.size).toBeGreaterThan(10);
    const routes = [...new Set(GUIDE_SECTIONS.flatMap((s) => [...s.routes]))];
    expect(routes.filter((r) => !screens.has(r))).toEqual([]);
  });

  it('every label in curly quotes is text the app shows, word for word (“…” stands for a part left out)', () => {
    const source = appSource().replace(/’/g, "'");
    const labels = [...new Set([...REVO_GUIDE.matchAll(/“([^”]+)”/g)].map((m) => m[1]))];
    expect(labels.length).toBeGreaterThan(50);
    const absent = labels.filter((l) =>
      l
        .split('…')
        .map((part) => part.trim().replace(/’/g, "'"))
        .filter(Boolean)
        .some((part) => !source.includes(part)),
    );
    // A label the app no longer shows: the guide sends users to something that isn't there.
    expect(absent).toEqual([]);
  });

  it('stays compact: the prompt carries it on every question', () => {
    // About 4 characters a token; under ~6,000 tokens.
    expect(REVO_GUIDE.length).toBeLessThan(24_000);
    expect(REVO_GUIDE).not.toMatch(/\b[A-Z]+-\d+\b/);
  });
});

describe('the screens Revo may open (REVO-31)', () => {
  /** A `['a', 'b'] as const` list exported from the app's src/lib/revo/types.ts. */
  const appList = (name: string) => {
    const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`).exec(read('src/lib/revo/types.ts'));
    return m ? [...m[1].matchAll(/'([A-Za-z]+)'/g)].map((x) => x[1]) : null;
  };

  it('are the same list in the app and on the server', () => {
    expect(appList('REVO_SCREENS')).toEqual([...REVO_SCREENS]);
    expect(appList('REVO_SETTINGS_SECTIONS')).toEqual([...REVO_SETTINGS_SECTIONS]);
  });
});

describe('the scripts that ask the real model still build their requests', () => {
  // They run on the built functions (lib/); CI builds before testing (npm run build && npm test).
  // A change to the request (Nov 7: `attach` became `attached`) broke all three without a test failing.
  const lib = join(__dirname, '..', '..', 'lib', 'revo', 'prompt.js');
  // The tone script compares with an older prompt from git; CI's checkout is shallow, so it compares with HEAD here.
  it.each([['revo-guide-samples.js'], ['record-anthropic.js'], ['revo-tone-samples.js', '--before', 'HEAD']])('%s --dry', (script, ...args) => {
    if (!existsSync(lib)) throw new Error('Build the functions first: npm run build');
    execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', script), '--dry', ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ANTHROPIC_API_KEY: '' } });
  });
});
