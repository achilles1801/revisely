// A GET from this repository's GitHub REST API, as CI's report scripts make them
// (scripts/ci/wait-times.js, scripts/e2e/flakes.js). A gateway error (502, 503,
// 504) is GitHub's for a moment, not the request's: it is tried again twice, after
// 2 s and 5 s, before the script fails. One 502 failed the "E2E flake report" of
// stack #510–#512 (Nov 10 2026). Any other status fails at once.

const GATEWAY = new Set([502, 503, 504]);
const WAITS_MS = [2000, 5000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `path` under /repos/<GITHUB_REPOSITORY>. Returns the parsed JSON, or with `raw` the
 * response itself (redirects not followed: an artifact's download address).
 */
async function githubGet(path, { raw = false, wait = sleep } = {}) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: raw ? 'manual' : 'follow',
    });
    if (GATEWAY.has(res.status) && attempt < WAITS_MS.length) {
      console.error(`::warning title=GitHub API::GET ${path} -> ${res.status}, trying again`);
      await wait(WAITS_MS[attempt]);
      continue;
    }
    if (raw) return res;
    if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}

module.exports = { githubGet };
