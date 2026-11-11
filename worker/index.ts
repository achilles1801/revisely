// The revisely worker: the public pages in /docs (privacy, terms) as static
// assets, and a small API under /api/ for the app (wrangler.jsonc sends only
// /api/* here; everything else is served from the assets without this code).
// The same code runs as "revisely-dev" (dev.revisely.app, wrangler.dev.jsonc),
// which sends every path here and sets NOINDEX.

import { errorResponse, handleTcq, TcqEnv } from './tcq';

// The Durable Object class behind TCQ_BUDGET (wrangler.jsonc).
export { TcqBudget } from './budget';

interface Env extends TcqEnv {
  ASSETS: Fetcher;
  /** "1" on the dev Worker only: search engines are asked to leave every page alone. */
  NOINDEX?: string;
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
  return env.ASSETS.fetch(request);
}
