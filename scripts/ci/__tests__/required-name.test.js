// The check branch protection requires is named by what the run tested (ci.yml, job `required`). GitHub
// matches a required check by name on the commit, from any run, so a run that tested less must post
// another name: a draft's run (no E2E) "Required (draft)", and only a full run on a PR into main
// "Release gate". #496 merged into main, and #499 into develop, on checks from lighter runs (Nov 10 2026).
// A PR whose commits another open PR into develop holds runs no E2E (`layers`): "Required (under #N)", so
// it merges with #N, or alone once #N's run has passed (`pass-lower`). Whether the PR is a draft is
// GitHub's answer when the run starts (`live` in plan), not the event's: on #674 the push's draft payload
// outlived `gh pr ready` (Nov 16 2026).
// Here the job's name expression is evaluated for each kind of run.

const fs = require('fs');
const path = require('path');

const ci = fs.readFileSync(path.join(__dirname, '..', '..', '..', '.github', 'workflows', 'ci.yml'), 'utf8');
// The value is quoted in YAML: unquoted, the " #" of "(under #N)" would start a comment.
const expr = ci.match(/\n  required:\n(?:    #.*\n)*    name: "?\$\{\{ (.+) \}\}"?\n/)[1];

/** GitHub's format(): {0}, {1}… replaced by the arguments. */
const format = (text, ...args) => text.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));

/** The expression as JavaScript: GitHub's && and || pick values the same way; == compares strings. */
function nameFor({ draft = false, payloadDraft = draft, base = '', stackBase = '', ios = 'none', android = 'none', upper = '' }) {
  const github = { base_ref: base, event: { pull_request: { draft: payloadDraft, stack: { base: { ref: stackBase } } } } };
  // The plan's output is a string, empty outside pull requests.
  const needs = { plan: { outputs: { ios, android, upper, draft: base ? String(draft) : '' } } };
  // eslint-disable-next-line no-new-func
  return new Function('github', 'needs', 'format', `return (${expr.replace(/([!=])=/g, '$1==')});`)(github, needs, format);
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

it('follows whether the PR is a draft now, not what the event said', () => {
  // The push's run of #674 carried draft: true after `gh pr ready`; it planned and posted as a draft.
  expect(nameFor({ base: 'develop', draft: false, payloadDraft: true, android: 'smoke' })).toBe('Required');
  expect(nameFor({ base: 'develop', draft: true, payloadDraft: false })).toBe('Required (draft)');
});

it('names a PR another PR holds "Required (under #N)", so it merges with that PR', () => {
  expect(nameFor({ base: 'develop', upper: '659' })).toBe('Required (under #659)');
  expect(nameFor({ draft: true, base: 'develop', upper: '659' })).toBe('Required (draft)');
  expect(nameFor({ base: 'develop', upper: '', android: 'smoke' })).toBe('Required');
});
