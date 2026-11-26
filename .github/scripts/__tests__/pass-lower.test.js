// Which PRs a passed run marks "Required" (.github/scripts/pass-lower.js), and when ci.yml's `pass-lower`
// job runs at all. The rule: a PR into develop whose commits another open PR holds is "Required (under #N)"
// (`layers`), and #N's passed run passes it, so two separate PRs, one holding the other's commits, no longer
// keep the lower one waiting for the upper to merge (Nov 16 2026).

const fs = require('fs');
const path = require('path');
const { choose, isRequired } = require('../pass-lower');

const L = 'a'.repeat(40);
const L2 = 'b'.repeat(40);
const open = (checks = [], head = L) => ({ state: 'open', head, checks });
const check = (name, conclusion, status = 'completed') => ({ name, status, conclusion });

describe('choose', () => {
  it('passes an open lower PR still at the commit this run tested, whose own run was cancelled', () => {
    // The usual case: the upper's run cancelled the lower's (`supersede`).
    const [c] = choose([{ number: 12, sha: L }], { 12: open([check('Required (under #13)', 'cancelled')]) });
    expect(c).toMatchObject({ number: 12, pass: true });
  });

  it("passes one whose own run passed, or is still going, or that has none", () => {
    const got = choose(
      [{ number: 1, sha: L }, { number: 2, sha: L }, { number: 3, sha: L }],
      {
        1: open([check('Required (under #9)', 'success')]),
        2: open([check('Required (under #9)', null, 'in_progress')]),
        3: open([check('E2E', 'success')]),
      },
    );
    expect(got.map((c) => c.pass)).toEqual([true, true, true]);
  });

  it("doesn't pass one whose own fast checks or scenarios failed: this run may have tested a fix above it", () => {
    const [c] = choose([{ number: 12, sha: L }], { 12: open([check('Required (under #13)', 'failure')]) });
    expect(c).toMatchObject({ pass: false, why: 'its own run failed ("Required (under #13)")' });
  });

  it("doesn't pass one with new commits, a closed one, one it couldn't read, or one already passed", () => {
    const got = choose(
      [{ number: 1, sha: L }, { number: 2, sha: L }, { number: 3, sha: L }, { number: 4, sha: L }],
      {
        1: open([], L2),
        2: { state: 'closed', head: L, checks: [] },
        4: open([check('Required', 'success')]),
      },
    );
    expect(got.map((c) => [c.pass, c.why])).toEqual([
      [false, 'it has new commits: its own run tests them'],
      [false, 'closed'],
      [false, "couldn't read it"],
      [false, 'already passed'],
    ]);
  });

  it('reads only the CI checks named Required', () => {
    expect(['Required', 'Required (draft)', 'Required (under #659)'].every(isRequired)).toBe(true);
    expect(['Release gate', 'Fast checks', 'E2E (partial run)', 'Requiredness'].some(isRequired)).toBe(false);
    // Another workflow's failed check doesn't hold a lower PR back.
    const [c] = choose([{ number: 1, sha: L }], { 1: open([check('Behaviour spec', 'failure')]) });
    expect(c.pass).toBe(true);
  });
});

describe("ci.yml's pass-lower job", () => {
  const ci = fs.readFileSync(path.join(__dirname, '..', '..', 'workflows', 'ci.yml'), 'utf8');
  const expr = ci.match(/\n  pass-lower:\n(?:    .*\n)*?    if: \$\{\{ (.+) \}\}\n/)[1];

  /** The job's `if:` as JavaScript (== and != compare strings in GitHub's expressions too). */
  function runs({ event = 'pull_request', draft = 'false', upper = '', lower = `[{"number":12,"sha":"${L}"}]`, required = 'success', runCancelled = false }) {
    const github = { event_name: event };
    const needs = { plan: { outputs: { draft, upper, lower } }, required: { result: required } };
    const cancelled = () => runCancelled;
    // eslint-disable-next-line no-new-func
    return new Function('github', 'needs', 'cancelled', `return (${expr.replace(/([!=])=/g, '$1==')});`)(github, needs, cancelled);
  }

  it('runs after a passed run of the PR on top, with PRs under it', () => {
    expect(runs({})).toBe(true);
  });

  it('runs after a skipped job: its own status function, not the success() GitHub would add', () => {
    // Without one, success() is false when any job before it was skipped, and `scenarios-wait` is skipped on
    // almost every PR: until Nov 26 2026 the job never ran (#1010's green run gave #987, under it, no Required).
    expect(expr).toMatch(/^!cancelled\(\) && /);
    expect(runs({ runCancelled: true })).toBe(false);
  });

  it("doesn't run for a draft, a PR that is itself under another, one with nothing under it, or a failed run", () => {
    expect(runs({ draft: 'true' })).toBe(false);
    expect(runs({ upper: '14' })).toBe(false);
    expect(runs({ lower: '[]' })).toBe(false);
    expect(runs({ lower: '' })).toBe(false);
    expect(runs({ required: 'failure' })).toBe(false);
    expect(runs({ event: 'push' })).toBe(false);
  });
});
