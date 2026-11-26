// ci.yml's `pass-lower` gives "Required" to the PRs whose commits a passed run tested. A job's `if` with no
// status function gets GitHub's success() added, which is false when any job before it was skipped, even one
// it doesn't need itself: `required` needs `scenarios-wait`, which is skipped on almost every PR. So the job
// never ran (100 PR runs, Nov 26 2026: #1010's run passed and #987, which it held, never got its check).

const fs = require('fs');
const path = require('path');

const ci = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');

/** A job's `if` expression, from its block in ci.yml. */
function jobIf(job) {
  const block = ci.split(new RegExp(`\\n  ${job}:\\n`))[1].split(/\n  [\w-]+:\n/)[0];
  return block.match(/\n    if: \$\{\{ (.+) \}\}\n/)[1];
}

it('runs after a skipped job, and only once `required` has passed', () => {
  const cond = jobIf('pass-lower');
  expect(cond).toMatch(/^!cancelled\(\) && /);
  expect(cond).toContain("needs.required.result == 'success'");
});
