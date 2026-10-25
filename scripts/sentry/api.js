// Small Sentry and GitHub API clients for the health workflows (no dependencies;
// Node 20+ fetch). Pure logic lives in logic.js so it can be tested.
//
// Env: SENTRY_API_TOKEN (read access: Issue & Event, Project, Organization),
// GITHUB_TOKEN and GITHUB_REPOSITORY (owner/repo) for the GitHub side.

const SENTRY = {
  base: process.env.SENTRY_API_BASE || 'https://sentry.io/api/0',
  org: process.env.SENTRY_ORG || 'revisely',
  project: process.env.SENTRY_PROJECT || 'react-native',
  projectId: process.env.SENTRY_PROJECT_ID || '4511369481945088',
};

async function sentry(path, params = {}) {
  const token = process.env.SENTRY_API_TOKEN;
  if (!token) throw new Error('SENTRY_API_TOKEN is not set');
  const url = new URL(`${SENTRY.base}${path}`);
  for (const [k, v] of Object.entries(params)) {
    for (const one of Array.isArray(v) ? v : [v]) if (one != null) url.searchParams.append(k, String(one));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sentry ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const sentryApi = {
  /** Issues matching a search, most recent first. */
  issues: (query, statsPeriod = '24h', limit = 25) =>
    sentry(`/projects/${SENTRY.org}/${SENTRY.project}/issues/`, { query, statsPeriod, limit, sort: 'date' }),
  latestEvent: (issueId) => sentry(`/organizations/${SENTRY.org}/issues/${issueId}/events/latest/`),
  /** Session totals grouped by release and status (healthy/errored/crashed/abnormal). */
  sessionsByRelease: ({ environment, statsPeriod = '24h' }) =>
    sentry(`/organizations/${SENTRY.org}/sessions/`, {
      project: SENTRY.projectId,
      field: ['sum(session)', 'count_unique(user)'],
      groupBy: ['release', 'session.status'],
      environment,
      statsPeriod,
      interval: '1d',
    }),
};

async function github(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY must be set');
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json();
}

const githubApi = {
  /** Open and closed issues with a label (up to 100, newest first). */
  issuesWithLabel: (label, state = 'all') =>
    github('GET', `/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=100`),
  createIssue: (title, body, labels) => github('POST', '/issues', { title, body, labels }),
  comment: (number, body) => github('POST', `/issues/${number}/comments`, { body }),
  reopen: (number) => github('PATCH', `/issues/${number}`, { state: 'open' }),
  ensureLabel: async (name, color, description) => {
    try {
      await github('POST', '/labels', { name, color, description });
    } catch (err) {
      if (!String(err.message).includes('422')) throw err; // 422: exists already
    }
  },
};

module.exports = { SENTRY, sentryApi, githubApi };
