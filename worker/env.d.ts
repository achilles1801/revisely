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
