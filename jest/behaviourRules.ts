// For the help's drift checks (src/lib/help/__tests__): BEHAVIOUR.md's rules and their text, a short
// hash of a rule's text, and the app's own source (to check a quoted label is text the app shows).

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

export const ROOT = join(__dirname, '..');
export const readRepo = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Each rule's text: its bullet and the indented lines under it, whitespace folded (re-wrapping isn't a change). */
export function ruleTexts(spec: string): Map<string, string> {
  const rules = new Map<string, string>();
  let id: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (id) rules.set(id, lines.join(' ').replace(/\s+/g, ' ').trim());
    id = null;
    lines = [];
  };
  for (const line of spec.split('\n')) {
    const start = /^- \*\*([A-Z]+-\d+)\.\*\*/.exec(line);
    if (start) {
      flush();
      id = start[1];
      lines = [line];
    } else if (id && /^\s+\S/.test(line)) {
      lines.push(line);
    } else {
      flush();
    }
  }
  flush();
  return rules;
}

export const ruleHash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The app's source, comments and the help itself left out: a label must be text the app shows. */
export function appSource(): string {
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === '__tests__' || p === 'src/lib/help' ? [] : walk(p);
      return /\.tsx?$/.test(e.name) ? [p] : [];
    });
  const uncommented = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return walk('src').map((f) => uncommented(readRepo(f))).join('\n');
}
