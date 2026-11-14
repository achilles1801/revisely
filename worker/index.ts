// The revisely worker: the public pages in /docs (privacy, terms) as static
// assets, and a small API under /api/ for the app (wrangler.jsonc sends /api/*,
// the account, Premium and Open Door pages and /__/* here; everything else is
// served from the assets without this code).
// The same code runs as "revisely-dev" (dev.revisely.app, wrangler.dev.jsonc),
// which sends every path here and sets NOINDEX.

import { errorResponse, handleTcq, TcqEnv } from './tcq';
import { gate, GateEnv } from './gate';
import { withAccountNav } from './nav';

// The Durable Object class behind TCQ_BUDGET (wrangler.jsonc).
export { TcqBudget } from './budget';

interface Env extends TcqEnv, GateEnv {
  ASSETS: Fetcher;
  /** "1" on the dev Worker only: search engines are asked to leave every page alone. */
  NOINDEX?: string;
  /**
   * "1" where the account, Premium and Open Door pages are open (dev.revisely.app for now). Elsewhere they answer
   * 404, so they reach revisely.app only when Majd sets it there (wrangler.jsonc sends their paths here).
   */
  ACCOUNT_PAGES?: string;
  /**
   * The Firebase Hosting site of the project the pages sign in to (revisely-dev.web.app on dev). Its
   * /__/firebase/init.json is the web config, served here at the same path, so no key is kept in the repository.
   */
  FIREBASE_HOSTING?: string;
}

/** The pages behind ACCOUNT_PAGES. */
const ACCOUNT_PAGE = /^\/(apply|premium|account)(\/|$)/;

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

/** The project's web config, from its Hosting site (an hour at the edge). */
async function firebaseConfig(host: string): Promise<Response> {
  const res = await fetch(`https://${host}/__/firebase/init.json`, { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) return new Response('{}', { status: 502, headers: { 'Content-Type': 'application/json' } });
  return new Response(await res.text(), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}

/** robots.txt where NOINDEX is set: nothing may be crawled. */
const ROBOTS_DISALLOW = 'User-agent: *\nDisallow: /\n';

/** The same answer, asking search engines not to index it or follow its links. */
function noindex(res: Response): Response {
  const out = new Response(res.body, res);
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // dev.revisely.app only (gate.ts): accounts with the devSite claim, or the gate page.
    if (env.DEV_GATE === '1') {
      const stop = await gate(request, env);
      if (stop) return env.NOINDEX === '1' ? noindex(stop) : stop;
    }
    if (env.NOINDEX !== '1') return answer(request, env, ctx);
    if (new URL(request.url).pathname === '/robots.txt') {
      return noindex(new Response(ROBOTS_DISALLOW, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    }
    return noindex(await answer(request, env, ctx));
  },
};

/** The site from the assets, the API under /api/. */
async function answer(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (ACCOUNT_PAGE.test(pathname) && env.ACCOUNT_PAGES !== '1') return notFound();
  if (pathname === '/__/firebase/init.json') {
    return env.FIREBASE_HOSTING ? firebaseConfig(env.FIREBASE_HOSTING) : notFound();
  }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    try {
      if (pathname.startsWith('/api/tcq/')) return await handleTcq(request, env, ctx);
      return errorResponse(404, 'NOT_FOUND', 'No such endpoint');
    } catch (err) {
      // Never Cloudflare's HTML error page: the app expects JSON.
      console.error('api: unexpected error', err);
      return errorResponse(500, 'UPSTREAM_ERROR', 'Something went wrong; try again');
    }
  }
  if (env.ACCOUNT_PAGES !== '1') return env.ASSETS.fetch(request);
  // dev.revisely.app: the site's own pages link the account, Premium and Open Door pages (nav.ts). A page asks the
  // assets without its validators, so a copy cached before the navigation was added (a 304) never stands in for it.
  let ask = request;
  if ((request.headers.get('Accept') ?? '').includes('text/html')) {
    ask = new Request(request);
    ask.headers.delete('If-None-Match');
    ask.headers.delete('If-Modified-Since');
  }
  return withAccountNav(await env.ASSETS.fetch(ask));
}
