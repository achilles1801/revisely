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

// A change to shared test code runs the flows it touches, once with a retry (ci.yml `plan`, `infra`). The
// jobs come from e2e.yml's `infra_jq`, run here with jq as the workflow runs it. They used to be two
// jobs whatever the flows: #574 touched 21 flows through signup.yaml, and its iOS job of 11 needed
// about 200 of its 180 minutes (run 43706009559).
describe('the jobs for a change to shared test code', () => {
  const { execFileSync } = require('child_process');
  const { affected } = require('../../../.github/scripts/affected-flows');

  function infraProgram() {
    const lines = workflow.split('\n');
    const start = lines.findIndex((l) => /^\s*infra_jq='/.test(l));
    if (start < 0) throw new Error("e2e.yml has no infra_jq='…'");
    const end = lines.findIndex((l, i) => i > start && /'$/.test(l));
    const body = lines.slice(start, end + 1).join('\n');
    return body.slice(body.indexOf("'") + 1, body.lastIndexOf("'"));
  }

  const infraJobs = (touched) =>
    JSON.parse(
      execFileSync('jq', ['-cn', '--arg', 'f', touched.join(' '), '--argjson', 'full', JSON.stringify(fullJobs()), infraProgram()], {
        encoding: 'utf8',
      }),
    ).map((job) => job.flows.split(' '));

  // Each touched flow once, each job a full job's flows in its order with only the touched ones
  // kept, and each job inside its limit with its longest flow run a second time (run.sh's retry).
  function check(touched) {
    const jobs = infraJobs(touched);
    expect(jobs.flat().sort()).toEqual([...touched].sort());
    for (const job of jobs) {
      const full = fullJobs().find((j) => flowsOf(j).includes(job[0]));
      expect(job).toEqual(flowsOf(full).filter((f) => touched.includes(f)));
    }
    for (const platform of ['ios', 'android']) {
      const over = jobs
        .map((job) => {
          const each = job.map((f) => minutes[platform][base(f)]);
          return { job, total: OVERHEAD[platform] + each.reduce((a, b) => a + b, 0) + Math.max(...each) };
        })
        .filter(({ total }) => total > limit(platform))
        .map(({ job, total }) => `${job.map(short).join(' ')}: ${total} of ${limit(platform)} minutes`);
      expect({ platform, over }).toEqual({ platform, over: [] });
    }
    return jobs;
  }

  it("runs five flows or fewer in one job, in the full run's order with 10 first, inside its limit even for the five slowest", () => {
    const five = flows.slice(0, 5);
    const [job] = infraJobs(five);
    expect(infraJobs(five)).toHaveLength(1);
    expect([...job].sort()).toEqual([...five].sort());
    const order = fullJobs().flatMap(flowsOf);
    expect(job).toEqual([...five].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(infraJobs(flows.slice(5, 6))).toEqual([flows.slice(5, 6)]);
    // 10 deletes its account: after the 09 seeds it took past the app's 30 s (#217), so it goes first.
    const seeds = flows.filter((f) => /\/(09-activity|09-insights|10-)/.test(f));
    expect(seeds.length).toBeLessThanOrEqual(5);
    expect(short(infraJobs([...seeds].reverse())[0][0])).toBe('10');
    for (const platform of ['ios', 'android']) {
      const each = [...flows].map((f) => minutes[platform][base(f)]).sort((a, b) => b - a).slice(0, 5);
      const total = OVERHEAD[platform] + each.reduce((a, b) => a + b, 0) + each[0];
      expect({ platform, total, fits: total <= limit(platform) }).toEqual({ platform, total, fits: true });
    }
  });

  // A change to the workflows runs the smoke set on iOS (affected-flows.js): one macOS job, not three.
  // With a flow the same PR edits (18), still one.
  it('runs the smoke set in one job, and the smoke set with one more flow', () => {
    const smoke = affected(['.github/workflows/e2e.yml']).ios;
    expect(smoke.map(short)).toEqual(['02', '04', '05', '06']);
    expect(infraJobs(smoke)).toHaveLength(1);
    const withEighteen = affected(['.github/workflows/e2e.yml', '.maestro/flows/18-recite-live.yaml']).ios;
    expect(withEighteen.map(short)).toEqual(['02', '04', '05', '06', '18']);
    expect(infraJobs(withEighteen)).toHaveLength(1);
  });

  it('runs more in the full jobs, keeping only the flows touched, each job inside its limit', () => {
    expect(check(flows)).toEqual(fullJobs().map(flowsOf));
    check(flows.filter((_, i) => i % 3 !== 0));
    check(flows.slice(0, 6));
  });

  it("fits the flows the sign-up's subflows touch (#574)", () => {
    const touched = affected(['.maestro/subflows/signup.yaml', '.maestro/subflows/type-in-field.yaml']).flows;
    expect(touched.length).toBeGreaterThan(3);
    check(touched);
  });

  it('still runs a flow that is in no full job', () => {
    const jobs = infraJobs([...flows.slice(0, 4), '.maestro/flows/99-new.yaml']);
    expect(jobs.flat()).toContain('.maestro/flows/99-new.yaml');
  });
});
