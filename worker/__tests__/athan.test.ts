/**
 * @jest-environment node
 */
// The worker's /athan/ route: the catalog and the voices from R2, read-only,
// with byte ranges (the full athan streams) and ETags.

import worker from '../index';
import { athanKey, cacheControl } from '../athan';

/** An in-memory R2 bucket that reads Range and If-None-Match headers as R2 does. */
function bucket(files: Record<string, string>) {
  const etag = (key: string) => `"etag-${key}"`;
  const meta = (key: string) => ({ key, size: files[key].length, httpEtag: etag(key) });
  const parse = (h: string | null, size: number) => {
    const m = h && /^bytes=(\d*)-(\d*)$/.exec(h);
    if (!m) return undefined;
    if (m[1] === '') return { suffix: Number(m[2]) };
    const offset = Number(m[1]);
    if (offset >= size) throw new Error('InvalidRange');
    return m[2] === '' ? { offset } : { offset, length: Number(m[2]) - offset + 1 };
  };
  return {
    head: jest.fn(async (key: string) => (key in files ? meta(key) : null)),
    get: jest.fn(async (key: string, opts: { range?: Headers; onlyIf?: Headers } = {}) => {
      if (!(key in files)) return null;
      if (opts.onlyIf?.get('If-None-Match') === etag(key)) return meta(key);
      const text = files[key];
      const range = parse(opts.range?.get('Range') ?? null, text.length);
      let bytes = text;
      if (range && 'suffix' in range) bytes = text.slice(text.length - range.suffix);
      else if (range) bytes = text.slice(range.offset, range.length != null ? range.offset + range.length : undefined);
      return { ...meta(key), range, body: new Response(bytes).body };
    }),
  };
}

const FILES = {
  'catalog.json': '{"version":1,"voices":[]}',
  'notif/icr-asim-javed.caf': 'CAFFDATA-0123456789',
  'full/makkah-fajr.m4a': 'M4A-abcdefghijklmnopqrstuvwxyz',
};

const ctx = { waitUntil() {}, passThroughOnException() {} };
const assets = { fetch: jest.fn(async () => new Response('asset')) };

