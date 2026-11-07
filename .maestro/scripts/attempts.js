#!/usr/bin/env node
// Writes <platform results>/attempts.json from run.sh's attempts.tsv and each
// attempt's Maestro report (report.xml, JUnit): every flow's attempts, whether
// each passed, how long it took, and why a failed one failed. The workflow keeps
// it (e2e-<platform>-attempts-…) for the weekly flake report (scripts/e2e/flakes.js).
//
//   node .maestro/scripts/attempts.js .maestro/build/results/android

const fs = require('fs');
const path = require('path');

const XML = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const unxml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return XML[e] ?? m;
  });
const clean = (s) => unxml(s).replace(/\s+/g, ' ').trim().slice(0, 300);

/** Why an attempt failed: Maestro's JUnit failure, else its log's last [Failed] line. */
function reasonOf(folder) {
  try {
    const xml = fs.readFileSync(path.join(folder, 'report.xml'), 'utf8');
    const m = /<failure(?:\s+message="([^"]*)")?[^>]*?(?:\/>|>([\s\S]*?)<\/failure>)/.exec(xml);
    if (m && (m[2] || m[1])) return clean(m[2] || m[1]);
  } catch {}
  try {
    const log = fs.readFileSync(path.join(folder, 'maestro.log'), 'utf8').split('\n');
    const failed = log.filter((l) => /\[Failed\]/.test(l)).pop();
    if (failed) return clean(failed.replace(/^.*\[Failed\]\s*/, ''));
  } catch {}
  return 'no report from Maestro (stopped at the time limit, or it crashed)';
}

function build(dir, env = process.env) {
  const platform = path.basename(dir);
  const flows = new Map();
  const tsv = fs.readFileSync(path.join(dir, 'attempts.tsv'), 'utf8');
  for (const line of tsv.split('\n')) {
    if (!line.trim()) continue;
    const [flow, zone, attempt, outcome, secs, folder] = line.split('\t');
    if (!flows.has(flow)) flows.set(flow, { flow, zone, attempts: [] });
    const a = { attempt: Number(attempt), passed: outcome === 'passed', secs: Number(secs) };
    if (!a.passed) a.reason = reasonOf(path.join(dir, folder));
    flows.get(flow).attempts.push(a);
  }
  const server = env.GITHUB_SERVER_URL || 'https://github.com';
  return {
    version: 1,
    platform,
    run: env.GITHUB_RUN_ID
      ? {
          id: Number(env.GITHUB_RUN_ID),
          attempt: Number(env.GITHUB_RUN_ATTEMPT || 1),
          workflow: env.GITHUB_WORKFLOW || '',
          event: env.GITHUB_EVENT_NAME || '',
          branch: env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || '',
          sha: env.GITHUB_SHA || '',
          url: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
        }
      : null,
    at: new Date().toISOString(),
    flows: [...flows.values()].map((f) => ({
      ...f,
      firstAttemptPassed: f.attempts[0]?.passed === true,
      passed: f.attempts.some((a) => a.passed),
    })),
  };
}

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.maestro/build/results');
  const out = build(dir);
  fs.writeFileSync(path.join(dir, 'attempts.json'), JSON.stringify(out, null, 2) + '\n');
  const flaky = out.flows.filter((f) => f.passed && !f.firstAttemptPassed).map((f) => f.flow);
  console.log(`attempts.json: ${out.flows.length} flows${flaky.length ? `, passed on a retry: ${flaky.join(', ')}` : ''}`);
}

module.exports = { build, reasonOf };
