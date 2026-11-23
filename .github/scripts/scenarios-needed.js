#!/usr/bin/env node
// Whether a PR needs its scenario run (tests/scenarios). It skips only when every file the PR changes is one the
// suite never reads. ci.yml's `plan` reads the answer: stdin is the PR's file list, one path per line, and it prints
// `true` or `false`.
//
// Conservative on purpose: a path not listed below runs the suite. The suite reads src/, functions/, the root config
// (jest, metro, package.json), the rules and BEHAVIOUR.md (check-spec.js), so none of them is listed. Everything
// listed is also in preview.yml's paths-ignore, so a PR that skips here never makes Preview publish on its own push.
// Publishing still needs the scenarios-passed-<tree> artifact, which only a run that passed uploads.

/** Paths the scenario suite never reads (checked Nov 22 2026: nothing in tests/scenarios refers to them). */
const NEVER_READ = [
  /^docs\//, // the website
  /^store\//, // store listings and screenshots
  /^\.maestro\//, // E2E flows: E2E's own `changes` job decides about those
  /^admin\//, // the Revisely Console
  /^worker\//, // the Cloudflare Worker (tested in Fast checks)
  /^wrangler(\.[a-z]+)?\.jsonc$/,
  /^scripts\/(lint|store|site|site-clips|stats|metrics|sentry|testlab|smoke|record)\//,
  /^scripts\/(asc|play)\.js$/,
];

/** Markdown is never read, except these: BEHAVIOUR.md is checked against the tests, and docs inside code folders run. */
const MARKDOWN = /\.md$/;
const READ_EVEN_IF_MARKDOWN = /^(BEHAVIOUR\.md$|src\/|tests\/|functions\/)/;

function neverRead(file) {
  if (READ_EVEN_IF_MARKDOWN.test(file)) return false;
  return MARKDOWN.test(file) || NEVER_READ.some((re) => re.test(file));
}

/** True unless the list is non-empty and every file in it is one the suite never reads. */
function scenariosNeeded(files) {
  const list = files.map((f) => f.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return !list.every(neverRead);
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    process.stdout.write(String(scenariosNeeded(input.split('\n'))));
  });
}

module.exports = { scenariosNeeded };
