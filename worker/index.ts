// The revisely worker: the public pages in /docs (privacy, terms) as static
// assets, a small API under /api/ for the app, and the athan voices under
// /athan/ from R2 (wrangler.jsonc sends only /api/* and /athan/* here;
// everything else is served from the assets without this code).

import { AthanEnv, handleAthan } from './athan';
import { errorResponse, handleTcq, TcqEnv } from './tcq';

// The Durable Object class behind TCQ_BUDGET (wrangler.jsonc).
export { TcqBudget } from './budget';

interface Env extends TcqEnv, AthanEnv {
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
    if (pathname.startsWith('/athan/')) {
      try {
        return await handleAthan(request, env);
      } catch (err) {
        console.error('athan: unexpected error', err);
        return new Response('Something went wrong; try again\n', { status: 500, headers: { 'Cache-Control': 'no-store' } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
