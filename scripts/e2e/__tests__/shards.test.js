// Every flow runs in a full E2E run: each file in .maestro/flows is in exactly one of e2e.yml's
// `full` jobs. Flows 12 and 13 were in none for a day (Nov 7–8 2026): develop's pushes, PRs into
// main and the nightly run never ran them, and nothing said so.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8');
const flows = fs
  .readdirSync(path.join(root, '.maestro/flows'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => `.maestro/flows/${f}`);

/** A shell glob of the kind e2e.yml uses (`*`, `?`, `[…]`) as a regular expression. */
function globRegex(glob) {
  const body = glob
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${body}$`);
}

function fullJobs() {
  const line = workflow.split('\n').find((l) => /^\s*full='/.test(l));
  if (!line) throw new Error("e2e.yml has no full='…' line");
  return JSON.parse(line.trim().slice("full='".length, -1));
}

it('puts every flow in exactly one job of a full run', () => {
  const jobs = fullJobs();
  const where = new Map(flows.map((f) => [f, []]));
  for (const job of jobs) {
    const globs = job.flows.split(/\s+/).filter(Boolean).map(globRegex);
    for (const f of flows) if (globs.some((g) => g.test(f))) where.get(f).push(job.name);
  }
  const missing = flows.filter((f) => where.get(f).length === 0);
  const twice = flows.filter((f) => where.get(f).length > 1);
  expect({ missing, twice }).toEqual({ missing: [], twice: [] });
});

it('names each job by the flows it runs', () => {
  for (const job of fullJobs()) {
    const globs = job.flows.split(/\s+/).filter(Boolean).map(globRegex);
    const numbers = [...new Set(flows.filter((f) => globs.some((g) => g.test(f))).map((f) => path.basename(f).slice(0, 2)))];
    expect(job.name).toBe(numbers.sort().join(' '));
  }
});

it('reads globs the way the shell does', () => {
  expect(globRegex('.maestro/flows/1[0234]-*.yaml').test('.maestro/flows/13-sitting-memorized.yaml')).toBe(true);
  expect(globRegex('.maestro/flows/1[04]-*.yaml').test('.maestro/flows/12-add-to-day.yaml')).toBe(false);
  expect(globRegex('.maestro/flows/0?-*.yaml').test('.maestro/flows/09-revo.yaml')).toBe(true);
});
