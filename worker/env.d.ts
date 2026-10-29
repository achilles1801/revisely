// The few Cloudflare Workers types the worker uses (no @cloudflare/workers-types
// dependency: the repo's package.json is the app's).

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

/** Workers rate limiting binding (wrangler.jsonc "ratelimits"). */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface CacheStorage {
  /** The data centre's cache (Workers Cache API). */
  readonly default: Cache;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage;
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

/** R2 (wrangler.jsonc "r2_buckets"): the parts the athan route uses. */
type R2Range = { offset?: number; length?: number } | { suffix: number };

interface R2Object {
  readonly key: string;
  readonly size: number;
  readonly httpEtag: string;
  readonly range?: R2Range;
}

interface R2ObjectBody extends R2Object {
  readonly body: ReadableStream;
}

interface R2GetOptions {
  /** A Range header (or the request's headers) for a ranged read. */
  range?: Headers | R2Range;
  /** Conditional headers (If-None-Match, …): when they fail, the object comes back without a body. */
  onlyIf?: Headers;
}

interface R2Bucket {
  head(key: string): Promise<R2Object | null>;
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
}
