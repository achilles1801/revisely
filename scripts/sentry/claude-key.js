#!/usr/bin/env node
// Checks the Claude key the fix workflow uses (ANTHROPIC_API_KEY, a repository secret from the
// Anthropic Console; it expires, see CLAUDE_KEY_EXPIRES and CLAUDE.md "Health"). If Anthropic rejects
// it, opens (or comments on) a GitHub issue mentioning the owner and exits non-zero, so a dead key is
// noticed instead of a fix silently not happening. Close to its expiry date, opens a reminder issue.
//
//   node claude-key.js              daily (health-report.yml): rejected → issue + exit 1; expiring → issue
//   node claude-key.js --issue 12   before Claude runs (claude-fix.yml): rejected → also say so on #12
//
// Env: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN (the alternative; not checkable here), GITHUB_TOKEN,
// GITHUB_REPOSITORY, MENTION, CLAUDE_KEY_EXPIRES (YYYY-MM-DD).

const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=1';
const LABEL = 'automation';
const TITLE_REJECTED = 'Claude key rejected (ANTHROPIC_API_KEY)';
const TITLE_EXPIRING = 'Claude key expires soon (ANTHROPIC_API_KEY)';
const REMIND_DAYS = 30;

/** 'ok' | 'rejected' | 'missing' | 'unknown (<status or error>)'. Never prints the key. */
async function keyStatus(key, fetchImpl = fetch) {
  if (!key) return 'missing';
  try {
    const res = await fetchImpl(MODELS_URL, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'rejected';
    return `unknown (${res.status})`;
  } catch (err) {
    return `unknown (${err && err.name ? err.name : 'error'})`;
  }
}

/** Days from `now` until the key expires (UTC midnight of `expires`), or null if unset or invalid. */
function daysToExpiry(expires, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires || '')) return null;
  const end = Date.parse(`${expires}T00:00:00Z`);
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

const ROTATE = 'Rotate it: CLAUDE.md, "Health" → "Rotating the Claude key" (a new key in the Anthropic Console workspace, then the `ANTHROPIC_API_KEY` repository secret).';

async function openOrComment(githubApi, title, body, log) {
  const open = await githubApi.issuesWithLabel(LABEL, 'open');
  const existing = open.find((i) => i.title === title && !i.pull_request);
  if (existing) {
    await githubApi.comment(existing.number, body);
    log(`Commented on #${existing.number}`);
    return existing.number;
  }
  await githubApi.ensureLabel(LABEL, 'b60205', 'Problems with the automation itself');
  const created = await githubApi.createIssue(title, body, [LABEL]);
  log(`Opened #${created.number}`);
  return created.number;
}

async function run({ env = process.env, argv = process.argv, fetchImpl = fetch, githubApi, now = new Date(), log = console.log }) {
  const at = argv.indexOf('--issue');
  const issue = at > 0 ? Number(argv[at + 1]) : null;
  const mention = env.MENTION ? `${env.MENTION} ` : '';
  const status = await keyStatus(env.ANTHROPIC_API_KEY, fetchImpl);
  log(`Claude key: ${status}`);

  if (status === 'missing') {
    if (env.CLAUDE_CODE_OAUTH_TOKEN) return 0; // the subscription token is used instead
    log('::warning::No ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN) repository secret: Claude fixes cannot run.');
    return issue ? 1 : 0;
  }
  if (status === 'rejected') {
    const body = `${mention}Anthropic rejected the \`ANTHROPIC_API_KEY\` repository secret (expired or revoked), so Claude fixes can't run. ${ROTATE}`;
    const number = await openOrComment(githubApi, TITLE_REJECTED, body, log);
    if (issue) {
      await githubApi.comment(issue, `Claude couldn't start: the Claude key was rejected (see #${number}). Nothing was changed.`);
    }
    log('::error::The Claude key (ANTHROPIC_API_KEY) was rejected.');
    return 1;
  }
  if (status !== 'ok') {
    // Anthropic unreachable or erroring: not the key's fault; say so without opening issues.
    log(`::warning::Couldn't check the Claude key: ${status}.`);
    return 0;
  }
  const days = daysToExpiry(env.CLAUDE_KEY_EXPIRES, now);
  if (!issue && days !== null && days <= REMIND_DAYS) {
    const open = await githubApi.issuesWithLabel(LABEL, 'open');
    if (!open.some((i) => i.title === TITLE_EXPIRING)) {
      const when = days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : 'now';
      await openOrComment(
        githubApi,
        TITLE_EXPIRING,
        `${mention}The Claude key (\`ANTHROPIC_API_KEY\`) expires on ${env.CLAUDE_KEY_EXPIRES} (${when}). ${ROTATE} Then set CLAUDE_KEY_EXPIRES in .github/workflows/health-report.yml to the new date and close this issue.`,
        log,
      );
    }
  }
  return 0;
}

module.exports = { keyStatus, daysToExpiry, run, TITLE_REJECTED, TITLE_EXPIRING };

if (require.main === module) {
  const { githubApi } = require('./api');
  run({ githubApi })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}