function call(path: string, init: RequestInit = {}, ATHAN: unknown = bucket(FILES)) {
  const env = { ASSETS: assets, ATHAN } as unknown as Parameters<typeof worker.fetch>[1];
  return worker.fetch(new Request(`https://revisely.app${path}`, init), env, ctx);
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('athanKey', () => {
  it('only the catalog and voice files', () => {
    expect(athanKey('/athan/catalog.json')).toBe('catalog.json');
    expect(athanKey('/athan/notif/icr-asim-javed.caf')).toBe('notif/icr-asim-javed.caf');
    expect(athanKey('/athan/full/makkah-fajr.m4a')).toBe('full/makkah-fajr.m4a');
    expect(athanKey('/athan/previews/tr-gocek-fajr.m4a')).toBe('previews/tr-gocek-fajr.m4a');
    for (const bad of [
      '/athan/',
      '/athan/sources.json',
      '/athan/notif/../catalog.json',
      '/athan/notif/%2e%2e/x.caf',
      '/athan/notif/Makkah.caf',
      '/athan/notif/x.mp3',
      '/athan/raw/x.m4a',
      '/athan/notif/-x.caf',
      '/athanx/catalog.json',
    ]) {
      expect(athanKey(bad)).toBeNull();
    }
  });

  it('caches the catalog an hour, the audio a day', () => {
    expect(cacheControl('catalog.json')).toBe('public, max-age=3600');
    expect(cacheControl('notif/a.caf')).toBe('public, max-age=86400');
  });
});

describe('/athan/', () => {
  it('serves the catalog as JSON with its ETag', async () => {
    const res = await call('/athan/catalog.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('ETag')).toBe('"etag-catalog.json"');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(await res.text()).toBe(FILES['catalog.json']);
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it('serves a notification clip as CAF', async () => {
    const res = await call('/athan/notif/icr-asim-javed.caf');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/x-caf');
    expect(res.headers.get('Content-Length')).toBe(String(FILES['notif/icr-asim-javed.caf'].length));
    expect(await res.text()).toBe(FILES['notif/icr-asim-javed.caf']);
  });

  it('streams in ranges: 206 with Content-Range', async () => {
    const full = FILES['full/makkah-fajr.m4a'];
    let res = await call('/athan/full/makkah-fajr.m4a', { headers: { Range: 'bytes=0-3' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Type')).toBe('audio/mp4');
    expect(res.headers.get('Content-Range')).toBe(`bytes 0-3/${full.length}`);
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(await res.text()).toBe('M4A-');

    res = await call('/athan/full/makkah-fajr.m4a', { headers: { Range: 'bytes=4-' } });
    expect(res.headers.get('Content-Range')).toBe(`bytes 4-${full.length - 1}/${full.length}`);
    expect(await res.text()).toBe(full.slice(4));

    res = await call('/athan/full/makkah-fajr.m4a', { headers: { Range: 'bytes=-3' } });
    expect(res.headers.get('Content-Range')).toBe(`bytes ${full.length - 3}-${full.length - 1}/${full.length}`);
    expect(await res.text()).toBe('xyz');
  });

  it('a range past the end is a 416', async () => {
    const res = await call('/athan/full/makkah-fajr.m4a', { headers: { Range: 'bytes=999-' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('Content-Range')).toBe(`bytes */${FILES['full/makkah-fajr.m4a'].length}`);
  });

  it('If-None-Match with the current ETag: 304, no body', async () => {
    const res = await call('/athan/catalog.json', { headers: { 'If-None-Match': '"etag-catalog.json"' } });
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe('"etag-catalog.json"');
    expect(await res.text()).toBe('');
  });

  it('HEAD: the size and ETag, no body', async () => {
    const res = await call('/athan/notif/icr-asim-javed.caf', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Length')).toBe(String(FILES['notif/icr-asim-javed.caf'].length));
    expect(res.headers.get('ETag')).toBe('"etag-notif/icr-asim-javed.caf"');
  });

  it('a voice that was taken down (or never was): 404', async () => {
    expect((await call('/athan/notif/madinah-regular.caf')).status).toBe(404);
    expect((await call('/athan/notif/madinah-regular.caf', { method: 'HEAD' })).status).toBe(404);
  });

  it('anything but the listed shapes: 404, and the bucket is never asked', async () => {
    const b = bucket(FILES);
    // (A plain ../ is resolved by the URL parser before it gets here.)
    for (const path of ['/athan/sources.json', '/athan/notif/%2e%2e%2fcatalog.json', '/athan/raw/x.m4a']) {
      expect((await call(path, {}, b)).status).toBe(404);
    }
    expect(b.get).not.toHaveBeenCalled();
    expect(b.head).not.toHaveBeenCalled();
  });

  it('read-only: other methods are 405', async () => {
    for (const method of ['PUT', 'POST', 'DELETE']) {
      const res = await call('/athan/catalog.json', { method, body: method === 'DELETE' ? undefined : 'x' });
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('GET, HEAD');
    }
  });

  it('without a bucket (Worker Previews): 503', async () => {
    expect((await call('/athan/catalog.json', {}, null)).status).toBe(503);
  });

  it('R2 failing: a 500, never an exception', async () => {
    const broken = { head: jest.fn(), get: jest.fn(async () => { throw new Error('R2 down'); }) };
    broken.head.mockRejectedValue(new Error('R2 down'));
    const res = await call('/athan/catalog.json', {}, broken);
    expect(res.status).toBe(500);
  });

  it('other paths are still the static site', async () => {
    const res = await call('/privacy/');
    expect(await res.text()).toBe('asset');
  });
});
