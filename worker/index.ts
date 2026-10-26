// The revisely worker: the public pages in /docs (privacy, terms) as static
// assets, and a small API under /api/ for the app (wrangler.jsonc sends only
// /api/* here; everything else is served from the assets without this code).

import { errorResponse, handleTcq, TcqEnv } from './tcq';

// The Durable Object class behind TCQ_BUDGET (wrangler.jsonc).
export { TcqBudget } from './budget';

interface Env extends TcqEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
  },
};
