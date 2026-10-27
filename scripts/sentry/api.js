// Small Sentry and GitHub API clients for the health workflows (no dependencies;
// Node 20+ fetch). Pure logic lives in logic.js so it can be tested.
//
// Env: SENTRY_API_TOKEN (read access: Issue & Event, Project, Organization),
// GITHUB_TOKEN and GITHUB_REPOSITORY (owner/repo) for the GitHub side.
//
// Issues and events are read from the environments of installed builds only
// (production, preview; SENTRY_ENVIRONMENTS overrides): development and simulator
// builds don't report, and anything sent under another environment is ignored.

const SENTRY = {
  base: process.env.SENTRY_API_BASE || 'https://sentry.io/api/0',
  org: process.env.SENTRY_ORG || 'revisely',
  project: process.env.SENTRY_PROJECT || 'react-native',
  projectId: process.env.SENTRY_PROJECT_ID || '4511369481945088',
  environments: (process.env.SENTRY_ENVIRONMENTS || 'production,preview')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),
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
  /** Issues matching a search in the reporting environments, most recent first. */
  issues: (query, statsPeriod = '24h', limit = 25) =>
    sentry(`/organizations/${SENTRY.org}/issues/`, {
      project: SENTRY.projectId,
      environment: SENTRY.environments,
      query,
      statsPeriod,
      limit,
      sort: 'date',
    }),
  /** The issue's latest event in the reporting environments. */
  latestEvent: (issueId) =>
    sentry(`/organizations/${SENTRY.org}/issues/${encodeURIComponent(issueId)}/events/latest/`, {
      environment: SENTRY.environments,
    }),
  /**
   * Session totals grouped by release and status (healthy/errored/crashed/abnormal), read from each
   * group's `totals`. Hourly buckets for periods in hours, so "24h" is the last 24 hours rather than
   * whole days; daily buckets for longer periods (the gate's 14 days), to stay within the API's limit.
   */
  sessionsByRelease: ({ environment, statsPeriod = '24h' }) =>
    sentry(`/organizations/${SENTRY.org}/sessions/`, {
      project: SENTRY.projectId,
      field: ['sum(session)', 'count_unique(user)'],
      groupBy: ['release', 'session.status'],
      environment,
      statsPeriod,
      interval: /h$/.test(statsPeriod) ? '1h' : '1d',
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

/** Every page of a GitHub list endpoint (100 a page; stops at 50 pages). */
async function githubAll(path) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; page <= 50; page++) {
    const batch = await github('GET', `${path}${sep}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

const githubApi = {
  /** All issues with a label (open and closed by default), every page. */
  issuesWithLabel: (label, state = 'all') => githubAll(`/issues?labels=${encodeURIComponent(label)}&state=${state}`),
  issue: (number) => github('GET', `/issues/${number}`),
  comments: (number) => githubAll(`/issues/${number}/comments`),
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
