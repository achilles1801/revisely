// The check branch protection requires is named by what the run tested (ci.yml, job `required`). GitHub
// matches a required check by name on the commit, from any run, so a run that tested less must post
// another name: a draft's run (no E2E) "Required (draft)", and only a full run on a PR into main
// "Release gate". #496 merged into main, and #499 into develop, on checks from lighter runs (Nov 10 2026).
// Here the job's name expression is evaluated for each kind of run.

const fs = require('fs');
const path = require('path');

const ci = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
const expr = ci.match(/\n  required:\n(?:    #.*\n)*    name: \$\{\{ (.+) \}\}\n/)[1];

/** The expression as JavaScript: GitHub's && and || pick values the same way; == compares strings. */
function nameFor({ draft = false, base = '', stackBase = '', ios = 'none', android = 'none' }) {
  const github = { base_ref: base, event: { pull_request: { draft, stack: { base: { ref: stackBase } } } } };
  const needs = { plan: { outputs: { ios, android } } };
  // eslint-disable-next-line no-new-func
  return new Function('github', 'needs', `return (${expr.replace(/==/g, '===')});`)(github, needs);
}

it('names the check by what the run tested', () => {
  expect(nameFor({ base: 'develop', android: 'smoke' })).toBe('Required');
  expect(nameFor({ draft: true, base: 'develop' })).toBe('Required (draft)');
  expect(nameFor({ draft: true, base: 'main', ios: 'full', android: 'full' })).toBe('Required (draft)');
  expect(nameFor({ base: 'main', ios: 'full', android: 'full' })).toBe('Release gate');
  // A lower layer of a stack into main runs the fast checks only.
  expect(nameFor({ base: 'layer-1', stackBase: 'main' })).toBe('Required');
  // develop's push run: no pull request.
  expect(nameFor({ ios: 'build', android: 'full' })).toBe('Required');
});
