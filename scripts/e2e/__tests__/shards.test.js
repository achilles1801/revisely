// Every flow runs in a full E2E run: each file in .maestro/flows is in exactly one of e2e.yml's
// `full` jobs. Flows 12 and 13 were in none for a day (Nov 7–8 2026): develop's pushes, PRs into
// main and the nightly run never ran them, and nothing said so. It caught 15 the same way.
//
// And every full job ends inside its time limit. When 09 grew to five files, the iOS job holding it
// needed about 100 minutes of flows: #217's run 42619006611 hit the 90-minute limit twice, before
// flows 11 and 16 had run, and only the job's timeout said so.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8');
const minutes = require('../flow-minutes.json');
const flows = fs
  .readdirSync(path.join(root, '.maestro/flows'))
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => `.maestro/flows/${f}`)
  .sort();

// A job's minutes before and after its flows: setup (the cached build, the JavaScript, the
// emulators), the warm-up, and keeping the results. #217's run 42619006611 measured iOS at 12.7
// and 16.8 (its re-run waited on GitHub's cache service), Android at 3.5 and 7.9.
const OVERHEAD = { ios: 17, android: 9 };

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

// A job's flows in the order it runs them: each glob in turn, its matches sorted, as the shell
// expands them for run.sh. A flow two globs match comes twice, which the one-job check reports.
const flowsOf = (job) =>
  job.flows
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((glob) => flows.filter((f) => globRegex(glob).test(f)));
const base = (flow) => path.basename(flow, '.yaml');

/** A flow in a job's name: its number, or its file's name where several share the number (09). */
function short(flow) {
  const number = base(flow).slice(0, 2);
  const shared = flows.filter((f) => path.basename(f).startsWith(`${number}-`)).length > 1;
  return shared ? base(flow) : number;
}

/**
 * The `timeout-minutes` of e2e.yml's job `ios` or `android`: a number, or
 * `${{ inputs.repeat == '2' && <twice> || <once> }}` (each flow run twice, for a change to shared test code).
 */
function limit(job, repeat = 1) {
  const at = workflow.indexOf(`\n  ${job}:\n`);
  if (at < 0) throw new Error(`e2e.yml has no job ${job}`);
  const line = /\n    timeout-minutes: ([^\n]+)\n/.exec(workflow.slice(at));
  if (!line) throw new Error(`e2e.yml's job ${job} has no timeout-minutes`);
  const plain = /^(\d+)$/.exec(line[1]);
  if (plain) return Number(plain[1]);
  const either = /^\$\{\{ inputs\.repeat == '2' && (\d+) \|\| (\d+) \}\}$/.exec(line[1]);
  if (!either) throw new Error(`e2e.yml's job ${job}: timeout-minutes '${line[1]}' isn't read here`);
  return Number(repeat === 2 ? either[1] : either[2]);
}

it('puts every flow in exactly one job of a full run', () => {
  const jobs = fullJobs();
  const where = new Map(flows.map((f) => [f, []]));
  for (const job of jobs) for (const f of flowsOf(job)) where.get(f).push(job.name);
  const missing = flows.filter((f) => where.get(f).length === 0);
  const twice = flows.filter((f) => where.get(f).length > 1);
  expect({ missing, twice }).toEqual({ missing: [], twice: [] });
});

it('names each job by the flows it runs, in the order it runs them', () => {
  for (const job of fullJobs()) expect(job.name).toBe(flowsOf(job).map(short).join(' '));
});

it('knows how long every flow takes on each platform (scripts/e2e/flow-minutes.json)', () => {
  const unknown = [];
  for (const platform of ['ios', 'android']) {
    for (const f of flows) if (!(minutes[platform][base(f)] > 0)) unknown.push(`${platform} ${base(f)}`);
  }
  expect(unknown).toEqual([]);
});

// Each job, with every flow as slow as it has ever passed and its longest flow run a second time
// (run.sh's one retry), still ends inside its limit.
it.each(['ios', 'android'])('%s: every full job fits its time limit with a retry to spare', (platform) => {
  const over = [];
  for (const job of fullJobs()) {
    const each = flowsOf(job).map((f) => minutes[platform][base(f)]);
    const total = OVERHEAD[platform] + each.reduce((a, b) => a + b, 0) + Math.max(...each);
    if (total > limit(platform)) over.push(`${job.name}: ${total} of ${limit(platform)} minutes`);
  }
  expect(over).toEqual([]);
});

// Each flow run twice, with no reruns (a change to shared test code that every flow uses: run.sh,
// e2e.yml, ci.yml), as slow as each has passed.
it.each(['ios', 'android'])('%s: every full job fits its limit when each flow runs twice', (platform) => {
  const over = [];
  for (const job of fullJobs()) {
    const each = flowsOf(job).map((f) => minutes[platform][base(f)]);
    const total = OVERHEAD[platform] + 2 * each.reduce((a, b) => a + b, 0);
    if (total > limit(platform, 2)) over.push(`${job.name}: ${total} of ${limit(platform, 2)} minutes`);
  }
  expect(over).toEqual([]);
});

it('reads globs the way the shell does', () => {
  expect(globRegex('.maestro/flows/1[02345]-*.yaml').test('.maestro/flows/13-sitting-memorized.yaml')).toBe(true);
  expect(globRegex('.maestro/flows/1[04]-*.yaml').test('.maestro/flows/12-add-to-day.yaml')).toBe(false);
  expect(globRegex('.maestro/flows/0?-*.yaml').test('.maestro/flows/09-revo.yaml')).toBe(true);
  expect(short('.maestro/flows/09-revo.yaml')).toBe('09-revo');
  expect(short('.maestro/flows/12-add-to-day.yaml')).toBe('12');
});

it('reads the time limits from e2e.yml', () => {
  for (const platform of ['ios', 'android']) {
    expect(limit(platform)).toBeGreaterThanOrEqual(60);
    expect(limit(platform, 2)).toBeGreaterThanOrEqual(limit(platform));
  }
});
