#!/usr/bin/env node
// The daily health report's reminder for the token Revisely Dev's builds read the private engine with
// (RECITE_CORE_TOKEN, handbook/dev-stack.md, "The private engine"). A fine-grained token expires and GitHub can't say when to a
// workflow, so its date is the repository variable RECITE_CORE_EXPIRES (YYYY-MM-DD). From 30 days before it, this opens
// one issue. It never sees the token itself. Unset: nothing to remind about.
//
// Environment: GITHUB_TOKEN, GITHUB_REPOSITORY, MENTION, RECITE_CORE_EXPIRES.
const { daysToExpiry } = require('./claude-key');

const LABEL = 'automation';
const TITLE = 'Engine build token expires soon (RECITE_CORE_TOKEN)';
const REMIND_DAYS = 30;

async function run({ env = process.env, githubApi, now = new Date(), log = console.log }) {
  const days = daysToExpiry(env.RECITE_CORE_EXPIRES, now);
  if (days === null || days > REMIND_DAYS) {
    log(days === null ? 'No expiry date set.' : `The engine build token has ${days} days left.`);
    return 0;
  }
  const open = await githubApi.issuesWithLabel(LABEL, 'open');
  if (open.some((i) => i.title === TITLE && !i.pull_request)) return 0;
  const when = days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : 'now';
  const mention = env.MENTION ? `${env.MENTION} ` : '';
  await githubApi.ensureLabel(LABEL, 'b60205', 'Problems with the automation itself');
  const issue = await githubApi.createIssue(
    TITLE,
    `${mention}The token Revisely Dev's builds use to fetch the on-device engine (\`RECITE_CORE_TOKEN\`) expires on ${env.RECITE_CORE_EXPIRES} (${when}). Without it, Dev builds fall back to the stub and takes go to the server. Rotate it: handbook/dev-stack.md, "The private engine". Then set the repository variable \`RECITE_CORE_EXPIRES\` to the new date and close this issue.`,
    [LABEL],
  );
  log(`Opened #${issue.number}`);
  return 0;
}

module.exports = { run, TITLE };

if (require.main === module) {
  const { githubApi } = require('./api');
  run({ githubApi })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
