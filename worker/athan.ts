// Athan voices at revisely.app/athan/: the catalog the app reads and the audio
// it downloads (notification clips) or streams (full athans), from the R2
// bucket `revisely-athan` (binding ATHAN). Public and read-only: GET and HEAD
// of a few key shapes, with byte ranges (AVPlayer streams in ranges) and ETags.
//
// The bucket's contents come from build_athan.py (the athan project, outside
// this repository): catalog.json, notif/<id>.caf|m4a, full/<id>.m4a,
// previews/<id>.m4a. To take a voice down, delete its objects or set
// `enabled: false` in catalog.json; phones fall back to the bundled default.

export interface AthanEnv {
  /** Absent in Worker Previews (they get no bucket): every request is a 503. */
  ATHAN?: R2Bucket;
}

const KEY = /^(?:catalog\.json|(?:notif|full|previews)\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:caf|m4a))$/;

const TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  caf: 'audio/x-caf',
  m4a: 'audio/mp4',
};

/** The bucket key for a path under /athan/, or null if it isn't one we serve. */
export function athanKey(pathname: string): string | null {
  if (!pathname.startsWith('/athan/')) return null;
  const key = pathname.slice('/athan/'.length);
  return KEY.test(key) ? key : null;
}

/** The catalog changes when voices are added or removed; the audio rarely. */
export function cacheControl(key: string): string {
  return key === 'catalog.json' ? 'public, max-age=3600' : 'public, max-age=86400';
}

function plain(status: number, message: string, extra: Record<string, string> = {}): Response {
  return new Response(`${message}\n`, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

/** The bytes a ranged read returned: [first, last] (inclusive). */
function returnedRange(range: R2Range, size: number): [number, number] {
  if ('suffix' in range && range.suffix != null) return [Math.max(0, size - range.suffix), size - 1];
  const offset = ('offset' in range && range.offset) || 0;
  const length = ('length' in range && range.length) || size - offset;
  return [offset, Math.min(size, offset + length) - 1];
}

export async function handleAthan(request: Request, env: AthanEnv): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return plain(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }
  const key = athanKey(new URL(request.url).pathname);
  if (!key) return plain(404, 'Not found');
  if (!env.ATHAN) return plain(503, 'Not available here');

  const headers = new Headers({
    'Content-Type': TYPES[key.slice(key.lastIndexOf('.') + 1)],
    'Cache-Control': cacheControl(key),
    'Accept-Ranges': 'bytes',
  });

  if (request.method === 'HEAD') {
    const head = await env.ATHAN.head(key);
    if (!head) return plain(404, 'Not found');
    headers.set('ETag', head.httpEtag);
    headers.set('Content-Length', String(head.size));
    return new Response(null, { status: 200, headers });
  }

  let object: R2Object | R2ObjectBody | null;
  try {
    object = await env.ATHAN.get(key, { range: request.headers, onlyIf: request.headers });
  } catch (err) {
    // R2 refuses a range it can't satisfy.
    const head = await env.ATHAN.head(key);
    if (!head) return plain(404, 'Not found');
    console.warn('athan: range refused', key, request.headers.get('Range'), err);
    return plain(416, 'Range not satisfiable', { 'Content-Range': `bytes */${head.size}` });
  }
  if (!object) return plain(404, 'Not found');
  headers.set('ETag', object.httpEtag);

  // A conditional request that matched (If-None-Match): R2 returns no body.
  if (!('body' in object) || !object.body) return new Response(null, { status: 304, headers });

  if (request.headers.has('Range') && object.range) {
    const [first, last] = returnedRange(object.range, object.size);
    headers.set('Content-Range', `bytes ${first}-${last}/${object.size}`);
    headers.set('Content-Length', String(last - first + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}
