// Every Storage write in functions/ is create-only (testerResetAdmin.ts, CREATE_ONLY): one save
// without a precondition turns the Storage client's retries off for good, for every write after it
// (@google-cloud/storage 7.19), so a broken connection then fails the backup of a tester reset.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

it('every Storage save, copy and upload in functions/src passes CREATE_ONLY', () => {
  const writes: string[] = [];
  const plain: string[] = [];
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8');
    // A call and its arguments, up to the closing parenthesis of the statement's line.
    for (const m of text.matchAll(/\.(save|copy|upload|createWriteStream)\(([^;]*)/g)) {
      const where = `${file.slice(SRC.length + 1)}: .${m[1]}(…`;
      writes.push(where);
      if (!m[2].includes('preconditionOpts: CREATE_ONLY')) plain.push(where);
    }
  }
  expect(writes.length).toBeGreaterThan(0);
  expect(plain).toEqual([]);
});
