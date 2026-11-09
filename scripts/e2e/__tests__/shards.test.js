// Every flow runs in a full E2E run: each file in .maestro/flows is in exactly one job of e2e.yml's
// `full` list (iOS) and of its `full_android` list. Flows 12 and 13 were in none for a day (Nov 7–8
// 2026): develop's pushes, PRs into main and the nightly run never ran them, and nothing said so. It
// caught 15 and 09-revo-attach the same way. Every pattern of the smoke sets matches a flow too.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8');
const flows = fs
  .readdirSync(path.join(root, '.maestro/flows'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => `.maestro/flows/${f}`)
  .sort();

/** A shell glob of the kind e2e.yml uses (`*`, `?`, `[…]`) as a regular expression. */
function globRegex(glob) {
  const body = glob
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${body}$`);
}

/** One of e2e.yml's job lists (`full='[…]'`). */
function list(name) {
  const line = workflow.split('\n').find((l) => new RegExp(`^\\s*${name}='`).test(l));
  if (!line) throw new Error(`e2e.yml has no ${name}='…' line`);
  return JSON.parse(line.trim().slice(`${name}='`.length, -1));
}

const patterns = (job) => job.flows.split(/\s+/).filter(Boolean);
const flowsOf = (job) => flows.filter((f) => patterns(job).some((p) => globRegex(p).test(f)));

/** A flow in a job's name: its number, or its file's name where several share the number (09). */
function short(flow) {
  const base = path.basename(flow, '.yaml');
  const number = base.slice(0, 2);
  const shared = flows.filter((f) => path.basename(f).startsWith(`${number}-`)).length > 1;
  return shared ? base : number;
}

describe.each(['full', 'full_android'])('e2e.yml %s', (name) => {
  it('puts every flow in exactly one job', () => {
    const where = new Map(flows.map((f) => [f, []]));
    for (const job of list(name)) for (const f of flowsOf(job)) where.get(f).push(job.name);
    const missing = flows.filter((f) => where.get(f).length === 0);
    const twice = flows.filter((f) => where.get(f).length > 1);
    expect({ missing, twice }).toEqual({ missing: [], twice: [] });
  });

  it('names each job by the flows it runs', () => {
    for (const job of list(name)) expect(job.name).toBe(flowsOf(job).map(short).join(' '));
  });
});

it.each(['full', 'full_android', 'smoke_android', 'smoke_ios'])('every pattern in %s matches a flow', (name) => {
  for (const job of list(name)) {
    for (const p of patterns(job)) {
      expect({ job: job.name, pattern: p, matches: flows.some((f) => globRegex(p).test(f)) }).toEqual({
        job: job.name,
        pattern: p,
        matches: true,
      });
    }
  }
});

it('two iOS jobs: macOS runners are five at a time', () => {
  expect(list('full')).toHaveLength(2);
});

it('reads globs the way the shell does', () => {
  expect(globRegex('.maestro/flows/1[02345]-*.yaml').test('.maestro/flows/13-sitting-memorized.yaml')).toBe(true);
  expect(globRegex('.maestro/flows/1[04]-*.yaml').test('.maestro/flows/12-add-to-day.yaml')).toBe(false);
  expect(globRegex('.maestro/flows/0?-*.yaml').test('.maestro/flows/09-revo.yaml')).toBe(true);
  expect(short('.maestro/flows/09-revo.yaml')).toBe('09-revo');
  expect(short('.maestro/flows/12-add-to-day.yaml')).toBe('12');
});
