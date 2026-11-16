// The PRs under this one (`lower` in ci.yml's plan: open PRs into develop whose commits this PR's branch
// holds) plan no E2E, and their check is "Required (under #N)". Once this PR's run has passed, which tested
// their commits with its own, each gets the check "Required" on its head (the `pass-lower` job), so it can
// merge on its own as well as with this PR. From #676 until Nov 16 2026 a lower PR merged only with the PR
// above it: two separate PRs into develop, one of which happened to hold the other's commits, kept the lower
// one waiting until the upper merged, and the upper's run had cancelled the lower's.
//
//   LOWER='[{"number":12,"sha":"…"}]' UPPER_PR=13 RUN_URL=… REPO=owner/name node .github/scripts/pass-lower.js
//
// A lower PR is passed only while it is open, its head is still the commit this run tested, and no run of
// its own has failed on that commit (its fast checks and scenarios ran on its commits alone).

const { execFileSync } = require('child_process');

/** A check of this repository's CI on a commit: "Required", "Required (draft)", "Required (under #N)". */
const isRequired = (name) => name === 'Required' || /^Required \(/.test(name);
const FAILED = new Set(['failure', 'timed_out', 'action_required']);

/**
 * What to do with each lower PR.
 * @param {{number: number, sha: string}[]} lower
 * @param {Record<number, {state: string, head: string, checks: {name: string, status: string, conclusion: string | null}[]} | undefined>} live
 * @returns {{number: number, sha: string, pass: boolean, why: string}[]}
 */
function choose(lower, live) {
  return lower.map(({ number, sha }) => {
    const pr = live[number];
    const out = (pass, why) => ({ number, sha, pass, why });
    if (!pr) return out(false, "couldn't read it");
    if (pr.state !== 'open') return out(false, 'closed');
    if (pr.head !== sha) return out(false, 'it has new commits: its own run tests them');
    const checks = pr.checks.filter((c) => isRequired(c.name));
    if (checks.some((c) => c.name === 'Required' && c.conclusion === 'success')) return out(false, 'already passed');
    const failed = checks.find((c) => c.status === 'completed' && FAILED.has(c.conclusion));
    if (failed) return out(false, `its own run failed ("${failed.name}")`);
    return out(true, "this run tested its commits and passed");
  });
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function main() {
  const { REPO, UPPER_PR, RUN_URL } = process.env;
  const lower = JSON.parse(process.env.LOWER || '[]').filter(
    (l) => Number.isInteger(l.number) && /^[0-9a-f]{40}$/.test(l.sha),
  );
  const live = {};
  for (const { number, sha } of lower) {
    try {
      const pr = JSON.parse(gh(['api', `repos/${REPO}/pulls/${number}`, '--jq', '{state, head: .head.sha}']));
      const checks = JSON.parse(
        gh(['api', `repos/${REPO}/commits/${sha}/check-runs?per_page=100`, '--jq', '[.check_runs[] | {name, status, conclusion}]']),
      );
      live[number] = { ...pr, checks };
    } catch {
      // Left out: choose() says it couldn't be read.
    }
  }
  for (const c of choose(lower, live)) {
    if (!c.pass) {
      console.log(`#${c.number} (${c.sha.slice(0, 8)}): not passed, ${c.why}.`);
      continue;
    }
    try {
      gh([
        'api', '-X', 'POST', `repos/${REPO}/check-runs`,
        '-f', 'name=Required', '-f', `head_sha=${c.sha}`, '-f', 'status=completed', '-f', 'conclusion=success',
        '-f', `details_url=${RUN_URL}`,
        '-f', `output[title]=Tested in #${UPPER_PR}'s run`,
        '-f', `output[summary]=#${UPPER_PR}'s branch holds this commit, and its CI run, which tested it with #${UPPER_PR}'s own commits, passed: ${RUN_URL}`,
      ]);
      console.log(`::notice title=CI::#${c.number} passed: this run tested its commits (${c.sha.slice(0, 8)}).`);
    } catch (e) {
      console.log(`::warning title=CI::Couldn't pass #${c.number}: ${String(e.stderr || e.message).trim()}`);
    }
  }
}

module.exports = { choose, isRequired };

if (require.main === module) main();
