// The revisely worker: the public pages in /docs (privacy, terms) as static
// assets, and a small API under /api/ for the app (wrangler.jsonc sends only
// /api/* here; everything else is served from the assets without this code).

import { errorResponse, handleTcq, TcqEnv } from './tcq';

interface Env extends TcqEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/tcq/')) return handleTcq(request, env, ctx);
    if (pathname === '/api' || pathname.startsWith('/api/')) return errorResponse(404, 'NOT_FOUND', 'No such endpoint');
    return env.ASSETS.fetch(request);
  },
};
